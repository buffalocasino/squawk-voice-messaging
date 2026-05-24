import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    svelte(),
    tailwindcss(),      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
      name: 'Squawk Voice Messaging',
      short_name: 'Squawk',
      description: 'Encrypted voice messages. P2P. No server.',
      start_url: '/',
      display: 'standalone',
      background_color: '#0f172a',
      theme_color: '#0f0f23',
      orientation: 'portrait',
      icons: [
        { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
        { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
      ],
      categories: ['social', 'communication'],
      shortcuts: [
        { name: 'New Squawk', short_name: 'Squawk', description: 'Start a new voice message', url: '/?action=squawk' }
      ]
    },
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2,webp,jpg,webm}'],
          navigateFallback: '/offline.html',
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } }
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: { cacheName: 'gstatic-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } }
            },
            {
              urlPattern: /^https:\/\/.*/i,
              handler: 'NetworkFirst',
              options: { cacheName: 'runtime-cache' }
            }
          ]
        }
      })
  ],
  server: {
    host: true,
    port: 5175
  }
})
