// Workbox registration for PWA Service Worker
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate, NetworkFirst } from 'workbox-strategies';
import { BackgroundSyncPlugin } from 'workbox-core';

// Cache-first for static assets
registerRoute(
  ({ request }) => request.destination.match(/\.css|\.js|\.png|\.jpg|\.svg/i),
  new StaleWhileRevalidate({
    cacheName: 'static-assets',
    plugins: [
      new BackgroundSyncPlugin()
    ]
  })
);

// Network-first for API calls
registerRoute(
  ({ request }) => request.url.match(/api\/.*$/i),
  new NetworkFirst({
    cacheName: 'api-cache',
    plugins: [
      new BackgroundSyncPlugin()
    ]
  })
);
// ... other routes (e.g., for forms, media)
