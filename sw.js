const CACHE = 'rikiki-v12';

// Le code de l'app. Servi réseau d'abord pour qu'une mise en ligne arrive
// sans dépendre d'un bump de version, avec repli sur le cache hors ligne.
const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/game.js',
  './js/storage.js',
  './js/app.js',
  './js/firebase.js',
  './manifest.json',
];

// Ne change quasiment jamais: cache d'abord, c'est instantané.
const STATIC = [
  './images/android-chrome-192x192.png',
  './images/android-chrome-512x512.png',
  './images/apple-touch-icon.png',
  './images/favicon.ico',
  './images/favicon-16x16.png',
  './images/favicon-32x32.png',
  'https://fonts.googleapis.com/css2?family=Kreon:wght@400;500;600;700&family=DM+Sans:wght@300;400;500&display=swap'
];

// Auth et base de données ne doivent jamais passer par le cache: un jeton ou
// une réponse périmée casse silencieusement la connexion et l'historique.
const NETWORK_ONLY_HOSTS = [
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firestore.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'apis.google.com',
  'accounts.google.com',
  'rikiki-the-game.firebaseapp.com',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL.concat(STATIC)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isShellRequest(url) {
  if (url.origin !== self.location.origin) return false;
  const path = url.pathname;
  return path === '/' || path.endsWith('/')
    || /\.(html|css|js|json)$/.test(path);
}

// Réseau d'abord, cache en repli. Le timeout évite de rester bloqué sur un
// réseau qui répond mal (wifi captif, 3G au fond du jardin).
function networkFirst(req) {
  return new Promise(resolve => {
    let settled = false;
    const fallback = () => {
      if (settled) return;
      settled = true;
      caches.match(req).then(hit => resolve(hit || fetch(req).catch(() => caches.match('./index.html'))));
    };
    const timer = setTimeout(fallback, 3000);

    fetch(req).then(resp => {
      clearTimeout(timer);
      if (settled) {
        // Trop tard pour cette réponse, mais on rafraîchit quand même le cache.
        if (resp && resp.status === 200) caches.open(CACHE).then(c => c.put(req, resp.clone())).catch(() => {});
        return;
      }
      settled = true;
      if (resp && resp.status === 200 && resp.type !== 'opaque') {
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
      }
      resolve(resp);
    }).catch(() => {
      clearTimeout(timer);
      fallback();
    });
  });
}

function cacheFirst(req) {
  return caches.match(req).then(hit => {
    if (hit) return hit;
    return fetch(req).then(resp => {
      if (resp && resp.status === 200 && resp.type !== 'opaque') {
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
      }
      return resp;
    }).catch(() => caches.match('./index.html'));
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (NETWORK_ONLY_HOSTS.includes(url.hostname)) return;

  e.respondWith(isShellRequest(url) ? networkFirst(req) : cacheFirst(req));
});
