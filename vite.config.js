import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      manifest: false,
      injectManifest: {
        injectionPoint: 'self.__WB_MANIFEST',
      },
    })
  ],
  server: {
    host: true,
    port: 5175
  },
  optimizeDeps: {
    exclude: ['@matrix-org/olm']
  }
})
