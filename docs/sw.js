// Aplicativo instalável: guarda as telas do sistema no aparelho para abrir sem internet. Nunca guarda dados (/api/) nem outros sites.
// Ao abrir a página, confere UMA vez com o site se há versão nova (a data de publicação do index.html: no GitHub Pages todos os
// arquivos publicados juntos levam a mesma data). Mesma versão: os arquivos vêm da cópia do aparelho, sem ir ao site
// (antes eram ~45 conferências por abertura, uma por arquivo). Versão nova: a cópia é refeita com os arquivos baixados de novo.
// Sem internet: usa a cópia. Em localhost (desenvolvimento) confere arquivo a arquivo, porque lá a data do index.html não muda.
const CACHE = 'imoveis-telas-v3';
const MARCA = './__versao-publicada'; // entrada do cache com a data de publicação da cópia guardada
const SEMPRE_CONFERIR = ['localhost', '127.0.0.1'].includes(self.location.hostname);

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

/**
 * Confere a versão (uma vez por abertura). Devolve 'rede' se os arquivos devem ser baixados de novo (versão nova, cópia sem
 * marca ou desenvolvimento) e 'copia' se a cópia guardada vale (mesma versão, ou sem internet para saber).
 */
async function conferirVersao() {
  if (SEMPRE_CONFERIR) return 'rede';
  const c = await caches.open(CACHE);
  const guardada = await (await c.match(MARCA))?.text();
  const publicada = await versaoPublicada();
  if (!publicada) return guardada ? 'copia' : 'rede';
  if (guardada === publicada) return 'copia';
  // versão nova: fora o que está guardado (os arquivos entram de novo conforme a página os pede)
  for (const k of await c.keys()) await c.delete(k);
  await c.put(MARCA, new Response(publicada));
  return 'rede';
}

let conferencia = null; // a conferência da abertura em curso; os arquivos da página esperam por ela

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/') || url.pathname.includes('/cdn-cgi/')) return;
  if (url.pathname.endsWith('/__versao-publicada')) return;
  ev.respondWith(req.mode === 'navigate' ? abrirPagina(req) : arquivo(req));
});

/** A página em si: sempre tenta o site (o login do Cloudflare precisa passar por ela); sem internet, a guardada. */
async function abrirPagina(req) {
  conferencia = conferirVersao().catch(() => 'copia');
  try {
    const r = await fetch(req);
    if (r.ok && r.type === 'basic' && !r.redirected) { const copia = r.clone(); conferencia.then(() => guardar('./', copia)); } // depois da limpeza, se houver
    return r;
  } catch (e) {
    const guardada = await caches.match('./', { ignoreSearch: true });
    if (guardada) return guardada;
    throw e;
  }
}

/** Arquivo da página (js, css, ícone…): da cópia se a versão não mudou; senão do site, conferindo que não é a cópia velha do navegador. */
async function arquivo(req) {
  const modo = (await conferencia) || 'rede';
  if (modo === 'copia') {
    const guardada = await caches.match(req);
    if (guardada) return guardada;
  }
  try {
    const r = await fetch(req, { cache: 'no-cache' });
    if (r.ok && r.type === 'basic' && !r.redirected) guardar(req, r.clone());
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
