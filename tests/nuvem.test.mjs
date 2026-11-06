// Worker da nuvem (nuvem/worker.mjs) com um R2 de mentira em memória: banco com ETag, conflito, backup do dia,
// anexos, listagem, mover/juntar pastas, caminhos perigosos e login do Access (JWT assinado aqui mesmo). Dados fictícios.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as W from '../nuvem/worker.mjs';

/** R2 em memória com o mesmo formato do Cloudflare (get/head/put/delete/list, etag e onlyIf.etagMatches). */
function r2Falso() {
  const m = new Map();
  let n = 0;
  const objeto = (key, o) => ({ key, size: o.dados.byteLength, etag: o.etag, httpEtag: `"${o.etag}"`, httpMetadata: o.httpMetadata, customMetadata: o.customMetadata });
  return {
    m,
    async head(key) { const o = m.get(key); return o ? objeto(key, o) : null; },
    async get(key) {
      const o = m.get(key); if (!o) return null;
      return { ...objeto(key, o), body: new Blob([o.dados]).stream(), arrayBuffer: async () => o.dados.slice().buffer, text: async () => new TextDecoder().decode(o.dados) };
    },
    async put(key, valor, op = {}) {
      const atual = m.get(key);
      if (op.onlyIf?.etagMatches && atual?.etag !== op.onlyIf.etagMatches) return null;
      const dados = typeof valor === 'string' ? new TextEncoder().encode(valor) : new Uint8Array(valor);
      n += 1;
      const o = { dados, etag: `e${n}`, httpMetadata: op.httpMetadata, customMetadata: op.customMetadata };
      m.set(key, o);
      return objeto(key, o);
    },
    async delete(chaves) { for (const k of [].concat(chaves)) m.delete(k); },
    async list({ prefix = '', delimiter, cursor, limit = 1000 } = {}) {
      const todas = [...m.keys()].filter((k) => k.startsWith(prefix)).sort();
      const objetos = []; const pastas = new Set();
      for (const k of todas) {
        const resto = k.slice(prefix.length);
        if (delimiter && resto.includes(delimiter)) pastas.add(prefix + resto.slice(0, resto.indexOf(delimiter) + 1));
        else objetos.push(k);
      }
      const ini = Number(cursor || 0);
      const fatia = objetos.slice(ini, ini + limit);
      const truncated = ini + limit < objetos.length;
      return { objects: fatia.map((k) => objeto(k, m.get(k))), delimitedPrefixes: [...pastas], truncated, cursor: truncated ? String(ini + limit) : undefined };
    },
  };
}

const BASE = 'https://erp.ankjck.com.br';
const pedir = (env, metodo, caminho, corpo, cab = {}) => W.atender(new Request(`${BASE}${caminho}`, {
  method: metodo, body: corpo, headers: { ...(metodo !== 'GET' ? { 'X-Sistema': 'imoveis', Origin: BASE } : {}), ...cab },
}), env);
const banco = (extra = {}) => JSON.stringify({ formato: 'imoveis-v1', imoveis: [], ...extra });

test('banco: primeira gravação, leitura com ETag, gravação condicional e conflito', async () => {
  const env = { MODO_TESTE: '1', DADOS: r2Falso() };
  assert.equal((await pedir(env, 'GET', '/api/banco')).status, 404);
  assert.equal((await pedir(env, 'PUT', '/api/banco', banco())).status, 428, 'sem If-Match nem If-None-Match');
  const r1 = await pedir(env, 'PUT', '/api/banco', banco(), { 'If-None-Match': '*' });
  assert.equal(r1.status, 200);
  assert.equal((await pedir(env, 'PUT', '/api/banco', banco(), { 'If-None-Match': '*' })).status, 412, 'já existe');
  const lido = await pedir(env, 'GET', '/api/banco');
  const etag = lido.headers.get('ETag');
  assert.equal(etag, (await r1.json()).etag);
  assert.equal(JSON.parse(await lido.text()).formato, 'imoveis-v1');
  // pessoa A grava com o ETag lido; pessoa B, com o mesmo ETag (velho), é recusada
  const a = await pedir(env, 'PUT', '/api/banco', banco({ quem: 'A' }), { 'If-Match': etag });
  assert.equal(a.status, 200);
  const b = await pedir(env, 'PUT', '/api/banco', banco({ quem: 'B' }), { 'If-Match': etag });
  assert.equal(b.status, 412);
  assert.equal((await b.json()).etag, (await a.json()).etag, 'devolve o ETag atual para recarregar');
  assert.equal(JSON.parse(await (await pedir(env, 'GET', '/api/banco')).text()).quem, 'A');
});

test('banco: recusa JSON danificado, outro formato e pedido sem o cabeçalho do sistema ou de outra origem', async () => {
  const env = { MODO_TESTE: '1', DADOS: r2Falso() };
  assert.equal((await pedir(env, 'PUT', '/api/banco', '{quebrado', { 'If-None-Match': '*' })).status, 400);
  assert.equal((await pedir(env, 'PUT', '/api/banco', JSON.stringify({ formato: 'outro' }), { 'If-None-Match': '*' })).status, 400);
  const semCab = await W.atender(new Request(`${BASE}/api/banco`, { method: 'PUT', body: banco(), headers: { 'If-None-Match': '*' } }), env);
  assert.equal(semCab.status, 403);
  assert.equal((await pedir(env, 'PUT', '/api/banco', banco(), { 'If-None-Match': '*', Origin: 'https://site-ruim.com' })).status, 403);
  assert.equal(env.DADOS.m.size, 0);
});

test('backup do dia: um por dia no horário de Brasília, guardando os 30 mais recentes', async () => {
  const env = { DADOS: r2Falso() };
  assert.equal(W.hojeBrasilia(new Date('2026-11-06T23:30:00-03:00')), '2026-11-06', 'às 23h30 ainda é o mesmo dia');
  assert.equal(await W.backupDiario(env, banco(), new Date('2026-11-06T12:00:00-03:00')), true);
  assert.equal(await W.backupDiario(env, banco(), new Date('2026-11-06T18:00:00-03:00')), false, 'segundo do dia não grava');
  for (let d = 0; d < 35; d += 1) await W.backupDiario(env, banco(), new Date(Date.UTC(2026, 6, 1 + d, 15)));
  const nomes = [...env.DADOS.m.keys()].filter((k) => k.startsWith('backups/')).sort();
  assert.equal(nomes.length, W.MANTER_BACKUPS);
  assert.equal(nomes.at(-1), 'backups/imoveis-dados-2026-11-06.json');
  // o PUT do banco também faz o backup
  const env2 = { MODO_TESTE: '1', DADOS: r2Falso() };
  await pedir(env2, 'PUT', '/api/banco', banco(), { 'If-None-Match': '*' });
  assert.ok([...env2.DADOS.m.keys()].some((k) => /^backups\/imoveis-dados-\d{4}-\d{2}-\d{2}\.json$/.test(k)));
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

test('mover: renomeia pasta, recusa destino ocupado, junta devolvendo o que sobrou e nunca para dentro dela mesma', async () => {
  const env = { MODO_TESTE: '1', DADOS: r2Falso() };
  for (const k of ['arquivos/Sala 1/Inquilinos/Ana/a.pdf', 'arquivos/Sala 1/Inquilinos/Ana/b.pdf', 'arquivos/Sala 1/Inquilinos/Bia/c.pdf']) await env.DADOS.put(k, k);
  const mover = (corpo) => pedir(env, 'POST', '/api/mover', JSON.stringify(corpo), { 'Content-Type': 'application/json' });
  const r = await mover({ de: 'arquivos/Sala 1/Inquilinos/Ana', para: 'arquivos/Sala 1/Inquilinos/Ana Souza' });
  assert.deepEqual(await r.json(), { ok: true, movidos: 2, sobraram: [] });
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
});

// ---------------------------------------------------------------------------
// Login do Access: token assinado com uma chave RSA criada no teste
// ---------------------------------------------------------------------------
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

test('login: só com token do Access válido, da equipe e do aplicativo certos, não vencido e de e-mail da lista', async () => {
  const env = { DADOS: r2Falso(), ACCESS_EQUIPE: EQUIPE, ACCESS_AUD: AUD, EMAILS: 'dono@exemplo.com.br, Socio@Exemplo.com.br' };
  const agora = Math.floor(Date.now() / 1000);
  const valido = { aud: [AUD], iss: `https://${EQUIPE}`, exp: agora + 3600, iat: agora, email: 'socio@exemplo.com.br' };
  const saude = async (jwt, e = env) => W.atender(new Request(`${BASE}/api/saude`, { headers: jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {} }), e, buscarCerts);
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
});
