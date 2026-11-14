// Aplicativo instalável (docs/sw.js): uma conferência por abertura (data de publicação do index.html); mesma versão → arquivos
// da cópia sem ir ao site; versão nova → cópia refeita (bibliotecas e modelos baixados de novo em segundo plano); arquivo velho
// de um cache no caminho não fica guardado como novo; sem internet → cópia; localhost → confere arquivo a arquivo.
// Também carregarScript (docs/js/app.js), que carrega essas bibliotecas na página.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const CODIGO = fs.readFileSync(new URL('../docs/sw.js', import.meta.url), 'utf8');
const A = 'Sat, 07 Nov 2026 12:41:50 GMT'; const B = 'Sun, 08 Nov 2026 10:00:00 GMT'; const C = 'Mon, 09 Nov 2026 14:00:00 GMT';

/**
 * Sobe o sw.js num mundo falso: `caches`, `fetch` e os eventos, com o site respondendo `publicada` como data (Last-Modified)
 * e o caminho como conteúdo. `noCaminho` (endereço exato → data): cópia velha num cache do caminho (Cloudflare), que outro
 * endereço (?v=…) não pega; `naOrigem` (caminho → data): velho até no site; `fora`: caminhos que saíram do site (404);
 * `semInternetNoFundo`: a internet cai logo depois da abertura (o que é baixado em segundo plano, ?v=…, falha).
 */
function mundo({ hostname = 'erp.exemplo.com.br', publicada = A } = {}) {
  const origem = `https://${hostname}`;
  const armazem = new Map(); // nome do cache → Map(url → Response)
  const pedidos = []; // o que foi ao site
  const fundo = []; // o que o service worker deixou rodando em segundo plano (ev.waitUntil)
  // erro: o site responde com página de erro (ex.: 502 do Cloudflare)
  // lento: o site não responde (sinal fraco) até `site.soltar()`; os prazos do service worker vencem antes
  const site = { publicada, internet: true, erro: 0, noCaminho: new Map(), naOrigem: new Map(), fora: new Set(), semInternetNoFundo: false, lento: false, soltar: () => {} };
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
    const url = new URL(req instanceof Request ? req.url : chave(req));
    const metodo = init.method || (req instanceof Request ? req.method : 'GET');
    pedidos.push(`${metodo} ${url.pathname}${url.search}${init.cache ? ` (${init.cache})` : ''}`);
    if (site.lento) await new Promise((ok) => { const antes = site.soltar; site.soltar = () => { antes(); ok(); }; });
    if (!site.internet || (site.semInternetNoFundo && url.searchParams.has('v'))) throw new TypeError('Failed to fetch');
    const data = site.noCaminho.get(url.pathname + url.search) || site.naOrigem.get(url.pathname) || site.publicada;
    const r = site.erro ? new Response('Bad gateway', { status: site.erro })
      : site.fora.has(url.pathname) ? new Response('Not found', { status: 404 })
        : new Response(`conteudo de ${url.pathname} @ ${data}`, { status: 200, headers: { 'last-modified': data } });
    Object.defineProperty(r, 'type', { value: 'basic' });
    Object.defineProperty(r, 'url', { value: url.href });
    return r;
  };
  // o segundo plano espera ESPERA_SEGUNDO_PLANO; aqui, o próximo instante (depois dos pedidos da abertura)
  const ctx = { self, caches, fetch, Request, Response, URL, console, setTimeout: (fn) => setTimeout(fn, 0), clearTimeout };
  vm.runInNewContext(CODIGO, ctx, { filename: 'sw.js' });
  /** Simula um pedido da página: devolve o texto da resposta. */
  const pedir = async (caminho, modo = 'no-cors') => {
    const req = new Request(`${origem}/${caminho}`);
    Object.defineProperty(req, 'mode', { value: modo });
    let resposta;
    ouvintes.fetch({ request: req, respondWith: (p) => { resposta = p; }, waitUntil: (p) => { fundo.push(p); } });
    return (await resposta).text();
  };
  const terminarFundo = async () => {
    await new Promise((ok) => setTimeout(ok, 5)); // as gravações no cache são por fora
    while (fundo.length) await fundo.shift();
    await new Promise((ok) => setTimeout(ok, 5));
  };
  /** Uma abertura da página: index + os arquivos que ela pede (e o que ficou em segundo plano). */
  const abrir = async () => {
    await pedir('', 'navigate');
    const textos = await Promise.all(['js/app.js', 'js/regras.js', 'css/estilo.css'].map((a) => pedir(a)));
    await terminarFundo();
    return textos;
  };
  const guardados = () => [...(armazem.get('imoveis-telas-v3') || new Map()).keys()].map((u) => new URL(u).pathname);
  return { site, pedidos, abrir, pedir, armazem, terminarFundo, guardados };
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

test('partes carregadas só quando usadas (planilha, regras em texto, visualizador, passagem) ficam guardadas desde a 1ª abertura', async () => {
  const m = mundo();
  await m.abrir(); // abre com internet e não usa nenhuma delas
  for (const a of ['/js/exportar.js', '/js/regras-texto.js', '/js/visualizador.js', '/js/migracao.js']) {
    assert.ok(m.guardados().includes(a), `guardou ${a}`);
  }
  m.site.internet = false;
  await m.abrir();
  assert.match(await m.pedir('js/exportar.js'), /exportar\.js/, 'sem internet, a planilha de tudo ainda carrega');
  // em localhost não baixa nada em segundo plano (lá cada arquivo é conferido quando a página pede)
  const local = mundo({ hostname: 'localhost' });
  await local.abrir();
  assert.ok(!local.guardados().includes('/js/exportar.js'));
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

test('sinal fraco (o site demora a responder): a página e os arquivos abrem da cópia sem esperar; o que chegar depois fica guardado', async () => {
  const m = mundo();
  await m.abrir();
  m.site.lento = true;
  m.site.publicada = B; // há versão nova no site, mas ele não responde a tempo
  const pagina = await m.pedir('', 'navigate');
  assert.match(pagina, /conteudo de \/ @ Sat, 07/, 'a página da cópia (versão A), sem esperar o site');
  const textos = await Promise.all(['js/app.js', 'css/estilo.css'].map((a) => m.pedir(a)));
  assert.match(textos[0], /js\/app\.js @ Sat, 07/, 'arquivos da cópia');
  // o site responde depois: a página nova fica guardada para a próxima abertura
  m.site.lento = false;
  m.site.soltar();
  await m.terminarFundo();
  assert.match(await (await m.armazem.get('imoveis-telas-v3').get('https://erp.exemplo.com.br/')).clone().text(), /@ Sun, 08/);
  // sem cópia guardada (primeira vez), espera o site
  const novo = mundo(); novo.site.lento = true;
  const primeira = novo.pedir('', 'navigate');
  await new Promise((ok) => setTimeout(ok, 5));
  novo.site.lento = false; novo.site.soltar();
  assert.match(await primeira, /conteudo de \//);
});

test('site fora do ar respondendo com página de erro (502): abre a cópia guardada, como sem internet', async () => {
  const m = mundo();
  await m.abrir();
  m.site.erro = 502;
  const textos = await m.abrir();
  assert.match(textos[0], /js\/app\.js/, 'arquivo da cópia');
  assert.match(await m.pedir('', 'navigate'), /conteudo de \//, 'página da cópia, não a de erro');
  // sem cópia guardada (primeira vez), mostra o erro do site
  const novo = mundo(); novo.site.erro = 502;
  assert.equal(await novo.pedir('', 'navigate'), 'Bad gateway');
});

test('em localhost (desenvolvimento) cada arquivo é conferido com o servidor, como antes', async () => {
  const m = mundo({ hostname: 'localhost' });
  await m.abrir(); m.pedidos.length = 0;
  await m.abrir();
  assert.ok(m.pedidos.includes('GET /js/app.js (no-cache)'));
  assert.ok(!m.pedidos.some((p) => p.startsWith('HEAD')), 'sem a conferência da data');
  // lá a data dos arquivos não é conferida: arquivo "velho" é guardado como veio, sem ir ao site de novo
  m.site.noCaminho.set('/js/regras.js', 'Thu, 01 Jan 2026 00:00:00 GMT'); m.pedidos.length = 0;
  assert.match((await m.abrir())[1], /01 Jan 2026/);
  assert.ok(!m.pedidos.some((p) => p.includes('?v=')));
});

test('versão nova: bibliotecas (vendor/) e modelos usados na versão anterior voltam em segundo plano; sem internet depois, PDF e Excel funcionam', async () => {
  const m = mundo();
  await m.abrir();
  for (const a of ['vendor/jspdf.umd.min.js', 'vendor/exceljs.min.js', 'modelos/fatura-modelo.xlsx', 'vendor/antiga.min.js']) await m.pedir(a); // usados na versão A
  await m.terminarFundo();
  m.site.publicada = B; m.site.fora.add('/vendor/antiga.min.js'); // 08/11: PR publicada (uma biblioteca saiu)
  m.pedidos.length = 0;
  await m.abrir(); // abre com internet e não gera PDF nem Excel
  for (const a of ['/vendor/jspdf.umd.min.js', '/vendor/exceljs.min.js', '/modelos/fatura-modelo.xlsx']) {
    assert.ok(m.pedidos.some((p) => p.startsWith(`GET ${a}?v=`) && p.endsWith('(reload)')), `baixou de novo ${a}`);
  }
  assert.ok(!m.pedidos.some((p) => p.startsWith('GET /js/app.js?v=')), 'o que a página já pediu nesta abertura não é baixado de novo');
  assert.ok(!m.guardados().includes('/vendor/antiga.min.js'), 'o que saiu do site sai da cópia');
  m.site.internet = false; // depois, sem internet (ou site fora do ar)
  await m.abrir();
  assert.match(await m.pedir('vendor/jspdf.umd.min.js'), /jspdf.+08 Nov 2026/);
  assert.match(await m.pedir('modelos/fatura-modelo.xlsx'), /fatura-modelo.+08 Nov 2026/);
  // com internet de novo: tudo da cópia, nada baixado outra vez
  m.site.internet = true; m.pedidos.length = 0;
  await m.abrir();
  assert.match(await m.pedir('vendor/exceljs.min.js'), /08 Nov 2026/);
  assert.deepEqual(m.pedidos.sort(), ['GET /', 'HEAD /index.html (no-cache)']);
});

test('versão nova e a internet cai logo depois de abrir: a biblioteca antiga fica até a nova chegar', async () => {
  const m = mundo();
  await m.abrir();
  await m.pedir('vendor/exceljs.min.js'); await m.terminarFundo();
  m.site.publicada = B; m.site.semInternetNoFundo = true;
  await m.abrir();
  m.site.internet = false;
  await m.abrir();
  assert.match(await m.pedir('vendor/exceljs.min.js'), /07 Nov 2026/, 'sem internet: a da versão anterior, em vez de falhar');
  // internet de volta: na abertura seguinte (mesma versão) baixa o que faltou; usada antes disso, vai ao site primeiro
  m.site.internet = true; m.site.semInternetNoFundo = false; m.pedidos.length = 0;
  await m.pedir('', 'navigate');
  assert.match(await m.pedir('vendor/exceljs.min.js'), /08 Nov 2026/);
  await m.terminarFundo();
  m.site.internet = false;
  assert.match(await m.pedir('vendor/exceljs.min.js'), /08 Nov 2026/, 'e fica guardada a nova');
});

test('logo depois de publicar, arquivo velho de um cache no caminho não fica guardado como se fosse da versão nova', async () => {
  const m = mundo();
  await m.abrir();
  m.site.publicada = C; // merge às 14h: o index.html já vem novo…
  m.site.noCaminho.set('/js/regras.js', A); // …mas o cache do Cloudflare ainda tem o regras.js velho
  m.pedidos.length = 0;
  const textos = await m.abrir();
  assert.match(textos[1], /regras.+09 Nov 2026/, 'a página recebe o novo');
  assert.ok(m.pedidos.some((p) => /^GET \/js\/regras\.js\?v=.+\(reload\)$/.test(p)), 'buscou de novo por outro endereço, sem cache');
  m.pedidos.length = 0;
  const depois = await m.abrir(); // o cache do caminho continua velho
  assert.match(depois[1], /09 Nov 2026/, 'a cópia guardada é a nova');
  assert.equal(m.pedidos.filter((p) => p.includes('js/')).length, 0);
});

test('nem passando por cima dos caches veio o novo: guarda o que veio (para sem internet) e busca de novo na próxima abertura', async () => {
  const m = mundo();
  await m.abrir();
  m.site.publicada = C;
  m.site.naOrigem.set('/js/regras.js', A); // até o site ainda responde o velho
  await m.abrir();
  m.site.internet = false;
  assert.match(await m.pedir('js/regras.js'), /07 Nov 2026/, 'sem internet, abre com o que veio');
  m.site.internet = true; m.site.naOrigem.clear(); m.pedidos.length = 0;
  const textos = await m.abrir();
  assert.match(textos[1], /09 Nov 2026/);
  assert.ok(m.pedidos.includes('GET /js/regras.js (no-cache)'), 'foi ao site primeiro');
  m.pedidos.length = 0;
  await m.abrir();
  assert.equal(m.pedidos.filter((p) => p.includes('js/')).length, 0, 'depois volta a usar a cópia');
  // e se o site nunca responder com a data da versão, desiste depois de algumas tentativas (não baixa a cada abertura)
  m.site.publicada = 'Tue, 10 Nov 2026 09:00:00 GMT'; m.site.naOrigem.set('/js/regras.js', A);
  for (let i = 0; i < 4; i += 1) await m.abrir();
  m.pedidos.length = 0;
  await m.abrir();
  assert.equal(m.pedidos.filter((p) => p.includes('regras')).length, 0);
});

/** carregarScript de docs/js/app.js (que não roda no Node) com uma página falsa: cada <script> pedido carrega ou falha. */
function paginaComScripts(resultados) {
  const fonte = fs.readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');
  const trecho = fonte.slice(fonte.indexOf('const scripts = {};'), fonte.indexOf('// Componentes de terceiros'));
  assert.ok(trecho.includes('function carregarScript'), 'achou carregarScript em app.js');
  const window = {}; const pedidos = [];
  const document = {
    createElement: () => ({ remove() { this.removido = true; } }),
    head: { appendChild(s) { pedidos.push(s); setTimeout(() => { if (resultados.shift()) { window.Biblioteca = { ok: true }; s.onload(); } else s.onerror(); }, 0); } },
  };
  const ctx = { window, document };
  vm.runInNewContext(`${trecho.replace('export function', 'function')}\nthis.carregarScript = carregarScript;`, ctx);
  return { carregar: () => ctx.carregarScript('vendor/biblioteca.min.js', 'Biblioteca'), pedidos };
}

test('carregarScript: se a biblioteca não carregou (sem internet), tenta de novo no próximo uso, sem precisar recarregar a página', async () => {
  const p = paginaComScripts([false, true]);
  await assert.rejects(p.carregar(), /Não consegui carregar/);
  assert.deepEqual(await p.carregar(), { ok: true }, 'a segunda vez carrega');
  assert.equal(p.pedidos.length, 2);
  assert.ok(p.pedidos[0].removido, 'o <script> que falhou sai da página');
  assert.deepEqual(await p.carregar(), { ok: true });
  assert.equal(p.pedidos.length, 2, 'carregada, não pede de novo');
});
