/* ═══════════════════════════════════════════════════
   sw.js — Service Worker do ContasApp

   Estratégia: Cache First para assets estáticos,
   Network First para chamadas de API.

   Para ativar: registre este arquivo no main.js
   substituindo o SW inline por:
     navigator.serviceWorker.register('./sw.js')
   ═══════════════════════════════════════════════════ */

const CACHE_NAME  = 'contasapp-v1';
const STATIC_URLS = [
  './',
  './index.html',
  './css/styles.css',
  './js/config.js',
  './js/api.js',
  './js/engine.js',
  './js/ui.js',
  './js/views.js',
  './js/main.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
];

/* ── Install: pré-carrega assets estáticos ───────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_URLS))
  );
  self.skipWaiting();
});

/* ── Activate: remove caches antigos ─────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ── Fetch ───────────────────────────────────────── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Chamadas de API → Network First (sem cache)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Assets estáticos → Cache First
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
