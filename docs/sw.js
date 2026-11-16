// Aplicativo instalável: guarda as telas do sistema no aparelho para abrir sem internet. Nunca guarda dados (/api/) nem outros sites.
// Ao abrir a página, confere UMA vez com o site se há versão nova (a data de publicação do index.html: no GitHub Pages todos os
// arquivos publicados juntos levam a mesma data). Mesma versão: os arquivos vêm da cópia do aparelho, sem ir ao site
// (antes eram ~45 conferências por abertura, uma por arquivo). Versão nova: os arquivos novos chegam numa cópia à parte (NOVA),
// os que a página pede e, em segundo plano, o resto do que estava guardado; a cópia em uso (CACHE) fica INTEIRA como estava até
// a nova chegar toda, e só então é trocada. Com internet a página já recebe os arquivos novos; se a internet cair no meio da
// atualização, o aplicativo abre com a versão anterior completa (antes, os arquivos antigos eram apagados na hora e ele não abria),
// e nunca fica guardada uma mistura de duas versões.
// Arquivo que chega com data mais velha que a da versão (cópia velha num cache no caminho, logo depois de publicar) é buscado de
// novo passando por cima dos caches (?v=<data>), para não ficar guardado como se fosse da versão nova.
// Sem internet: usa a cópia. Em localhost (desenvolvimento) confere arquivo a arquivo, porque lá a data do index.html não muda.
const CACHE = 'imoveis-telas-v3'; // a cópia em uso: uma versão completa
const NOVA = 'imoveis-telas-nova'; // a versão nova enquanto chega (com a MARCA dela e os PENDENTES que faltam); completa, troca a em uso
const MARCA = './__versao-publicada'; // entrada do cache com a data de publicação da cópia guardada
const PENDENTES = './__para-baixar'; // entrada do cache com os arquivos ainda por baixar na versão guardada (lista em JSON)
const SEMPRE_CONFERIR = ['localhost', '127.0.0.1'].includes(self.location.hostname);
// Bibliotecas (vendor/, 3 MB): não mudam a cada publicação, então só são baixadas de novo quando esta versão muda (antes, cada
// publicação fazia o aparelho baixar tudo outra vez). MUDOU UM ARQUIVO DE docs/vendor? Troque esta data (tests/sw.test.mjs confere).
const VERSAO_VENDOR = '2026-11-13';
const VENDOR = './__versao-vendor'; // entrada do cache com a VERSAO_VENDOR das bibliotecas guardadas
const EH_VENDOR = /\/vendor\//;
const FOLGA_DATA = 60 * 1000; // o GitHub grava os arquivos de uma publicação um a um: a data de cada um varia alguns segundos
const ESPERA_SEGUNDO_PLANO = 3000; // ms: o que fica em segundo plano começa depois da abertura, sem disputar a internet com ela
// Sinal fraco (celular): a conferência da versão e a página não seguram a abertura além destes limites; passou disso, abre a cópia
// guardada (como sem internet) e o que o site responder depois fica para a próxima abertura
const LIMITE_CONFERENCIA = 3000; // ms
const LIMITE_PAGINA = 5000; // ms
const MAX_TENTATIVAS = 3; // arquivo que nem passando por cima dos caches vem com a data da versão: aceito como veio depois disso
// Partes do programa que a página só carrega quando usadas (import() em telas/acoes.js e telas/nuvem.js): ficam guardadas
// desde a primeira abertura com internet, para funcionarem sem internet mesmo sem terem sido usadas antes.
// As bibliotecas de PDF e ZIP (~700 KB) entram aqui para "Baixar PDF" e o ZIP funcionarem sem internet num aparelho recém-instalado;
// a planilha (exceljs) e o visualizador de PDF (pdf.js), maiores, continuam guardados só depois do primeiro uso.
const ADIADOS = ['js/exportar.js', 'js/regras-texto.js', 'js/visualizador.js', 'js/migracao.js',
  'vendor/jspdf.umd.min.js', 'vendor/html2canvas.min.js', 'vendor/jszip.min.js'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== NOVA).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

/** A resposta da promessa, ou null se ela não chegar em `ms` (continua por fora; erro depois do prazo é ignorado). */
function comPrazo(promessa, ms) {
  let t;
  const prazo = new Promise((ok) => { t = setTimeout(() => ok(null), ms); });
  const p = promessa.finally(() => clearTimeout(t));
  p.catch(() => {});
  return Promise.race([p, prazo]);
}

/** Data de publicação do site agora (cabeçalho Last-Modified do index.html), ou null sem internet / sem resposta normal (ou no prazo). */
async function versaoPublicada() {
  try {
    const r = await comPrazo(fetch('index.html', { method: 'HEAD', cache: 'no-cache', credentials: 'same-origin' }), LIMITE_CONFERENCIA);
    if (!r || !r.ok || r.redirected || r.type !== 'basic') return null; // sinal fraco, login do Cloudflare ou erro: não dá para saber
    return r.headers.get('last-modified') || null;
  } catch { return null; }
}

let conferencia = null; // a conferência da abertura em curso; os arquivos da página esperam por ela
let marca = null; // data de publicação da versão guardada (null: sem conferência, como em localhost)
let comInternet = false; // a conferência falou com o site (dá para baixar em segundo plano)
let pendentes = new Map(); // endereço ainda por baixar nesta versão → vezes que veio sem ser da versão (guardado em PENDENTES)
let atualizando = false; // há versão nova chegando: o que vem do site vai para NOVA (e `pendentes` é o que falta nela)
let gravandoPendentes = Promise.resolve();
let baixando = false;
const emCurso = new Set(); // gravações no cache ainda em andamento (a troca pela versão nova espera por elas)
let troca = Promise.resolve(); // uma troca de cada vez

const PAGINA = new URL('./', self.location.href).href;
const INTERNOS = [MARCA, PENDENTES, VENDOR].map((k) => new URL(k, self.location.href).href);
const normal = (r) => !!r && r.ok && r.type === 'basic' && !r.redirected; // não o login do Cloudflare (redirecionamento) nem erro
const esperar = (ms) => new Promise((ok) => { setTimeout(ok, ms); });
const texto = async (c, k) => (await (await c.match(k))?.text()) || '';
const temNova = async () => (await caches.keys()).includes(NOVA);
/** O arquivo na cópia em uso (a versão completa guardada). */
const emUso = async (k, opcoes) => (await caches.open(CACHE)).match(k, opcoes);
/** O arquivo na versão nova que está chegando (só enquanto ela chega). */
const naNova = async (k) => (atualizando ? (await caches.open(NOVA)).match(k) : undefined);
/** Para quando o site não responde: a cópia em uso; arquivo que só existe na versão nova, o que já chegou dela. */
const daCopia = async (k) => (await emUso(k)) || naNova(k);

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
/** Grava a lista de pendentes como está na hora (uma gravação de cada vez: a última sempre vale), na cópia a que ela pertence. */
function gravarPendentes() {
  gravandoPendentes = gravandoPendentes.then(async () => {
    const c = await caches.open(atualizando ? NOVA : CACHE);
    await c.put(PENDENTES, new Response(JSON.stringify(Object.fromEntries(pendentes))));
  }).catch(() => {});
  return gravandoPendentes;
}

/**
 * Troca a cópia em uso pela versão nova, se ela já chegou inteira (tem a MARCA e não falta nada). Decide pelo que está gravado em
 * NOVA, então pode ser chamada a qualquer hora e repetida: se o aparelho parar no meio, a próxima abertura termina (mesmo sem
 * internet). A MARCA da cópia em uso só muda no fim, e NOVA só some depois dela. Sai da cópia o que não veio na versão nova
 * (arquivo que saiu do site); as bibliotecas que não mudaram (VERSAO_VENDOR) e a página ficam.
 */
function trocarPelaNova() {
  troca = troca.then(async () => {
    if (!(await temNova())) return;
    const n = await caches.open(NOVA);
    const versao = await texto(n, MARCA);
    if (!versao || (await lerPendentes(n)).size) return;
    const c = await caches.open(CACHE);
    const vendorMudou = (await texto(c, VENDOR)) !== VERSAO_VENDOR;
    const novos = new Set();
    for (const k of await n.keys()) {
      if (INTERNOS.includes(k.url)) continue;
      const r = await n.match(k);
      if (!r) continue;
      await c.put(k, r);
      novos.add(k.url);
    }
    for (const k of await c.keys()) {
      if (novos.has(k.url) || INTERNOS.includes(k.url) || k.url === PAGINA) continue;
      if (!vendorMudou && EH_VENDOR.test(new URL(k.url).pathname)) continue;
      await c.delete(k);
    }
    await c.put(PENDENTES, new Response('{}'));
    if (vendorMudou) await c.put(VENDOR, new Response(VERSAO_VENDOR));
    await c.put(MARCA, new Response(versao));
    await caches.delete(NOVA);
  }).catch(() => {});
  return troca;
}

/** A versão nova chegou inteira (não falta nada)? Espera as gravações em andamento, grava a lista vazia e troca. */
async function promover() {
  if (!atualizando || pendentes.size) return;
  for (;;) {
    while (emCurso.size) await Promise.all([...emCurso]);
    await gravarPendentes();
    if (!atualizando || pendentes.size) return;
    if (!emCurso.size) break;
  }
  atualizando = false; // daqui em diante o que chegar do site já vai para a cópia em uso (que passa a ser a nova)
  await trocarPelaNova();
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
  if (SEMPRE_CONFERIR) { marca = null; comInternet = false; atualizando = false; pendentes = new Map(); return 'rede'; }
  await trocarPelaNova(); // versão nova que já tinha chegado inteira (o aparelho parou no meio da troca) entra em uso primeiro
  const publicada = await versaoPublicada();
  await troca; // troca começada pela abertura anterior enquanto o site respondia: a MARCA lida a seguir já é a dela
  const c = await caches.open(CACHE);
  const guardada = (await texto(c, MARCA)) || null;
  comInternet = !!publicada;
  if (!publicada) {
    // sem internet (ou sem resposta a tempo): a cópia em uso, inteira; a versão nova pela metade fica para quando houver internet
    const p = await lerPendentes(c);
    atualizando = false; pendentes = p; marca = guardada;
    return guardada ? 'copia' : 'rede';
  }
  // bibliotecas: só voltam para a lista de baixar quando VERSAO_VENDOR muda (ou na 1ª vez, sem a marca)
  const vendorMudou = (await texto(c, VENDOR)) !== VERSAO_VENDOR;
  if (guardada === publicada) {
    const p = await lerPendentes(c);
    if (await temNova()) await caches.delete(NOVA); // sobra de uma versão que não é mais a do site
    atualizando = false; pendentes = p; marca = publicada;
    // mesma versão do site, mas este service worker chegou depois com outras bibliotecas: as guardadas entram na lista
    if (vendorMudou) {
      for (const k of await c.keys()) if (EH_VENDOR.test(new URL(k.url).pathname)) pendentes.set(k.url, 0);
      await c.put(VENDOR, new Response(VERSAO_VENDOR));
      await gravarPendentes();
    }
    return 'copia';
  }
  // versão nova: nada sai da cópia em uso. Os arquivos novos vão para NOVA conforme a página os pede e, em segundo plano, tudo o
  // que estava guardado (a lista `pendentes`); quando não faltar nada, NOVA troca a cópia em uso (promover)
  let n = (await temNova()) ? await caches.open(NOVA) : null;
  let p;
  if (n && (await texto(n, MARCA)) === publicada) p = await lerPendentes(n); // esta versão já vinha chegando: continua de onde parou
  else {
    p = new Map();
    for (const k of await c.keys()) {
      if (INTERNOS.includes(k.url) || k.url === PAGINA) continue;
      if (!vendorMudou && EH_VENDOR.test(new URL(k.url).pathname)) continue; // biblioteca igual: fica como está, sem baixar de novo
      p.set(k.url, 0);
    }
    if (n) await caches.delete(NOVA); // o que tinha chegado era de outra versão
    n = null;
    if (p.size) {
      n = await caches.open(NOVA);
      await n.put(PENDENTES, new Response(JSON.stringify(Object.fromEntries(p))));
      await n.put(MARCA, new Response(publicada)); // por último: NOVA com MARCA sempre tem a lista do que falta
    } else {
      // nada guardado para trocar (primeira abertura): os arquivos entram direto na cópia em uso
      await c.put(PENDENTES, new Response('{}'));
      if (vendorMudou) await c.put(VENDOR, new Response(VERSAO_VENDOR));
      await c.put(MARCA, new Response(publicada));
    }
  }
  atualizando = !!n; pendentes = p; marca = publicada;
  return 'rede';
}

/**
 * Arquivo pedido sem uma abertura antes (o aparelho parou o service worker no meio do uso): marca e pendentes da cópia; se havia
 * versão nova chegando, continua nela (o que vier do site vai para NOVA).
 */
async function semAbertura() {
  if (SEMPRE_CONFERIR) return 'rede';
  await trocarPelaNova();
  const n = (await temNova()) ? await caches.open(NOVA) : null;
  const versaoNova = n ? await texto(n, MARCA) : '';
  if (versaoNova) {
    const p = await lerPendentes(n);
    atualizando = true; pendentes = p; marca = versaoNova;
    return 'rede';
  }
  const c = await caches.open(CACHE);
  const guardada = (await texto(c, MARCA)) || null;
  const p = await lerPendentes(c);
  atualizando = false; pendentes = p; marca = guardada;
  return 'rede';
}

/**
 * Baixa em segundo plano, um de cada vez, o que ficou da cópia anterior e a página ainda não pediu nesta versão.
 * Sem internet (ou login do Cloudflare vencido): para e tenta de novo na próxima abertura; arquivo que saiu do site: sai da cópia.
 */
async function baixarPendentes() {
  if (baixando || !marca || !pendentes.size) return;
  baixando = true;
  const versao = marca; const paraNova = atualizando;
  try {
    const c = await caches.open(paraNova ? NOVA : CACHE);
    for (const url of [...pendentes.keys()]) {
      if (marca !== versao || atualizando !== paraNova) return; // outra abertura achou uma versão mais nova (ou a nova entrou em uso)
      const guardada = await c.match(url);
      if (guardada && daVersao(guardada)) { marcarPendente(url, false); continue; } // a página já pediu
      let r;
      try { r = await buscarDaVersao(url); } catch { return; }
      if (r.status === 404 || r.status === 410) { await c.delete(url); marcarPendente(url, false); continue; } // saiu do site
      if (!normal(r)) return;
      const velho = !daVersao(r);
      if (marca !== versao || atualizando !== paraNova) return; // mudou enquanto baixava: este arquivo não é mais desta cópia
      await c.put(url, r);
      marcarPendente(url, velho);
    }
  } finally { baixando = false; }
}

async function emSegundoPlano() {
  try {
    await conferencia;
    if (!comInternet) return;
    for (const p of ADIADOS) {
      const url = new URL(p, self.location.href).href;
      // guardado na cópia em uso e fora da lista: ou não muda nesta versão (biblioteca), ou o novo já chegou
      if (!pendentes.has(url) && !(await emUso(url)) && !(await naNova(url))) pendentes.set(url, 0);
    }
    if (pendentes.size) {
      await esperar(ESPERA_SEGUNDO_PLANO);
      await baixarPendentes();
    }
    await promover(); // a versão nova chegou inteira: passa a ser a cópia em uso
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
 * A página em si: sempre tenta o site (o login do Cloudflare precisa passar por ela); sem internet, ou sem resposta em LIMITE_PAGINA, a guardada.
 * Site fora do ar respondendo com página de erro (5xx: Cloudflare ou GitHub Pages com problema) também abre a guardada:
 * para o sistema, "o site caiu" é o mesmo que "sem internet" (edita aqui e envia sozinho quando voltar).
 */
async function abrirPagina(req) {
  const guardada = () => emUso('./', { ignoreSearch: true });
  // a página do site fica guardada quando chegar, mesmo depois do prazo (depois da conferência: com versão nova chegando, vai com ela)
  const doSite = fetch(req).then((r) => { if (normal(r)) { const copia = r.clone(); conferencia.then(() => guardar('./', copia)); } return r; });
  try {
    let r = await comPrazo(doSite, LIMITE_PAGINA);
    if (!r) {
      // sinal fraco: abre a cópia guardada (o sistema trabalha com os dados do aparelho e envia depois); sem cópia (1ª vez), espera o site
      const g = await guardada();
      if (g) return g;
      r = await doSite;
    }
    if (r.status >= 500) return (await guardada()) || r;
    return r;
  } catch (e) {
    const g = await guardada();
    if (g) return g;
    throw e;
  }
}

/**
 * Arquivo da página (js, css, ícone…): da cópia se a versão não mudou; senão do site, conferindo que não é a cópia velha do
 * navegador nem de um cache no caminho. O que ainda está para baixar nesta versão vai ao site primeiro (a cópia antiga fica
 * para quando não houver internet). Com versão nova chegando, o que já chegou dela não vai ao site de novo.
 */
async function arquivo(req) {
  const modo = (await (conferencia ||= semAbertura().catch(() => 'rede'))) || 'rede';
  if (modo === 'copia' && !pendentes.has(req.url)) {
    const guardada = await emUso(req);
    if (guardada) return guardada;
  }
  if (atualizando && !pendentes.has(req.url)) {
    const chegou = await naNova(req);
    if (chegou && daVersao(chegou)) return chegou;
  }
  try {
    let r = await fetch(req, { cache: 'no-cache' });
    if (normal(r)) {
      let velho = false;
      if (!daVersao(r)) {
        // logo depois de publicar: o index.html já é o novo, mas este arquivo veio velho de um cache no caminho
        const nova = await buscarDaVersao(req.url).catch(() => null);
        if (normal(nova)) r = nova;
        // se nem assim veio o da versão, guarda o que veio (sem internet é melhor que nada) e tenta de novo na próxima abertura
        velho = !daVersao(r);
      }
      guardar(req, r.clone());
      marcarPendente(req.url, velho);
      if (atualizando && !pendentes.size) promover().catch(() => {}); // era o último que faltava da versão nova
    }
    if (r.status >= 500) return (await daCopia(req)) || r; // site fora do ar: a cópia guardada
    return r;
  } catch (e) {
    const guardada = await daCopia(req);
    if (guardada) return guardada;
    throw e;
  }
}

/**
 * Só guarda resposta normal do próprio site (não o login do Cloudflare, que vem como redirecionamento). Com versão nova
 * chegando, vai para NOVA (a cópia em uso não recebe arquivo de outra versão).
 */
function guardar(chave, resposta) {
  const p = caches.open(atualizando ? NOVA : CACHE).then((c) => c.put(chave, resposta)).catch(() => {});
  emCurso.add(p);
  p.then(() => emCurso.delete(p));
  return p;
}

// Aviso no celular (ficha pela internet: dados, ficha assinada, desistência), mandado pela nuvem (nuvem/push.mjs).
// Tocar no aviso abre o sistema na ficha (ou traz para a frente a janela já aberta).
// Figura do aviso: o ícone escolhido em Empresas (o mesmo do aplicativo; na nuvem, api/icone-192.png, que sem ícone
// escolhido vai para o ERP). Ícone da barra de cima do Android (badge): só a silhueta branca em fundo transparente
// (o Android pinta de uma cor só; figura colorida vira um quadrado branco).
const ICONE_AVISO = /^(localhost|127\.0\.0\.1)$/.test(self.location.hostname) ? 'icones/erp-192.png' : 'api/icone-192.png';
self.addEventListener('push', (ev) => {
  let d = {};
  try { d = ev.data ? ev.data.json() : {}; } catch { d = {}; }
  ev.waitUntil(self.registration.showNotification(d.titulo || 'Administração de Imóveis', {
    body: d.texto || 'Novidade na ficha pela internet.', icon: ICONE_AVISO, badge: 'icones/aviso-96.png', tag: d.tag || 'ficha', renotify: true, data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', (ev) => {
  ev.notification.close();
  const url = new URL((ev.notification.data && ev.notification.data.url) || './', self.location.href).href;
  ev.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
    const aberta = janelas.find((j) => j.url.startsWith(self.registration.scope));
    if (!aberta) return self.clients.openWindow(url);
    // primeiro traz a janela; depois vai para a ficha (janela não controlada recusa navigate: abre outra)
    return aberta.focus().then((j) => (j || aberta).navigate(url)).catch(() => self.clients.openWindow(url));
  }));
});
