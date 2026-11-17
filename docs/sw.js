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
// A data de publicação vem da própria página (o GET do index.html, sem o cache do navegador): uma ida ao site só por abertura,
// e a página guardada é sempre a da versão marcada (antes, um HEAD à parte, e a página podia vir da cópia de 10 min do navegador
// e ficar guardada como se fosse da versão nova, com os módulos de outra).
// 1ª visita: a página ainda não passa pelo service worker (ele chega depois dela); a instalação guarda a página, os módulos que
// ela usa (lidos do index.html e dos import de cada módulo), ADIADOS e EXTRAS, para o aplicativo abrir sem internet logo depois.
// Sem internet: usa a cópia. Em localhost (desenvolvimento) confere arquivo a arquivo, porque lá a data do index.html não muda
// (mas guarda ADIADOS e EXTRAS também, para o teste sem internet mostrar quando falta um).
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
// o pdf.js (1,4 MB) também: sem ele, o PDF escaneado anexado sem internet ia sem compactar (compactar.js) e o visualizador do
// celular não abria. Bibliotecas só voltam a ser baixadas quando VERSAO_VENDOR muda. A planilha (exceljs), maior, continua
// guardada só depois do primeiro uso.
const ADIADOS = ['js/exportar.js', 'js/regras-texto.js', 'js/visualizador.js', 'js/migracao.js', 'js/gestao.js', 'js/telas/gestao.js',
  'vendor/jspdf.umd.min.js', 'vendor/html2canvas.min.js', 'vendor/jszip.min.js', 'vendor/pdf.min.js', 'vendor/pdf.worker.min.js'];
// O que o navegador pede por fora dos módulos (manifest do aplicativo e ícones): guardado também, para não falhar sem internet
const EXTRAS = ['manifest.webmanifest', 'icones/erp-192.png', 'icones/erp-512.png', 'icones/aviso-96.png'];
const PARALELO = 6; // downloads ao mesmo tempo na instalação

self.addEventListener('install', (ev) => {
  self.skipWaiting();
  ev.waitUntil(guardarPrimeiraVisita().catch(() => {})); // falhou (sem internet no meio): fica para a próxima abertura
});

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

/**
 * Data de publicação do site agora (cabeçalho Last-Modified da própria página, `doSite`), ou null sem internet / sem resposta
 * normal (ou fora do prazo).
 */
async function versaoPublicada(doSite) {
  try {
    const r = await comPrazo(doSite, LIMITE_CONFERENCIA);
    if (!normal(r)) return null; // sinal fraco, login do Cloudflare (redirecionamento) ou erro: não dá para saber
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
function daVersao(r, versao = marca) {
  if (!versao) return true;
  const data = r.headers.get('last-modified');
  if (data === versao) return true;
  const a = Date.parse(data); const b = Date.parse(versao);
  return Number.isFinite(a) && Number.isFinite(b) && a >= b - FOLGA_DATA;
}

/** Busca passando por cima dos caches do caminho: outro endereço (?v=<data da versão>) e sem o cache do navegador. */
function buscarDaVersao(url, versao = marca) {
  const u = new URL(url);
  u.searchParams.set('v', versao);
  return fetch(u.href, { cache: 'reload', credentials: 'same-origin' });
}

// import estático de um módulo ('./x.js' ou '../x.js'; o import() das partes adiadas fica de fora: elas estão em ADIADOS)
const IMPORTS = /\b(?:from|import)\s*['"](\.{1,2}\/[^'"]+\.js)['"]/g;
const LIGACOES = /\b(?:src|href)="([^"#?]+)"/g; // do index.html: o módulo principal, o estilo, o manifest e os ícones

/**
 * 1ª visita (a cópia está vazia): guarda a página e tudo o que ela carrega, mais ADIADOS e EXTRAS, e por último a marca da
 * versão (a data da própria página). Os módulos que a página acabou de baixar vêm do cache do navegador conferido (304).
 * Arquivo que veio velho de um cache no caminho, mesmo passando por cima dele, fica guardado e na lista para baixar de novo.
 */
async function guardarPrimeiraVisita() {
  const c = await caches.open(CACHE);
  if ((await c.keys()).length) return; // já tem cópia (só trocou o service worker): a abertura cuida, como sempre
  const pagina = await fetch(PAGINA, { cache: 'no-cache', credentials: 'same-origin' });
  if (!normal(pagina)) return; // login do Cloudflare ou erro: fica para a próxima abertura
  const versao = SEMPRE_CONFERIR ? null : pagina.headers.get('last-modified');
  if (!SEMPRE_CONFERIR && !versao) return;
  const velhos = {};
  const vistos = new Set(); const fila = [];
  const incluir = (rel, base) => {
    let u;
    try { u = new URL(rel, base); } catch { return; }
    if (u.origin !== self.location.origin || u.pathname.includes('/api/') || u.href === PAGINA) return;
    u.hash = '';
    if (!vistos.has(u.href)) { vistos.add(u.href); fila.push(u.href); }
  };
  for (const [, rel] of (await pagina.clone().text()).matchAll(LIGACOES)) incluir(rel, PAGINA);
  const baixarUm = async (url) => {
    let r = await fetch(url, { cache: 'no-cache', credentials: 'same-origin' });
    if (!normal(r)) return;
    if (!daVersao(r, versao)) {
      const nova = await buscarDaVersao(url, versao).catch(() => null);
      if (normal(nova)) r = nova;
      if (!daVersao(r, versao)) velhos[url] = 1;
    }
    await c.put(url, r.clone());
    const caminho = new URL(url).pathname;
    if (/\.js$/.test(caminho) && !EH_VENDOR.test(caminho)) {
      for (const [, rel] of (await r.text()).matchAll(IMPORTS)) incluir(rel, url);
    }
  };
  // primeiro os módulos da página (o que precisa para abrir), depois ADIADOS e EXTRAS
  const trabalhar = async () => { while (fila.length) await baixarUm(fila.shift()).catch(() => {}); };
  const rodada = () => Promise.all(Array.from({ length: PARALELO }, trabalhar));
  await rodada();
  for (const a of [...ADIADOS, ...EXTRAS]) incluir(a, PAGINA);
  await rodada();
  await c.put(PAGINA, pagina);
  if (SEMPRE_CONFERIR) return;
  await c.put(PENDENTES, new Response(JSON.stringify(velhos)));
  await c.put(VENDOR, new Response(VERSAO_VENDOR));
  await c.put(MARCA, new Response(versao)); // por último: cópia com MARCA tem a página e os módulos dela
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
async function conferirVersao(doSite) {
  if (SEMPRE_CONFERIR) { marca = null; comInternet = false; atualizando = false; pendentes = new Map(); return 'rede'; }
  await trocarPelaNova(); // versão nova que já tinha chegado inteira (o aparelho parou no meio da troca) entra em uso primeiro
  let publicada = await versaoPublicada(doSite);
  await troca; // troca começada pela abertura anterior enquanto o site respondia: a MARCA lida a seguir já é a dela
  const c = await caches.open(CACHE);
  const guardada = (await texto(c, MARCA)) || null;
  // página mais velha que a versão guardada: cópia velha num cache do caminho (as publicações só avançam). Fica a guardada.
  if (publicada && guardada && Date.parse(publicada) < Date.parse(guardada)) publicada = guardada;
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

/** Desenvolvimento (localhost): guarda ADIADOS e EXTRAS que faltam na cópia, para o teste sem internet ser como no aparelho. */
async function guardarFaltandoLocal() {
  const c = await caches.open(CACHE);
  for (const p of [...ADIADOS, ...EXTRAS]) {
    if (await c.match(p)) continue;
    try {
      const r = await fetch(p, { cache: 'no-cache', credentials: 'same-origin' });
      if (normal(r)) await c.put(p, r);
    } catch { return; } // sem internet: na próxima abertura
  }
}

async function emSegundoPlano() {
  try {
    await conferencia;
    if (SEMPRE_CONFERIR) { await esperar(ESPERA_SEGUNDO_PLANO); await guardarFaltandoLocal(); return; }
    if (!comInternet) return;
    for (const p of [...ADIADOS, ...EXTRAS]) {
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
    // uma ida ao site: a própria página, sem o cache do navegador (que a guardaria por 10 min), traz a data de publicação
    const doSite = fetch(req, { cache: 'no-cache' });
    doSite.catch(() => {});
    conferencia = conferirVersao(doSite).catch(() => 'copia');
    ev.respondWith(abrirPagina(doSite));
    const fundo = emSegundoPlano();
    if (ev.waitUntil) ev.waitUntil(fundo); // o aparelho não para o service worker no meio do download
  } else ev.respondWith(arquivo(req));
});

/**
 * A página em si: sempre tenta o site (o login do Cloudflare precisa passar por ela); sem internet, ou sem resposta em LIMITE_PAGINA, a guardada.
 * Site fora do ar respondendo com página de erro (5xx: Cloudflare ou GitHub Pages com problema) também abre a guardada:
 * para o sistema, "o site caiu" é o mesmo que "sem internet" (edita aqui e envia sozinho quando voltar).
 * A página do site só é usada e guardada se for da versão marcada: com sinal fraco a conferência pode ter ficado com a cópia
 * guardada; aí abre a página guardada, inteira, e a nova fica para a próxima abertura (nunca a página de uma versão com os
 * módulos de outra).
 */
async function abrirPagina(doSite) {
  const guardada = () => emUso('./', { ignoreSearch: true });
  try {
    let r = await comPrazo(doSite, LIMITE_PAGINA);
    if (!r) {
      // sinal fraco: abre a cópia guardada (o sistema trabalha com os dados do aparelho e envia depois); sem cópia (1ª vez), espera o site
      const g = await guardada();
      if (g) return g;
      r = await doSite;
    }
    await conferencia;
    if (normal(r)) {
      if (!marca || r.headers.get('last-modified') === marca) { guardar('./', r.clone()); return r; }
      return (await guardada()) || r;
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
