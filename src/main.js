import { mount } from 'svelte'
import App from './App.svelte'
import './app.css'
import { registerSW } from 'virtual:pwa-register'
import { writable } from 'svelte/store'

export const installPrompt = writable(null)

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
  }
})

export default app
