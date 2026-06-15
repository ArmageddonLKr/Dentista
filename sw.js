const CACHE_NAME = 'av-agenda-v5';
// Relative URLs so the SW works whether hosted at the domain root or a subpath
// (e.g. GitHub Pages: user.github.io/dentista/). They resolve against the SW scope.
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/icon-light.png',
  './icons/icon-blue.png',
  './icons/icon-black.png',
  './icons/icon-white.png',
];

// Files that must always be fresh (network-first)
function isCritical(url) {
  const p = new URL(url).pathname;
  return p === '/' || p.endsWith('/') || p.endsWith('.html') || p.endsWith('.js') || p.endsWith('.css') || p.endsWith('.json');
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      // Cache individually so one missing asset doesn't abort the whole install.
      .then((cache) => Promise.all(ASSETS.map((a) => cache.add(a).catch(() => {}))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
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
      }).catch(() => caches.match(e.request).then((cached) => cached || caches.match('./index.html')))
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
        }).catch(() => undefined);
      })
    );
  }
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
