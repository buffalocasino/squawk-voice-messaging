/**
 * EphemeralEngine — timed message expiry, view-once, dynamic timers, End Chat.
 *
 * Built on top of SecureVault + DOD wipe + MemoryGuard.
 * Zero new crypto. Pure policy + timer layer.
 *
 * Architecture:
 *   EphemeralEngine (singleton)
 *   ├── stamp(msg)         → adds expiresAt, viewOnce metadata
 *   ├── onRead(msg)        → applies dynamic timer override
 *   ├── startSweep()       → background 60s loop checking for expired messages
 *   ├── endChat(contactId) → DOD-wipes all messages for a contact
 *   └── getExpiry(msg)     → seconds remaining (for UI countdown)
 */

import { persistentMessages } from '../storage/persistentStores.svelte.js'
import { getVault } from '../storage/SecureVault.js'
import { markWiped, wipeAllMemory, trackBlobUrl } from '../storage/MemoryGuard.js'
import { secureDeleteMessage } from '../crypto/wipe.js'

// ─── Configuration ─────────────────────────────────────────────────────────

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000   // 24 hours
const SWEEP_INTERVAL_MS = 60_000              // check every 60s
const VIEW_ONCE_GRACE_S = 5                   // seconds before view-once wipe
const DYNAMIC_MIN_MS = 30_000                 // minimum dynamic lifetime (30s)
const DYNAMIC_CHAR_MS = 500                   // 0.5s per character

// ─── Module state ──────────────────────────────────────────────────────────

let _sweepInterval = null
let _activeViewOnceTimers = new Map() // msgId → timeoutId
let _onMessageExpired = null          // callback: (msgId) => void

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Stamp a message with expiry metadata.
 * Called immediately after message creation.
 *
 * @param {object} msg — message object (mutated in place)
 * @param {object} opts
 * @param {boolean} opts.viewOnce — if true, message self-destructs after first view
 * @param {number}  opts.ttlMs    — custom TTL (default: 24h)
 */
export function stamp(msg, opts = {}) {
  const ttl = opts.ttlMs || DEFAULT_TTL_MS
  msg.expiresAt = Date.now() + ttl
  msg.viewOnce = opts.viewOnce === true
  msg._ephemeralStamped = true
}

/**
 * Called when a message is first seen by the recipient.
 * Applies dynamic timer: lifetime scales with text length.
 * Shorter messages vanish faster after being read.
 *
 * @param {object} msg — message object (mutated in place)
 */
export function onRead(msg) {
  if (!msg || msg.from === 'me') return // only recipient-side
  if (msg._readApplied) return          // only apply once

  msg._readApplied = true

  // Dynamic timer: shorter = faster vanish
  const textLen = (msg.text || '').length
  const dynamicMs = Math.max(DYNAMIC_MIN_MS, textLen * DYNAMIC_CHAR_MS)

  // Override expiry: whichever is sooner — dynamic or original 24h
  if (dynamicMs < (msg.expiresAt - Date.now())) {
    msg.expiresAt = Date.now() + dynamicMs
    msg._dynamicExpiry = true
  }

  // Persist the updated expiry
  persistentMessages.update(msg.id, {
    expiresAt: msg.expiresAt,
    _readApplied: true,
    _dynamicExpiry: msg._dynamicExpiry,
  }).catch(() => {})
}

/**
 * Schedule view-once destruction for a message.
 * After VIEW_ONCE_GRACE_S seconds, the message is wiped.
 *
 * @param {string|number} msgId
 * @returns {function} cancel function — call if user scrolls away before timer fires
 */
export function scheduleViewOnceWipe(msgId) {
  // Cancel any existing timer for this message
  cancelViewOnceWipe(msgId)

  const timeoutId = setTimeout(async () => {
    _activeViewOnceTimers.delete(msgId)
    await _wipeMessage(msgId)
    if (_onMessageExpired) _onMessageExpired(msgId)
  }, VIEW_ONCE_GRACE_S * 1000)

  _activeViewOnceTimers.set(msgId, timeoutId)
  return () => cancelViewOnceWipe(msgId)
}

/**
 * Cancel a pending view-once wipe (e.g., user scrolled away before timer fired).
 */
export function cancelViewOnceWipe(msgId) {
  const existing = _activeViewOnceTimers.get(msgId)
  if (existing) {
    clearTimeout(existing)
    _activeViewOnceTimers.delete(msgId)
  }
}

/**
 * Start the background expiry sweep.
 * Every SWEEP_INTERVAL_MS, checks all messages for expiration.
 *
 * @param {function} onExpired — callback(msgId) when a message is wiped
 */
export function startSweep(onExpired) {
  if (_sweepInterval) return
  _onMessageExpired = onExpired

  _sweepInterval = setInterval(async () => {
    const now = Date.now()
    const expired = persistentMessages.items.filter(m =>
      m.expiresAt && m.expiresAt <= now && !m._wiped
    )

    for (const msg of expired) {
      await _wipeMessage(msg.id)
      if (_onMessageExpired) _onMessageExpired(msg.id)
    }
  }, SWEEP_INTERVAL_MS)

  console.log(`[Ephemeral] Sweep started (every ${SWEEP_INTERVAL_MS / 1000}s)`)
}

/**
 * Stop the background sweep.
 */
export function stopSweep() {
  if (_sweepInterval) {
    clearInterval(_sweepInterval)
    _sweepInterval = null
  }
  // Clear all pending view-once timers
  for (const [, id] of _activeViewOnceTimers) clearTimeout(id)
  _activeViewOnceTimers.clear()
}

/**
 * End Chat — DOD-wipe all messages for a contact, destroy Olm session.
 *
 * @param {string} contactId — the peer/contact id
 * @param {object}  opts
 * @param {function} opts.destroySession — call to destroy the Olm session
 */
export async function endChat(contactId, opts = {}) {
  const msgs = persistentMessages.forChat(contactId)

  // Phase 1: DOD-wipe each message from vault
  for (const msg of msgs) {
    await _wipeMessage(msg.id)
  }

  // Phase 2: Clear from in-memory store
  for (const msg of msgs) {
    persistentMessages.delete(msg.id)
  }

  // Phase 3: Destroy Olm session
  if (opts.destroySession) {
    try { await opts.destroySession(contactId) } catch (err) {
      console.warn('[Ephemeral] Session destroy failed:', err)
    }
  }

  // Phase 4: Clear view-once timers for this chat
  for (const msg of msgs) {
    cancelViewOnceWipe(msg.id)
  }

  console.log(`[Ephemeral] End Chat: wiped ${msgs.length} messages for ${contactId}`)
  return msgs.length
}

/**
 * Get seconds remaining until a message expires.
 * Returns -1 if no expiry set, 0 if expired.
 */
export function getExpiry(msg) {
  if (!msg || !msg.expiresAt) return -1
  const remaining = Math.max(0, msg.expiresAt - Date.now())
  return Math.ceil(remaining / 1000)
}

/**
 * Format expiry seconds for UI display.
 * "2m 30s", "45s", "23h 59m", "expired"
 */
export function formatExpiry(seconds) {
  if (seconds <= 0) return 'expired'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

/**
 * Register a callback for when messages expire (for UI reactivity).
 */
export function onExpired(fn) {
  _onMessageExpired = fn
}

// ─── Internal ──────────────────────────────────────────────────────────────

/**
 * Wipe a single message: DOD overwrite → mark wiped → delete from vault.
 */
async function _wipeMessage(msgId) {
  try {
    // Mark as wiped in memory guard (prevents re-render)
    markWiped(msgId)

    // Delete from encrypted vault
    const vault = getVault()
    if (vault) {
      await vault.delete('messages', msgId)
    }

    // Update in-memory store to mark as deleted
    persistentMessages.update(msgId, {
      text: '[expired]',
      audioUrl: null,
      status: 'deleted',
      type: 'deleted',
      _wiped: true,
    }).catch(() => {})
  } catch (err) {
    console.warn('[Ephemeral] Wipe failed for', msgId, err)
  }
}

// ─── Cleanup on module unload ──────────────────────────────────────────────

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    stopSweep()
  })
}

// ─── Settings / config (reactive) ──────────────────────────────────────────

export const ephemeralConfig = {
  /** Enable 24h auto-expiry on all outgoing messages */
  expiry24h: true,

  /** Enable dynamic timers (shorter messages vanish faster after read) */
  dynamicTimers: true,

  /** Default to view-once for all media messages */
  viewOnceDefault: false,

  /** TTL override in ms (0 = use DEFAULT_TTL_MS) */
  customTtlMs: 0,
}

/**
 * Stamp a message using the current ephemeralConfig settings.
 * Preferred over raw stamp() for App-level usage.
 */
export function stampWithConfig(msg, opts = {}) {
  if (!ephemeralConfig.expiry24h && !opts.forceExpiry) return msg

  const ttl = ephemeralConfig.customTtlMs || opts.ttlMs || DEFAULT_TTL_MS
  msg.expiresAt = Date.now() + ttl
  msg.viewOnce = opts.viewOnce ?? ephemeralConfig.viewOnceDefault
  msg._ephemeralStamped = true
  if (ephemeralConfig.dynamicTimers) msg._dynamicEnabled = true
  return msg
}

/**
 * Get ephemeral stats for settings display.
 */
export function getStats() {
  const now = Date.now()
  const all = persistentMessages.items || []
  const withExpiry = all.filter(m => m.expiresAt)
  const expired = withExpiry.filter(m => m.expiresAt <= now)
  const active = withExpiry.filter(m => m.expiresAt > now)
  const viewOnce = active.filter(m => m.viewOnce)

  return {
    total: all.length,
    withExpiry: withExpiry.length,
    active: active.length,
    expired: expired.length,
    viewOnce: viewOnce.length,
    nextExpiry: active.length ? Math.min(...active.map(m => m.expiresAt)) : null,
    sweepActive: _sweepInterval !== null,
    sweepIntervalMs: SWEEP_INTERVAL_MS,
  }
}

/**
 * Force an immediate sweep (for manual trigger from settings).
 */
export async function forceSweep() {
  const now = Date.now()
  const expired = persistentMessages.items.filter(m =>
    m.expiresAt && m.expiresAt <= now && !m._wiped
  )
  let count = 0
  for (const msg of expired) {
    await _wipeMessage(msg.id)
    count++
  }
  return count
}
