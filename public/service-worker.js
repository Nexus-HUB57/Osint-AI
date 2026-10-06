/* OSINT-FUSION SW — SWR apenas para /_next/static/. Nunca cacheia RSC. */
let STATIC_CACHE = 'osint-static-bootstrap';

async function refreshCacheName() {
  try {
    const res = await fetch('/build-id.json', { cache: 'no-store' });
    if (res.ok) {
      const { id } = await res.json();
      STATIC_CACHE = `osint-static-${id}`;
    }
  } catch { /* mantém bootstrap */ }
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => { await refreshCacheName(); await self.skipWaiting(); })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    await refreshCacheName();
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const isCacheable = (req, url) =>
  req.method === 'GET' &&
  url.origin === self.location.origin &&
  url.pathname.startsWith('/_next/static/') &&
  req.headers.get('RSC') !== '1' &&
  !url.searchParams.has('_rsc');

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!isCacheable(event.request, url)) return;

  event.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(event.request);
    const network = fetch(event.request)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') cache.put(event.request, res.clone());
        return res;
      })
      .catch(() => cached);
    return cached || network;
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
📜 Contratos de domínio
