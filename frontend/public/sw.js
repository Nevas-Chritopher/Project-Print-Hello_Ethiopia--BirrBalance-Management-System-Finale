const CACHE_NAME = 'esrom-birrbalance-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/sw.js',
  '/favicon.ico'
];

// Install Event
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event with network-first fallback to cache strategy
self.addEventListener('fetch', (e) => {
  // Only intercept HTTP/S GET requests
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Do not intercept or cache critical dynamic/authenticated APIs to avoid state conflicts
  const isDynamicApi = e.request.url.includes('/api/auth/') ||
                       e.request.url.includes('/api/notifications') ||
                       e.request.url.includes('/api/messages') ||
                       e.request.url.includes('/api/audit-logs') ||
                       e.request.url.includes('/api/feedback');

  if (isDynamicApi) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Clone and cache successful response
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, resClone);
        });
        return res;
      })
      .catch(() => {
        // Offline: attempt to match in cache
        return caches.match(e.request).then((cachedRes) => {
          if (cachedRes) return cachedRes;
          // Fallback response for offline API queries or assets
          if (e.request.url.includes('/api/menu')) {
            return new Response(JSON.stringify({ menuItems: [], offline: true }), {
              headers: { 'Content-Type': 'application/json' }
            });
          }
          return new Response('Offline: Network unavailable and asset not cached.', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
  );
});
