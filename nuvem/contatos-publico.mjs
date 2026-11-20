// Comunicado com confirmação de contatos (pedido do dono em 2026-11-18): cada inquilino e fiador ativo recebe um link só dele
// (e-mail ou WhatsApp), abre a página no endereço da ficha (ficha.ankjck.com.br/contatos, sem o login do sistema), confere ou
// corrige o e-mail e o celular, confirma o e-mail com um código enviado a ele, marca "Li e concordo" (e, se quiser, assina com
// o dedo). A resposta fica guardada com data, hora, endereço de internet e aparelho (prova do aceite) e vai por e-mail um
// comprovante para a pessoa.
//
// - Equipe (dentro do sistema, com login, papel operador): POST /api/contatos/link cria o link de uma pessoa (devolve o endereço
//   com a chave depois do "#"), GET /api/contatos/lista?comunicado=ID lê a situação e as respostas, POST /api/contatos/encerrar
//   desliga o link.
// - Público (só no endereço da ficha): GET /contatos (a página), GET /api/publico/contatos, POST …/contatos/codigo,
//   POST …/contatos/confirmar, com a chave no cabeçalho X-Ficha-Token (o mesmo da ficha) e X-Ficha: 1 nas gravações.
// - R2: publico/contatos/<comunicado>/<destino>.json (o registro, com a resposta) e publico/tokens-contatos/<hash da chave>
//   (aponta para o registro; a chave não fica guardada aqui). Nada daqui lê o banco do sistema: só o que a equipe mandou.
// - O código vai para o e-mail que a pessoa digitou (é isso que prova que esse e-mail recebe as mensagens): no máximo
//   MAX_CODIGOS por link, um por minuto, texto fixo (quem tem o link não consegue usar o Gmail da empresa para escrever outra coisa).
import { contaGuardada, emailValido, enviarEmail, estadoEmail } from './gmail.mjs';
import { avisarAparelhos } from './push.mjs';
import { HSTS, SO_SE_NOVO, hashDaChave } from './ficha-publica.mjs';

/** Guarda do registro: a prova do aceite precisa durar (o sistema copia a resposta para o banco ao atualizar a lista). */
export const DIAS_GUARDA_CONTATOS = 730;
/** O link vale até o prazo do comunicado mais esta folga (quem responde atrasado ainda consegue). */
export const DIAS_FOLGA = 60;
export const MAX_CODIGOS = 5;
export const MAX_TENTATIVAS = 6;
const MINUTOS_CODIGO = 30;
const MAX_PEDIDO = 256 * 1024;
const MAX_LOGO = 120 * 1024; // data URL da logo (o site manda já reduzida)
const MAX_ASSINATURA = 150 * 1024; // data URL do desenho da assinatura
const LEITURAS_JUNTAS = 10;
export const MELHORES = ['WhatsApp', 'E-mail', 'Ligação'];

export class ErroContatos extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}

const json = (status, dados) => new Response(JSON.stringify(dados), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...HSTS },
});
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha = async (t) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(t))));
const novaChave = () => { const b = crypto.getRandomValues(new Uint8Array(32)); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const texto = (v, max = 300) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
const passou = (iso, dias = 0) => Date.parse(iso) + dias * 86400000 < Date.now();

const chaveRegistro = (com, dest) => `publico/contatos/${com}/${dest}.json`;
const chaveToken = (hash) => `publico/tokens-contatos/${hash}`;

const comunicadoValido = (v) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw new ErroContatos(400, 'Comunicado inválido.'); return n; };
/** Destino: "c<id do contrato>" (inquilino) ou "f<id do fiador>". */
const destinoValido = (v) => { const s = String(v || ''); if (!/^[cf][1-9][0-9]{0,9}$/.test(s)) throw new ErroContatos(400, 'Pessoa inválida.'); return s; };
const dataValida = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const logoValida = (v) => { const s = String(v || ''); return /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length <= MAX_LOGO ? s : ''; };
const assinaturaValida = (v) => { const s = String(v || ''); if (!s) return ''; if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s) || s.length > MAX_ASSINATURA) throw new ErroContatos(400, 'Assinatura inválida. Limpe e assine de novo.'); return s; };
/** Telefone só com números (10 a 13 dígitos, com ou sem o 55). */
export const telefoneValido = (v) => { const t = String(v || '').replace(/\D/g, ''); return t.length >= 10 && t.length <= 13 ? t : ''; };
/** Telefone para mostrar. Ex.: "41999990000" → "(41) 99999-0000" (o que não tem 10 ou 11 números sai como veio). */
export const foneBr = (v) => {
  const n = String(v || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return String(v || '');
};

async function lerJson(request, maximo = MAX_PEDIDO) {
  const tamanho = Number(request.headers.get('Content-Length') || 0);
  if (tamanho > maximo) throw new ErroContatos(413, 'Pedido grande demais.');
  const t = await request.text();
  if (t.length > maximo) throw new ErroContatos(413, 'Pedido grande demais.');
  try { return JSON.parse(t || '{}'); } catch { throw new ErroContatos(400, 'Pedido inválido.'); }
}

async function lerRegistro(env, com, dest) {
  const obj = await env.DADOS.get(chaveRegistro(com, dest));
  return obj ? { registro: JSON.parse(await obj.text()), etag: obj.etag } : null;
}

async function mudarRegistro(env, com, dest, mudar) {
  for (let i = 0; i < 4; i += 1) {
    const atual = await lerRegistro(env, com, dest);
    if (!atual) throw new ErroContatos(404, 'Link não encontrado.');
    const novo = (await mudar(atual.registro)) || atual.registro;
    novo.atualizado_em = new Date().toISOString();
    novo.eventos = (novo.eventos || []).slice(-60);
    const ok = await env.DADOS.put(chaveRegistro(com, dest), JSON.stringify(novo), { onlyIf: { etagMatches: atual.etag }, httpMetadata: { contentType: 'application/json' } });
    if (ok) return novo;
  }
  throw new ErroContatos(409, 'Outra mudança ao mesmo tempo: tente de novo.');
}

/** O que a equipe manda sobre a pessoa e a empresa (só texto curto; a logo como imagem pequena). */
export function contextoValido(ctx = {}) {
  const lista = (v, n, max) => (Array.isArray(v) ? v : []).slice(0, n).map((x) => texto(x, max)).filter(Boolean);
  const prazo = dataValida(ctx.prazo);
  if (!prazo) throw new ErroContatos(400, 'Prazo do comunicado inválido.');
  const aviso = texto(ctx.aviso, 6000);
  if (!aviso) throw new ErroContatos(400, 'Falta o texto do aviso.');
  return {
    empresas: lista(ctx.empresas, 4, 160), cnpjs: lista(ctx.cnpjs, 4, 20), cidade: texto(ctx.cidade, 80), logo: logoValida(ctx.logo),
    titulo: texto(ctx.titulo, 160), nome: texto(ctx.nome, 160), tipo: ctx.tipo === 'fiador' ? 'fiador' : 'inquilino',
    imovel: texto(ctx.imovel, 300), desde: texto(ctx.desde, 20), locatario: texto(ctx.locatario, 160),
    email: texto(ctx.email, 254), telefone: texto(ctx.telefone, 30), whatsapp: ctx.whatsapp === true,
    prazo, aviso, ciencia: texto(ctx.ciencia, 1200) || 'Li o aviso acima e concordo.',
    email_empresa: texto(ctx.email_empresa, 254), telefone_empresa: texto(ctx.telefone_empresa, 40),
  };
}

const paraEquipe = (r) => {
  const { hash, codigo, ...resto } = r;
  return { ...resto, codigo_enviado_para: codigo ? codigo.para : null, codigos_enviados: codigo ? (codigo.enviados || []).length : 0 };
};

// ---------------------------------------------------------------------------
// Equipe
// ---------------------------------------------------------------------------
/** Cria (ou troca) o link de uma pessoa: { comunicado_id, destino, contexto }. Devolve { url, vence_em }. */
export async function criarLinkContatos(request, env, email) {
  const p = await lerJson(request);
  const com = comunicadoValido(p.comunicado_id);
  const dest = destinoValido(p.destino);
  const contexto = contextoValido(p.contexto);
  const chave = novaChave();
  const hash = await hashDaChave(chave);
  const agora = new Date().toISOString();
  const vence = new Date(Date.parse(`${contexto.prazo}T23:59:59-03:00`) + DIAS_FOLGA * 86400000).toISOString();
  let hashAntigo = null; let gravado = false;
  for (let i = 0; i < 4 && !gravado; i += 1) {
    const anterior = await lerRegistro(env, com, dest);
    const velho = anterior ? anterior.registro : {};
    hashAntigo = velho.hash || null;
    const registro = {
      comunicado_id: com, destino: dest, hash, contexto, criado_em: velho.criado_em || agora, criado_por: email, vence_em: vence, atualizado_em: agora,
      aberto_em: velho.aberto_em || null, aberturas: velho.aberturas || [], codigo: null, resposta: velho.resposta || null,
      eventos: [...(velho.eventos || []), { em: agora, texto: `link ${anterior ? 'renovado' : 'criado'} por ${email}` }],
    };
    gravado = !!(await env.DADOS.put(chaveRegistro(com, dest), JSON.stringify(registro), {
      ...(anterior ? { onlyIf: { etagMatches: anterior.etag } } : SO_SE_NOVO()), httpMetadata: { contentType: 'application/json' },
    }));
  }
  if (!gravado) throw new ErroContatos(409, 'Outra mudança ao mesmo tempo: tente de novo.');
  await env.DADOS.put(chaveToken(hash), JSON.stringify({ comunicado_id: com, destino: dest }));
  if (hashAntigo && hashAntigo !== hash) await env.DADOS.delete(chaveToken(hashAntigo));
  const base = String(env.URL_FICHA || 'https://ficha.ankjck.com.br/').replace(/\/ficha\/?$/, '/').replace(/\/?$/, '/');
  return json(200, { ok: true, url: `${base}contatos#${chave}`, vence_em: vence });
}

/** Situação de todos os links de um comunicado (com a resposta). Registro passado da guarda sai. */
export async function listarContatos(env, url) {
  const com = comunicadoValido(url.searchParams.get('comunicado'));
  const lista = [];
  const ler = async (chave) => {
    const obj = await env.DADOS.get(chave);
    if (!obj) return null;
    const reg = JSON.parse(await obj.text());
    if (passou(reg.vence_em, DIAS_GUARDA_CONTATOS)) {
      await env.DADOS.delete([chave, ...(reg.hash ? [chaveToken(reg.hash)] : [])]);
      return null;
    }
    const { contexto, ...resto } = paraEquipe(reg);
    return { ...resto, nome: contexto.nome };
  };
  let cursor;
  do {
    const r = await env.DADOS.list({ prefix: `publico/contatos/${com}/`, cursor, limit: 1000 });
    const chaves = r.objects.map((o) => o.key).filter((k) => k.endsWith('.json'));
    for (let i = 0; i < chaves.length; i += LEITURAS_JUNTAS) lista.push(...(await Promise.all(chaves.slice(i, i + LEITURAS_JUNTAS).map(ler))).filter(Boolean));
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return json(200, { links: lista });
}

/** Desliga o link (a resposta continua guardada): { comunicado_id, destino }. */
export async function encerrarContatos(request, env, email) {
  const p = await lerJson(request);
  const com = comunicadoValido(p.comunicado_id);
  const dest = destinoValido(p.destino);
  const novo = await mudarRegistro(env, com, dest, (r) => { r.encerrado_em = new Date().toISOString(); r.eventos.push({ em: r.encerrado_em, texto: `link encerrado por ${email}` }); });
  if (novo.hash) await env.DADOS.delete(chaveToken(novo.hash));
  return json(200, { ok: true });
}

/** Faxina (alarme diário do cofre): registro passado da guarda sai inteiro. */
export async function faxinaDosContatos(env) {
  if (!env.DADOS) return 0;
  let cursor; let apagados = 0;
  do {
    const r = await env.DADOS.list({ prefix: 'publico/contatos/', cursor, limit: 1000 });
    for (const o of r.objects) {
      if (!o.key.endsWith('.json')) continue;
      const obj = await env.DADOS.get(o.key);
      if (!obj) continue;
      let reg; try { reg = JSON.parse(await obj.text()); } catch { continue; }
      if (passou(reg.vence_em, DIAS_GUARDA_CONTATOS)) { await env.DADOS.delete([o.key, ...(reg.hash ? [chaveToken(reg.hash)] : [])]); apagados += 1; }
    }
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return apagados;
}

export async function atenderEquipeContatos(request, env, rota, email) {
  const url = new URL(request.url);
  const m = request.method;
  try {
    if (rota === 'link' && m === 'POST') return await criarLinkContatos(request, env, email);
    if (rota === 'lista' && m === 'GET') return await listarContatos(env, url);
    if (rota === 'encerrar' && m === 'POST') return await encerrarContatos(request, env, email);
    return json(404, { erro: 'Não encontrado.' });
  } catch (e) {
    if (e instanceof ErroContatos) return json(e.status, { erro: e.message });
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Público
// ---------------------------------------------------------------------------
async function registroDaChave(request, env, { gravar = false } = {}) {
  const chave = request.headers.get('X-Ficha-Token') || '';
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(chave)) throw new ErroContatos(404, 'Link inválido. Confira se abriu o endereço inteiro.');
  const hash = await hashDaChave(chave);
  const ponteiro = await env.DADOS.get(chaveToken(hash));
  if (!ponteiro) throw new ErroContatos(404, 'Este link não vale mais. Peça um novo para a administração.');
  const { comunicado_id: com, destino: dest } = JSON.parse(await ponteiro.text());
  const atual = await lerRegistro(env, com, dest);
  if (!atual || atual.registro.hash !== hash || atual.registro.encerrado_em) throw new ErroContatos(404, 'Este link não vale mais. Peça um novo para a administração.');
  if (gravar && passou(atual.registro.vence_em)) throw new ErroContatos(410, 'O prazo deste link acabou. Peça um novo para a administração.');
  return { com, dest, registro: atual.registro };
}

const canalDe = (request) => (['email', 'whatsapp'].includes(request.headers.get('X-Canal')) ? request.headers.get('X-Canal') : 'direto');
const ipDe = (request) => texto(request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '', 60);
const aparelhoDe = (request) => texto(request.headers.get('User-Agent') || '', 300);

/** A página: contexto e, se já respondeu, a resposta (sem o código). A primeira abertura de cada canal fica anotada. */
export async function lerContatosPublico(request, env) {
  const { com, dest, registro } = await registroDaChave(request, env);
  const canal = canalDe(request);
  let r = registro;
  if (!r.aberturas.some((a) => a.canal === canal) && r.aberturas.length < 20) {
    try {
      r = await mudarRegistro(env, com, dest, (x) => {
        const em = new Date().toISOString();
        if (!x.aberto_em) x.aberto_em = em;
        if (!x.aberturas.some((a) => a.canal === canal)) x.aberturas.push({ em, canal, ip: ipDe(request), aparelho: aparelhoDe(request) });
      });
    } catch (e) { console.warn('abertura do link de contatos', e.message); }
  }
  const resp = r.resposta;
  return json(200, {
    contexto: r.contexto, vence_em: r.vence_em, vencido: passou(r.vence_em),
    resposta: resp ? { em: resp.em, email: resp.email, telefone: resp.telefone, whatsapp: resp.whatsapp, melhor: resp.melhor, assinou: !!resp.assinatura, comprovante: !!resp.comprovante_em } : null,
    codigo_para: r.codigo && !passou(r.codigo.vence, 0) ? r.codigo.para : null,
  });
}

/** Manda o código de 6 números para o e-mail digitado: { email }. */
export async function enviarCodigoContatos(request, env, { buscar = fetch } = {}) {
  const { com, dest, registro } = await registroDaChave(request, env, { gravar: true });
  const p = await lerJson(request, 8 * 1024);
  const para = texto(p.email, 254).toLowerCase();
  if (!emailValido(para)) throw new ErroContatos(400, 'Confira o e-mail: parece incompleto.');
  const enviados = (registro.codigo && registro.codigo.enviados) || [];
  if (enviados.length >= MAX_CODIGOS) throw new ErroContatos(429, 'Já mandamos códigos demais para este link. Fale com a administração.');
  if (enviados.length && Date.now() - Date.parse(enviados.at(-1)) < 60000) throw new ErroContatos(429, 'Espere um minuto para pedir outro código.');
  const simular = env.SIMULAR_GMAIL === '1' && /\/\/(localhost|127\.0\.0\.1)[:/]/.test(String(env.ORIGEM || ''));
  const conta = simular ? null : await contaGuardada(env);
  if (!estadoEmail(env, { simular, conta }).ligado) throw new ErroContatos(503, 'O envio de e-mail da administração está desligado agora. Tente mais tarde.');
  const codigo = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
  const em = new Date().toISOString();
  let anterior = null; let hashNovo = null;
  await mudarRegistro(env, com, dest, async (r) => {
    const lista = (r.codigo && r.codigo.enviados) || [];
    if (lista.length >= MAX_CODIGOS) throw new ErroContatos(429, 'Já mandamos códigos demais para este link. Fale com a administração.');
    anterior = r.codigo || null;
    hashNovo = await sha(`${r.hash}|${codigo}`);
    r.codigo = { para, hash: hashNovo, vence: new Date(Date.now() + MINUTOS_CODIGO * 60000).toISOString(), tentativas: 0, enviados: [...lista, em] };
    r.eventos.push({ em, texto: `código enviado para ${para}` });
  });
  const c = registro.contexto;
  const empresa = c.empresas.join(' e ') || 'Administração';
  const corpo = `Olá${c.nome ? `, ${c.nome.split(/\s+/)[0]}` : ''}.\n\nSeu código para confirmar este e-mail é: ${codigo}\n\nEle vale por ${MINUTOS_CODIGO} minutos. Digite na página da confirmação de contatos.\n\nSe você não pediu este código, ignore este e-mail.\n\n${empresa}`;
  try {
    await enviarEmail(env, { para, assunto: `Seu código de confirmação: ${codigo}`, texto: corpo }, { buscar, simular, conta });
  } catch (e) {
    console.warn('código dos contatos', e.message);
    // o código não saiu: não conta no limite nem na espera de 1 minuto, e o código anterior (se havia) continua valendo
    try {
      await mudarRegistro(env, com, dest, (r) => {
        if (!r.codigo || r.codigo.hash !== hashNovo) return r;
        r.codigo = anterior ? { ...anterior, enviados: (r.codigo.enviados || []).filter((x) => x !== em) } : null;
        r.eventos.push({ em: new Date().toISOString(), texto: `código para ${para} não saiu (falha no envio do e-mail)` });
        return r;
      });
    } catch (e2) { console.warn('desfazer o código que não saiu', e2.message); }
    throw new ErroContatos(502, 'Não conseguimos mandar o e-mail agora. Confira o endereço e tente de novo em alguns minutos.');
  }
  return json(200, { ok: true, para });
}

/** Texto do aceite (o que a pessoa leu): entra inteiro na resposta, com o resumo SHA-256. */
export function textoDoAceite(c) {
  return [c.titulo, c.aviso, `Declaração: ${c.ciencia}`].filter(Boolean).join('\n\n');
}

/**
 * Confirma: { email, codigo, telefone, whatsapp, melhor, ciente: true, assinatura? }.
 * O e-mail precisa ser o do último código enviado e o código precisa bater (até MAX_TENTATIVAS erros).
 */
export async function confirmarContatos(request, env, { buscar = fetch, avisar = true } = {}) {
  const { com, dest, registro } = await registroDaChave(request, env, { gravar: true });
  const p = await lerJson(request);
  if (p.ciente !== true) throw new ErroContatos(400, 'Marque "Li e concordo" antes de confirmar.');
  const email = texto(p.email, 254).toLowerCase();
  const telefone = telefoneValido(p.telefone);
  if (!telefone) throw new ErroContatos(400, 'Confira o celular: com DDD, só números. Ex.: (41) 99999-0000.');
  const melhor = MELHORES.includes(p.melhor) ? p.melhor : '';
  if (!melhor) throw new ErroContatos(400, 'Escolha a melhor forma de falar com você.');
  const assinatura = assinaturaValida(p.assinatura);
  const codigo = String(p.codigo || '').replace(/\D/g, '');
  const em = new Date().toISOString();
  let errou = false;
  const novo = await mudarRegistro(env, com, dest, async (r) => {
    errou = false;
    const k = r.codigo;
    if (!k || k.para !== email) throw new ErroContatos(400, 'Peça o código para este e-mail antes de confirmar.');
    if (k.tentativas >= MAX_TENTATIVAS) throw new ErroContatos(429, 'Código errado vezes demais. Peça um código novo.');
    if (passou(k.vence)) throw new ErroContatos(400, 'O código venceu. Peça um código novo.');
    if (codigo.length !== 6 || (await sha(`${r.hash}|${codigo}`)) !== k.hash) { k.tentativas += 1; errou = true; return r; }
    const textoAceito = textoDoAceite(r.contexto);
    r.resposta = {
      em, email, telefone, whatsapp: p.whatsapp === true, melhor, ciente: true, assinatura,
      email_confirmado: true, canal: canalDe(request), ip: ipDe(request), aparelho: aparelhoDe(request),
      texto_aceito: textoAceito, texto_sha256: await sha(textoAceito), anteriores: r.resposta ? [...(r.resposta.anteriores || []), { em: r.resposta.em, email: r.resposta.email, telefone: r.resposta.telefone }].slice(-5) : [],
    };
    r.codigo = null;
    r.eventos.push({ em, texto: `contatos confirmados (${email}, ${telefone})` });
    return r;
  });
  if (errou) throw new ErroContatos(400, 'Código errado. Confira o e-mail e digite de novo.');
  const c = novo.contexto;
  const empresa = c.empresas.join(' e ') || 'Administração';
  const quando = new Date(em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  const comprovante = `Olá${c.nome ? `, ${c.nome.split(/\s+/)[0]}` : ''}.\n\nRecebemos a confirmação dos seus contatos em ${quando} (horário de Brasília).\n\n`
    + `Imóvel: ${c.imovel}\nE-mail: ${email} (confirmado pelo código)\nCelular: ${foneBr(telefone)}${p.whatsapp === true ? ' (WhatsApp)' : ''}\nMelhor forma de falar com você: ${melhor}\n${assinatura ? 'Assinatura: feita na tela\n' : ''}\n`
    + `O texto que você leu e aceitou:\n\n${textoDoAceite(c)}\n\nCódigo de conferência do texto: ${novo.resposta.texto_sha256.slice(0, 16)}\n\nGuarde este e-mail. Qualquer dúvida, fale com a administração${c.telefone_empresa ? ` pelo ${c.telefone_empresa}` : ''}.\n\n${empresa}`;
  const simular = env.SIMULAR_GMAIL === '1' && /\/\/(localhost|127\.0\.0\.1)[:/]/.test(String(env.ORIGEM || ''));
  let comprovanteSaiu = false;
  try {
    const conta = simular ? null : await contaGuardada(env);
    if (estadoEmail(env, { simular, conta }).ligado) {
      await enviarEmail(env, { para: email, assunto: `Comprovante: contatos confirmados (${c.imovel || empresa})`.slice(0, 190), texto: comprovante }, { buscar, simular, conta });
      comprovanteSaiu = true;
    }
  } catch (e) { console.warn('comprovante dos contatos', e.message); }
  // anotado na resposta: quem reabre o link vê se o comprovante saiu
  try {
    await mudarRegistro(env, com, dest, (r) => {
      if (r.resposta && r.resposta.em === em) r.resposta.comprovante_em = comprovanteSaiu ? new Date().toISOString() : null;
      return r;
    });
  } catch (e) { console.warn('anotar o comprovante dos contatos', e.message); }
  if (avisar) {
    const quem = dest.startsWith('f') ? 'Um fiador' : 'Um inquilino';
    try { await avisarAparelhos(env, { titulo: 'Contatos confirmados', texto: `${quem} confirmou os contatos. Toque para abrir.`, url: './#/comunicacoes', tag: `contatos-${com}` }, { buscar }); } catch (e) { console.warn('aviso no celular (contatos)', e.message); }
  }
  return json(200, { ok: true, em, comprovante: comprovanteSaiu });
}

/** Rotas públicas dos contatos (dentro do endereço da ficha). `r`: o caminho depois de /api/publico/. */
export async function atenderContatosPublico(request, env, r, opcoes = {}) {
  const m = request.method;
  try {
    if (r === 'contatos' && m === 'GET') return await lerContatosPublico(request, env);
    if (r === 'contatos/codigo' && m === 'POST') return await enviarCodigoContatos(request, env, opcoes);
    if (r === 'contatos/confirmar' && m === 'POST') return await confirmarContatos(request, env, opcoes);
    return json(404, { erro: 'Não encontrado.' });
  } catch (e) {
    if (e instanceof ErroContatos) return json(e.status, { erro: e.message });
    console.error(e);
    return json(500, { erro: 'Erro no servidor. Tente de novo em alguns minutos.' });
  }
}

// ---------------------------------------------------------------------------
// A página (um arquivo só, sem nada de fora; CSP com nonce). Sem barra invertida no script (fica dentro de um texto `...`).
// ---------------------------------------------------------------------------
export function paginaDosContatos() {
  const nonce = novaChave().slice(0, 24);
  const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data:; form-action 'none'; frame-ancestors 'none'; base-uri 'none'`;
  return new Response(PAGINA.replaceAll('{{NONCE}}', nonce), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': csp, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex', ...HSTS },
  });
}

const PAGINA = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Confirmação de contatos</title>
<style nonce="{{NONCE}}">
:root{--fundo:#f5f6f8;--cartao:#fff;--texto:#1d2330;--suave:#5d6675;--borda:#d6dae1;--cor:#1e3a8a;--claro:#e8edfb;--ok:#1d7a45;--aviso:#8a5a00;--perigo:#b3261e}
@media (prefers-color-scheme:dark){:root{--fundo:#15181d;--cartao:#1e232a;--texto:#e7eaef;--suave:#9aa3b2;--borda:#343b46;--cor:#8fb3ff;--claro:#1f2a44;--ok:#5cc28a;--aviso:#e0b04f;--perigo:#ff8a80}}
*{box-sizing:border-box}body{margin:0;background:var(--fundo);color:var(--texto);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:620px;margin:0 auto;padding:12px 14px 40px}
.topo{text-align:center;background:var(--cartao);border:1px solid var(--borda);border-radius:12px;padding:16px;margin:8px 0}
.topo img{max-width:160px;max-height:90px;display:block;margin:0 auto 8px}.topo .nome{font-weight:700;font-size:1.05rem}
.seguro{font-size:.85rem;color:var(--suave);margin-top:6px}
.cartao{background:var(--cartao);border:1px solid var(--borda);border-radius:12px;padding:16px;margin:12px 0}
h1{font-size:1.25rem;margin:0 0 6px}h2{font-size:1.05rem;margin:0 0 8px}.suave{color:var(--suave);font-size:.92rem}
label{display:block;font-weight:600;margin:12px 0 4px}input[type=email],input[type=tel],input[type=text]{width:100%;font:inherit;padding:11px;border:1px solid var(--borda);border-radius:8px;background:var(--cartao);color:var(--texto)}
.caixa{display:flex;gap:10px;align-items:flex-start;font-weight:400;margin:10px 0}.caixa input{margin-top:5px;transform:scale(1.3)}
.opcoes{display:flex;gap:8px;flex-wrap:wrap}.opcoes label{font-weight:400;margin:0;border:1px solid var(--borda);border-radius:8px;padding:8px 12px;display:flex;gap:6px;align-items:center}
button{font:inherit;font-weight:600;padding:12px 18px;border-radius:10px;border:0;background:var(--cor);color:#fff;cursor:pointer;margin:8px 8px 0 0}
@media (prefers-color-scheme:dark){button{color:#10172a}}
button.sec{background:transparent;color:var(--cor);border:1px solid var(--cor)}button:disabled{opacity:.5}
.aviso{border-left:4px solid var(--aviso);padding:10px 12px;background:color-mix(in srgb,var(--aviso) 10%,transparent);border-radius:6px}
.ok{border-left:4px solid var(--ok);padding:10px 12px;background:color-mix(in srgb,var(--ok) 10%,transparent);border-radius:6px}
.texto{white-space:pre-wrap;background:var(--claro);border-radius:8px;padding:12px}
.erro{color:var(--perigo);font-weight:600}canvas{width:100%;height:150px;border:1px dashed var(--borda);border-radius:8px;touch-action:none;background:#fff}
.rodape{text-align:center;color:var(--suave);font-size:.82rem;margin-top:18px}[hidden]{display:none!important}
</style></head><body><main id="app"><p class="suave">Carregando…</p></main>
<script nonce="{{NONCE}}">
(() => {
  const app = document.getElementById('app');
  const chave = location.hash.slice(1);
  const canal = { e: 'email', w: 'whatsapp' }[new URLSearchParams(location.search).get('c')] || 'direto';
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dataBr = (iso) => (iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('pt-BR') : '');
  const horaBr = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
  const so = (t) => String(t || '').split('').filter((x) => x >= '0' && x <= '9').join('');
  const fone = (t) => { const n = so(t).replace(/^55(?=[0-9]{10,11}$)/, ''); return n.length === 11 ? '(' + n.slice(0, 2) + ') ' + n.slice(2, 7) + '-' + n.slice(7) : n.length === 10 ? '(' + n.slice(0, 2) + ') ' + n.slice(2, 6) + '-' + n.slice(6) : t || ''; };
  const api = async (caminho, op = {}) => {
    const r = await fetch('/api/publico/' + caminho, { ...op, headers: { 'X-Ficha-Token': chave, 'X-Canal': canal, ...(op.method && op.method !== 'GET' ? { 'X-Ficha': '1', 'Content-Type': 'application/json' } : {}) } });
    const tipo = r.headers.get('content-type') || '';
    if (!tipo.includes('json')) throw new Error('Sem resposta do servidor. Tente de novo.');
    const d = await r.json();
    if (!r.ok) throw new Error(d.erro || 'Não deu certo. Tente de novo.');
    return d;
  };
  let D = null; let assinou = false;
  const topo = (c) => '<div class="topo">' + (c.logo ? '<img src="' + esc(c.logo) + '" alt="Logo">' : '')
    + '<div class="nome">' + esc(c.empresas.join(' e ') || 'Administração de imóveis') + '</div>'
    + (c.cnpjs.length ? '<div class="suave">CNPJ ' + esc(c.cnpjs.join(' · ')) + (c.cidade ? ' · ' + esc(c.cidade) : '') + '</div>' : '')
    + '<div class="seguro">Endereço seguro: <b>' + esc(location.host) + '</b>' + (c.email_empresa ? ' · e-mail oficial: <b>' + esc(c.email_empresa) + '</b>' : '') + '</div></div>';
  const rodape = (c) => '<p class="rodape">A conta e a chave Pix para pagamento não mudam. Nunca pedimos pagamento em outra conta.' + (c.telefone_empresa ? ' Na dúvida, ligue para ' + esc(c.telefone_empresa) + '.' : '') + '</p>';

  function feito(c, resp, novo) {
    app.innerHTML = topo(c) + '<div class="cartao"><div class="ok"><b>' + (novo ? 'Pronto! Contatos confirmados.' : 'Você já confirmou seus contatos.') + '</b><br>Em ' + esc(horaBr(resp.em)) + '.</div>'
      + '<p>E-mail: <b>' + esc(resp.email) + '</b><br>Celular: <b>' + esc(fone(resp.telefone)) + '</b>' + (resp.whatsapp ? ' (WhatsApp)' : '') + '<br>Melhor contato: <b>' + esc(resp.melhor) + '</b></p>'
      + '<p class="suave">' + (resp.comprovante ? 'Mandamos o comprovante para o seu e-mail.' : 'Não conseguimos mandar o comprovante para o seu e-mail agora: guarde esta tela (tire uma foto ou um print).') + ' Guarde o endereço <b>' + esc(c.email_empresa || '') + '</b> nos seus contatos e confira também a caixa de spam.</p>'
      + (D && !D.vencido ? '<button class="sec" id="corrigir">Mudar meus contatos</button>' : '') + '</div>' + rodape(c);
    const b = document.getElementById('corrigir');
    if (b) b.addEventListener('click', () => formulario(c, resp));
  }

  function formulario(c, antes) {
    const email = antes ? antes.email : c.email;
    const tel = antes ? antes.telefone : c.telefone;
    const zap = antes ? antes.whatsapp : c.whatsapp;
    const melhor = antes ? antes.melhor : (zap ? 'WhatsApp' : '');
    app.innerHTML = topo(c)
      + '<div class="cartao"><h1>Olá, ' + esc(String(c.nome).split(' ')[0]) + '</h1>'
      + '<p class="suave">' + (c.tipo === 'fiador' ? 'Você é fiador(a) da locação de ' + esc(c.locatario) + ', no imóvel ' : 'Imóvel: ') + esc(c.imovel) + (c.desde ? ' · contrato desde ' + esc(c.desde) : '') + '</p>'
      + (c.titulo ? '<h2>' + esc(c.titulo) + '</h2>' : '') + '<div class="texto">' + esc(c.aviso) + '</div>'
      + '<p class="suave">Prazo para confirmar: <b>' + esc(dataBr(c.prazo)) + '</b>.</p></div>'
      + '<div class="cartao"><h2>1. Seus contatos</h2><p class="suave">Confira e, se mudou, corrija.</p>'
      + '<label for="email">E-mail</label><input id="email" type="email" autocomplete="email" value="' + esc(email) + '">'
      + '<label for="tel">Celular com DDD</label><input id="tel" type="tel" autocomplete="tel" value="' + esc(fone(tel)) + '" placeholder="(41) 99999-0000">'
      + '<label class="caixa"><input type="checkbox" id="zap"' + (zap ? ' checked' : '') + '> Este celular tem WhatsApp</label>'
      + '<label>Melhor forma de falar com você</label><div class="opcoes">' + ['WhatsApp', 'E-mail', 'Ligação'].map((o) => '<label><input type="radio" name="melhor" value="' + o + '"' + (o === melhor ? ' checked' : '') + '> ' + o + '</label>').join('') + '</div></div>'
      + '<div class="cartao"><h2>2. Confirme o e-mail</h2><p class="suave">Mandamos um código de 6 números para o e-mail acima. É assim que sabemos que nossas mensagens chegam até você.</p>'
      + '<button class="sec" id="pedir">Mandar o código</button><div id="msg-codigo" class="suave"></div>'
      + '<label for="codigo">Código recebido</label><input id="codigo" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"></div>'
      + '<div class="cartao"><h2>3. Ciência</h2><label class="caixa"><input type="checkbox" id="ciente"> <span>' + esc(c.ciencia) + '</span></label>'
      + '<label>Assinatura com o dedo (opcional)</label><canvas id="ass"></canvas><button class="sec" id="limpar" type="button">Limpar assinatura</button></div>'
      + '<div class="cartao"><button id="confirmar">Confirmar</button><div id="msg" class="erro"></div>'
      + '<p class="suave">Ao confirmar, guardamos a data, a hora, o endereço de internet e o aparelho usado, como prova da confirmação. Seus dados são usados só para a administração da locação.</p></div>'
      + rodape(c);
    if (D.codigo_para && D.codigo_para === String(email).toLowerCase()) document.getElementById('msg-codigo').textContent = 'Código já enviado para ' + D.codigo_para + '. Confira a caixa de entrada e o spam.';
    // assinatura
    const cv = document.getElementById('ass'); const ctx = cv.getContext('2d');
    // tinta sempre escura sobre fundo branco, em qualquer tema do aparelho (o comprovante do aceite é uma folha branca)
    const fundo = () => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.restore(); };
    const ajustar = () => { const r = cv.getBoundingClientRect(); cv.width = r.width * 2; cv.height = r.height * 2; ctx.scale(2, 2); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#111111'; fundo(); };
    ajustar(); assinou = false;
    let desenhando = false;
    const ponto = (ev) => { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
    cv.addEventListener('pointerdown', (ev) => { desenhando = true; cv.setPointerCapture(ev.pointerId); const [x, y] = ponto(ev); ctx.beginPath(); ctx.moveTo(x, y); });
    cv.addEventListener('pointermove', (ev) => { if (!desenhando) return; const [x, y] = ponto(ev); ctx.lineTo(x, y); ctx.stroke(); assinou = true; });
    cv.addEventListener('pointerup', () => { desenhando = false; });
    document.getElementById('limpar').addEventListener('click', () => { fundo(); assinou = false; });
    document.getElementById('pedir').addEventListener('click', async (ev) => {
      const b = ev.currentTarget; const m = document.getElementById('msg-codigo'); b.disabled = true; m.className = 'suave'; m.textContent = 'Mandando…';
      // a espera de 1 minuto só quando o código saiu; no erro (ex.: e-mail digitado errado) o botão volta na hora
      try { const r = await api('contatos/codigo', { method: 'POST', body: JSON.stringify({ email: document.getElementById('email').value }) }); m.textContent = 'Código enviado para ' + r.para + '. Confira a caixa de entrada e o spam.'; setTimeout(() => { b.disabled = false; }, 60000); }
      catch (e) { m.className = 'erro'; m.textContent = e.message; b.disabled = false; }
    });
    document.getElementById('confirmar').addEventListener('click', async (ev) => {
      const msg = document.getElementById('msg'); msg.textContent = '';
      const melhorEsc = document.querySelector('input[name=melhor]:checked');
      if (!document.getElementById('ciente').checked) { msg.textContent = 'Marque a caixa de ciência antes de confirmar.'; return; }
      if (!melhorEsc) { msg.textContent = 'Escolha a melhor forma de falar com você.'; return; }
      if (so(document.getElementById('codigo').value).length !== 6) { msg.textContent = 'Digite o código de 6 números que chegou no e-mail.'; return; }
      ev.target.disabled = true; ev.target.textContent = 'Confirmando…';
      try {
        const corpo = { email: document.getElementById('email').value, codigo: document.getElementById('codigo').value, telefone: document.getElementById('tel').value,
          whatsapp: document.getElementById('zap').checked, melhor: melhorEsc.value, ciente: true, assinatura: assinou ? cv.toDataURL('image/png') : '' };
        const r = await api('contatos/confirmar', { method: 'POST', body: JSON.stringify(corpo) });
        feito(c, { em: r.em, email: String(corpo.email).trim().toLowerCase(), telefone: so(corpo.telefone), whatsapp: corpo.whatsapp, melhor: corpo.melhor, comprovante: !!r.comprovante }, true);
        window.scrollTo(0, 0);
      } catch (e) { msg.textContent = e.message; ev.target.disabled = false; ev.target.textContent = 'Confirmar'; }
    });
  }

  (async () => {
    if (!chave) { app.innerHTML = '<div class="cartao"><p class="erro">Link incompleto. Abra o endereço inteiro que você recebeu.</p></div>'; return; }
    try {
      D = await api('contatos');
      if (D.resposta) feito(D.contexto, D.resposta, false);
      else if (D.vencido) app.innerHTML = topo(D.contexto) + '<div class="cartao"><p class="aviso">O prazo deste link acabou. Fale com a administração para receber um novo.</p></div>' + rodape(D.contexto);
      else formulario(D.contexto, null);
    } catch (e) { app.innerHTML = '<div class="cartao"><p class="erro">' + esc(e.message) + '</p></div>'; }
  })();
})();
</script></body></html>`;
