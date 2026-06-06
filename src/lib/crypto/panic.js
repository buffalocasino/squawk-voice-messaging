/**
 * panic.js — Emergency/duress mode for Squawk.
 *
 * Provides:
 *   initPanicShake(options) — watch accelerometer for shake gesture
 *   panic(callback) — execute full panic sequence
 *   shutdown() — stop accelerometer listener
 *
 * On panic:
 *   1. Destroy in-memory sealed key (messages become unrecoverable)
 *   2. Wipe all messages from store (DOD 5220.22-M)
 *   3. Wipe Olm sessions from localStorage
 *   4. Wipe identity keys from localStorage
 *   5. Wipe peer key bundles
 *   6. Redirect to safe landing screen
 *   7. Optionally navigate to a decoy URL
 */

import { secureWipeAll, secureWipeLocalStorage } from './wipe.js'
import { destroyKey } from './sealed.js'
import { destroyVault } from '../storage/SecureVault.js'
import { wipeAllMemory } from '../storage/MemoryGuard.js'
import { persistentMessages } from '../storage/persistentStores.svelte.js'
import { stopSweep } from '../ephemeral/timerEngine.js'
import { messages, myPeerId, connectionStatus, onlinePeers, peerKeyBundles } from '../../stores.js'

// ─── Shake detection ──────────────────────────────────────────────────────────

const SHAKE_THRESHOLD = 15    // m/s² — minimum acceleration for a shake event
const SHAKE_WINDOW_MS = 1000  // time window to detect sustained shaking
const SHAKE_MIN_EVENTS = 4    // shake events needed to trigger

let accelerationHistory = []
let shakeListenerActive = false
let shakeCallback = null

/**
 * Start watching the accelerometer for a shake gesture.
 *
 * @param {object} options
 * @param {function} options.onShake — called when shake detected
 * @param {number} options.threshold — acceleration threshold (default 15)
 * @param {number} options.minEvents — shakes needed in window (default 4)
 * @param {number} options.windowMs — detection window (default 1000ms)
 */
export function initPanicShake(options = {}) {
  if (shakeListenerActive) return

  const threshold = options.threshold || SHAKE_THRESHOLD
  const minEvents = options.minEvents || SHAKE_MIN_EVENTS
  const windowMs = options.windowMs || SHAKE_WINDOW_MS
  shakeCallback = options.onShake || (() => panic())

  if (typeof window === 'undefined' || !window.DeviceMotionEvent) {
    console.warn('[panic] DeviceMotion not available on this device')
    return
  }

  shakeListenerActive = true
  window.addEventListener('devicemotion', handleMotion)
  accelerationHistory = []

  function handleMotion(event) {
    if (!shakeListenerActive) return

    const acc = event.accelerationIncludingGravity
    if (!acc) return

    const x = acc.x || 0
    const y = acc.y || 0
    const z = acc.z || 0
    const magnitude = Math.sqrt(x * x + y * y + z * z)

    if (magnitude > threshold) {
      const now = Date.now()
      accelerationHistory.push(now)

      // Prune events outside the detection window
      accelerationHistory = accelerationHistory.filter(t => now - t < windowMs)

      if (accelerationHistory.length >= minEvents) {
        // Shake detected!
        shakeListenerActive = false
        window.removeEventListener('devicemotion', handleMotion)
        if (shakeCallback) shakeCallback()
      }
    }
  }
}

/**
 * Stop the accelerometer listener.
 */
export function shutdown() {
  shakeListenerActive = false
  if (typeof window !== 'undefined') {
    // Can't reference the exact handler without keeping a ref,
    // but setting active=false stops processing
  }
}

// ─── Panic execution ──────────────────────────────────────────────────────────

/**
 * Execute the full panic sequence:
 *
 * Phase 1 — Crypto wipe (instant)
 *   - Destroy sealed AES-GCM key → all messages become unrecoverable
 *   - Wipe Olm sessions from localStorage (7-pass)
 *   - Wipe identity keys (7-pass)
 *
 * Phase 2 — Data wipe (async)
 *   - Wipe all in-memory messages (7-pass overwrite)
 *   - Clear peer key bundles
 *
 * Phase 3 — UI reset
 *   - Reset connection state
 *   - Navigate to safe screen
 *   - Optionally redirect to decoy URL
 *
 * @param {object} options
 * @param {string} options.decoyUrl — URL to navigate to after panic (e.g. 'https://google.com')
 * @param {boolean} options.silent — if true, don't show any UI feedback
 */
export async function panic(options = {}) {
  console.log('[panic] ⚠️ PANIC SEQUENCE INITIATED')

  // Stop ephemeral sweep (no point wiping on a timer when we're doing it now)
  stopSweep()

  // ── Phase 1: Crypto wipe ──
  console.log('[panic] Destroying sealed encryption key...')
  await destroyKey().catch(() => {})

  console.log('[panic] Destroying IndexedDB vault...')
  await destroyVault().catch(() => {})

  console.log('[panic] Wiping in-memory content...')
  wipeAllMemory()

  console.log('[panic] Wiping Olm sessions from localStorage...')
  const sessionsWiped = secureWipeLocalStorage('squawk_session_')
  console.log(`[panic] Wiped ${sessionsWiped} sessions`)

  console.log('[panic] Wiping identity keys...')
  secureWipeLocalStorage('squawk_identity')

  console.log('[panic] Wiping peer key bundle cache...')
  secureWipeLocalStorage('squawk_peer_')

  // ── Phase 2: Data wipe ──
  console.log('[panic] Wiping all messages from persistent store...')
  await persistentMessages.wipeAll().catch(() => {})

  console.log('[panic] Wiping all messages from legacy store...')
  secureWipeAll(messages)

  console.log('[panic] Clearing peer state...')
  myPeerId.set('')
  connectionStatus.set('disconnected')
  onlinePeers.set(new Set())
  peerKeyBundles.set({})

  // ── Phase 3: UI reset ──
  // Clear any remaining localStorage items
  // (squawk_ prefix covers identity, sessions, contacts, peer keys)
  try {
    const storeKeys = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('squawk_')) storeKeys.push(key)
    }
    for (const key of storeKeys) {
      // Overwrite with random data
      const value = localStorage.getItem(key) || ''
      const random = window.crypto.getRandomValues(new Uint8Array(value.length || 64))
      let overwrite = ''
      for (let j = 0; j < (value.length || 64); j++) {
        overwrite += String.fromCharCode(random[j % random.length])
      }
      localStorage.setItem(key, overwrite)
      localStorage.removeItem(key)
    }
  } catch (err) {
    console.warn('[panic] localStorage wipe error:', err)
  }

  console.log('[panic] ✅ Panic sequence complete')

  // Navigate to decoy if specified
  if (options.decoyUrl) {
    window.location.href = options.decoyUrl
  }
}
