// Service worker da versão web (PWA). Não roda no app do iPhone (Capacitor), só no navegador.
// - Código do app (HTML/JS/CSS/dados): rede primeiro, cache se estiver sem internet.
// - Cesium e geotiff (vendor/): cache primeiro; mudam só quando a versão muda.
// - Tiles e APIs de outros sites: não passam por aqui.
// VERSION é trocada por scripts/deploy-web.mjs a cada publicação.
const VERSION = '1.0.5-202611030211';
const CACHE = `terra3d-${VERSION}`;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(url.pathname.includes('/vendor/') ? cacheFirst(req) : networkFirst(req));
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}
