const CACHE_NAME = 'av-agenda-v4';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-light.png',
  '/icons/icon-blue.png',
  '/icons/icon-black.png',
  '/icons/icon-white.png',
];

// Files that must always be fresh (network-first)
function isCritical(url) {
  const p = new URL(url).pathname;
  return p === '/' || p.endsWith('.html') || p.endsWith('.js') || p.endsWith('.css') || p.endsWith('.json');
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  if (isCritical(e.request.url)) {
    // Network-first: always try network, fall back to cache
    e.respondWith(
      fetch(e.request).then((response) => {
        if (!response || response.status !== 200) throw new Error('bad response');
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        return response;
      }).catch(() => caches.match(e.request).then((cached) => cached || caches.match('/index.html')))
    );
  } else {
    // Cache-first for assets (images, fonts, etc.)
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((response) => {
          if (!response || response.status !== 200 || response.type === 'opaque') return response;
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          return response;
        }).catch(() => caches.match('/index.html'));
      })
    );
  }
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) return clientList[0].focus();
      return clients.openWindow('/');
    })
  );
});
