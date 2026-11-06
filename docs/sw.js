// Aplicativo instalável: guarda as telas do sistema no aparelho para abrir sem internet.
// Sempre tenta a versão nova primeiro (internet); sem internet, usa a guardada. Nunca guarda dados (/api/) nem outros sites.
const CACHE = 'imoveis-telas-v1';

self.addEventListener('install', (ev) => {
  // guarda o essencial já na instalação (o resto entra no cache conforme é usado)
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './css/estilo.css', './js/app.js', './manifest.webmanifest'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/') || url.pathname.includes('/cdn-cgi/')) return;
  ev.respondWith((async () => {
    try {
      const r = await fetch(req);
      // só guarda resposta normal do próprio site (não o login do Cloudflare, que vem como redirecionamento)
      if (r.ok && r.type === 'basic' && !r.redirected) {
        const copia = r.clone();
        caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? './' : req, copia)).catch(() => {});
      }
      return r;
    } catch (e) {
      const guardada = await caches.match(req.mode === 'navigate' ? './' : req, { ignoreSearch: req.mode === 'navigate' });
      if (guardada) return guardada;
      throw e;
    }
  })());
});
