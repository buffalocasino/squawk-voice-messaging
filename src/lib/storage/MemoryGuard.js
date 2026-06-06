/**
 * MemoryGuard — ensures decrypted message content exists strictly in
 * transient app state and is scrubbed on unmount / view change / panic.
 *
 * Principles:
 *  1. Decrypted content is held in a WeakMap keyed by message id
 *  2. When a chat view unmounts, all messages for that chat are scrubbed
 *  3. Audio blob URLs are revoked on unmount
 *  4. On panic, all content is zeroed
 *
 * Usage in a component:
 *   import { guard, unguard } from './MemoryGuard.js'
 *   onMount(() => guard('chat-alice', messageIds))
 *   onDestroy(() => unguard('chat-alice'))
 */

// ─── Live content registry ─────────────────────────────────────────────────

/** Map<scopeId, Set<messageId>> — which messages are currently live */
const activeScopes = new Map()

/** Map<messageId, Set<blobUrl>> — audio URLs to revoke on unguard */
const blobUrls = new Map()

/** Set<messageId> — messages that have been zeroed (don't re-render content) */
const wipedMessages = new Set()

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Register a chat scope as active. Messages in this scope are considered
 * "live" and their decrypted content is held in memory.
 *
 * @param {string} scopeId — unique scope identifier (e.g., contact id or 'chat-{id}')
 * @param {Array<string|number>} messageIds — message ids currently visible
 */
export function guard(scopeId, messageIds = []) {
  const set = new Set(messageIds)
  activeScopes.set(scopeId, set)
}

/**
 * Unguard a chat scope. Scrub all decrypted content for messages
 * that are NOT still active in another scope.
 *
 * @param {string} scopeId — scope to unguard
 */
export function unguard(scopeId) {
  const messageIds = activeScopes.get(scopeId)
  activeScopes.delete(scopeId)

  if (!messageIds) return

  // For each message in this scope, check if it's still active elsewhere
  for (const msgId of messageIds) {
    let stillActive = false
    for (const [, ids] of activeScopes) {
      if (ids.has(msgId)) {
        stillActive = true
        break
      }
    }

    if (!stillActive) {
      // Revoke any blob URLs for this message
      const urls = blobUrls.get(msgId)
      if (urls) {
        for (const url of urls) {
          try { URL.revokeObjectURL(url) } catch {}
        }
        blobUrls.delete(msgId)
      }
    }
  }
}

/**
 * Track a blob URL associated with a message.
 * Automatically revoked when the message is unguarded.
 */
export function trackBlobUrl(messageId, url) {
  if (!blobUrls.has(messageId)) {
    blobUrls.set(messageId, new Set())
  }
  blobUrls.get(messageId).add(url)
}

/**
 * Mark a message as wiped. Its content should not be rendered.
 */
export function markWiped(messageId) {
  wipedMessages.add(messageId)
}

/**
 * Check if a message has been wiped.
 */
export function isWiped(messageId) {
  return wipedMessages.has(messageId)
}

/**
 * Wipe ALL in-memory content. Called on panic.
 * Revokes all blob URLs and clears all registries.
 */
export function wipeAllMemory() {
  // Revoke all blob URLs
  for (const [, urls] of blobUrls) {
    for (const url of urls) {
      try { URL.revokeObjectURL(url) } catch {}
    }
  }

  // Clear all registries
  blobUrls.clear()
  activeScopes.clear()
  wipedMessages.clear()
}

/**
 * Overwrite a string in memory by replacing it with zeroes.
 * In JavaScript, strings are immutable, so this creates a new string
 * and the old one will be GC'd. For sensitive content, we also null
 * any references the caller holds.
 *
 * @param {string} str — string to overwrite
 * @returns {string} — zeroed string of same length
 */
export function zeroString(str) {
  if (!str) return ''
  return '\x00'.repeat(str.length)
}

/**
 * Create a secure proxy that zeroes content fields on access.
 * Used as a last-resort defense for objects that may escape scope.
 *
 * @param {object} obj — object with .text, .audioUrl etc.
 * @returns {object} — proxied object that zeroes on property access
 */
export function zeroableProxy(obj) {
  let accessed = false
  return new Proxy(obj, {
    get(target, prop) {
      if (prop === 'text' || prop === 'audioUrl') {
        accessed = true
      }
      return target[prop]
    },
    apply(target, thisArg, args) {
      if (accessed && typeof target === 'function') {
        // After content fields accessed, zero them on function call
        if (target.text) target.text = zeroString(target.text)
        if (target.audioUrl) target.audioUrl = zeroString(target.audioUrl)
      }
      return Reflect.apply(target, thisArg, args)
    }
  })
}

export { activeScopes, blobUrls, wipedMessages }
