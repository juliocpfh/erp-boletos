// Aplicativo instalável: guarda as telas do sistema no aparelho para abrir sem internet. Nunca guarda dados (/api/) nem outros sites.
// Ao abrir a página, confere UMA vez com o site se há versão nova (a data de publicação do index.html: no GitHub Pages todos os
// arquivos publicados juntos levam a mesma data). Mesma versão: os arquivos vêm da cópia do aparelho, sem ir ao site
// (antes eram ~45 conferências por abertura, uma por arquivo). Versão nova: a cópia é refeita com os arquivos baixados de novo;
// o que a página só pede quando usa (bibliotecas de PDF/Excel/ZIP em vendor/, modelos/) é baixado de novo em segundo plano, e o
// antigo fica até o novo chegar (sem internet logo depois da atualização, "Baixar PDF" continua funcionando).
// Arquivo que chega com data mais velha que a da versão (cópia velha num cache no caminho, logo depois de publicar) é buscado de
// novo passando por cima dos caches (?v=<data>), para não ficar guardado como se fosse da versão nova.
// Sem internet: usa a cópia. Em localhost (desenvolvimento) confere arquivo a arquivo, porque lá a data do index.html não muda.
const CACHE = 'imoveis-telas-v3';
const MARCA = './__versao-publicada'; // entrada do cache com a data de publicação da cópia guardada
const PENDENTES = './__para-baixar'; // entrada do cache com os arquivos ainda por baixar na versão guardada (lista em JSON)
const SEMPRE_CONFERIR = ['localhost', '127.0.0.1'].includes(self.location.hostname);
const MANTER_ATE_O_NOVO = /\/(vendor|modelos)\//; // só são pedidos quando usados: o antigo serve sem internet até o novo chegar
const FOLGA_DATA = 60 * 1000; // o GitHub grava os arquivos de uma publicação um a um: a data de cada um varia alguns segundos
const ESPERA_SEGUNDO_PLANO = 3000; // ms: o que fica em segundo plano começa depois da abertura, sem disputar a internet com ela
const MAX_TENTATIVAS = 3; // arquivo que nem passando por cima dos caches vem com a data da versão: aceito como veio depois disso
// Partes do programa que a página só carrega quando usadas (import() em telas/acoes.js e telas/nuvem.js): ficam guardadas
// desde a primeira abertura com internet, para funcionarem sem internet mesmo sem terem sido usadas antes
const ADIADOS = ['js/exportar.js', 'js/regras-texto.js', 'js/visualizador.js', 'js/migracao.js'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

/** Data de publicação do site agora (cabeçalho Last-Modified do index.html), ou null sem internet / sem resposta normal. */
async function versaoPublicada() {
  try {
    const r = await fetch('index.html', { method: 'HEAD', cache: 'no-cache', credentials: 'same-origin' });
    if (!r.ok || r.redirected || r.type !== 'basic') return null; // login do Cloudflare ou erro: não dá para saber
    return r.headers.get('last-modified') || null;
  } catch { return null; }
}

let conferencia = null; // a conferência da abertura em curso; os arquivos da página esperam por ela
let marca = null; // data de publicação da versão guardada (null: sem conferência, como em localhost)
let comInternet = false; // a conferência falou com o site (dá para baixar em segundo plano)
let pendentes = new Map(); // endereço ainda por baixar nesta versão → vezes que veio sem ser da versão (guardado em PENDENTES)
let gravandoPendentes = Promise.resolve();
let baixando = false;

const PAGINA = new URL('./', self.location.href).href;
const INTERNOS = [MARCA, PENDENTES].map((k) => new URL(k, self.location.href).href);
const normal = (r) => !!r && r.ok && r.type === 'basic' && !r.redirected; // não o login do Cloudflare (redirecionamento) nem erro
const esperar = (ms) => new Promise((ok) => { setTimeout(ok, ms); });

/** A resposta é da versão guardada? Mesma data de publicação (com a folga) ou mais nova; sem marca, não há como conferir. */
function daVersao(r) {
  if (!marca) return true;
  const data = r.headers.get('last-modified');
  if (data === marca) return true;
  const a = Date.parse(data); const b = Date.parse(marca);
  return Number.isFinite(a) && Number.isFinite(b) && a >= b - FOLGA_DATA;
}

/** Busca passando por cima dos caches do caminho: outro endereço (?v=<data da versão>) e sem o cache do navegador. */
function buscarDaVersao(url) {
  const u = new URL(url);
  u.searchParams.set('v', marca);
  return fetch(u.href, { cache: 'reload', credentials: 'same-origin' });
}

async function lerPendentes(c) {
  try { return new Map(Object.entries(JSON.parse((await (await c.match(PENDENTES))?.text()) || '{}'))); } catch { return new Map(); }
}
/** Grava a lista de pendentes como está na hora (uma gravação de cada vez: a última sempre vale). */
function gravarPendentes() {
  gravandoPendentes = gravandoPendentes.then(async () => {
    const c = await caches.open(CACHE);
    await c.put(PENDENTES, new Response(JSON.stringify(Object.fromEntries(pendentes))));
  }).catch(() => {});
  return gravandoPendentes;
}
/** `velho`: veio sem ser da versão (fica para baixar de novo, até MAX_TENTATIVAS vezes); senão já está certo e sai da lista. */
function marcarPendente(url, velho) {
  if (!velho && !pendentes.has(url)) return;
  const vezes = (pendentes.get(url) || 0) + 1;
  if (!velho || vezes >= MAX_TENTATIVAS) pendentes.delete(url); else pendentes.set(url, vezes);
  gravarPendentes();
}

/**
 * Confere a versão (uma vez por abertura). Devolve 'rede' se os arquivos devem ser baixados de novo (versão nova, cópia sem
 * marca ou desenvolvimento) e 'copia' se a cópia guardada vale (mesma versão, ou sem internet para saber).
 */
async function conferirVersao() {
  if (SEMPRE_CONFERIR) { marca = null; comInternet = false; pendentes = new Map(); return 'rede'; }
  const c = await caches.open(CACHE);
  const guardada = await (await c.match(MARCA))?.text();
  const publicada = await versaoPublicada();
  pendentes = await lerPendentes(c);
  comInternet = !!publicada;
  if (!publicada) { marca = guardada || null; return guardada ? 'copia' : 'rede'; }
  marca = publicada;
  if (guardada === publicada) return 'copia';
  // versão nova: sai da cópia o que é da versão anterior (os arquivos entram de novo conforme a página os pede); tudo o que
  // estava guardado fica na lista para baixar em segundo plano, e as bibliotecas e modelos antigos ficam até o novo chegar
  for (const k of await c.keys()) {
    if (INTERNOS.includes(k.url)) continue;
    if (k.url !== PAGINA) pendentes.set(k.url, 0);
    if (k.url === PAGINA || !MANTER_ATE_O_NOVO.test(new URL(k.url).pathname)) await c.delete(k);
  }
  await c.put(MARCA, new Response(publicada));
  await gravarPendentes();
  return 'rede';
}

/** Arquivo pedido sem uma abertura antes (o aparelho parou o service worker no meio do uso): marca e pendentes da cópia. */
async function semAbertura() {
  if (SEMPRE_CONFERIR) return 'rede';
  const c = await caches.open(CACHE);
  marca = (await (await c.match(MARCA))?.text()) || null;
  pendentes = await lerPendentes(c);
  return 'rede';
}

/**
 * Baixa em segundo plano, um de cada vez, o que ficou da cópia anterior e a página ainda não pediu nesta versão.
 * Sem internet (ou login do Cloudflare vencido): para e tenta de novo na próxima abertura; arquivo que saiu do site: sai da cópia.
 */
async function baixarPendentes() {
  if (baixando || !marca || !pendentes.size) return;
  baixando = true;
  const versao = marca;
  try {
    const c = await caches.open(CACHE);
    for (const url of [...pendentes.keys()]) {
      if (marca !== versao) return; // outra abertura achou uma versão mais nova
      const guardada = await c.match(url);
      if (guardada && daVersao(guardada)) { marcarPendente(url, false); continue; } // a página já pediu
      let r;
      try { r = await buscarDaVersao(url); } catch { return; }
      if (r.status === 404 || r.status === 410) { await c.delete(url); marcarPendente(url, false); continue; } // saiu do site
      if (!normal(r)) return;
      const velho = !daVersao(r);
      await c.put(url, r);
      marcarPendente(url, velho);
    }
  } finally { baixando = false; }
}

async function emSegundoPlano() {
  try {
    await conferencia;
    if (!comInternet) return;
    const c = await caches.open(CACHE);
    for (const p of ADIADOS) {
      const url = new URL(p, self.location.href).href;
      if (!pendentes.has(url) && !(await c.match(url))) pendentes.set(url, 0);
    }
    if (!pendentes.size) return;
    await esperar(ESPERA_SEGUNDO_PLANO);
    await baixarPendentes();
  } catch { /* fica para a próxima abertura */ }
}

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/') || url.pathname.includes('/cdn-cgi/')) return;
  if (url.pathname.endsWith('/__versao-publicada') || url.pathname.endsWith('/__para-baixar')) return;
  if (req.mode === 'navigate') {
    conferencia = conferirVersao().catch(() => 'copia');
    ev.respondWith(abrirPagina(req));
    const fundo = emSegundoPlano();
    if (ev.waitUntil) ev.waitUntil(fundo); // o aparelho não para o service worker no meio do download
  } else ev.respondWith(arquivo(req));
});

/**
 * A página em si: sempre tenta o site (o login do Cloudflare precisa passar por ela); sem internet, a guardada.
 * Site fora do ar respondendo com página de erro (5xx: Cloudflare ou GitHub Pages com problema) também abre a guardada:
 * para o sistema, "o site caiu" é o mesmo que "sem internet" (edita aqui e envia sozinho quando voltar).
 */
async function abrirPagina(req) {
  try {
    const r = await fetch(req);
    if (normal(r)) { const copia = r.clone(); conferencia.then(() => guardar('./', copia)); } // depois da limpeza, se houver
    if (r.status >= 500) return (await caches.match('./', { ignoreSearch: true })) || r;
    return r;
  } catch (e) {
    const guardada = await caches.match('./', { ignoreSearch: true });
    if (guardada) return guardada;
    throw e;
  }
}

/**
 * Arquivo da página (js, css, ícone…): da cópia se a versão não mudou; senão do site, conferindo que não é a cópia velha do
 * navegador nem de um cache no caminho. O que ainda está para baixar nesta versão vai ao site primeiro (a cópia antiga fica
 * para quando não houver internet).
 */
async function arquivo(req) {
  const modo = (await (conferencia ||= semAbertura().catch(() => 'rede'))) || 'rede';
  if (modo === 'copia' && !pendentes.has(req.url)) {
    const guardada = await caches.match(req);
    if (guardada) return guardada;
  }
  try {
    let r = await fetch(req, { cache: 'no-cache' });
    if (normal(r) && !daVersao(r)) {
      // logo depois de publicar: o index.html já é o novo, mas este arquivo veio velho de um cache no caminho
      const nova = await buscarDaVersao(req.url).catch(() => null);
      if (normal(nova)) r = nova;
      // se nem assim veio o da versão, guarda o que veio (sem internet é melhor que nada) e tenta de novo na próxima abertura
      marcarPendente(req.url, !daVersao(r));
    } else if (normal(r)) marcarPendente(req.url, false);
    if (normal(r)) guardar(req, r.clone());
    if (r.status >= 500) return (await caches.match(req)) || r; // site fora do ar: a cópia guardada
    return r;
  } catch (e) {
    const guardada = await caches.match(req);
    if (guardada) return guardada;
    throw e;
  }
}

/** Só guarda resposta normal do próprio site (não o login do Cloudflare, que vem como redirecionamento). */
function guardar(chave, resposta) {
  caches.open(CACHE).then((c) => c.put(chave, resposta)).catch(() => {});
}
