const CACHE_NAME = 'baryo-konek-web-shell-bk-desktop-aligned-20261122-06';
const APP_SHELL = ['/', '/index.html', '/app.css?v=bk-desktop-aligned-20261122-06', '/app.js?v=bk-desktop-aligned-20261122-06', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/barangay.jpg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('baryo-konek-web-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/') || request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(fetch(new Request(request, {cache:'no-store'})).then(response => {
    if (response && response.ok) { const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(request, copy)); }
    return response;
  }).catch(() => caches.match(request).then(hit => hit || caches.match('/'))));
});
