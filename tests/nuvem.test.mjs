// Worker da nuvem (nuvem/worker.mjs) com um R2 de mentira em memória: repasse ao cofre (testes do cofre em cofre.test.mjs),
// anexos, listagem, mover/juntar pastas, caminhos perigosos e login do Access (JWT assinado aqui mesmo). Dados fictícios.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { resumoSenha } from '../docs/js/auth.js';
import * as A from '../nuvem/aparelhos.mjs';
import { CofreDO } from '../nuvem/cofre.mjs';
import * as W from '../nuvem/worker.mjs';
import { r2Falso } from './r2-falso.mjs';

const BASE = 'http://localhost:8787'; // MODO_TESTE só vale no próprio computador
const pedir = (env, metodo, caminho, corpo, cab = {}) => W.atender(new Request(`${BASE}${caminho}`, {
  method: metodo, body: corpo, headers: { ...(metodo !== 'GET' ? { 'X-Sistema': 'imoveis', Origin: BASE } : {}), ...cab },
}), { ORIGEM: BASE, ...env });
const banco = (extra = {}) => JSON.stringify({ formato: 'imoveis-v1', imoveis: [], ...extra });

test('modo de teste publicado por engano continua pedindo login; OPTIONS recusado', async () => {
  const env = { MODO_TESTE: '1', DADOS: r2Falso() };
  const r = await W.atender(new Request('https://erp.ankjck.com.br/api/saude'), env);
  assert.equal(r.status, 503, 'sem Access configurado: recusa');
  assert.equal((await pedir(env, 'GET', '/api/saude')).status, 200, 'no computador: entra');
  assert.equal((await W.atender(new Request(`${BASE}/api/arquivos/a.pdf`, { method: 'OPTIONS' }), env)).status, 405);
});

test('dados: o Worker repassa ao cofre com o e-mail conferido, sem deixar o navegador mandar o e-mail', async () => {
  const pedidos = [];
  const COFRE = { idFromName: (n) => n, get: () => ({ fetch: async (req) => { pedidos.push({ url: req.url, metodo: req.method, email: req.headers.get('X-Email-Conferido'), corpo: req.body ? await req.text() : null }); return new Response('{"ok":true}'); } }) };
  const env = { MODO_TESTE: '1', EMAIL_TESTE: 'dono@exemplo.com.br', DADOS: r2Falso(), COFRE };
  assert.equal((await pedir(env, 'GET', '/api/dados/mudancas?desde=5', undefined, { 'X-Email-Conferido': 'outro@exemplo.com.br' })).status, 200);
  assert.deepEqual(pedidos[0], { url: 'https://cofre/mudancas?desde=5', metodo: 'GET', email: 'dono@exemplo.com.br', corpo: null });
  assert.equal((await pedir(env, 'POST', '/api/dados/lote', '{"id":"x"}')).status, 200);
  assert.equal(pedidos[1].corpo, '{"id":"x"}');
  assert.equal((await pedir(env, 'GET', '/api/dados/lote')).status, 404, 'método errado');
  assert.equal((await pedir(env, 'POST', '/api/dados/qualquer', '{}')).status, 404);
  const semCab = await W.atender(new Request(`${BASE}/api/dados/lote`, { method: 'POST', body: '{}' }), { ORIGEM: BASE, ...env });
  assert.equal(semCab.status, 403, 'gravação sem o cabeçalho do sistema');
  assert.equal(pedidos.length, 2);
});

test('anexos seguem o papel do usuário: consulta lê, mas não grava', async () => {
  const COFRE = { idFromName: (n) => n, get: () => ({ fetch: async (req) => (new URL(req.url).searchParams.get('nivel') !== 'consulta' ? new Response('{"erro":"Seu usuário não pode fazer isso."}', { status: 403 }) : new Response('{"papel":"consulta"}')) }) };
  const env = { MODO_TESTE: '1', DADOS: r2Falso(), COFRE };
  await env.DADOS.put('arquivos/a.pdf', 'x');
  assert.equal((await pedir(env, 'GET', '/api/arquivos/a.pdf')).status, 200);
  const r = await pedir(env, 'PUT', '/api/arquivos/b.pdf', 'x');
  assert.equal(r.status, 403);
  assert.match((await r.json()).erro, /não pode/);
  assert.equal((await pedir(env, 'DELETE', '/api/arquivos/a.pdf')).status, 403);
  assert.equal((await pedir(env, 'POST', '/api/mover', '{"de":"arquivos/a.pdf","para":"arquivos/c.pdf"}')).status, 403);
  assert.ok(env.DADOS.m.has('arquivos/a.pdf'));
  await env.DADOS.put('backups/imoveis-dados-2026-01-01.json', '{}');
  assert.equal((await pedir(env, 'GET', '/api/backups/imoveis-dados-2026-01-01.json')).status, 403, 'backup (banco inteiro, com senhas) só o administrador baixa');
});

test('arquivos: gravar, ler com tipo seguro, não sobrescrever, apagar; backups só leitura; página/script barrados', async () => {
  const env = { MODO_TESTE: '1', DADOS: r2Falso() };
  const pdf = '/api/arquivos/Sala%20101/Inquilinos/Jo%C3%A3o/contrato.pdf';
  assert.equal((await pedir(env, 'PUT', pdf, new Uint8Array([37, 80, 68, 70]), { 'If-None-Match': '*' })).status, 200);
  assert.ok(env.DADOS.m.has('arquivos/Sala 101/Inquilinos/João/contrato.pdf'), 'nome com acento e espaço guardado legível');
  assert.equal((await pedir(env, 'PUT', pdf, 'x', { 'If-None-Match': '*' })).status, 412, 'não sobrescreve sem querer');
  const lido = await pedir(env, 'GET', pdf);
  assert.equal(lido.headers.get('Content-Type'), 'application/pdf');
  assert.match(lido.headers.get('Content-Security-Policy'), /sandbox/);
  assert.equal(lido.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.deepEqual([...new Uint8Array(await lido.arrayBuffer())], [37, 80, 68, 70]);
  await pedir(env, 'PUT', '/api/arquivos/Sala%20101/planilha.xlsx', 'x');
  const xlsx = await pedir(env, 'GET', '/api/arquivos/Sala%20101/planilha.xlsx');
  assert.equal(xlsx.headers.get('Content-Type'), 'application/octet-stream');
  assert.match(xlsx.headers.get('Content-Disposition'), /^attachment/);
  for (const nome of ['pagina.html', 'desenho.SVG', 'x.js', 'y.xml']) assert.equal((await pedir(env, 'PUT', `/api/arquivos/Sala%20101/${nome}`, 'x')).status, 415, nome);
  assert.equal((await pedir(env, 'PUT', '/api/backups/imoveis-dados-2026-01-01.json', banco())).status, 403);
  // backups têm o banco inteiro (senhas de todos): só o administrador baixa; a lista qualquer um vê
  await env.DADOS.put('backups/imoveis-dados-2026-01-01.json', banco());
  assert.equal((await pedir(env, 'GET', '/api/backups/imoveis-dados-2026-01-01.json')).status, 200, 'administrador (modo de teste) lê');
  assert.equal((await pedir(env, 'GET', '/api/lista/backups/')).status, 200);
  assert.equal((await pedir(env, 'DELETE', pdf)).status, 200);
  assert.equal((await pedir(env, 'GET', pdf)).status, 404);
});

test('caminhos perigosos ou fora das pastas do sistema são recusados', async () => {
  const env = { MODO_TESTE: '1', DADOS: r2Falso() };
  for (const c of ['/api/arquivos/../imoveis-dados.json', '/api/arquivos/a%2Fb.pdf', '/api/arquivos/a%5Cb.pdf', '/api/arquivos/a%00.pdf', '/api/arquivos//b.pdf', '/api/outra/b.pdf', '/api/arquivos/a/%E0%A4%A.pdf']) {
    const r = await pedir(env, 'PUT', c, 'x');
    assert.ok([400, 404].includes(r.status), `${c} → ${r.status}`);
  }
  assert.throws(() => W.caminhoSeguro(`arquivos/${'a'.repeat(201)}`), /inválido/);
  assert.equal(W.caminhoSeguro('arquivos/Sala%20101/', { pasta: true }), 'arquivos/Sala 101');
  assert.equal(env.DADOS.m.size, 0);
  // "%2E%2E" o próprio endereço resolve antes de chegar aqui: continua dentro de arquivos/
  await pedir(env, 'PUT', '/api/arquivos/a/%2E%2E/b.pdf', 'x');
  assert.deepEqual([...env.DADOS.m.keys()], ['arquivos/b.pdf']);
});

test('lista: subpastas e arquivos de uma pasta, em ordem, com mais de 1000 itens', async () => {
  const env = { MODO_TESTE: '1', DADOS: r2Falso() };
  for (const k of ['arquivos/Sala 2/a.pdf', 'arquivos/Sala 10/b.pdf', 'arquivos/Sala 2/Inquilinos/Ana/c.pdf', 'arquivos/leia.pdf']) await env.DADOS.put(k, 'x');
  const raiz = await (await pedir(env, 'GET', '/api/lista/arquivos/')).json();
  assert.deepEqual(raiz.pastas, ['Sala 10', 'Sala 2']);
  assert.deepEqual(raiz.arquivos, [{ nome: 'leia.pdf', tamanho: 1 }]);
  const sala = await (await pedir(env, 'GET', '/api/lista/arquivos/Sala%202/')).json();
  assert.deepEqual(sala, { pastas: ['Inquilinos'], arquivos: [{ nome: 'a.pdf', tamanho: 1 }] });
  for (let i = 0; i < 1005; i += 1) await env.DADOS.put(`arquivos/Muitos/f${String(i).padStart(4, '0')}.pdf`, 'x');
  assert.equal((await (await pedir(env, 'GET', '/api/lista/arquivos/Muitos/')).json()).arquivos.length, 1005);
});

test('lista-tudo: todos os arquivos de uma pasta com as subpastas numa resposta só, em partes quando é grande', async () => {
  const env = { MODO_TESTE: '1', DADOS: r2Falso() };
  for (const k of ['arquivos/Sala 2/a.pdf', 'arquivos/Sala 2/Inquilinos/Ana/c.pdf', 'arquivos/leia.pdf', 'modelos/x.xlsx']) await env.DADOS.put(k, 'x');
  const tudo = await (await pedir(env, 'GET', '/api/lista-tudo/arquivos/')).json();
  // alterado: data de envio (a cópia aberta do PC vê arquivo trocado com o mesmo tamanho)
  assert.deepEqual(tudo, { arquivos: [{ caminho: 'Sala 2/Inquilinos/Ana/c.pdf', tamanho: 1, alterado: '2026-11-01T00:00:02.000Z' }, { caminho: 'Sala 2/a.pdf', tamanho: 1, alterado: '2026-11-01T00:00:01.000Z' }, { caminho: 'leia.pdf', tamanho: 1, alterado: '2026-11-01T00:00:03.000Z' }], mais: false });
  const sala = await (await pedir(env, 'GET', '/api/lista-tudo/arquivos/Sala%202/')).json();
  assert.deepEqual(sala.arquivos.map((a) => a.caminho), ['Inquilinos/Ana/c.pdf', 'a.pdf']);
  for (let i = 0; i < 5003; i += 1) await env.DADOS.put(`arquivos/Muitos/f${String(i).padStart(4, '0')}.pdf`, 'x');
  const p1 = await (await pedir(env, 'GET', '/api/lista-tudo/arquivos/Muitos/')).json();
  assert.equal(p1.arquivos.length, 5000); assert.equal(p1.mais, true); assert.ok(p1.cursor);
  const p2 = await (await pedir(env, 'GET', `/api/lista-tudo/arquivos/Muitos/?cursor=${encodeURIComponent(p1.cursor)}`)).json();
  assert.equal(p2.arquivos.length, 3); assert.equal(p2.mais, false);
  assert.equal((await pedir(env, 'GET', '/api/lista-tudo/outra/')).status, 404);
});

test('papel conferido no cofre fica guardado 1 minuto (o Painel pede muitos anexos seguidos); o "não pode" não fica', async () => {
  W.esquecerPapeis();
  let consultas = 0; let papel = 'consulta';
  const NIVEL = { consulta: 1, operador: 2, admin: 3 };
  const COFRE = { idFromName: (n) => n, get: () => ({ fetch: async (req) => { consultas += 1; return NIVEL[papel] < NIVEL[new URL(req.url).searchParams.get('nivel')] ? new Response('{"erro":"Seu usuário não pode fazer isso."}', { status: 403 }) : new Response(`{"papel":"${papel}"}`); } }) };
  const env = { MODO_TESTE: '1', DADOS: r2Falso(), COFRE };
  await env.DADOS.put('arquivos/a.pdf', 'x');
  for (let i = 0; i < 5; i += 1) assert.equal((await pedir(env, 'GET', '/api/lista/arquivos/')).status, 200);
  assert.equal(consultas, 1, 'cinco listagens, uma consulta ao cofre');
  assert.equal((await pedir(env, 'PUT', '/api/arquivos/b.pdf', 'x')).status, 403);
  assert.equal((await pedir(env, 'PUT', '/api/arquivos/b.pdf', 'x')).status, 403);
  assert.equal(consultas, 3, 'o "não pode" é conferido toda vez');
  papel = 'operador';
  assert.equal((await pedir(env, 'PUT', '/api/arquivos/b.pdf', 'x')).status, 200, 'promovido: vale na hora');
  assert.equal((await pedir(env, 'GET', '/api/lista/arquivos/')).status, 200);
  assert.equal(consultas, 4, 'leitura ainda guardada');
  W.esquecerPapeis();
});

test('mover: renomeia pasta, recusa destino ocupado, junta devolvendo o que sobrou e nunca para dentro dela mesma', async () => {
  const env = { MODO_TESTE: '1', DADOS: r2Falso() };
  for (const k of ['arquivos/Sala 1/Inquilinos/Ana/a.pdf', 'arquivos/Sala 1/Inquilinos/Ana/b.pdf', 'arquivos/Sala 1/Inquilinos/Bia/c.pdf']) await env.DADOS.put(k, k);
  const mover = (corpo) => pedir(env, 'POST', '/api/mover', JSON.stringify(corpo), { 'Content-Type': 'application/json' });
  const r = await mover({ de: 'arquivos/Sala 1/Inquilinos/Ana', para: 'arquivos/Sala 1/Inquilinos/Ana Souza' });
  assert.deepEqual(await r.json(), { ok: true, movidos: 2, sobraram: [], mais: false });
  assert.equal(await (await env.DADOS.get('arquivos/Sala 1/Inquilinos/Ana Souza/a.pdf')).text(), 'arquivos/Sala 1/Inquilinos/Ana/a.pdf', 'conteúdo preservado');
  assert.ok(![...env.DADOS.m.keys()].some((k) => k.includes('/Ana/')));
  await env.DADOS.put('arquivos/Sala 1/Inquilinos/Bia/a.pdf', 'outro');
  assert.equal((await mover({ de: 'arquivos/Sala 1/Inquilinos/Bia', para: 'arquivos/Sala 1/Inquilinos/Ana Souza' })).status, 409);
  const j = await (await mover({ de: 'arquivos/Sala 1/Inquilinos/Bia', para: 'arquivos/Sala 1/Inquilinos/Ana Souza', juntar: true })).json();
  assert.deepEqual([j.movidos, j.sobraram], [1, ['a.pdf']]);
  assert.equal(await (await env.DADOS.get('arquivos/Sala 1/Inquilinos/Ana Souza/a.pdf')).text(), 'arquivos/Sala 1/Inquilinos/Ana/a.pdf', 'o do destino não foi trocado');
  assert.equal((await mover({ de: 'arquivos/Sala 1', para: 'arquivos/Sala 1/Inquilinos/X' })).status, 400);
  assert.equal((await mover({ de: 'arquivos/Sala 1', para: 'backups/x' })).status, 403);
  assert.equal((await mover({ de: 'arquivos/Nada', para: 'arquivos/Outra' })).status, 404);
  // pasta grande: move em partes (limite de chamadas do plano grátis) e o site repete até acabar
  for (let i = 0; i < 450; i += 1) await env.DADOS.put(`arquivos/Grande/f${i}.pdf`, 'x');
  const partes = [];
  for (let n = 0; n < 5; n += 1) { const p = await (await mover({ de: 'arquivos/Grande', para: 'arquivos/Nova' })).json(); partes.push(p.movidos); if (!p.mais) break; }
  assert.deepEqual(partes, [200, 200, 50]);
  assert.equal([...env.DADOS.m.keys()].filter((k) => k.startsWith('arquivos/Nova/')).length, 450);
});


const b64 = (bytes) => Buffer.from(bytes).toString('base64url');
const par = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwkPublica = { ...(await crypto.subtle.exportKey('jwk', par.publicKey)), kid: 'chave1', alg: 'RS256' };
const EQUIPE = 'exemplo.cloudflareaccess.com';
const AUD = 'aud-de-teste';
async function token(dados, kid = 'chave1') {
  const cab = b64(Buffer.from(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })));
  const corpo = b64(Buffer.from(JSON.stringify(dados)));
  const ass = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', par.privateKey, new TextEncoder().encode(`${cab}.${corpo}`));
  return `${cab}.${corpo}.${b64(new Uint8Array(ass))}`;
}
const buscarCerts = async (url) => {
  assert.equal(url, `https://${EQUIPE}/cdn-cgi/access/certs`);
  return new Response(JSON.stringify({ keys: [jwkPublica] }));
};

// ---------------------------------------------------------------------------
// Login do Access: token assinado com uma chave RSA criada no teste
// ---------------------------------------------------------------------------
test('chave de serviço (atualizador-pc): token do Access sem e-mail entra como o usuário ligado a ela em SERVICOS', async () => {
  const env = { DADOS: r2Falso(), ACCESS_EQUIPE: EQUIPE, ACCESS_AUD: AUD, SERVICOS: ' abc123.access = dono@exemplo.com.br , outra=socia@exemplo.com.br' };
  const agora = Math.floor(Date.now() / 1000);
  const servico = { aud: [AUD], iss: `https://${EQUIPE}`, exp: agora + 3600, iat: agora, common_name: 'abc123.access', type: 'app' };
  const saude = async (jwt, e = env) => W.atender(new Request('https://erp.ankjck.com.br/api/saude', { headers: { 'Cf-Access-Jwt-Assertion': jwt } }), e, buscarCerts);
  const ok = await saude(await token(servico));
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).email, 'dono@exemplo.com.br');
  assert.equal((await saude(await token({ ...servico, common_name: 'desconhecida' }))).status, 403, 'chave que não está em SERVICOS');
  assert.equal((await saude(await token(servico), { ...env, SERVICOS: '' })).status, 403, 'sem SERVICOS nenhuma chave entra');
  assert.equal((await (await saude(await token({ ...servico, email: 'x@exemplo.com.br' }))).json()).email, 'x@exemplo.com.br', 'com e-mail no token, o e-mail manda');
  assert.equal(W.emailDoServico({ SERVICOS: 'a=b@c' }, 'a'), 'b@c');
  assert.equal(W.emailDoServico({}, 'a'), '');
});

test('login: só com token do Access válido, da equipe e do aplicativo certos, não vencido e de e-mail da lista', async () => {
  const env = { DADOS: r2Falso(), ACCESS_EQUIPE: EQUIPE, ACCESS_AUD: AUD, EMAILS: 'dono@exemplo.com.br, Socio@Exemplo.com.br' };
  const agora = Math.floor(Date.now() / 1000);
  const valido = { aud: [AUD], iss: `https://${EQUIPE}`, exp: agora + 3600, iat: agora, email: 'socio@exemplo.com.br' };
  const saude = async (jwt, e = env) => W.atender(new Request('https://erp.ankjck.com.br/api/saude', { headers: jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {} }), e, buscarCerts);
  const ok = await saude(await token(valido));
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).email, 'socio@exemplo.com.br', 'e-mail sem diferença de maiúsculas');
  assert.equal((await saude('')).status, 401);
  assert.equal((await saude('a.b.c')).status, 401);
  assert.equal((await saude(await token({ ...valido, exp: agora - 10 }))).status, 401, 'vencido');
  assert.equal((await saude(await token({ ...valido, aud: ['outro-app'] }))).status, 401, 'outro aplicativo');
  assert.equal((await saude(await token({ ...valido, iss: 'https://outra.cloudflareaccess.com' }))).status, 401, 'outra equipe');
  assert.equal((await saude(await token({ ...valido, email: 'estranho@exemplo.com.br' }))).status, 403, 'fora da lista');
  assert.equal((await saude(await token(valido, 'chave-desconhecida'))).status, 401);
  const adulterado = (await token(valido)).split('.');
  adulterado[1] = b64(Buffer.from(JSON.stringify({ ...valido, email: 'dono@exemplo.com.br', exp: agora + 99999 })));
  assert.equal((await saude(adulterado.join('.'))).status, 401, 'assinatura não confere');
  assert.equal((await saude(await token(valido), { DADOS: r2Falso() })).status, 503, 'sem configuração do Access: recusa tudo');
  const semLista = { ...env, EMAILS: '' };
  assert.equal((await saude(await token({ ...valido, email: 'estranho@exemplo.com.br' }), semLista)).status, 200, 'sem EMAILS: a porta é o Access e o cadastro de usuários (o cofre confere)');
  assert.equal((await saude(await token({ ...valido, email: '' }), semLista)).status, 403, 'token sem e-mail');
});

test('ícone do aplicativo: padrão até o administrador gravar; só PNG do tamanho certo; operador não grava; fora das rotas genéricas', async () => {
  W.esquecerPapeis();
  const png = (larg, alt, extra = 0) => { // assinatura + IHDR (o resto não importa para o Worker)
    const b = new Uint8Array(33 + extra); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
    const v = new DataView(b.buffer); v.setUint32(16, larg); v.setUint32(20, alt); return b;
  };
  const env = { MODO_TESTE: '1', DADOS: r2Falso() }; // modo de teste sem cofre: administrador
  for (const t of ['192', '512']) {
    const r = await pedir(env, 'GET', `/api/icone-${t}.png`);
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('Location'), `/icones/erp-${t}.png`);
    assert.equal(r.headers.get('Cache-Control'), 'no-cache');
  }
  assert.deepEqual(await (await pedir(env, 'PUT', '/api/icone/512', png(512, 512))).json(), { ok: true });
  assert.equal((await pedir(env, 'PUT', '/api/icone/192', png(192, 192))).status, 200);
  const lido = await pedir(env, 'GET', '/api/icone-512.png');
  assert.equal(lido.status, 200);
  assert.equal(lido.headers.get('Content-Type'), 'image/png');
  assert.equal(lido.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(lido.headers.get('Cache-Control'), 'no-cache');
  assert.deepEqual([...new Uint8Array(await lido.arrayBuffer())], [...png(512, 512)]);
  // recusas
  assert.equal((await pedir(env, 'PUT', '/api/icone/512', new TextEncoder().encode('<svg onload=alert(1)>'))).status, 400, 'não é PNG');
  assert.equal((await pedir(env, 'PUT', '/api/icone/512', png(100, 100))).status, 400, 'tamanho errado');
  assert.equal((await pedir(env, 'PUT', '/api/icone/192', png(512, 512))).status, 400, 'tamanho de outra rota');
  assert.equal((await pedir(env, 'PUT', '/api/icone/512', png(512, 512, 1024 * 1024))).status, 400, 'mais de 1 MB');
  assert.equal((await pedir(env, 'PUT', '/api/icone/256', png(256, 256))).status, 404);
  assert.equal((await W.atender(new Request(`${BASE}/api/icone/512`, { method: 'PUT', body: png(512, 512) }), { ORIGEM: BASE, ...env })).status, 403, 'sem o cabeçalho do sistema');
  // a pasta sistema/ não é alcançada pelas rotas genéricas
  for (const [m, c, corpo] of [['GET', '/api/arquivos/../sistema/icone-512.png'], ['GET', '/api/arquivos/%2E%2E/sistema/icone-512.png'], ['GET', '/api/sistema/icone-512.png'], ['PUT', '/api/sistema/icone-512.png', 'x'], ['DELETE', '/api/sistema/icone-512.png'],
    ['GET', '/api/lista/sistema/'], ['GET', '/api/lista-tudo/sistema/'], ['POST', '/api/mover', '{"de":"sistema","para":"arquivos/x"}'], ['POST', '/api/mover', '{"de":"arquivos/a.pdf","para":"sistema/icone-192.png"}'], ['POST', '/api/apagar', '{"caminho":"sistema"}']]) {
    const r = await pedir(env, m, c, corpo);
    assert.ok(r.status >= 400, `${m} ${c} → ${r.status}`);
  }
  assert.equal(env.DADOS.m.size, 2, 'os dois ícones continuam lá');
  // operador não grava nem apaga
  W.esquecerPapeis();
  const COFRE = { idFromName: (n) => n, get: () => ({ fetch: async (req) => (new URL(req.url).searchParams.get('nivel') === 'admin' ? new Response('{"erro":"Seu usuário não pode fazer isso."}', { status: 403 }) : new Response('{"papel":"operador"}')) }) };
  const envOp = { ...env, COFRE };
  assert.equal((await pedir(envOp, 'PUT', '/api/icone/512', png(512, 512))).status, 403);
  assert.equal((await pedir(envOp, 'DELETE', '/api/icone')).status, 403);
  assert.equal((await pedir(envOp, 'GET', '/api/icone-512.png')).status, 200, 'qualquer um que entrou vê o ícone');
  // o administrador volta ao padrão
  W.esquecerPapeis();
  assert.deepEqual(await (await pedir(env, 'DELETE', '/api/icone')).json(), { ok: true });
  for (const t of ['192', '512']) assert.equal((await pedir(env, 'GET', `/api/icone-${t}.png`)).status, 302);
  assert.equal(env.DADOS.m.size, 0);
});

// ---------------------------------------------------------------------------
// Crachá do aparelho (programa do PC, nuvem/aparelhos.mjs): entra com e-mail e senha, só lê, desliga, para com o usuário
// ---------------------------------------------------------------------------
async function nuvemComCofre() {
  const db = new DatabaseSync(':memory:');
  const sql = { exec(q, ...p) { if (!p.length && q.trim().split(';').filter((x) => x.trim()).length > 1) { db.exec(q); return { toArray: () => [] }; } const l = db.prepare(q).all(...p).map((x) => ({ ...x })); return { toArray: () => l }; } };
  const tx = (fn) => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  const r2 = r2Falso();
  const dobj = new CofreDO({ storage: { sql, transactionSync: tx } }, { DADOS: r2 });
  const usuario = async (id, login, papel, senha, extra = {}) => ({ id, login, email: login, nome: `Pessoa ${id}`, papel, ativo: true, senha_sal: `sal${id}`, senha_hash: await resumoSenha(senha, `sal${id}`, 1000), senha_iteracoes: 1000, ...extra });
  dobj.cofre.importar({ formato: 'imoveis-v1', imoveis: [], usuarios: [
    await usuario(1, 'dono@exemplo.com.br', 'admin', 'senha do dono 2026'),
    await usuario(2, 'leitor@exemplo.com.br', 'consulta', 'senha do leitor 2026'),
    await usuario(3, 'antigo@exemplo.com.br', 'admin', 'senha antiga 2026', { senha_iteracoes: undefined, senha_hash: await resumoSenha('senha antiga 2026', 'sal3', 150000) }),
  ] }, 'dono@exemplo.com.br');
  await r2.put('arquivos/Sala 101/contrato.pdf', 'pdf');
  await r2.put('backups/imoveis-dados-2026-11-08.json', '{}');
  W.esquecerPapeis(); W.esquecerCrachas();
  // sem MODO_TESTE e com o Access configurado: só o caminho do aparelho entra sem o token do Access
  const env = { ACCESS_EQUIPE: EQUIPE, ACCESS_AUD: AUD, ORIGEM: 'https://erp.ankjck.com.br', DADOS: r2, COFRE: { idFromName: (n) => n, get: () => ({ fetch: (req) => dobj.fetch(req) }) } };
  const github = [];
  const buscar = async (url, op = {}) => {
    if (String(url).includes('cloudflareaccess')) return buscarCerts(url);
    github.push({ url, metodo: op.method, se: op.headers?.['If-None-Match'] });
    if (op.headers?.['If-None-Match'] === '"v1"') return new Response(null, { status: 304, headers: { ETag: '"v1"' } });
    return new Response(op.method === 'HEAD' ? null : '<html>programa</html>', { headers: { ETag: '"v1"' } });
  };
  const pedir = (metodo, caminho, { corpo, cracha, ip = '203.0.113.5', cab = {} } = {}) => W.atender(new Request(`https://erp.ankjck.com.br/api/${caminho}`, {
    method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
    headers: { 'CF-Connecting-IP': ip, ...(cracha ? { Authorization: `Bearer ${cracha}` } : {}), ...cab },
  }), env, buscar);
  const entrar = (email, senha, extra = {}) => pedir('POST', 'aparelho/entrar', { corpo: { email, senha, computador: 'ESCRITORIO-01' }, ...extra });
  return { dobj, env, pedir, entrar, github };
}

test('crachá do aparelho: entra com e-mail e senha conferidos no servidor e só lê; nada fora de /api/aparelho/ passa sem o Access', async () => {
  const { dobj, pedir, entrar, github } = await nuvemComCofre();
  const r = await entrar('Dono@Exemplo.com.br', 'senha do dono 2026');
  assert.equal(r.status, 200);
  const { cracha, computador, papel } = await r.json();
  assert.match(cracha, /^ap1_[A-Za-z0-9_-]{43}$/);
  assert.deepEqual([computador, papel], ['ESCRITORIO-01', 'admin']);
  const guardado = dobj.cofre.q('SELECT * FROM aparelhos')[0];
  assert.equal(guardado.hash, await A.hashDoCracha(cracha), 'o cofre guarda só o hash');
  assert.ok(!JSON.stringify(dobj.cofre.q('SELECT * FROM aparelhos')).includes(cracha));
  assert.ok(!JSON.stringify(dobj.cofre.tudo()).includes(guardado.hash), 'os aparelhos não vão para o banco (JSON)');
  assert.equal(guardado.ligado_por, 'dono@exemplo.com.br');

  // lê: dados, lista, arquivos, backups (o dono é administrador) e a versão PC
  assert.equal((await (await pedir('GET', 'aparelho/saude', { cracha })).json()).email, 'dono@exemplo.com.br');
  const tudo = await (await pedir('GET', 'aparelho/dados/tudo', { cracha })).json();
  assert.equal(tudo.formato, 'imoveis-v1');
  assert.equal((await pedir('GET', 'aparelho/dados/mudancas?desde=0', { cracha })).status, 200);
  assert.equal((await (await pedir('GET', 'aparelho/lista-tudo/arquivos/', { cracha })).json()).arquivos[0].caminho, 'Sala 101/contrato.pdf');
  assert.equal(await (await pedir('GET', 'aparelho/arquivos/Sala%20101/contrato.pdf', { cracha })).text(), 'pdf');
  assert.equal((await pedir('GET', 'aparelho/backups/imoveis-dados-2026-11-08.json', { cracha })).status, 200);
  const prog = await pedir('GET', 'aparelho/programa', { cracha });
  assert.equal(await prog.text(), '<html>programa</html>');
  assert.equal(prog.headers.get('ETag'), '"v1"');
  assert.equal((await pedir('GET', 'aparelho/programa', { cracha, cab: { 'If-None-Match': '"v1"' } })).status, 304, 'versão igual: não baixa de novo');
  assert.equal((await pedir('HEAD', 'aparelho/programa', { cracha })).status, 200);
  assert.equal(github[0].url, W.URL_PROGRAMA);

  // não grava nada, nem pelo caminho do aparelho
  for (const [m, c] of [['POST', 'aparelho/dados/lote'], ['PUT', 'aparelho/arquivos/x.pdf'], ['DELETE', 'aparelho/arquivos/Sala%20101/contrato.pdf'], ['POST', 'aparelho/mover'], ['POST', 'aparelho/apagar']]) {
    assert.equal((await pedir(m, c, { cracha, corpo: {} })).status, 405, `${m} ${c}`);
  }
  assert.equal((await pedir('GET', 'aparelho/dados/conflitos', { cracha })).status, 404, 'só tudo e mudancas');
  assert.equal((await pedir('GET', 'aparelho/dados/aparelhos', { cracha })).status, 404);
  assert.equal((await pedir('GET', 'aparelho/email/estado', { cracha })).status, 404);
  // sem crachá (ou inventado), nada; e o crachá não abre as rotas normais (elas pedem o Access)
  assert.equal((await pedir('GET', 'aparelho/dados/tudo')).status, 401);
  assert.equal((await pedir('GET', 'aparelho/dados/tudo', { cracha: `ap1_${'A'.repeat(43)}` })).status, 401);
  assert.equal((await pedir('GET', 'dados/tudo', { cracha })).status, 401, 'fora de /api/aparelho/ vale só o Access');
  assert.equal((await pedir('GET', 'aparelho/%2e%2e/dados/tudo', { cracha })).status, 401, '"../" sai do caminho do aparelho e cai no Access');
});

test('crachá do aparelho: senha errada e limite de tentativas (por e-mail, por endereço e no total); usuário antigo e pendente', async () => {
  const { dobj, entrar } = await nuvemComCofre();
  const r = await entrar('dono@exemplo.com.br', 'senha errada');
  assert.equal(r.status, 401);
  assert.equal((await r.json()).erro, 'E-mail ou senha errados.');
  assert.equal((await entrar('ninguem@exemplo.com.br', 'qualquer coisa')).status, 401, 'e-mail desconhecido: mesma resposta');
  assert.equal((await entrar('', '')).status, 400);
  assert.equal((await entrar('dono@exemplo.com.br', 'senha do dono 2026', { ip: '198.51.100.1' })).status, 200, 'acertou: entra e zera o e-mail');
  for (let i = 0; i < 5; i += 1) assert.equal((await entrar('leitor@exemplo.com.br', `errada ${i}`, { ip: `198.51.100.${10 + i}` })).status, 401);
  const barrado = await entrar('leitor@exemplo.com.br', 'senha do leitor 2026', { ip: '198.51.100.99' });
  assert.equal(barrado.status, 429, '5 erros no mesmo e-mail: espera, mesmo com a senha certa');
  assert.match((await barrado.json()).erro, /Espere 15 minutos/);
  dobj.cofre.relogio = () => new Date(Date.now() + 16 * 60000);
  assert.equal((await entrar('leitor@exemplo.com.br', 'senha do leitor 2026', { ip: '198.51.100.99' })).status, 200, 'passados 15 minutos, entra');
  // por endereço: 10 erros com e-mails diferentes do mesmo lugar
  for (let i = 0; i < 10; i += 1) await entrar(`x${i}@exemplo.com.br`, 'errada', { ip: '192.0.2.7' });
  assert.equal((await entrar('dono@exemplo.com.br', 'senha do dono 2026', { ip: '192.0.2.7' })).status, 429);
  // no total: 50 erros por hora param todo mundo (sem o Access na frente, é a trava contra quem tenta de muitos lugares)
  dobj.cofre.relogio = () => new Date(Date.now() + 2 * 3600000);
  for (let i = 0; i < 50; i += 1) await entrar(`y${i}@exemplo.com.br`, 'errada', { ip: `10.0.${i}.1` });
  assert.equal((await entrar('dono@exemplo.com.br', 'senha do dono 2026', { ip: '10.9.9.9' })).status, 429);
  dobj.cofre.relogio = () => new Date(Date.now() + 4 * 3600000);
  assert.equal((await entrar('antigo@exemplo.com.br', 'senha antiga 2026', { ip: '10.9.9.9' })).status, 200, 'senha gravada com as voltas antigas (sem senha_iteracoes)');
  // pedido de acesso ainda não aprovado não liga computador
  const u = dobj.cofre.q("SELECT dados FROM registros WHERE tabela = 'usuarios' AND id = 2").map((x) => JSON.parse(x.dados))[0];
  dobj.cofre.sql.exec("UPDATE registros SET dados = ? WHERE tabela = 'usuarios' AND id = 2", JSON.stringify({ ...u, pendente: true }));
  assert.equal((await entrar('leitor@exemplo.com.br', 'senha do leitor 2026', { ip: '10.9.9.8' })).status, 401);
});

test('crachá do aparelho: papel do usuário, desligar em Usuários, usuário desativado e 90 dias parado', async () => {
  const { dobj, env, pedir, entrar } = await nuvemComCofre();
  const leitor = (await (await entrar('leitor@exemplo.com.br', 'senha do leitor 2026')).json()).cracha;
  const dono = (await (await entrar('dono@exemplo.com.br', 'senha do dono 2026')).json()).cracha;
  assert.equal((await pedir('GET', 'aparelho/backups/imoveis-dados-2026-11-08.json', { cracha: leitor })).status, 403, 'consulta não baixa backup');
  const tudo = await (await pedir('GET', 'aparelho/dados/tudo', { cracha: leitor })).json();
  assert.equal(tudo.usuarios.find((u) => u.id === 1).senha_hash, undefined, 'consulta não recebe a senha dos outros');

  // a lista e o Desligar, pelo site (com o login do Access)
  const site = async (email, metodo, rota, corpo) => {
    const agora = Math.floor(Date.now() / 1000);
    const jwt = await token({ aud: [AUD], iss: `https://${EQUIPE}`, exp: agora + 3600, iat: agora, email });
    return W.atender(new Request(`https://erp.ankjck.com.br/api/dados/${rota}`, {
      method: metodo, body: corpo && JSON.stringify(corpo),
      headers: { 'Cf-Access-Jwt-Assertion': jwt, ...(metodo === 'POST' ? { 'X-Sistema': 'imoveis', Origin: 'https://erp.ankjck.com.br' } : {}) },
    }), env, buscarCerts);
  };
  const lista = (await (await site('dono@exemplo.com.br', 'GET', 'aparelhos')).json()).aparelhos;
  assert.deepEqual(lista.map((a) => [a.computador, a.ligado_por, a.nome]), [['ESCRITORIO-01', 'leitor@exemplo.com.br', 'Pessoa 2'], ['ESCRITORIO-01', 'dono@exemplo.com.br', 'Pessoa 1']]);
  assert.ok(lista.every((a) => a.ligado_em && a.ultimo_uso && !('hash' in a)));
  const doLeitor = (await (await site('leitor@exemplo.com.br', 'GET', 'aparelhos')).json()).aparelhos;
  assert.deepEqual(doLeitor.map((a) => a.ligado_por), ['leitor@exemplo.com.br'], 'quem não é administrador vê só os seus');
  assert.equal((await site('leitor@exemplo.com.br', 'POST', 'desligar-aparelho', { id: lista[1].id })).status, 403, 'não desliga o do outro');
  assert.equal((await site('dono@exemplo.com.br', 'POST', 'desligar-aparelho', { id: lista[0].id })).status, 200);
  W.esquecerCrachas(); W.esquecerPapeis(); // o Worker guarda o "vale" por 1 minuto
  assert.equal((await pedir('GET', 'aparelho/dados/tudo', { cracha: leitor })).status, 401, 'desligado: para');
  assert.equal((await site('dono@exemplo.com.br', 'POST', 'desligar-aparelho', { id: lista[0].id })).status, 404);
  assert.equal((await (await site('dono@exemplo.com.br', 'GET', 'aparelhos')).json()).aparelhos.length, 1);

  // usuário desativado: o crachá que ele ligou para
  const u = dobj.cofre.q("SELECT dados FROM registros WHERE tabela = 'usuarios' AND id = 1").map((x) => JSON.parse(x.dados))[0];
  dobj.cofre.sql.exec("UPDATE registros SET dados = ? WHERE tabela = 'usuarios' AND id = 1", JSON.stringify({ ...u, ativo: false }));
  W.esquecerCrachas();
  const r = await pedir('GET', 'aparelho/dados/tudo', { cracha: dono });
  assert.equal(r.status, 403);
  assert.match((await r.json()).erro, /desativado/);
  dobj.cofre.sql.exec("UPDATE registros SET dados = ? WHERE tabela = 'usuarios' AND id = 1", JSON.stringify(u));
  W.esquecerCrachas(); W.esquecerPapeis();
  assert.equal((await pedir('GET', 'aparelho/dados/tudo', { cracha: dono })).status, 200, 'reativado: volta');

  // 90 dias sem usar: vence
  W.esquecerCrachas();
  dobj.cofre.relogio = () => new Date(Date.now() + 91 * 86400000);
  assert.equal((await pedir('GET', 'aparelho/saude', { cracha: dono })).status, 401);
  assert.equal(dobj.cofre.q('SELECT desligado_por FROM aparelhos WHERE id = 2')[0].desligado_por, 'parado 90 dias');
});
