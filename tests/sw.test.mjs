// Aplicativo instalável (docs/sw.js): uma conferência por abertura (data de publicação do index.html); mesma versão → arquivos
// da cópia sem ir ao site; versão nova → chega numa cópia à parte e só troca a em uso quando está inteira (queda de internet no
// meio: abre a versão anterior completa); arquivo velho de um cache no caminho não fica guardado como novo; sem internet → cópia;
// localhost → confere arquivo a arquivo.
// Também carregarScript (docs/js/app.js), que carrega essas bibliotecas na página.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const CODIGO = fs.readFileSync(new URL('../docs/sw.js', import.meta.url), 'utf8');
/** O sw.js com outra VERSAO_VENDOR (as bibliotecas de docs/vendor foram trocadas naquela publicação). */
const comVendor = (v) => { const [antes, resto] = CODIGO.split("const VERSAO_VENDOR = '"); return `${antes}const VERSAO_VENDOR = '${v}${resto.slice(resto.indexOf("'"))}`; };
const VERSAO_VENDOR_NO_SW = CODIGO.split("const VERSAO_VENDOR = '")[1].split("'")[0];
const VENDOR_CONFERIDO = '2026-11-13 86b72bfa5974b8e7'; // "VERSAO_VENDOR resumo de docs/vendor": os dois mudam juntos
const A = 'Sat, 07 Nov 2026 12:41:50 GMT'; const B = 'Sun, 08 Nov 2026 10:00:00 GMT'; const C = 'Mon, 09 Nov 2026 14:00:00 GMT';

/**
 * Sobe o sw.js num mundo falso: `caches`, `fetch` e os eventos, com o site respondendo `publicada` como data (Last-Modified)
 * e o caminho como conteúdo. `noCaminho` (endereço exato → data): cópia velha num cache do caminho (Cloudflare), que outro
 * endereço (?v=…) não pega; `naOrigem` (caminho → data): velho até no site; `fora`: caminhos que saíram do site (404);
 * `semInternetNoFundo`: a internet cai logo depois da abertura (o que é baixado em segundo plano, ?v=…, falha).
 */
function mundo({ hostname = 'erp.exemplo.com.br', publicada = A, armazem = new Map(), codigo = CODIGO } = {}) {
  const origem = `https://${hostname}`;
  // armazem: nome do cache → Map(url → Response); passado de um mundo a outro = o mesmo aparelho com outro service worker (`codigo`)
  const pedidos = []; // o que foi ao site
  const fundo = []; // o que o service worker deixou rodando em segundo plano (ev.waitUntil)
  // erro: o site responde com página de erro (ex.: 502 do Cloudflare)
  // lento: o site não responde (sinal fraco) até `site.soltar()`; os prazos do service worker vencem antes
  // caiu: caminhos que não respondem mais (a internet caiu no meio da abertura, depois da conferência)
  // arquivos: caminho → conteúdo de verdade (ex.: o index.html e os módulos de docs/), para a instalação ler os import
  // fixo: o conteúdo de cada arquivo não muda de uma publicação a outra (só o que estiver em `arquivos`), como no site de verdade
  // lista: o site publica resumos.json (tools/publicar-site.mjs) com o resumo de cada arquivo conhecido
  const site = { publicada, internet: true, erro: 0, noCaminho: new Map(), naOrigem: new Map(), fora: new Set(), caiu: new Set(), semInternetNoFundo: false, lento: false, soltar: () => {}, arquivos: new Map(), fixo: false, lista: false };
  const conteudo = (caminho, data) => (site.arquivos.has(caminho) ? site.arquivos.get(caminho) : site.fixo ? `conteudo de ${caminho}` : `conteudo de ${caminho} @ ${data}`);
  /** resumos.json da publicação: todo arquivo que o aparelho guardou ou que o site tem em `arquivos`, com o conteúdo de agora. */
  const listaDeResumos = (data) => {
    const caminhos = new Set([...site.arquivos.keys()]);
    for (const m of armazem.values()) for (const u of m.keys()) caminhos.add(new URL(u).pathname);
    const arquivos = {};
    for (const c of caminhos) if (c !== '/' && c !== '/resumos.json' && !c.startsWith('/__') && !site.fora.has(c)) arquivos[c.slice(1)] = createHash('sha256').update(conteudo(c, data)).digest('hex');
    return JSON.stringify({ formato: 1, arquivos });
  };
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
    if (!site.internet || site.caiu.has(url.pathname) || (site.semInternetNoFundo && url.searchParams.has('v'))) throw new TypeError('Failed to fetch');
    const data = site.noCaminho.get(url.pathname + url.search) || site.naOrigem.get(url.pathname) || site.publicada;
    const r = site.erro ? new Response('Bad gateway', { status: site.erro })
      : site.fora.has(url.pathname) ? new Response('Not found', { status: 404 })
        : url.pathname === '/resumos.json' && !site.lista && !site.arquivos.has(url.pathname) ? new Response('Not found', { status: 404 }) // publicação pela branch: sem a lista
          : new Response(url.pathname === '/resumos.json' && !site.arquivos.has(url.pathname) ? listaDeResumos(data) : conteudo(url.pathname, data), { status: 200, headers: { 'last-modified': data } });
    Object.defineProperty(r, 'type', { value: 'basic' });
    Object.defineProperty(r, 'url', { value: url.href });
    return r;
  };
  // o segundo plano espera ESPERA_SEGUNDO_PLANO; aqui, o próximo instante (depois dos pedidos da abertura)
  const ctx = { self, caches, fetch, Request, Response, Headers, URL, crypto: globalThis.crypto, console, setTimeout: (fn) => setTimeout(fn, 0), clearTimeout };
  vm.runInNewContext(codigo, ctx, { filename: 'sw.js' });
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
  /** A instalação do service worker (1ª visita: a página abriu sem ele). */
  const instalar = async () => {
    let p = Promise.resolve();
    ouvintes.install({ waitUntil: (x) => { p = x; } });
    await p;
  };
  return { site, pedidos, abrir, pedir, armazem, terminarFundo, guardados, instalar };
}

test('primeira abertura baixa tudo; a seguinte, na mesma versão, faz uma conferência só e usa a cópia', async () => {
  const m = mundo();
  await m.abrir();
  assert.ok(m.pedidos.includes('GET / (no-cache)'), 'a página vem do site, sem a cópia de 10 min do navegador');
  assert.ok(!m.pedidos.some((p) => p.startsWith('HEAD')), 'a data de publicação vem da própria página, sem um pedido à parte');
  assert.ok(m.pedidos.includes('GET /js/app.js (no-cache)'));
  m.pedidos.length = 0;
  const textos = await m.abrir();
  assert.deepEqual(m.pedidos, ['GET / (no-cache)'], 'só a página foi ao site');
  assert.match(textos[0], /js\/app\.js/);
});

test('partes carregadas só quando usadas (planilha, regras em texto, visualizador, passagem) ficam guardadas desde a 1ª abertura', async () => {
  const m = mundo();
  await m.abrir(); // abre com internet e não usa nenhuma delas
  for (const a of ['/js/exportar.js', '/js/regras-texto.js', '/js/visualizador.js', '/js/migracao.js']) {
    assert.ok(m.guardados().includes(a), `guardou ${a}`);
  }
  // bibliotecas de PDF e ZIP: aparelho recém-instalado gera PDF e ZIP sem internet; planilha e visualizador de PDF só depois do 1º uso
  for (const a of ['/vendor/jspdf.umd.min.js', '/vendor/html2canvas.min.js', '/vendor/jszip.min.js']) {
    assert.ok(m.guardados().includes(a), `guardou ${a}`);
    assert.ok(fs.existsSync(new URL(`../docs${a}`, import.meta.url)), `${a} existe em docs/vendor`);
  }
  // o pdf.js também (compactar o PDF escaneado e o visualizador do celular sem internet); a planilha só depois do 1º uso
  for (const a of ['/vendor/pdf.min.js', '/vendor/pdf.worker.min.js']) assert.ok(m.guardados().includes(a), `guardou ${a}`);
  assert.ok(!m.guardados().includes('/vendor/exceljs.min.js'), 'a planilha fica para o 1º uso');
  // o manifest e os ícones do aplicativo (o navegador pede por fora dos módulos)
  for (const a of ['/manifest.webmanifest', '/icones/erp-192.png', '/icones/aviso-96.png']) assert.ok(m.guardados().includes(a), `guardou ${a}`);
  m.site.internet = false;
  await m.abrir();
  assert.match(await m.pedir('js/exportar.js'), /exportar\.js/, 'sem internet, a planilha de tudo ainda carrega');
  assert.match(await m.pedir('vendor/jspdf.umd.min.js'), /jspdf/, 'e o PDF também');
  // em localhost também (lá cada arquivo é conferido quando a página pede, mas o teste sem internet tem de mostrar a falta de um)
  const local = mundo({ hostname: 'localhost' });
  await local.abrir();
  for (const a of ['/js/exportar.js', '/vendor/jspdf.umd.min.js', '/manifest.webmanifest']) assert.ok(local.guardados().includes(a), `localhost guardou ${a}`);
  local.site.internet = false;
  assert.match(await local.pedir('js/migracao.js'), /migracao\.js/);
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

test('versão nova e a internet cai no meio da atualização: o aplicativo abre com a versão anterior inteira, sem mistura; depois completa e troca', async () => {
  const m = mundo();
  await m.abrir(); // versão A guardada
  m.site.publicada = B;
  m.site.caiu.add('/js/regras.js'); m.site.semInternetNoFundo = true; // a conferência e o app.js passam; depois a internet cai
  const naQueda = await m.abrir();
  assert.match(naQueda[0], /app\.js @ Sun, 08/, 'o que chegou do site é o novo');
  assert.match(naQueda[1], /regras\.js @ Sat, 07/, 'o que não chegou abre o anterior, em vez de o aplicativo não abrir');
  // a cópia em uso continua sendo a versão A inteira (nada foi apagado nem trocado por arquivo da B)
  const emUso = m.armazem.get('imoveis-telas-v3');
  for (const a of ['js/app.js', 'js/regras.js', 'css/estilo.css', 'js/exportar.js']) {
    assert.match(await emUso.get(`https://erp.exemplo.com.br/${a}`).clone().text(), /@ Sat, 07/, `${a} da versão anterior continua guardado`);
  }
  assert.equal(await emUso.get('https://erp.exemplo.com.br/__versao-publicada').clone().text(), A);
  // sem internet nenhuma: abre tudo da versão A (página e arquivos), nada da B misturado
  m.site.internet = false;
  assert.match(await m.pedir('', 'navigate'), /conteudo de \/ @ Sat, 07/);
  for (const t of await m.abrir()) assert.match(t, /@ Sat, 07/);
  assert.match(await m.pedir('js/exportar.js'), /@ Sat, 07/);
  // a internet volta: a página recebe a B, o que já tinha chegado não é baixado de novo, e o resto completa em segundo plano
  m.site.internet = true; m.site.caiu.clear(); m.site.semInternetNoFundo = false; m.pedidos.length = 0;
  for (const t of await m.abrir()) assert.match(t, /@ Sun, 08/);
  assert.ok(!m.pedidos.some((p) => p.startsWith('GET /js/app.js')), 'o app.js da B já estava guardado');
  assert.ok(!m.armazem.has('imoveis-telas-nova'), 'a versão nova chegou inteira e virou a cópia em uso');
  assert.equal(await emUso.get('https://erp.exemplo.com.br/__versao-publicada').clone().text(), B);
  // daí em diante, sem internet, é a B inteira
  m.site.internet = false;
  for (const t of await m.abrir()) assert.match(t, /@ Sun, 08/);
  assert.match(await m.pedir('js/exportar.js'), /@ Sun, 08/);
  assert.match(await m.pedir('', 'navigate'), /conteudo de \/ @ Sun, 08/);
});

test('versão nova pela metade e sai outra: recomeça com a mais nova; arquivo que saiu do site sai da cópia só na troca', async () => {
  const m = mundo();
  await m.abrir();
  await m.pedir('js/antigo.js'); await m.terminarFundo(); // parte que a versão A tinha
  m.site.publicada = B; m.site.semInternetNoFundo = true;
  await m.abrir(); // a B chega pela metade
  m.site.publicada = C; m.site.semInternetNoFundo = false; m.site.fora.add('/js/antigo.js');
  for (const t of await m.abrir()) assert.match(t, /@ Mon, 09/);
  assert.ok(!m.armazem.has('imoveis-telas-nova'));
  assert.ok(!m.guardados().includes('/js/antigo.js'), 'o que saiu do site saiu da cópia');
  m.site.internet = false;
  for (const t of await m.abrir()) assert.match(t, /@ Mon, 09/, 'nada da B ficou');
  assert.match(await m.pedir('js/migracao.js'), /@ Mon, 09/);
});

test('o aparelho para no meio da troca pela versão nova: a abertura seguinte termina, mesmo sem internet', async () => {
  const m = mundo();
  await m.abrir();
  m.site.publicada = B; m.site.semInternetNoFundo = true;
  await m.abrir(); // a B chega pela metade (falta o que vem em segundo plano)
  // como se tudo tivesse chegado e o aparelho parasse antes de trocar: NOVA completa (lista vazia), cópia em uso ainda na A
  const nova = m.armazem.get('imoveis-telas-nova'); const emUso = m.armazem.get('imoveis-telas-v3');
  for (const u of Object.keys(JSON.parse(await nova.get('https://erp.exemplo.com.br/__para-baixar').clone().text()))) {
    nova.set(u, new Response(`conteudo de ${new URL(u).pathname} @ ${B}`, { headers: { 'last-modified': B } }));
  }
  nova.set('https://erp.exemplo.com.br/__para-baixar', new Response('{}'));
  const outro = mundo({ armazem: m.armazem, publicada: B }); // o service worker sobe de novo
  outro.site.internet = false;
  for (const t of await outro.abrir()) assert.match(t, /@ Sun, 08/);
  assert.match(await outro.pedir('js/exportar.js'), /@ Sun, 08/);
  assert.ok(!outro.armazem.has('imoveis-telas-nova'));
  assert.equal(await emUso.get('https://erp.exemplo.com.br/__versao-publicada').clone().text(), B);
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
  // o site responde depois: a página nova NÃO entra na cópia da versão A (seria a página de uma versão com os módulos de outra)
  m.site.lento = false;
  m.site.soltar();
  await m.terminarFundo();
  const emUso = m.armazem.get('imoveis-telas-v3');
  assert.match(await (await emUso.get('https://erp.exemplo.com.br/')).clone().text(), /@ Sat, 07/);
  assert.equal(await emUso.get('https://erp.exemplo.com.br/__versao-publicada').clone().text(), A);
  // na abertura seguinte, com sinal bom, chega a versão B inteira
  for (const t of await m.abrir()) assert.match(t, /@ Sun, 08/);
  assert.match(await (await emUso.get('https://erp.exemplo.com.br/')).clone().text(), /@ Sun, 08/);
  assert.equal(await emUso.get('https://erp.exemplo.com.br/__versao-publicada').clone().text(), B);
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

test('versão nova com as mesmas bibliotecas: os modelos voltam em segundo plano e as bibliotecas (vendor/) não são baixadas de novo; sem internet depois, PDF e Excel funcionam', async () => {
  const m = mundo();
  await m.abrir();
  for (const a of ['vendor/jspdf.umd.min.js', 'vendor/exceljs.min.js', 'modelos/fatura-modelo.xlsx', 'vendor/antiga.min.js']) await m.pedir(a); // usados na versão A
  await m.terminarFundo();
  m.site.publicada = B; m.site.fora.add('/vendor/antiga.min.js'); // 08/11: PR publicada (uma biblioteca saiu)
  m.pedidos.length = 0;
  await m.abrir(); // abre com internet e não gera PDF nem Excel
  assert.ok(m.pedidos.some((p) => p.startsWith('GET /modelos/fatura-modelo.xlsx?v=') && p.endsWith('(reload)')), 'baixou de novo o modelo');
  assert.ok(!m.pedidos.some((p) => p.includes('/vendor/')), 'as bibliotecas não mudaram (VERSAO_VENDOR): nada delas foi ao site');
  assert.ok(!m.pedidos.some((p) => p.startsWith('GET /js/app.js?v=')), 'o que a página já pediu nesta abertura não é baixado de novo');
  m.site.internet = false; // depois, sem internet (ou site fora do ar)
  await m.abrir();
  assert.match(await m.pedir('vendor/jspdf.umd.min.js'), /jspdf.+07 Nov 2026/, 'a biblioteca guardada continua servindo');
  assert.match(await m.pedir('modelos/fatura-modelo.xlsx'), /fatura-modelo.+08 Nov 2026/);
  // com internet de novo: tudo da cópia, nada baixado outra vez
  m.site.internet = true; m.pedidos.length = 0;
  await m.abrir();
  assert.match(await m.pedir('vendor/exceljs.min.js'), /07 Nov 2026/);
  assert.deepEqual(m.pedidos, ['GET / (no-cache)']);
});

test('bibliotecas trocadas (VERSAO_VENDOR mudou): voltam em segundo plano, a que saiu do site sai da cópia, e isso vale mesmo se a versão do site já estava conferida', async () => {
  const m = mundo();
  await m.abrir();
  for (const a of ['vendor/jspdf.umd.min.js', 'vendor/exceljs.min.js', 'vendor/antiga.min.js']) await m.pedir(a); // usadas na versão A
  await m.terminarFundo();
  // publicação B troca as bibliotecas: o service worker novo chega com outra VERSAO_VENDOR
  const m2 = mundo({ armazem: m.armazem, publicada: B, codigo: comVendor('2099-01-01') });
  m2.site.fora.add('/vendor/antiga.min.js');
  await m2.abrir();
  for (const a of ['/vendor/jspdf.umd.min.js', '/vendor/exceljs.min.js']) assert.ok(m2.pedidos.some((p) => p.startsWith(`GET ${a}?v=`) && p.endsWith('(reload)')), `baixou de novo ${a}`);
  assert.ok(!m2.guardados().includes('/vendor/antiga.min.js'), 'o que saiu do site sai da cópia');
  m2.site.internet = false;
  await m2.abrir();
  assert.match(await m2.pedir('vendor/jspdf.umd.min.js'), /jspdf.+08 Nov 2026/);
  // outro aparelho: o service worker antigo já tinha conferido a versão B; o novo (outras bibliotecas) assume depois, sem publicação nova
  const n = mundo();
  await n.abrir();
  await n.pedir('vendor/exceljs.min.js'); await n.terminarFundo();
  n.site.publicada = B; n.pedidos.length = 0;
  await n.abrir(); // versão B conferida pelo service worker antigo: as bibliotecas ficaram como estavam
  assert.ok(!n.pedidos.some((p) => p.includes('/vendor/')));
  const n2 = mundo({ armazem: n.armazem, publicada: B, codigo: comVendor('2099-01-01') });
  await n2.abrir();
  assert.ok(n2.pedidos.some((p) => p.startsWith('GET /vendor/exceljs.min.js?v=')), 'mesma versão do site, bibliotecas novas: baixou de novo');
  n2.site.internet = false;
  assert.match(await n2.pedir('vendor/exceljs.min.js'), /08 Nov 2026/);
});

test('VERSAO_VENDOR (sw.js) acompanha docs/vendor: mudou uma biblioteca, troque a data lá e o resumo aqui', () => {
  const dir = new URL('../docs/vendor/', import.meta.url);
  const h = createHash('sha256');
  // fim de linha igual no Windows e no GitHub (o git troca LF por CRLF na pasta de trabalho)
  for (const f of fs.readdirSync(dir).sort()) { h.update(f); h.update(fs.readFileSync(new URL(f, dir), 'latin1').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10)), 'latin1'); }
  assert.equal(`${VERSAO_VENDOR_NO_SW} ${h.digest('hex').slice(0, 16)}`, VENDOR_CONFERIDO,
    'docs/vendor mudou: troque VERSAO_VENDOR em docs/sw.js (senão os aparelhos não baixam a biblioteca nova) e atualize VENDOR_CONFERIDO neste teste');
});

test('bibliotecas trocadas e a internet cai logo depois de abrir: a biblioteca antiga fica até a nova chegar', async () => {
  const antes = mundo();
  await antes.abrir();
  await antes.pedir('vendor/exceljs.min.js'); await antes.terminarFundo();
  const m = mundo({ armazem: antes.armazem, publicada: B, codigo: comVendor('2099-01-01') });
  m.site.semInternetNoFundo = true;
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

/** Os arquivos de verdade de docs/ (index.html e módulos), para a instalação ler os import como no site. */
function comArquivosDeVerdade(m) {
  const raiz = new URL('../docs/', import.meta.url);
  m.site.arquivos.set('/', fs.readFileSync(new URL('index.html', raiz), 'utf8'));
  const andar = (dir, prefixo) => {
    for (const e of fs.readdirSync(new URL(dir, raiz), { withFileTypes: true })) {
      if (e.isDirectory()) andar(`${dir}${e.name}/`, `${prefixo}${e.name}/`);
      else if (e.name.endsWith('.js')) m.site.arquivos.set(`/${prefixo}${e.name}`, fs.readFileSync(new URL(`${dir}${e.name}`, raiz), 'utf8'));
    }
  };
  andar('js/', 'js/');
  return m;
}

test('1ª visita (a página abriu antes do service worker) e sem internet logo depois: o aplicativo abre da cópia', async () => {
  const m = comArquivosDeVerdade(mundo());
  await m.instalar(); // a instalação guarda a página e os módulos que ela usa
  const guardados = new Set(m.guardados());
  // todo módulo de docs/js vai para a cópia, menos os carregados só com import() (que estão em ADIADOS) e os de fora do sistema
  const fora = ['/js/simulado-banco.js', '/js/ficha-online.js'];
  const faltam = [...m.site.arquivos.keys()].filter((k) => k.startsWith('/js/') && !guardados.has(k) && !fora.includes(k));
  assert.deepEqual(faltam, [], 'módulo novo carregado só com import()? Ponha-o em ADIADOS (docs/sw.js)');
  for (const a of ['/', '/css/estilo.css', '/manifest.webmanifest', '/icones/erp-192.png', '/js/telas/acoes.js', '/js/exportar.js', '/vendor/jspdf.umd.min.js']) {
    assert.ok(guardados.has(a), `guardou ${a}`);
  }
  assert.equal(await m.armazem.get('imoveis-telas-v3').get('https://erp.exemplo.com.br/__versao-publicada').clone().text(), A, 'marca da versão da página');
  m.site.internet = false;
  assert.match(await m.pedir('', 'navigate'), /<script type="module" src="js\/app\.js">/, 'a página abre sem internet');
  assert.match(await m.pedir('js/app.js'), /export function alterar/);
  assert.match(await m.pedir('js/telas/acoes.js'), /ACOES/);
  // com internet de novo, mesma versão: nada é baixado outra vez
  m.site.internet = true; m.pedidos.length = 0;
  await m.abrir();
  assert.deepEqual(m.pedidos, ['GET / (no-cache)']);
  // service worker novo num aparelho que já tem cópia: a instalação não baixa nada
  const outro = mundo({ armazem: m.armazem });
  await outro.instalar();
  assert.deepEqual(outro.pedidos, []);
});

test('página velha de um cache no caminho, mais velha que a versão guardada: abre a guardada e não baixa tudo de novo', async () => {
  const m = mundo();
  await m.abrir();
  m.site.publicada = B;
  await m.abrir(); // versão B guardada
  m.site.noCaminho.set('/', A); // o cache do caminho ainda tem a página da A
  m.pedidos.length = 0;
  assert.match(await m.pedir('', 'navigate'), /conteudo de \/ @ Sun, 08/, 'a página da versão em uso (B)');
  for (const t of await Promise.all(['js/app.js', 'js/regras.js'].map((a) => m.pedir(a)))) assert.match(t, /@ Sun, 08/);
  await m.terminarFundo();
  assert.deepEqual(m.pedidos, ['GET / (no-cache)'], 'nada baixado de novo');
  const emUso = m.armazem.get('imoveis-telas-v3');
  assert.equal(await emUso.get('https://erp.exemplo.com.br/__versao-publicada').clone().text(), B);
  assert.match(await (await emUso.get('https://erp.exemplo.com.br/')).clone().text(), /@ Sun, 08/);
});

// Lista de resumos (resumos.json, tools/publicar-site.mjs): na versão nova, só os arquivos de conteúdo diferente vão ao site
const NAO_PAGINA = (p) => !p.startsWith('GET / ');
const marcaDe = async (m, nome = 'imoveis-telas-v3') => m.armazem.get(nome)?.get('https://erp.exemplo.com.br/__versao-publicada')?.clone().text();

test('lista de resumos publicada: versão nova com 1 arquivo mudado baixa só ele; o resto passa da cópia; sem internet abre a nova', async () => {
  const m = mundo();
  m.site.fixo = true; m.site.lista = true;
  await m.abrir(); // versão A guardada (com ADIADOS, EXTRAS e bibliotecas em segundo plano)
  const guardadosA = m.guardados().length;
  assert.ok(guardadosA > 15, 'a cópia tem a página, os módulos, ADIADOS e EXTRAS');
  m.site.publicada = B; m.site.arquivos.set('/js/regras.js', 'regras da versão B');
  m.pedidos.length = 0;
  const textos = await m.abrir();
  assert.deepEqual(m.pedidos.filter(NAO_PAGINA), [`GET /resumos.json?v=${encodeURIComponent(B).replace(/%20/g, '+')} (reload)`, 'GET /js/regras.js (no-cache)'],
    'foram ao site só a lista e o arquivo que mudou');
  assert.equal(textos[1], 'regras da versão B');
  assert.equal(textos[0], 'conteudo de /js/app.js', 'o que não mudou veio da cópia');
  assert.equal(await marcaDe(m), B, 'a versão nova já está em uso');
  assert.ok(!m.armazem.has('imoveis-telas-nova'), 'sem sobra da cópia à parte');
  assert.equal(m.guardados().length, guardadosA, 'nada saiu da cópia');
  // a cópia em uso é a da versão B: a abertura seguinte não vai ao site, e sem internet abre a nova
  m.pedidos.length = 0;
  await m.abrir();
  assert.deepEqual(m.pedidos, ['GET / (no-cache)']);
  m.site.internet = false;
  const semInternet = await m.abrir();
  assert.equal(semInternet[1], 'regras da versão B');
  assert.equal(await m.pedir('js/exportar.js'), 'conteudo de /js/exportar.js', 'as partes adiadas continuam guardadas');
});

test('lista de resumos e nada mudou (só a data): a versão nova entra em uso sem baixar nenhum arquivo', async () => {
  const m = mundo();
  m.site.fixo = true; m.site.lista = true;
  await m.abrir();
  m.site.publicada = B; m.pedidos.length = 0;
  await m.abrir();
  assert.deepEqual(m.pedidos.filter(NAO_PAGINA).map((p) => p.split('?')[0]), ['GET /resumos.json']);
  assert.equal(await marcaDe(m), B);
  // a próxima publicação também usa a cópia (os arquivos que passaram levam a data da versão em que entraram)
  m.site.publicada = C; m.site.arquivos.set('/css/estilo.css', 'estilo da C'); m.pedidos.length = 0;
  const textos = await m.abrir();
  assert.deepEqual(m.pedidos.filter(NAO_PAGINA).map((p) => p.split('?')[0]), ['GET /resumos.json', 'GET /css/estilo.css (no-cache)']);
  assert.equal(textos[2], 'estilo da C');
});

test('sem a lista (publicação pela branch, 404), com a lista de outra versão ou ilegível: baixa tudo de novo, como antes', async () => {
  for (const caso of ['sem lista', 'lista velha', 'ilegível']) {
    const m = mundo();
    m.site.fixo = true; m.site.lista = caso !== 'sem lista';
    await m.abrir();
    m.site.publicada = B; m.pedidos.length = 0;
    if (caso === 'lista velha') m.site.noCaminho.set(`/resumos.json?v=${encodeURIComponent(B).replace(/%20/g, '+')}`, A);
    if (caso === 'ilegível') m.site.arquivos.set('/resumos.json', '{ isto não é a lista');
    await m.abrir();
    assert.ok(m.pedidos.includes('GET /js/app.js (no-cache)'), `${caso}: a página buscou o app.js no site`);
    assert.ok(m.pedidos.some((p) => p.startsWith('GET /js/exportar.js?v=')), `${caso}: o resto voltou em segundo plano`);
    assert.equal(await marcaDe(m), B, `${caso}: a versão nova entrou em uso`);
  }
});

test('lista de resumos e a internet cai no meio: abre a versão anterior inteira; depois completa só com o que mudou', async () => {
  const m = mundo();
  m.site.fixo = true; m.site.lista = true;
  await m.abrir();
  m.site.publicada = B; m.site.arquivos.set('/js/regras.js', 'regras da versão B');
  m.site.caiu.add('/js/regras.js'); // a lista chega; o arquivo que mudou não
  await m.abrir();
  assert.equal(await marcaDe(m), A, 'a versão A continua em uso, inteira');
  m.site.internet = false;
  const semInternet = await m.abrir();
  assert.equal(semInternet[1], 'conteudo de /js/regras.js', 'sem internet: a regras.js da A, sem mistura');
  m.site.internet = true; m.site.caiu.clear(); m.pedidos.length = 0;
  const textos = await m.abrir();
  assert.equal(textos[1], 'regras da versão B');
  assert.ok(!m.pedidos.some((p) => p.includes('/js/app.js')), 'o que não mudou não foi ao site');
  assert.equal(await marcaDe(m), B);
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
