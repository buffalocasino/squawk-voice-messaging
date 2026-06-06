import { mount } from 'svelte'
import App from './App.svelte'
import './app.css'
import { registerSW } from 'virtual:pwa-register'
import { writable } from 'svelte/store'

export const installPrompt = writable(null)
/** Signal for App to navigate to a specific chat from notification click */
export const notificationRoute = writable(null)

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault()
  installPrompt.set(e)
})

window.addEventListener('appinstalled', () => {
  installPrompt.set(null)
})

const app = mount(App, { target: document.getElementById('app') })

const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('New version available. Reload to update?')) {
      updateSW(true)
    }
  },
  onOfflineReady() {
    console.info('App ready to work offline')
  }
})

// ── Listen for messages from the hardened service worker ──────────────────

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    const { type, senderId } = event.data || {}

    if (type === 'NOTIFICATION_OPEN') {
      // Store the route intent — App.onMount will consume it
      notificationRoute.set({ senderId, timestamp: Date.now() })
    }
  })
}

// ── Register periodic vault health check ──────────────────────────────────
// Warns if IndexedDB is unavailable or quota exceeded

if ('storage' in navigator && 'estimate' in navigator.storage) {
  navigator.storage.estimate().then(({ usage, quota }) => {
    if (quota && usage > quota * 0.9) {
      console.warn('[Squawk] Storage quota >90% used:', {
        usedMB: (usage / (1024 * 1024)).toFixed(1),
        totalMB: (quota / (1024 * 1024)).toFixed(1),
      })
    }
  }).catch(() => {})
}

export default app
