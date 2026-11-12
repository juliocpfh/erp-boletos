// E-mail pela conta Gmail da empresa: mensagem (MIME), validações, troca do token e envio com fetch de mentira,
// rotas do Worker (/api/email/…) e o cliente do site (docs/js/gmail.js). Dados fictícios; nada vai ao Google.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as G from '../nuvem/gmail.mjs';
import * as W from '../nuvem/worker.mjs';
import * as S from '../docs/js/gmail.js';
import { r2Falso } from './r2-falso.mjs';

const BASE = 'http://localhost:8787';
const SEGREDOS = { GMAIL_CLIENT_ID: 'id-teste', GMAIL_CLIENT_SECRET: 'segredo-teste', GMAIL_REFRESH_TOKEN: 'refresh-teste', GMAIL_REMETENTE: 'administracao@exemplo.com.br', GMAIL_NOME: 'Administradora' };
const b64 = (t) => Buffer.from(t).toString('base64');
const deB64url = (t) => Buffer.from(t.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('latin1');
const respostaJson = (status, dados) => new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json' } });

/** fetch de mentira do Google: guarda os pedidos e responde o token e o envio. */
function googleFalso({ envio = () => respostaJson(200, { id: 'msg-1', threadId: 't-1' }), token = () => respostaJson(200, { access_token: 'acesso-1', expires_in: 3599 }) } = {}) {
  const pedidos = [];
  const buscar = async (url, op = {}) => {
    pedidos.push({ url: String(url), ...op });
    return String(url).startsWith('https://oauth2.googleapis.com/token') ? token(op) : envio(op, pedidos);
  };
  return { buscar, pedidos };
}

test('MIME: assunto e nome com acento em UTF-8 (RFC 2047), texto em base64, Bcc, só ASCII', () => {
  const mime = G.montarMime({ de: 'administracao@exemplo.com.br', nome: 'Administração', para: ['inquilino@exemplo.com.br'], cco: ['caixa@exemplo.com.br'], assunto: 'Boleto de março – Sala 101', texto: 'Olá,\nsegue o boleto.\n' });
  assert.match(mime, /^From: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <administracao@exemplo\.com\.br>\r\n/);
  assert.match(mime, /\r\nTo: inquilino@exemplo\.com\.br\r\n/);
  assert.match(mime, /\r\nBcc: caixa@exemplo\.com\.br\r\n/);
  const assunto = mime.match(/\r\nSubject: ((?:.*)(?:\r\n .*)*)\r\n/)[1];
  const decodificado = assunto.split('\r\n ').map((p) => Buffer.from(p.match(/^=\?UTF-8\?B\?(.*)\?=$/)[1], 'base64').toString('utf8')).join('');
  assert.equal(decodificado, 'Boleto de março – Sala 101');
  for (const l of mime.split('\r\n')) assert.ok(l.length <= 998, 'linha dentro do limite');
  assert.ok(/^[\x20-\x7e\r\n]*$/.test(mime), 'mensagem toda em ASCII');
  const corpo = mime.split('\r\n\r\n')[1].replace(/\r\n/g, '');
  assert.equal(Buffer.from(corpo, 'base64').toString('utf8'), 'Olá,\r\nsegue o boleto.\r\n', 'quebras de linha em CRLF');
  assert.match(G.montarMime({ de: 'a@exemplo.com', nome: 'Administradora', para: ['b@exemplo.com'], assunto: 'Recibo', texto: 'x' }), /^From: "Administradora" <a@exemplo\.com>\r\nTo: b@exemplo\.com\r\nSubject: Recibo\r\n/);
});

test('MIME: assunto comprido com acentos vira vários pedaços sem partir um caractere', () => {
  const assunto = 'Notificação de reajuste ção '.repeat(6).trim();
  const cab = G.codificarCabecalho(assunto);
  const pedacos = cab.split('\r\n ');
  assert.ok(pedacos.length > 1);
  for (const p of pedacos) assert.ok(p.length <= 75, `pedaço com ${p.length} caracteres`);
  assert.equal(pedacos.map((p) => Buffer.from(p.slice(10, -2), 'base64').toString('utf8')).join(''), assunto);
});

test('MIME: anexo em multipart/mixed com nome acentuado (RFC 2231) e base64 em linhas de 76', () => {
  const conteudo = Buffer.alloc(300, 7);
  const mime = G.montarMime({ de: 'a@exemplo.com', para: ['b@exemplo.com'], assunto: 'NF', texto: 'Segue a NF.', anexos: [{ nome: 'Nota fiscal março.pdf', tipo: 'application/pdf', base64: conteudo.toString('base64') }], fronteira: 'FRONTEIRA' });
  assert.match(mime, /Content-Type: multipart\/mixed; boundary="FRONTEIRA"/);
  assert.match(mime, /Content-Type: application\/pdf; name="Nota fiscal marco\.pdf"/);
  assert.match(mime, /filename\*=UTF-8''Nota%20fiscal%20mar%C3%A7o\.pdf/);
  assert.ok(mime.trimEnd().endsWith('--FRONTEIRA--'));
  const parte = mime.split('--FRONTEIRA')[2];
  const linhas = parte.split('\r\n\r\n')[1].trim().split('\r\n');
  assert.ok(linhas.every((l) => l.length <= 76));
  assert.deepEqual(Buffer.from(linhas.join(''), 'base64'), conteudo);
});

test('MIME: quebra de linha em cabeçalho é recusada (injeção de Bcc pelo assunto ou pelo nome)', () => {
  const base = { de: 'a@exemplo.com', para: ['b@exemplo.com'], assunto: 'Oi', texto: 'x' };
  assert.throws(() => G.montarMime({ ...base, assunto: 'Oi\r\nBcc: espiao@exemplo.com' }), /quebra de linha/);
  assert.throws(() => G.montarMime({ ...base, nome: 'Adm\nBcc: x@exemplo.com' }), /quebra de linha/);
  assert.throws(() => G.montarMime({ ...base, para: ['b@exemplo.com\r\nBcc: x@exemplo.com'] }), /quebra de linha/);
  assert.throws(() => G.validarEnvio({ para: 'b@exemplo.com', assunto: 'Oi\nBcc: x@exemplo.com', texto: 'x' }), /quebra de linha/);
});

test('validações: destinatários (até 5, vírgula ou ponto e vírgula), assunto, texto, anexos e 20 MB', () => {
  const ok = { para: 'a@exemplo.com, b@exemplo.com;c@exemplo.com', assunto: 'Assunto', texto: 'Texto' };
  assert.deepEqual(G.validarEnvio(ok).para, ['a@exemplo.com', 'b@exemplo.com', 'c@exemplo.com']);
  assert.throws(() => G.validarEnvio({ ...ok, para: '' }), /Informe o e-mail do destinatário/);
  assert.throws(() => G.validarEnvio({ ...ok, para: 'fulano@' }), /E-mail do destinatário inválido/);
  assert.throws(() => G.validarEnvio({ ...ok, para: 'a <a@exemplo.com>' }), /inválido/);
  assert.throws(() => G.validarEnvio({ ...ok, para: Array.from({ length: 6 }, (_, i) => `p${i}@exemplo.com`).join(',') }), /No máximo 5/);
  assert.throws(() => G.validarEnvio({ ...ok, cco: 'nao-e-email' }), /cópia oculta inválido/);
  assert.throws(() => G.validarEnvio({ ...ok, assunto: ' ' }), /assunto/);
  assert.throws(() => G.validarEnvio({ ...ok, assunto: 'x'.repeat(201) }), /200 caracteres/);
  assert.throws(() => G.validarEnvio({ ...ok, texto: 'x'.repeat(50001) }), /50\.000 caracteres/);
  assert.throws(() => G.validarEnvio({ ...ok, anexos: [{ nome: 'a.pdf', base64: 'não é base64!' }] }), /Anexo inválido/);
  const grande = 'A'.repeat(Math.ceil((20 * 1024 * 1024 + 3) / 3) * 4);
  assert.throws(() => G.validarEnvio({ ...ok, anexos: [{ nome: 'a.pdf', base64: grande }] }), (e) => e.status === 413 && /Anexos passam de 20 MB/.test(e.message));
  const v = G.validarEnvio({ ...ok, anexos: [{ nome: '../..\\pasta/"contrato"\r\n.pdf', tipo: 'text/html"; x', base64: b64('abc') }] });
  assert.equal(v.anexos[0].nome, 'pasta contrato .pdf');
  assert.equal(v.anexos[0].tipo, 'application/octet-stream', 'tipo estranho vira genérico');
  assert.equal(v.anexos[0].tamanho, 3);
  assert.equal(G.nomeDeAnexo('x'.repeat(300) + '.pdf').length, 150);
  assert.ok(G.nomeDeAnexo('x'.repeat(300) + '.pdf').endsWith('.pdf'));
});

test('envio: troca o refresh token, guarda o access token, manda o raw em base64url com o remetente e a cópia oculta fixa', async () => {
  G.esquecerToken();
  const g = googleFalso();
  const env = { ...SEGREDOS, GMAIL_CCO: 'caixa@exemplo.com.br' };
  const r = await G.enviarEmail(env, { para: 'inquilino@exemplo.com.br', assunto: 'Boleto de março', texto: 'Segue.', anexos: [{ nome: 'boleto.pdf', tipo: 'application/pdf', base64: b64('%PDF-1.4') }] }, { buscar: g.buscar });
  assert.deepEqual(r, { ok: true, id: 'msg-1' });
  const [tok, envio] = g.pedidos;
  assert.equal(tok.method, 'POST');
  const form = new URLSearchParams(tok.body);
  assert.deepEqual(Object.fromEntries(form), { client_id: 'id-teste', client_secret: 'segredo-teste', refresh_token: 'refresh-teste', grant_type: 'refresh_token' });
  assert.equal(envio.url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
  assert.equal(envio.headers.Authorization, 'Bearer acesso-1');
  const raw = JSON.parse(envio.body).raw;
  assert.ok(/^[A-Za-z0-9_-]+$/.test(raw), 'base64url sem "=" nem "+/"');
  const mime = deB64url(raw);
  assert.match(mime, /^From: "Administradora" <administracao@exemplo\.com\.br>/);
  assert.match(mime, /\r\nBcc: caixa@exemplo\.com\.br\r\n/);
  assert.match(mime, /filename="boleto\.pdf"/);
  await G.enviarEmail(env, { para: 'outro@exemplo.com.br', assunto: 'Oi', texto: 'x' }, { buscar: g.buscar });
  assert.equal(g.pedidos.filter((p) => p.url.includes('oauth2')).length, 1, 'access token reaproveitado até vencer');
});

test('envio: token recusado (invalid_grant), 401 do Gmail tenta de novo uma vez, limite e erro do Gmail em português', async () => {
  G.esquecerToken();
  const venceu = googleFalso({ token: () => respostaJson(400, { error: 'invalid_grant' }) });
  await assert.rejects(G.enviarEmail(SEGREDOS, { para: 'a@exemplo.com', assunto: 'x', texto: 'x' }, { buscar: venceu.buscar }), /autorização do Gmail venceu/);
  G.esquecerToken();
  let n = 0;
  const revogado = googleFalso({ envio: () => (++n === 1 ? respostaJson(401, { error: { code: 401 } }) : respostaJson(200, { id: 'msg-2' })) });
  assert.equal((await G.enviarEmail(SEGREDOS, { para: 'a@exemplo.com', assunto: 'x', texto: 'x' }, { buscar: revogado.buscar })).id, 'msg-2');
  assert.equal(revogado.pedidos.filter((p) => p.url.includes('oauth2')).length, 2, 'pediu outro token');
  const limite = googleFalso({ envio: () => respostaJson(429, { error: { code: 429, message: 'Too many', errors: [{ reason: 'rateLimitExceeded' }] } }) });
  await assert.rejects(G.enviarEmail(SEGREDOS, { para: 'a@exemplo.com', assunto: 'x', texto: 'x' }, { buscar: limite.buscar }), /Limite de envios/);
  const recusado = googleFalso({ envio: () => respostaJson(400, { error: { code: 400, message: 'Invalid To header' } }) });
  await assert.rejects(G.enviarEmail(SEGREDOS, { para: 'a@exemplo.com', assunto: 'x', texto: 'x' }, { buscar: recusado.buscar }), /O Gmail recusou o e-mail \(Invalid To header\)/);
  const semRede = googleFalso({ envio: () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(G.enviarEmail(SEGREDOS, { para: 'a@exemplo.com', assunto: 'x', texto: 'x' }, { buscar: semRede.buscar }), /Não foi possível falar com o Gmail/);
  await assert.rejects(G.enviarEmail({}, { para: 'a@exemplo.com', assunto: 'x', texto: 'x' }, { buscar: semRede.buscar }), /ainda não foi ligado/);
});

test('envio: mensagem grande vai pelo envio de arquivo (message/rfc822), sem base64 por cima', async () => {
  G.esquecerToken();
  const g = googleFalso();
  const anexo = Buffer.alloc(3.5 * 1024 * 1024, 1).toString('base64');
  await G.enviarEmail(SEGREDOS, { para: 'a@exemplo.com', assunto: 'Fotos', texto: 'x', anexos: [{ nome: 'f.jpg', tipo: 'image/jpeg', base64: anexo }] }, { buscar: g.buscar });
  const envio = g.pedidos[1];
  assert.equal(envio.url, 'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media');
  assert.equal(envio.headers['Content-Type'], 'message/rfc822');
  assert.match(envio.body, /^From: /);
});

// ---------------------------------------------------------------------------
const pedir = (env, metodo, caminho, corpo, buscar) => W.atender(new Request(`${BASE}${caminho}`, {
  method: metodo, body: corpo, headers: metodo !== 'GET' ? { 'X-Sistema': 'imoveis', Origin: BASE, 'Content-Type': 'application/json' } : {},
}), { ORIGEM: BASE, MODO_TESTE: '1', DADOS: r2Falso(), ...env }, buscar);
const corpoEmail = JSON.stringify({ para: 'inquilino@exemplo.com.br', assunto: 'Boleto', texto: 'Segue.' });

test('Worker sem os segredos: estado desligado e envio recusado com mensagem clara', async () => {
  const e = await pedir({}, 'GET', '/api/email/estado');
  assert.equal(e.status, 200);
  assert.deepEqual(await e.json(), { ligado: false, remetente: null });
  const r = await pedir({}, 'POST', '/api/email/enviar', corpoEmail);
  assert.equal(r.status, 503);
  assert.equal((await r.json()).erro, 'O envio pelo Gmail ainda não foi ligado.');
});

test('Worker com os segredos: envia pelo Google; exige o cabeçalho do sistema, usuário ativo e e-mail válido', async () => {
  G.esquecerToken(); W.esquecerPapeis();
  const g = googleFalso();
  const e = await pedir(SEGREDOS, 'GET', '/api/email/estado');
  assert.deepEqual(await e.json(), { ligado: true, remetente: 'administracao@exemplo.com.br' });
  const r = await pedir(SEGREDOS, 'POST', '/api/email/enviar', corpoEmail, g.buscar);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, id: 'msg-1' });
  const ruim = await pedir(SEGREDOS, 'POST', '/api/email/enviar', JSON.stringify({ para: 'x@', assunto: 'a', texto: 'b' }), g.buscar);
  assert.equal(ruim.status, 400);
  assert.match((await ruim.json()).erro, /E-mail do destinatário inválido/);
  const semCab = await W.atender(new Request(`${BASE}/api/email/enviar`, { method: 'POST', body: corpoEmail }), { ORIGEM: BASE, MODO_TESTE: '1', DADOS: r2Falso(), ...SEGREDOS }, g.buscar);
  assert.equal(semCab.status, 403, 'outro site não consegue mandar e-mail');
  assert.equal((await pedir(SEGREDOS, 'GET', '/api/email/enviar')).status, 404);
  // usuário desativado (o cofre recusa): nem estado nem envio
  const COFRE = { idFromName: (n) => n, get: () => ({ fetch: async () => respostaJson(403, { erro: 'Este e-mail não está ligado a nenhum usuário ativo do sistema.' }) }) };
  W.esquecerPapeis();
  assert.equal((await pedir({ ...SEGREDOS, COFRE }, 'GET', '/api/email/estado')).status, 403);
  assert.equal((await pedir({ ...SEGREDOS, COFRE }, 'POST', '/api/email/enviar', corpoEmail, g.buscar)).status, 403);
  // papel consulta também envia
  const consulta = { idFromName: (n) => n, get: () => ({ fetch: async (req) => (new URL(req.url).searchParams.get('nivel') === 'consulta' ? respostaJson(200, { papel: 'consulta' }) : respostaJson(403, { erro: 'não pode' })) }) };
  W.esquecerPapeis();
  assert.equal((await pedir({ ...SEGREDOS, COFRE: consulta }, 'POST', '/api/email/enviar', corpoEmail, g.buscar)).status, 200);
  W.esquecerPapeis();
});

test('Worker: SIMULAR_GMAIL=1 só no computador (liga sem segredos e não fala com o Google)', async () => {
  const nada = async () => { throw new Error('não deveria chamar o Google'); };
  const e = await pedir({ SIMULAR_GMAIL: '1' }, 'GET', '/api/email/estado');
  assert.equal((await e.json()).ligado, true);
  const log = console.log; console.log = () => {};
  try {
    const r = await pedir({ SIMULAR_GMAIL: '1' }, 'POST', '/api/email/enviar', corpoEmail, nada);
    assert.equal(r.status, 200);
    assert.match((await r.json()).id, /^simulado-/);
  } finally { console.log = log; }
  const publicado = await W.atender(new Request('https://erp.ankjck.com.br/api/email/estado'), { SIMULAR_GMAIL: '1', MODO_TESTE: '1', DADOS: r2Falso() });
  assert.equal(publicado.status, 503, 'publicado: continua pedindo login (e a simulação não vale fora do computador)');
});

test('Worker: pedido acima do limite é recusado antes de ler', async () => {
  const r = await W.atender(new Request(`${BASE}/api/email/enviar`, { method: 'POST', body: 'x', headers: { 'X-Sistema': 'imoveis', Origin: BASE, 'Content-Length': String(G.MAX_PEDIDO + 1) } }), { ORIGEM: BASE, MODO_TESTE: '1', DADOS: r2Falso(), ...SEGREDOS });
  assert.equal(r.status, 413);
  assert.match((await r.json()).erro, /Anexos passam de 20 MB/);
});

// ---------------------------------------------------------------------------
test('site: emailLigado consulta uma vez por abertura e não guarda a falha', async () => {
  let chamadas = 0; let falhar = true;
  S.configurarEmail({ buscar: async (url) => { chamadas += 1; assert.equal(url, 'api/email/estado'); if (falhar) throw new TypeError('sem rede'); return respostaJson(200, { ligado: true, remetente: 'administracao@exemplo.com.br' }); } });
  assert.equal(await S.emailLigado(), false, 'sem internet: desligado');
  falhar = false;
  assert.equal(await S.emailLigado(), true);
  assert.equal(await S.emailLigado(), true);
  assert.equal(chamadas, 2, 'a resposta boa ficou guardada');
  assert.deepEqual(await S.estadoEmail(), { ligado: true, remetente: 'administracao@exemplo.com.br' });
  S.configurarEmail({ buscar: async () => new Response('não encontrado', { status: 404 }) });
  assert.equal(await S.emailLigado(), false, 'sem a nuvem (GitHub Pages, ?teste): desligado');
  S.configurarEmail({ buscar: async () => new Response('<html>login</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }) });
  assert.equal(await S.emailLigado(), false, 'login do Access vencido: desligado');
});

test('site: enviarEmail converte os anexos em base64 e mostra os erros como ErroUsuario', async () => {
  let enviado;
  S.configurarEmail({ online: () => true, buscar: async (url, op) => { enviado = { url, ...op, corpo: JSON.parse(op.body) }; return respostaJson(200, { ok: true, id: 'msg-9' }); } });
  const blob = new Blob(['%PDF-1.4 teste'], { type: 'application/pdf' });
  assert.deepEqual(await S.enviarEmail({ para: 'a@exemplo.com', assunto: 'NF', texto: 'Segue.', anexos: [{ nome: 'nf.pdf', blob }] }), { ok: true, id: 'msg-9' });
  assert.equal(enviado.url, 'api/email/enviar');
  assert.equal(enviado.headers['X-Sistema'], 'imoveis');
  assert.deepEqual(enviado.corpo.anexos, [{ nome: 'nf.pdf', tipo: 'application/pdf', base64: b64('%PDF-1.4 teste') }]);
  const grandeBlob = new Blob([new Uint8Array(1)]);
  Object.defineProperty(grandeBlob, 'size', { value: 21 * 1024 * 1024 });
  await assert.rejects(S.enviarEmail({ para: 'a@exemplo.com', assunto: 'x', texto: 'x', anexos: [{ nome: 'g.pdf', blob: grandeBlob }] }), (e) => e.esperado && /Anexos passam de 20 MB/.test(e.message));
  await assert.rejects(S.enviarEmail({ para: '', assunto: 'x', texto: 'x' }), (e) => e.esperado && /destinatário/.test(e.message));
  S.configurarEmail({ online: () => true, buscar: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(S.enviarEmail({ para: 'a@exemplo.com', assunto: 'x', texto: 'x' }), (e) => e.esperado && e.message === 'Sem internet: o e-mail não foi enviado. Use Copiar texto ou Abrir no Gmail.');
  S.configurarEmail({ online: () => false, buscar: async () => { throw new Error('não deveria chamar'); } });
  await assert.rejects(S.enviarEmail({ para: 'a@exemplo.com', assunto: 'x', texto: 'x' }), /Sem internet/);
  S.configurarEmail({ online: () => true, buscar: async () => respostaJson(503, { erro: 'O envio pelo Gmail ainda não foi ligado.' }) });
  await assert.rejects(S.enviarEmail({ para: 'a@exemplo.com', assunto: 'x', texto: 'x' }), (e) => e.esperado && e.message === 'O envio pelo Gmail ainda não foi ligado.');
  S.configurarEmail({ online: () => true, buscar: async () => new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } }) });
  await assert.rejects(S.enviarEmail({ para: 'a@exemplo.com', assunto: 'x', texto: 'x' }), /acesso pela internet venceu/);
  S.configurarEmail({ buscar: (...a) => fetch(...a), online: () => globalThis.navigator?.onLine !== false });
});
