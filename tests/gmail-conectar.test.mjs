// "Conectar o Gmail" (Entrar com o Google): início só do administrador, state de uso único (vencido, repetido, de outra pessoa:
// recusado), troca do código com PKCE, refresh token guardado cifrado no cofre e nunca devolvido à tela, renovação do access
// token, Desconectar (apaga e revoga) e o segredo antigo GMAIL_REFRESH_TOKEN valendo até alguém conectar. Cofre de verdade
// (node:sqlite) e Google de mentira (fetch falso). Dados fictícios; nada vai ao Google.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import * as G from '../nuvem/gmail.mjs';
import * as K from '../nuvem/cofre.mjs';
import * as W from '../nuvem/worker.mjs';
import * as S from '../docs/js/gmail.js';
import * as R from '../docs/js/regras.js';
import { r2Falso } from './r2-falso.mjs';

const BASE = 'http://localhost:8787';
const DONO = 'dono@exemplo.com.br'; const SOCIA = 'socia@exemplo.com.br'; const OPERADOR = 'operador@exemplo.com.br';
const CONTA = 'empresa@exemplo.com.br';
const CLIENTE = { GMAIL_CLIENT_ID: 'id-teste.apps.googleusercontent.com', GMAIL_CLIENT_SECRET: 'segredo-do-cliente-teste' };
const REFRESH = 'refresh-do-botao-1234567890';
const respostaJson = (status, dados) => new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json' } });
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const idToken = (dados = {}) => `${b64u({ alg: 'RS256' })}.${b64u({ iss: 'https://accounts.google.com', aud: CLIENTE.GMAIL_CLIENT_ID, email: CONTA, email_verified: true, ...dados })}.assinatura`;

function novoCofre() {
  const db = new DatabaseSync(':memory:');
  const sql = { exec(q, ...p) { if (!p.length && q.trim().split(';').filter((x) => x.trim()).length > 1) { db.exec(q); return { toArray: () => [] }; } const l = db.prepare(q).all(...p).map((x) => ({ ...x })); return { toArray: () => l }; } };
  const tx = (fn) => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  const cofre = new K.CofreDO({ storage: { sql, transactionSync: tx } }, { DADOS: r2Falso() });
  return { cofre, db, COFRE: { idFromName: (n) => n, get: () => ({ fetch: (req) => cofre.fetch(req) }) } };
}

async function cenario(extra = {}) {
  const c = novoCofre();
  const d = R.bancoVazio();
  R.inserir(d, 'usuarios', { login: DONO, nome: 'Dono', papel: 'admin', ativo: true, senha_hash: 'h' }, 'teste');
  R.inserir(d, 'usuarios', { login: 'socia', email: SOCIA, nome: 'Sócia', papel: 'admin', ativo: true, senha_hash: 'h' }, 'teste');
  R.inserir(d, 'usuarios', { login: 'operador', email: OPERADOR, nome: 'Operador', papel: 'operador', ativo: true, senha_hash: 'h' }, 'teste');
  const r = await c.cofre.fetch(new Request('https://cofre/importar', { method: 'POST', body: JSON.stringify({ dados: d }), headers: { 'X-Email-Conferido': DONO } }));
  assert.equal(r.status, 200);
  const google = googleFalso();
  const env = { ORIGEM: BASE, MODO_TESTE: '1', DADOS: r2Falso(), COFRE: c.COFRE, ...CLIENTE, ...extra };
  /** Pedido ao Worker como `quem` (o login do Access, aqui pelo MODO_TESTE). */
  const pedir = (quem, metodo, caminho, { corpo, cabecalhos } = {}) => W.atender(new Request(`${BASE}${caminho}`, {
    method: metodo, body: corpo,
    headers: cabecalhos || (metodo !== 'GET' ? { 'X-Sistema': 'imoveis', Origin: BASE, 'Content-Type': 'application/json' } : {}),
  }), { ...env, EMAIL_TESTE: quem }, google.buscar);
  return { ...c, env, google, pedir };
}

/** Google de mentira: token (código e renovação), revogação e envio. */
function googleFalso() {
  const g = { pedidos: [], codigos: new Map(), escopo: `openid ${G.ESCOPO_ENVIO} https://www.googleapis.com/auth/userinfo.email`, renovacoes: 0, revogados: [], idToken: idToken() };
  g.buscar = async (url, op = {}) => {
    const u = String(url);
    g.pedidos.push({ url: u, ...op });
    const corpo = new URLSearchParams(String(op.body || ''));
    if (u === 'https://oauth2.googleapis.com/token' && corpo.get('grant_type') === 'authorization_code') {
      const esperado = g.codigos.get(corpo.get('code'));
      if (!esperado) return respostaJson(400, { error: 'invalid_grant' });
      g.codigos.delete(corpo.get('code'));
      const desafio = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(corpo.get('code_verifier') || ''))).toString('base64url');
      if (desafio !== esperado.desafio) return respostaJson(400, { error: 'invalid_grant', error_description: 'PKCE' });
      if (corpo.get('redirect_uri') !== esperado.retorno) return respostaJson(400, { error: 'redirect_uri_mismatch' });
      if (corpo.get('client_secret') !== CLIENTE.GMAIL_CLIENT_SECRET) return respostaJson(401, { error: 'invalid_client' });
      return respostaJson(200, { access_token: 'acesso-inicial', expires_in: 3599, refresh_token: REFRESH, scope: g.escopo, id_token: g.idToken, token_type: 'Bearer' });
    }
    if (u === 'https://oauth2.googleapis.com/token' && corpo.get('grant_type') === 'refresh_token') {
      g.renovacoes += 1;
      return respostaJson(200, { access_token: `acesso-${corpo.get('refresh_token')}`, expires_in: 3599 });
    }
    if (u === 'https://oauth2.googleapis.com/revoke') { g.revogados.push(corpo.get('token')); return new Response('', { status: 200 }); }
    if (u.startsWith('https://gmail.googleapis.com/')) return respostaJson(200, { id: `msg-${g.pedidos.length}` });
    throw new Error(`pedido inesperado: ${u}`);
  };
  /** O que o Google faz quando a pessoa clica em Permitir: guarda o código com o desafio e devolve o endereço de volta. */
  g.permitir = (urlAutorizacao, code = `codigo-${g.codigos.size + 1}-${Math.random().toString(36).slice(2)}`) => {
    const p = new URL(urlAutorizacao).searchParams;
    g.codigos.set(code, { desafio: p.get('code_challenge'), retorno: p.get('redirect_uri') });
    return `${new URL(p.get('redirect_uri')).pathname}?state=${encodeURIComponent(p.get('state'))}&code=${encodeURIComponent(code)}&scope=x`;
  };
  return g;
}

const conectar = async (c, quem = DONO) => {
  const r = await c.pedir(quem, 'POST', '/api/email/google/conectar', { corpo: '{}' });
  assert.equal(r.status, 200, `conectar como ${quem}`);
  return (await r.json()).url;
};
const volta = async (c, caminho, quem = DONO) => {
  const r = await c.pedir(quem, 'GET', caminho);
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('Referrer-Policy'), 'no-referrer');
  return r.headers.get('Location');
};
const estado = async (c, quem = DONO) => (await c.pedir(quem, 'GET', '/api/email/estado')).json();
const corpoEmail = JSON.stringify({ para: 'inquilino@exemplo.com.br', assunto: 'Boleto', texto: 'Segue.' });

test('Conectar: só o administrador começa; o endereço do Google leva escopo de envio, offline, consent, state e PKCE', async () => {
  W.esquecerPapeis(); G.esquecerToken();
  const c = await cenario();
  const operador = await c.pedir(OPERADOR, 'POST', '/api/email/google/conectar', { corpo: '{}' });
  assert.equal(operador.status, 403, 'operador não liga o Gmail');
  const semCabecalho = await c.pedir(DONO, 'POST', '/api/email/google/conectar', { corpo: '{}', cabecalhos: { 'Content-Type': 'application/json' } });
  assert.equal(semCabecalho.status, 403, 'outro site não começa a ligação');
  assert.equal((await c.pedir(DONO, 'GET', '/api/email/google/conectar')).status, 404);
  const url = new URL(await conectar(c));
  assert.equal(`${url.origin}${url.pathname}`, 'https://accounts.google.com/o/oauth2/v2/auth');
  const p = url.searchParams;
  assert.equal(p.get('client_id'), CLIENTE.GMAIL_CLIENT_ID);
  assert.equal(p.get('redirect_uri'), `${BASE}/api/email/google/retorno`);
  assert.equal(p.get('response_type'), 'code');
  assert.deepEqual(p.get('scope').split(' ').sort(), ['email', 'https://www.googleapis.com/auth/gmail.send', 'openid'], 'só enviar (e saber qual conta)');
  assert.equal(p.get('access_type'), 'offline');
  assert.equal(p.get('prompt'), 'consent');
  assert.match(p.get('state'), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(p.get('code_challenge_method'), 'S256');
  assert.match(p.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(p.get('client_secret'), null, 'o segredo nunca vai para o navegador');
  const guardados = c.db.prepare('SELECT hash, email FROM gmail_estados').all();
  assert.equal(guardados.length, 1);
  assert.notEqual(guardados[0].hash, p.get('state'), 'o cofre guarda só o hash do state');
  assert.equal(guardados[0].email, DONO);
  // sem a credencial no Cloudflare: mensagem clara
  W.esquecerPapeis();
  const semCliente = await cenario({ GMAIL_CLIENT_ID: '', GMAIL_CLIENT_SECRET: '' });
  const r = await semCliente.pedir(DONO, 'POST', '/api/email/google/conectar', { corpo: '{}' });
  assert.equal(r.status, 503);
  assert.match((await r.json()).erro, /GMAIL_CLIENT_ID e o GMAIL_CLIENT_SECRET/);
});

test('Volta do Google: state inválido, repetido, vencido ou de outra pessoa é recusado; cancelar não liga nada', async () => {
  W.esquecerPapeis(); G.esquecerToken();
  const c = await cenario();
  assert.equal(await volta(c, '/api/email/google/retorno?state=inventado&code=x'), `${BASE}/#/sistema-email?gmail=recusado`);
  assert.equal(await volta(c, `/api/email/google/retorno?state=${'a'.repeat(43)}&code=x`), `${BASE}/#/sistema-email?gmail=recusado`, 'state que o cofre não conhece');
  // de outra pessoa (outra administradora voltando com o state do dono): recusado e gasto
  const deOutro = c.google.permitir(await conectar(c));
  assert.equal(await volta(c, deOutro, SOCIA), `${BASE}/#/sistema-email?gmail=recusado`);
  assert.equal(await volta(c, deOutro, DONO), `${BASE}/#/sistema-email?gmail=recusado`, 'o state já foi gasto');
  // vencido: 11 minutos depois
  const atrasado = c.google.permitir(await conectar(c));
  const relogio = c.cofre.cofre.relogio;
  c.cofre.cofre.relogio = () => new Date(Date.now() + 11 * 60000);
  try { assert.equal(await volta(c, atrasado), `${BASE}/#/sistema-email?gmail=recusado`); } finally { c.cofre.cofre.relogio = relogio; }
  // cancelou na tela do Google
  const cancelado = new URL(await conectar(c)).searchParams.get('state');
  assert.equal(await volta(c, `/api/email/google/retorno?state=${cancelado}&error=access_denied`), `${BASE}/#/sistema-email?gmail=cancelado`);
  assert.equal((await estado(c)).ligado, false);
  // certo: liga; repetir a mesma volta é recusado (uso único)
  const certo = c.google.permitir(await conectar(c));
  assert.equal(await volta(c, certo), `${BASE}/#/sistema-email?gmail=ligado`);
  assert.equal(await volta(c, certo), `${BASE}/#/sistema-email?gmail=recusado`);
  assert.equal(c.db.prepare('SELECT COUNT(*) AS n FROM gmail_estados').get().n, 0, 'nenhum pedido sobra');
  // o operador nem consegue gastar um state
  const doDono = c.google.permitir(await conectar(c));
  W.esquecerPapeis();
  assert.equal(await volta(c, doDono, OPERADOR), `${BASE}/#/sistema-email?gmail=recusado`);
});

test('Ligado: refresh token cifrado no cofre, nunca devolvido à tela; remetente = a conta; renova o access token sozinho', async () => {
  W.esquecerPapeis(); G.esquecerToken();
  const c = await cenario();
  assert.deepEqual(await estado(c), { ligado: false, remetente: null, origem: null, conta: null, cliente: true, retorno: `${BASE}/api/email/google/retorno` });
  assert.equal(await volta(c, c.google.permitir(await conectar(c))), `${BASE}/#/sistema-email?gmail=ligado`);
  // a troca do código levou o verificador do PKCE e o segredo do cliente (do Worker para o Google)
  const troca = new URLSearchParams(c.google.pedidos.find((x) => String(x.body).includes('authorization_code')).body);
  assert.match(troca.get('code_verifier'), /^[A-Za-z0-9_-]{43}$/);
  const linha = c.db.prepare('SELECT * FROM gmail_conta').get();
  assert.equal(linha.email, CONTA);
  assert.equal(linha.ligado_por, DONO);
  assert.match(linha.cifrado, /^g1\./);
  assert.ok(!linha.cifrado.includes(REFRESH) && !linha.cifrado.includes(Buffer.from(REFRESH).toString('base64')), 'guardado cifrado');
  assert.equal(await G.decifrarToken(CLIENTE, linha.cifrado), REFRESH);
  assert.equal(await G.decifrarToken({ ...CLIENTE, GMAIL_CLIENT_SECRET: 'outro' }, linha.cifrado), null, 'com outro segredo não abre');
  // a tela: ligado, a conta e a data; nada do token
  const e = await c.pedir(OPERADOR, 'GET', '/api/email/estado');
  const texto = await e.text();
  assert.ok(!texto.includes(REFRESH) && !texto.includes(linha.cifrado), 'estado sem o token');
  const d = JSON.parse(texto);
  assert.equal(d.ligado, true); assert.equal(d.origem, 'conta'); assert.equal(d.conta, CONTA); assert.equal(d.remetente, CONTA); assert.ok(d.ligado_em);
  // o banco (o que vai para os aparelhos e backups) não tem nada do Gmail; a rota interna não chega pelo site
  const tudo = await (await c.pedir(DONO, 'GET', '/api/dados/tudo')).text();
  assert.ok(!tudo.includes(REFRESH) && !tudo.includes('g1.'), 'o JSON do banco não leva a autorização');
  assert.equal((await c.pedir(DONO, 'GET', '/api/dados/gmail/conta')).status, 404);
  assert.equal((await c.pedir(DONO, 'POST', '/api/dados/gmail/guardar', { corpo: '{}' })).status, 404);
  // envio: renova com o refresh do botão, uma vez (o access token fica guardado até perto de vencer)
  for (let i = 0; i < 2; i += 1) assert.equal((await c.pedir(OPERADOR, 'POST', '/api/email/enviar', { corpo: corpoEmail })).status, 200);
  assert.equal(c.google.renovacoes, 1);
  const renov = new URLSearchParams(c.google.pedidos.find((x) => String(x.body).includes('grant_type=refresh_token')).body);
  assert.equal(renov.get('refresh_token'), REFRESH);
  const envio = c.google.pedidos.filter((x) => x.url.startsWith('https://gmail.googleapis.com/')).at(-1);
  assert.equal(envio.headers.Authorization, `Bearer acesso-${REFRESH}`);
  assert.match(Buffer.from(JSON.parse(envio.body).raw, 'base64url').toString(), /^From: empresa@exemplo\.com\.br\r\n/);
  // GMAIL_REMETENTE continua mandando no remetente
  W.esquecerPapeis();
  const comRemetente = await cenario({ GMAIL_REMETENTE: 'administracao@exemplo.com.br' });
  await volta(comRemetente, comRemetente.google.permitir(await conectar(comRemetente)));
  assert.equal((await estado(comRemetente)).remetente, 'administracao@exemplo.com.br');
});

test('Desmarcou a permissão de enviar ou o Google não disse a conta: nada é guardado e a autorização é retirada', async () => {
  W.esquecerPapeis(); G.esquecerToken();
  const c = await cenario();
  c.google.escopo = 'openid email';
  assert.equal(await volta(c, c.google.permitir(await conectar(c))), `${BASE}/#/sistema-email?gmail=sem-permissao`);
  assert.deepEqual(c.google.revogados, [REFRESH]);
  assert.equal(c.db.prepare('SELECT COUNT(*) AS n FROM gmail_conta').get().n, 0);
  c.google.escopo = G.ESCOPO_ENVIO; c.google.idToken = idToken({ aud: 'outro-cliente' });
  assert.equal(await volta(c, c.google.permitir(await conectar(c))), `${BASE}/#/sistema-email?gmail=erro`);
  assert.equal(c.db.prepare('SELECT COUNT(*) AS n FROM gmail_conta').get().n, 0);
  // código que o Google não aceita (vencido)
  const url = await conectar(c);
  const st = new URL(url).searchParams.get('state');
  assert.equal(await volta(c, `/api/email/google/retorno?state=${st}&code=codigo-falso`), `${BASE}/#/sistema-email?gmail=erro`);
});

test('Desconectar: só o administrador; apaga do cofre, revoga no Google e o envio desliga', async () => {
  W.esquecerPapeis(); G.esquecerToken();
  const c = await cenario();
  await volta(c, c.google.permitir(await conectar(c)));
  assert.equal((await c.pedir(OPERADOR, 'POST', '/api/email/google/desconectar', { corpo: '{}' })).status, 403);
  const r = await c.pedir(SOCIA, 'POST', '/api/email/google/desconectar', { corpo: '{}' });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, havia: true, revogado: true, segredo_antigo: false });
  assert.deepEqual(c.google.revogados, [REFRESH]);
  assert.equal(c.db.prepare('SELECT COUNT(*) AS n FROM gmail_conta').get().n, 0);
  assert.equal((await estado(c)).ligado, false);
  const envio = await c.pedir(OPERADOR, 'POST', '/api/email/enviar', { corpo: corpoEmail });
  assert.equal(envio.status, 503);
  // desconectar de novo: nada a revogar
  assert.deepEqual(await (await c.pedir(DONO, 'POST', '/api/email/google/desconectar', { corpo: '{}' })).json(), { ok: true, havia: false, revogado: false, segredo_antigo: false });
  assert.equal(c.google.revogados.length, 1);
});

test('Compatível: o segredo antigo GMAIL_REFRESH_TOKEN vale até alguém conectar pelo botão, e volta a valer se desconectar', async () => {
  W.esquecerPapeis(); G.esquecerToken();
  const c = await cenario({ GMAIL_REFRESH_TOKEN: 'refresh-antigo', GMAIL_REMETENTE: 'administracao@exemplo.com.br' });
  const antes = await estado(c);
  assert.equal(antes.ligado, true); assert.equal(antes.origem, 'segredo'); assert.equal(antes.conta, null);
  await c.pedir(OPERADOR, 'POST', '/api/email/enviar', { corpo: corpoEmail });
  assert.equal(new URLSearchParams(c.google.pedidos.at(-2).body).get('refresh_token'), 'refresh-antigo');
  await volta(c, c.google.permitir(await conectar(c)));
  const depois = await estado(c);
  assert.equal(depois.origem, 'conta'); assert.equal(depois.conta, CONTA);
  await c.pedir(OPERADOR, 'POST', '/api/email/enviar', { corpo: corpoEmail });
  assert.equal(new URLSearchParams(c.google.pedidos.filter((x) => String(x.body).includes('grant_type=refresh_token')).at(-1).body).get('refresh_token'), REFRESH, 'o do botão vale antes do antigo');
  const r = await (await c.pedir(DONO, 'POST', '/api/email/google/desconectar', { corpo: '{}' })).json();
  assert.equal(r.segredo_antigo, true, 'a tela avisa que o antigo continua no Cloudflare');
  assert.equal((await estado(c)).origem, 'segredo');
  // autorização guardada que não abre (Client Secret trocado): a tela pede para conectar de novo e o antigo segue valendo
  await volta(c, c.google.permitir(await conectar(c)));
  W.esquecerPapeis();
  const trocado = await c.pedir(DONO, 'GET', '/api/email/estado');
  const outroSegredo = await W.atender(new Request(`${BASE}/api/email/estado`), { ...c.env, EMAIL_TESTE: DONO, GMAIL_CLIENT_SECRET: 'segredo-novo' });
  assert.equal((await trocado.json()).origem, 'conta');
  const e = await outroSegredo.json();
  assert.equal(e.ilegivel, true); assert.equal(e.origem, 'segredo');
});

test('Avisos da ficha pela internet usam a conta ligada pelo botão', async () => {
  W.esquecerPapeis(); G.esquecerToken();
  const c = await cenario();
  await volta(c, c.google.permitir(await conectar(c)));
  const { avisar } = await import('../nuvem/avisos-ficha.mjs');
  const registro = { ficha_id: 7, pessoa: 'interessado', contexto: { empresa: 'ANK', nome: 'Maria Souza' }, valores_iniciais: { inquilino_email: 'maria@exemplo.com.br' }, respostas: [{ em: '2026-11-17T10:00:00Z', valores: {} }], arquivos: [], faltando: [] };
  const feitos = await avisar(c.env, registro, 'enviou', '', { buscar: c.google.buscar });
  assert.deepEqual(feitos, ['pessoa', 'equipe'], 'e-mail para a pessoa e para a equipe (a própria conta ligada)');
  const envios = c.google.pedidos.filter((x) => x.url.startsWith('https://gmail.googleapis.com/'));
  assert.equal(envios.length, 2);
  assert.match(Buffer.from(JSON.parse(envios[1].body).raw, 'base64url').toString(), /\r\nTo: empresa@exemplo\.com\.br\r\n/);
});

test('Cifra do refresh token: formato, sal sorteado e texto mexido recusado', async () => {
  const a = await G.cifrarToken(CLIENTE, REFRESH); const b = await G.cifrarToken(CLIENTE, REFRESH);
  assert.notEqual(a, b, 'sal e iv sorteados a cada vez');
  assert.ok(G.cifradoValido(a));
  assert.equal(await G.decifrarToken(CLIENTE, a), REFRESH);
  const partes = a.split('.'); const ultimo = partes[3];
  partes[3] = (ultimo[0] === 'A' ? 'B' : 'A') + ultimo.slice(1);
  assert.equal(await G.decifrarToken(CLIENTE, partes.join('.')), null);
  assert.equal(await G.decifrarToken({}, a), null, 'sem o Client Secret não abre');
  await assert.rejects(G.cifrarToken({}, REFRESH), /GMAIL_CLIENT_SECRET/);
});

test('site: conectar só vai para o Google; desconectar mostra a mensagem da nuvem; fora da nuvem não há situação', async () => {
  S.configurarEmail({ buscar: async (url, op) => { assert.equal(url, 'api/email/google/conectar'); assert.equal(op.headers['X-Sistema'], 'imoveis'); return respostaJson(200, { url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' }); } });
  assert.equal(await S.enderecoParaConectar(), 'https://accounts.google.com/o/oauth2/v2/auth?x=1');
  S.configurarEmail({ buscar: async () => respostaJson(200, { url: 'https://malicioso.exemplo/' }) });
  await assert.rejects(S.enderecoParaConectar(), (e) => e.esperado && /endereço do Google/.test(e.message));
  S.configurarEmail({ buscar: async () => respostaJson(403, { erro: 'Seu usuário não pode fazer isso.' }) });
  await assert.rejects(S.desconectarGmail(), (e) => e.esperado && e.message === 'Seu usuário não pode fazer isso.');
  S.configurarEmail({ buscar: async () => respostaJson(200, { ligado: true, origem: 'conta', conta: CONTA, remetente: CONTA, cliente: true, retorno: `${BASE}/api/email/google/retorno` }) });
  assert.equal((await S.situacaoGmail()).conta, CONTA);
  S.configurarEmail({ buscar: async () => { throw new TypeError('sem rede'); } });
  assert.equal(await S.situacaoGmail(), null);
  S.configurarEmail({ buscar: (...a) => fetch(...a) });
});
