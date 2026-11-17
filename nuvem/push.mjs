// Aviso no celular (Web Push) para a equipe, pelo aplicativo instalado (pedido do dono em 2026-11-14: avisar a cada etapa
// da ficha pela internet). Padrão da web: o aparelho se inscreve no serviço do navegador (Google, Apple, Mozilla, Microsoft)
// e o Worker manda a mensagem cifrada (RFC 8291, aes128gcm) com a assinatura VAPID (RFC 8292), só com WebCrypto.
// Chaves VAPID: segredos do Worker VAPID_PUBLICA e VAPID_PRIVADA (gerar com `node tools/gerar-vapid.mjs`) e VAPID_CONTATO
// (mailto: + o e-mail da empresa; sem ele, o do Gmail: contatoVapid). Sem as chaves, o aviso no celular fica desligado e o resto funciona.
// Inscrições no R2: publico/push/<hash do endereço>.json { endpoint, p256dh, auth, email, criado_em }.

const enc = new TextEncoder();
export const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const deB64url = (t) => Uint8Array.from(atob(String(t).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(t).length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const juntar = (...partes) => { const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of partes) { out.set(p, i); i += p.length; } return out; };
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Serviços de aviso aceitos (o endereço da inscrição vem do navegador; outro endereço é recusado). */
const SERVICOS = /^https:\/\/([a-z0-9-]+\.)*(fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)\//i;

/**
 * Chave como foi colada no Cloudflare, limpa: sem espaços, quebras de linha, caracteres invisíveis nem o "NOME=" da linha
 * do arquivo (ex.: "VAPID_PUBLICA=BAbc…" → "BAbc…"). Só ficam as letras do base64url.
 */
export const limparChave = (v) => String(v || '').replace(/^\s*VAPID_[A-Z]+\s*=/, '').replace(/[^A-Za-z0-9_-]/g, '');
export const publica = (env) => limparChave(env.VAPID_PUBLICA);
export const pushLigado = (env) => !!(publica(env) && limparChave(env.VAPID_PRIVADA));
const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;
/**
 * Contato do VAPID ("sub"), sempre "mailto:" + e-mail (a Apple recusa outro formato), o da empresa que usa o sistema:
 * VAPID_CONTATO ("mailto:x@y" ou só "x@y"); sem ele, o remetente do Gmail (GMAIL_REMETENTE) ou o 1º e-mail de AVISOS_EQUIPE.
 * Sem nenhum: null, e o aviso vai sem contato (até 2026-11-17 ia o e-mail da ANK, fixo no código). Ex.: VAPID_CONTATO vazio e
 * GMAIL_REMETENTE "contato@exemplo.com.br" → "mailto:contato@exemplo.com.br".
 */
export function contatoVapid(env) {
  const candidatos = [env.VAPID_CONTATO, env.GMAIL_REMETENTE, ...String(env.AVISOS_EQUIPE || '').split(',')]
    .map((x) => String(x || '').trim().replace(/^mailto:/i, '')).filter(Boolean);
  const email = candidatos.find((x) => EMAIL.test(x));
  return email ? `mailto:${email}` : null;
}

/** Chave privada VAPID (d) com a pública (x, y) como JWK, para assinar com ES256. */
async function chaveVapid(env) {
  const pub = deB64url(publica(env));
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('A chave VAPID_PUBLICA cadastrada no Cloudflare está incompleta ou errada.');
  const d = limparChave(env.VAPID_PRIVADA);
  if (deB64url(d).length !== 32) throw new Error('A chave VAPID_PRIVADA cadastrada no Cloudflare está incompleta ou errada.');
  const jwk = { kty: 'EC', crv: 'P-256', d, x: b64url(pub.slice(1, 33)), y: b64url(pub.slice(33)), ext: true };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

/** As duas chaves formam um par? (assina com a privada e confere com a pública) */
export async function chavesFormamPar(env) {
  const teste = enc.encode('teste');
  const assinatura = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await chaveVapid(env), teste);
  const pub = await crypto.subtle.importKey('raw', deB64url(publica(env)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, assinatura, teste);
}

/** Cabeçalho Authorization (VAPID) para o serviço do endereço. */
export async function autorizacaoVapid(env, endpoint, agora = Date.now()) {
  const aud = new URL(endpoint).origin;
  const cab = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const sub = contatoVapid(env);
  const corpo = b64url(enc.encode(JSON.stringify({ aud, exp: Math.floor(agora / 1000) + 12 * 3600, ...(sub ? { sub } : {}) })));
  const assinatura = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await chaveVapid(env), enc.encode(`${cab}.${corpo}`));
  return `vapid t=${cab}.${corpo}.${b64url(assinatura)}, k=${publica(env)}`;
}

async function hkdf(salt, ikm, info, bytes) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bytes * 8));
}

/** Cifra a mensagem para a inscrição (RFC 8291): devolve o corpo aes128gcm (cabeçalho + texto cifrado). */
export async function cifrar(texto, p256dh, auth, { salt = crypto.getRandomValues(new Uint8Array(16)), par = null } = {}) {
  const ua = deB64url(p256dh);
  const segredo = deB64url(auth);
  const meu = par || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const meuPublico = new Uint8Array(await crypto.subtle.exportKey('raw', meu.publicKey));
  const uaChave = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaChave }, meu.privateKey, 256));
  const ikm = await hkdf(segredo, ecdh, juntar(enc.encode('WebPush: info\0'), ua, meuPublico), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const chave = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, chave, juntar(enc.encode(texto), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return juntar(salt, rs, new Uint8Array([meuPublico.length]), meuPublico, cifrado);
}

const chaveInscricao = async (endpoint) => `publico/push/${hex(await crypto.subtle.digest('SHA-256', enc.encode(endpoint)))}.json`;

/** Guarda a inscrição do aparelho ({ endpoint, keys: { p256dh, auth } }) com o e-mail de quem ligou. */
export async function inscrever(env, pedido, email) {
  const endpoint = String(pedido?.endpoint || '');
  const p256dh = String(pedido?.keys?.p256dh || '');
  const auth = String(pedido?.keys?.auth || '');
  if (!SERVICOS.test(endpoint) || endpoint.length > 1000) throw new Error('Endereço de aviso inválido.');
  if (deB64url(p256dh).length !== 65 || deB64url(auth).length !== 16) throw new Error('Chaves de aviso inválidas.');
  await env.DADOS.put(await chaveInscricao(endpoint), JSON.stringify({ endpoint, p256dh, auth, email, criado_em: new Date().toISOString() }));
}

export async function desinscrever(env, endpoint) {
  await env.DADOS.delete(await chaveInscricao(String(endpoint || '')));
}

/**
 * Manda { titulo, texto, url, tag } para todos os aparelhos inscritos. Inscrição que o serviço diz que acabou (404/410) é
 * apagada. Devolve quantos aceitaram. Sem as chaves VAPID: não manda nada.
 */
/** Quem ligou o aviso ainda é da equipe (usuário ativo, operador ou administrador)? Sem cofre (testes): sim. */
async function aindaNaEquipe(env, email) {
  if (!env.COFRE || !email) return true;
  try {
    const r = await env.COFRE.get(env.COFRE.idFromName('principal')).fetch(new Request('https://cofre/papel?nivel=operador', { headers: { 'X-Email-Conferido': email } }));
    return r.ok || r.status >= 500; // erro do cofre: não apaga a inscrição por engano
  } catch { return true; }
}

export async function avisarAparelhos(env, mensagem, { buscar = fetch } = {}) {
  if (!pushLigado(env)) return 0;
  const objetos = [];
  let cursor;
  do {
    const r = await env.DADOS.list({ prefix: 'publico/push/', limit: 1000, cursor });
    objetos.push(...r.objects);
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  let ok = 0;
  for (const o of objetos) {
    try {
      const obj = await env.DADOS.get(o.key);
      if (!obj) continue;
      const s = JSON.parse(await obj.text());
      // quem saiu da equipe deixa de receber (os avisos têm nome e imóvel do interessado)
      if (!(await aindaNaEquipe(env, s.email))) { await env.DADOS.delete(o.key); continue; }
      const r = await mandarUm(env, s, mensagem, buscar);
      if (r.status === 404 || r.status === 410) await env.DADOS.delete(o.key);
      else if (r.ok) ok += 1;
      else console.warn('aviso no celular recusado', r.status, (await r.text().catch(() => '')).slice(0, 300));
    } catch (e) { console.warn('aviso no celular', e.message); }
  }
  return ok;
}

/** Manda a mensagem para uma inscrição; devolve a resposta do serviço do navegador. */
async function mandarUm(env, s, mensagem, buscar) {
  const corpo = await cifrar(JSON.stringify(mensagem), s.p256dh, s.auth);
  return buscar(s.endpoint, {
    method: 'POST', body: corpo,
    headers: { Authorization: await autorizacaoVapid(env, s.endpoint), TTL: '86400', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', Urgency: 'high' },
  });
}

/**
 * Teste pelo botão "Testar o aviso" (o aparelho manda o próprio endereço): confere as chaves, se o aparelho está inscrito
 * na nuvem e o que o serviço do navegador respondeu. Devolve { ok, etapa, mensagem } em português, para mostrar na tela.
 */
export async function testarAparelho(env, endpoint, { buscar = fetch } = {}) {
  if (!pushLigado(env)) return { ok: false, etapa: 'chaves', mensagem: 'As chaves VAPID_PUBLICA e VAPID_PRIVADA não estão cadastradas no Cloudflare (ou o Deploy não foi feito).' };
  const semPar = { ok: false, etapa: 'chaves', mensagem: 'As duas chaves do Cloudflare não formam um par: cadastre de novo as duas, copiadas do mesmo arquivo gerado.' };
  try {
    if (!(await chavesFormamPar(env))) return semPar;
  } catch (e) {
    // a privada que não é da pública: o WebCrypto recusa ao abrir a chave (DataError)
    return e && e.name === 'DataError' ? semPar : { ok: false, etapa: 'chaves', mensagem: e.message };
  }
  const obj = await env.DADOS.get(await chaveInscricao(String(endpoint || '')));
  if (!obj) return { ok: false, etapa: 'inscricao', mensagem: 'Este aparelho não está guardado na nuvem: toque em "Desligar neste aparelho" e depois em "Ligar" de novo.' };
  const s = JSON.parse(await obj.text());
  let r;
  try { r = await mandarUm(env, s, { titulo: 'Teste do aviso', texto: 'Se você está lendo isto, o aviso no celular está funcionando.', url: './', tag: 'teste' }, buscar); } catch (e) {
    return { ok: false, etapa: 'servico', mensagem: `Não consegui falar com o serviço de avisos do navegador: ${e.message}` };
  }
  if (r.ok) return { ok: true, etapa: 'enviado', mensagem: 'O serviço de avisos aceitou: o aviso deve aparecer neste aparelho em alguns segundos.' };
  const detalhe = (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
  if (r.status === 404 || r.status === 410) { await env.DADOS.delete(await chaveInscricao(s.endpoint)); return { ok: false, etapa: 'servico', mensagem: 'O serviço de avisos diz que esta inscrição acabou: toque em "Ligar" de novo.' }; }
  if (r.status === 401 || r.status === 403) return { ok: false, etapa: 'servico', mensagem: `O serviço de avisos recusou a assinatura (${r.status}): o aparelho foi ligado com outra chave. Toque em "Desligar neste aparelho" e em "Ligar" de novo. ${detalhe}` };
  return { ok: false, etapa: 'servico', mensagem: `O serviço de avisos respondeu ${r.status}. ${detalhe}` };
}
