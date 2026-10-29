// HallLab — service worker : tout est mis en cache pour fonctionner hors ligne.
// Après une modification des fichiers, augmente VERSION pour forcer la mise à jour.
const VERSION = 'halllab-v2';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './physics.js',
  './storage.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache d'abord (réponse immédiate, même hors ligne), puis mise à jour du cache
// en arrière-plan quand le réseau est disponible.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      // no-cache : revalide auprès du serveur au lieu du cache HTTP du navigateur
      const network = fetch(req.url, { cache: 'no-cache' })
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);

      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      const res = await network;
      if (res) return res;
      if (req.mode === 'navigate') return cache.match('./index.html');
      return new Response('Hors ligne', { status: 503, statusText: 'Hors ligne' });
    }),
  );
});
