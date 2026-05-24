/* Service Worker script for Squawk Voice Messaging */

const CACHE_NAME = 'squawk-pwa-v1';
const assetsToCache = [
    // Core assets list for initial installation
    '/', 
    '/src/offline/microphone-offline.html', // The dedicated offline page
    '/static/icons/icon-192.png', 
    '/static/icons/icon-512.png', 
    '/static/icons/icon.svg'
    // Add other resources needed for initial load, e.g., CSS, fonts, etc.
];

// Install event: Cache all necessary assets
self.addEventListener('install', event => {
    console.log('[Service Worker] Starting installation. Caching core assets...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[Service Worker] Cache successfully opened.');
                // cache.addAll is synchronous-like and ideal for bulk.
                return cache.addAll(assetsToCache);
            })
            .then(() => self.clients.claim()) // Helps immediately activate on new pages
    );
});

// Fetch event: Intercept requests and serve from cache or network
self.addEventListener('fetch', event => {
    const request = event.request;

    event.respondWith(
        // 1. Try to match the request in the cache first
        caches.match(request).then(cachedResponse => {
            if (cachedResponse) {
                console.log(`[Service Worker] Hit cache for: ${request.url}`);
                // Cache hit: return the cached resource
                return cachedResponse;
            }
            
            // Cache miss: fetch from network
            console.log(`[Service Worker] Miss cache, fetching from network: ${request.url}`);
            return fetch(request)
                .then(networkResponse => {
                    // If successful, cache the new response for next time
                    console.log('[Service Worker] Successfully fetched and caching new asset.');
                    const newCache = caches.open(CACHE_NAME);
                    return newCache.put(request, networkResponse)
                        .then(() => networkResponse); // Return the response anyway
                })
                .catch(error => {
                    console.error('[Service Worker] Network fetch failed:', error);
                    // If network fails, try to serve a generic fallback
                    if (request.url.endsWith('/')) {
                       return new Response('<h1>Offline Detected</h1><p>Could not connect to the network.</p>', {
                           status: 503,
                           headers: {'Content-Type': 'text/html'}
                       });
                    }
                    return new Response(null, { status: 404 });
                });
        })
    );
});

// Activate event: Clean up old cache versions
self.addEventListener('activate', event => {
    console.log('[Service Worker] Activating. Cleaning up old caches...');
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log(`[Service Worker] Deleting old cache: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
        .then(() => self.clients.claim())
    );
});
