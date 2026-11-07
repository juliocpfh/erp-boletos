// Aplicativo instalável (docs/sw.js): uma conferência por abertura (data de publicação do index.html); mesma versão → arquivos
// da cópia sem ir ao site; versão nova → cópia refeita; sem internet → cópia; localhost → confere arquivo a arquivo.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const CODIGO = fs.readFileSync(new URL('../docs/sw.js', import.meta.url), 'utf8');

/** Sobe o sw.js num mundo falso: `caches`, `fetch` e os eventos, com o site respondendo `publicada` como data e `arquivos` como conteúdo. */
function mundo({ hostname = 'erp.exemplo.com.br', publicada = 'Sat, 07 Nov 2026 12:41:50 GMT' } = {}) {
  const origem = `https://${hostname}`;
  const armazem = new Map(); // nome do cache → Map(url → Response)
  const pedidos = []; // o que foi ao site
  const site = { publicada, internet: true };
  const chave = (k) => (k instanceof Request ? k.url : new URL(k, `${origem}/`).href);
  const cacheFalso = (nome) => {
    if (!armazem.has(nome)) armazem.set(nome, new Map());
    const m = armazem.get(nome);
    return {
      async match(k) { return m.get(chave(k))?.clone(); },
      async put(k, r) { m.set(chave(k), r); },
      async delete(k) { return m.delete(chave(k)); },
      async keys() { return [...m.keys()].map((u) => new Request(u)); },
    };
  };
  const caches = {
    async open(nome) { return cacheFalso(nome); },
    async keys() { return [...armazem.keys()]; },
    async delete(nome) { return armazem.delete(nome); },
    async match(k) { for (const m of armazem.values()) { const r = m.get(chave(k)); if (r) return r.clone(); } return undefined; },
  };
  const ouvintes = {};
  const self = {
    location: new URL(`${origem}/sw.js`),
    addEventListener: (tipo, fn) => { ouvintes[tipo] = fn; },
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  };
  const fetch = async (req, init = {}) => {
    const url = req instanceof Request ? req.url : chave(req);
    const metodo = init.method || (req instanceof Request ? req.method : 'GET');
    pedidos.push(`${metodo} ${new URL(url).pathname}${init.cache ? ` (${init.cache})` : ''}`);
    if (!site.internet) throw new TypeError('Failed to fetch');
    const r = new Response(`conteudo de ${new URL(url).pathname} @ ${site.publicada}`, { status: 200, headers: { 'last-modified': site.publicada } });
    Object.defineProperty(r, 'type', { value: 'basic' });
    Object.defineProperty(r, 'url', { value: url });
    return r;
  };
  const ctx = { self, caches, fetch, Request, Response, URL, console };
  vm.runInNewContext(CODIGO, ctx, { filename: 'sw.js' });
  /** Simula um pedido da página: devolve o texto da resposta. */
  const pedir = async (caminho, modo = 'no-cors') => {
    const req = new Request(`${origem}/${caminho}`);
    Object.defineProperty(req, 'mode', { value: modo });
    let resposta;
    ouvintes.fetch({ request: req, respondWith: (p) => { resposta = p; } });
    return (await resposta).text();
  };
  /** Uma abertura da página: index + os arquivos que ela pede. */
  const abrir = async () => {
    await pedir('', 'navigate');
    const textos = await Promise.all(['js/app.js', 'js/regras.js', 'css/estilo.css'].map((a) => pedir(a)));
    await new Promise((ok) => setTimeout(ok, 5)); // as gravações no cache são por fora
    return textos;
  };
  return { site, pedidos, abrir, pedir, armazem };
}

test('primeira abertura baixa tudo; a seguinte, na mesma versão, faz uma conferência só e usa a cópia', async () => {
  const m = mundo();
  await m.abrir();
  assert.ok(m.pedidos.includes('HEAD /index.html (no-cache)'), 'conferiu a data de publicação');
  assert.ok(m.pedidos.includes('GET /js/app.js (no-cache)'));
  m.pedidos.length = 0;
  const textos = await m.abrir();
  assert.deepEqual(m.pedidos.sort(), ['GET /', 'HEAD /index.html (no-cache)'], 'só a página e a conferência foram ao site');
  assert.match(textos[0], /js\/app\.js/);
});

test('versão nova publicada: a cópia é refeita com os arquivos novos', async () => {
  const m = mundo();
  await m.abrir();
  m.site.publicada = 'Sun, 08 Nov 2026 10:00:00 GMT';
  m.pedidos.length = 0;
  const textos = await m.abrir();
  assert.ok(m.pedidos.includes('GET /js/regras.js (no-cache)'), 'baixou de novo');
  assert.match(textos[1], /08 Nov 2026/);
  // e a abertura seguinte volta a usar a cópia (já com a data nova)
  m.pedidos.length = 0;
  const depois = await m.abrir();
  assert.equal(m.pedidos.filter((p) => p.includes('js/')).length, 0);
  assert.match(depois[1], /08 Nov 2026/, 'a cópia é a nova');
});

test('sem internet: a página e os arquivos vêm da cópia', async () => {
  const m = mundo();
  await m.abrir();
  m.site.internet = false;
  const textos = await m.abrir();
  assert.match(textos[2], /css\/estilo\.css/);
  assert.match(await m.pedir('', 'navigate'), /conteudo de \//);
});

test('em localhost (desenvolvimento) cada arquivo é conferido com o servidor, como antes', async () => {
  const m = mundo({ hostname: 'localhost' });
  await m.abrir(); m.pedidos.length = 0;
  await m.abrir();
  assert.ok(m.pedidos.includes('GET /js/app.js (no-cache)'));
  assert.ok(!m.pedidos.some((p) => p.startsWith('HEAD')), 'sem a conferência da data');
});
