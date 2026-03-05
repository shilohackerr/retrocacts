/**
 * sw.js — RetroCoats™ Service Worker
 * Estrategia de caché: Cache First para assets, Network First para HTML
 * Versión: 2.0.0
 * 
 * ACTUALIZAR "CACHE_VERSION" en cada deploy para invalidar caché anterior.
 */

const CACHE_VERSION   = 'retrocoats-v2.0.0';
const STATIC_CACHE    = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE   = `${CACHE_VERSION}-dynamic`;
const IMAGE_CACHE     = `${CACHE_VERSION}-images`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/assets/css/main.css',
  '/assets/js/seo.config.js',
  '/assets/js/security.js',
  '/assets/js/performance.js',
  '/assets/js/app.js',
  '/pages/404.html',
  '/manifest.json',
];

const NEVER_CACHE = [
  '/api/',
  '/config/',
  'paypal.com',
  'paypalobjects.com',
];

// ── INSTALL: Pre-cachear assets estáticos ──────────────────
self.addEventListener('install', event => {
  console.log(`[SW] Instalando ${CACHE_VERSION}...`);
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Algunos assets no se pudieron cachear:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: Limpiar cachés viejos ───────────────────────
self.addEventListener('activate', event => {
  console.log(`[SW] Activando ${CACHE_VERSION}...`);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => !key.startsWith(CACHE_VERSION))
            .map(key => {
              console.log(`[SW] Eliminando caché obsoleto: ${key}`);
              return caches.delete(key);
            })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: Estrategia mixta ────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar peticiones no-GET y rutas sensibles
  if (request.method !== 'GET') return;
  if (NEVER_CACHE.some(pattern => request.url.includes(pattern))) return;
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') return;

  // HTML: Network First (siempre intentar red, fallback a caché)
  if (request.headers.get('Accept')?.includes('text/html')) {
    event.respondWith(networkFirst(request, STATIC_CACHE));
    return;
  }

  // Imágenes: Cache First con expiración
  if (/\.(jpg|jpeg|png|webp|gif|svg|ico)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // CSS/JS/Fonts: Cache First (cambiar query string para invalidar)
  if (/\.(css|js|woff2|woff|ttf)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Resto: Stale While Revalidate
  event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
});

// ── ESTRATEGIAS DE CACHÉ ───────────────────────────────────

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match('/pages/404.html');
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Recurso no disponible offline.', { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache    = await caches.open(cacheName);
  const cached   = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || fetchPromise;
}

// ── BACKGROUND SYNC (para pedidos offline) ────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-orders') {
    event.waitUntil(syncPendingOrders());
  }
});

async function syncPendingOrders() {
  // En producción: leer de IndexedDB y reenviar peticiones pendientes
  console.log('[SW] Sincronizando pedidos pendientes...');
}

// ── PUSH NOTIFICATIONS ────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'RetroCoats™', {
      body:  data.body || 'Tienes una novedad en RetroCoats™',
      icon:  '/assets/images/icons/icon-192.png',
      badge: '/assets/images/icons/badge-72.png',
      tag:   data.tag || 'retrocoats-notification',
      data:  { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});
