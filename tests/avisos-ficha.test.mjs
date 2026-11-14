// Avisos da ficha pela internet (nuvem/avisos-ficha.mjs e nuvem/push.mjs): textos de cada etapa, e-mail à pessoa e à
// equipe (Gmail simulado), aviso no celular cifrado (RFC 8291, conferido decifrando aqui) com a assinatura VAPID, e
// inscrição vencida apagada. Dados fictícios.
import assert from 'node:assert/strict';
import test from 'node:test';
import { avisar, emailDaPessoa, textosDoAviso } from '../nuvem/avisos-ficha.mjs';
import * as FP from '../nuvem/ficha-publica.mjs';
import { autorizacaoVapid, avisarAparelhos, b64url, cifrar, deB64url, inscrever } from '../nuvem/push.mjs';
import * as W from '../nuvem/worker.mjs';
import { r2Falso } from './r2-falso.mjs';

const enc = new TextEncoder();
const juntar = (...p) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
async function hkdf(salt, ikm, info, n) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, n * 8));
}

async function aparelho() {
  const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { par, p256dh: b64url(pub), auth: b64url(auth), pub, authBytes: auth };
}

/** Decifra como o navegador (RFC 8188/8291). */
async function decifrar(corpo, ap) {
  const salt = corpo.slice(0, 16);
  const idlen = corpo[20];
  const asPub = corpo.slice(21, 21 + idlen);
  const cifrado = corpo.slice(21 + idlen);
  const asChave = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asChave }, ap.par.privateKey, 256));
  const ikm = await hkdf(ap.authBytes, ecdh, juntar(enc.encode('WebPush: info\0'), ap.pub, asPub), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const k = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const claro = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, k, cifrado));
  assert.equal(claro.at(-1), 2, 'último registro');
  return new TextDecoder().decode(claro.slice(0, -1));
}

async function vapid() {
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', par.privateKey);
  return { VAPID_PUBLICA: b64url(pub), VAPID_PRIVADA: jwk.d, VAPID_CONTATO: 'mailto:administracao@exemplo.com.br', publica: par.publicKey };
}

const registro = (extra = {}) => ({
  ficha_id: 7, pessoa: 'interessado', contexto: { empresa: 'ANK', nome: 'Maria Souza', imovel: 'Rua das Flores, 120', reserva: 'R$ 1.000,00' },
  valores_iniciais: { inquilino_email: 'maria@exemplo.com.br' }, respostas: [], arquivos: [], faltando: [], ...extra,
});

test('textos de cada etapa: pessoa e equipe; o link não vai no e-mail', () => {
  const r = registro({ respostas: [{ em: 'x', valores: {} }] });
  const enviou = textosDoAviso(r, 'enviou');
  assert.match(enviou.pessoa.assunto, /^Recebemos sua ficha cadastral \(Rua das Flores, 120\)$/);
  assert.match(enviou.pessoa.texto, /^Olá, Maria!/);
  assert.match(enviou.equipe.titulo, /^Maria Souza mandou os dados$/);
  assert.equal(textosDoAviso({ ...r, respostas: [{}, {}] }, 'enviou').pessoa, null, 'reenvio: só a equipe');
  assert.equal(textosDoAviso(registro({ arquivos: [{}, {}] }), 'documento').equipe, null, 'só o primeiro documento avisa');
  const falta = textosDoAviso(registro({ faltando: ['Comprovante de residência'] }), 'falta');
  assert.match(falta.pessoa.texto, /- Comprovante de residência\n\nAbra o mesmo link/);
  assert.doesNotMatch(falta.pessoa.texto, /https?:/);
  assert.match(textosDoAviso(r, 'desistiu').pessoa.texto, /reserva de R\$ 1\.000,00 é devolvida por inteiro/);
  assert.match(textosDoAviso(r, 'assinar').pessoa.assunto, /^Sua ficha cadastral está pronta para assinar/);
  // e-mail da pessoa: o da ficha (posto pela equipe) vale mais que o digitado no link; sem o da ficha, o digitado; inválido não manda
  assert.equal(emailDaPessoa(registro({ respostas: [{ valores: { inquilino_email: 'outro@exemplo.com.br' } }] })), 'maria@exemplo.com.br');
  assert.equal(emailDaPessoa(registro({ valores_iniciais: {}, respostas: [{ valores: { inquilino_email: 'novo@exemplo.com.br' } }] })), 'novo@exemplo.com.br');
  // a segunda ficha assinada não repete os avisos
  assert.ok(textosDoAviso(registro({ arquivos: [{ documento: 'Ficha cadastral assinada' }] }), 'assinou').pessoa);
  assert.equal(textosDoAviso(registro({ arquivos: [{ documento: 'Ficha cadastral assinada' }, { documento: 'Ficha cadastral assinada' }] }), 'assinou').equipe, null);
  assert.equal(emailDaPessoa(registro({ valores_iniciais: { inquilino_email: 'sem arroba' } })), '');
  assert.equal(emailDaPessoa({ pessoa: 'fiador1', respostas: [], valores_iniciais: { fiador1_email: 'ana@exemplo.com.br' } }), 'ana@exemplo.com.br');
});

test('aviso no celular: cifrado para o aparelho, assinado com VAPID; inscrição vencida é apagada', async () => {
  const ap = await aparelho();
  const corpo = await cifrar('{"titulo":"Olá"}', ap.p256dh, ap.auth);
  assert.equal(await decifrar(corpo, ap), '{"titulo":"Olá"}');
  const chaves = await vapid();
  const env = { ...chaves, DADOS: r2Falso() };
  const cab = await autorizacaoVapid(env, 'https://fcm.googleapis.com/fcm/send/abc', 1_800_000_000_000);
  const [, jwt, k] = cab.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, chaves.VAPID_PUBLICA);
  const [h, c, s] = jwt.split('.');
  assert.equal(JSON.parse(new TextDecoder().decode(deB64url(c))).aud, 'https://fcm.googleapis.com');
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, chaves.publica, deB64url(s), enc.encode(`${h}.${c}`)));
  // inscrição: só serviço de aviso conhecido
  await assert.rejects(() => inscrever(env, { endpoint: 'https://outro-site.com/x', keys: { p256dh: ap.p256dh, auth: ap.auth } }, 'dono@exemplo.com.br'), /inválido/);
  await inscrever(env, { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: ap.p256dh, auth: ap.auth } }, 'dono@exemplo.com.br');
  await inscrever(env, { endpoint: 'https://web.push.apple.com/velho', keys: { p256dh: ap.p256dh, auth: ap.auth } }, 'dono@exemplo.com.br');
  const pedidos = [];
  const buscar = async (url, op) => { pedidos.push({ url, op }); return new Response(null, { status: url.includes('velho') ? 410 : 201 }); };
  assert.equal(await avisarAparelhos(env, { titulo: 'Maria mandou os dados', texto: 'x', url: './#/ficha/7' }, { buscar }), 1);
  assert.equal(pedidos.length, 2);
  const fcm = pedidos.find((p) => p.url.includes('fcm'));
  assert.equal(fcm.op.headers['Content-Encoding'], 'aes128gcm');
  assert.match(JSON.parse(await decifrar(fcm.op.body, ap)).titulo, /Maria mandou os dados/);
  assert.equal([...env.DADOS.m.keys()].filter((k) => k.startsWith('publico/push/')).length, 1, 'a vencida (410) saiu');
  // quem saiu da equipe (o cofre não reconhece mais o e-mail) deixa de receber e a inscrição sai
  const COFRE = { idFromName: (n) => n, get: () => ({ fetch: async () => new Response('{"erro":"sem acesso"}', { status: 403 }) }) };
  assert.equal(await avisarAparelhos({ ...env, COFRE }, { titulo: 'x' }, { buscar }), 0);
  assert.equal([...env.DADOS.m.keys()].filter((k) => k.startsWith('publico/push/')).length, 0);
  // sem as chaves VAPID: nada sai
  assert.equal(await avisarAparelhos({ DADOS: env.DADOS }, { titulo: 'x' }, { buscar }), 0);
});

test('fluxo: a pessoa manda os dados → e-mail para ela e para a equipe; a equipe pede o que falta → e-mail para a pessoa', async () => {
  const logs = [];
  const original = console.log;
  console.log = (t) => logs.push(String(t));
  try {
    const env = { MODO_TESTE: '1', EMAIL_TESTE: 'dono@exemplo.com.br', ORIGEM: 'http://localhost:8787', SIMULAR_GMAIL: '1', GMAIL_REMETENTE: 'administracao@exemplo.com.br', DADOS: r2Falso() };
    const equipe = (caminho, corpo) => W.atender(new Request(`http://localhost:8787/api/ficha-online/${caminho}`, { method: 'POST', body: JSON.stringify(corpo), headers: { 'X-Sistema': 'imoveis', Origin: 'http://localhost:8787' } }), env);
    const criado = await (await equipe('link', { ficha_id: 7, pessoa: 'interessado', pasta: 'arquivos/Fichas em analise/Maria', formulario: [{ nome: 'inquilino_nome', rotulo: 'Nome', tipo: 'texto' }, { nome: 'inquilino_email', rotulo: 'E-mail', tipo: 'email' }], valores: { inquilino_email: 'maria@exemplo.com.br' }, contexto: { nome: 'Maria Souza', empresa: 'ANK' } })).json();
    const chave = criado.url.split('#')[1];
    const r = await FP.atenderFicha(new Request('https://ficha.ankjck.com.br/api/publico/ficha/enviar', { method: 'POST', body: JSON.stringify({ declaracao: true, valores: { inquilino_nome: 'Maria Souza' } }), headers: { 'X-Ficha-Token': chave, 'X-Ficha': '1' } }), env, { avisar: W.avisador() });
    assert.equal(r.status, 200);
    assert.ok(logs.some((l) => /\[gmail simulado\] para maria@exemplo\.com\.br.*"Recebemos sua ficha cadastral"/.test(l)), logs.join('\n'));
    assert.ok(logs.some((l) => /\[gmail simulado\] para administracao@exemplo\.com\.br.*"Ficha pela internet: Maria Souza mandou os dados"/.test(l)));
    logs.length = 0;
    await equipe('atualizar', { ficha_id: 7, pessoa: 'interessado', situacao: 'Falta documento', faltando: ['Comprovante de residência'] });
    assert.ok(logs.some((l) => /para maria@exemplo\.com\.br.*"Falta um documento: sua ficha cadastral"/.test(l)));
    // o mesmo pedido de novo (clique duplo) não repete o e-mail
    logs.length = 0;
    await equipe('atualizar', { ficha_id: 7, pessoa: 'interessado', situacao: 'Falta documento', faltando: ['Comprovante de residência'] });
    assert.ok(!logs.some((l) => /Falta um documento/.test(l)));
    // sem Gmail ligado, nada sai e não dá erro
    const feitos = await avisar({ DADOS: r2Falso() }, registro({ respostas: [{ em: 'x', valores: {} }] }), 'enviou');
    assert.deepEqual(feitos, []);
  } finally { console.log = original; }
});
