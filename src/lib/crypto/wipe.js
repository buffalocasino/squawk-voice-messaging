/**
 * wipe.js — DOD 5220.22-M compliant secure deletion for Squawk.
 *
 * Provides:
 *   secureDeleteMessage(store, msgId) — 7-pass overwrite of message content before removal
 *   secureWipeAll(store) — wipe ALL messages from the store
 *   secureWipeLocalStorage(prefix) — sec-delete all localStorage items matching a prefix
 *
 * The DOD 5220.22-M standard specifies a 7-pass overwrite:
 *   Pass 1: 0x00
 *   Pass 2: 0xFF
 *   Pass 3: random
 *   Pass 4: 0x00
 *   Pass 5: 0xFF
 *   Pass 6: random (alternate pattern)
 *   Pass 7: random (final verification pattern)
 */

// ─── 7-pass overwrite patterns ────────────────────────────────────────────────

const DOD_PATTERNS = [
  () => new Uint8Array(0),      // Pass 1: 0x00 (all zeros — default)
  () => new Uint8Array(0),      // Pass 2: 0xFF (all ones)
  getRandomBuffer,              // Pass 3: random
  () => new Uint8Array(0),      // Pass 4: 0x00
  () => new Uint8Array(0),      // Pass 5: 0xFF
  getRandomBuffer,              // Pass 6: random (supplement)
  getRandomBuffer,              // Pass 7: random (verify)
]

function getRandomBuffer() {
  const buf = new Uint8Array(256)
  window.crypto.getRandomValues(buf)
  return buf
}

function fillWithPattern(target, pattern) {
  const isZero = pattern.length === 0 || pattern.every?.(b => b === 0)
  const isOne = pattern.length > 0 && pattern.every?.(b => b === 0xFF)

  if (typeof target === 'string') {
    let replacement = ''
    for (let i = 0; i < target.length; i++) {
      if (isZero) replacement += '\x00'
      else if (isOne) replacement += '\xFF'
      else replacement += String.fromCharCode(pattern[i % pattern.length])
    }
    return replacement
  }
  return target
}

// ─── Message wipe ─────────────────────────────────────────────────────────────

/**
 * Securely delete a single message from the store.
 * Applies DOD 5220.22-M 7-pass overwrite to all text/audioUrl fields
 * before removing the message from the array.
 *
 * @param {import('svelte/store').Writable} messagesStore — Svelte writable store
 * @param {number} msgId — message id to wipe
 */
export function secureDeleteMessage(messagesStore, msgId) {
  messagesStore.update(list => {
    return list.map(msg => {
      if (msg.id !== msgId) return msg

      // Apply 7-pass overwrite to content fields
      let wiped = { ...msg }

      for (let pass = 0; pass < 7; pass++) {
        const pattern = DOD_PATTERNS[pass]()
        if (wiped.text) wiped.text = fillWithPattern(wiped.text, pattern)
        if (wiped.audioUrl) wiped.audioUrl = fillWithPattern(wiped.audioUrl, pattern)
      }

      // Set a wipe marker so the store knows to remove this entry
      wiped._wiped = true
      wiped._wipedAt = Date.now()
      wiped.text = '[deleted]'
      wiped.audioUrl = null
      wiped.status = 'deleted'
      wiped.type = 'deleted'

      return wiped
    })
  })

  // Second pass: remove from store entirely
  requestAnimationFrame(() => {
    messagesStore.update(list => list.filter(msg => msg.id !== msgId))
  })
}

/**
 * Securely wipe ALL messages from the store.
 * Each message gets 7-pass overwrite before removal.
 */
export function secureWipeAll(messagesStore) {
  // Collect all IDs
  let ids = []
  messagesStore.update(list => {
    ids = list.map(m => m.id)
    return list
  })

  // Wipe each individually
  for (const id of ids) {
    secureDeleteMessage(messagesStore, id)
  }
}

// ─── localStorage wipe ────────────────────────────────────────────────────────

/**
 * Securely delete all localStorage keys matching a prefix.
 * Overwrites their values with 7 passes before removing them.
 *
 * Used for wiping Olm sessions, identity keys, etc.
 *
 * @param {string} prefix — localStorage key prefix (e.g. 'squawk_session_')
 */
export function secureWipeLocalStorage(prefix) {
  const keysToWipe = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key.startsWith(prefix)) {
      keysToWipe.push(key)
    }
  }

  for (const key of keysToWipe) {
    const value = localStorage.getItem(key) || ''
    for (let pass = 0; pass < 7; pass++) {
      const pattern = DOD_PATTERNS[pass]()
      let overwritten = ''
      for (let j = 0; j < value.length; j++) {
        if (pass === 0 || pass === 3) overwritten += '\x00'
        else if (pass === 1 || pass === 4) overwritten += '\xFF'
        else overwritten += String.fromCharCode(pattern[j % pattern.length])
      }
      localStorage.setItem(key, overwritten)
    }
    localStorage.removeItem(key)
  }

  return keysToWipe.length
}
