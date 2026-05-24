/**
 * Olm wrapper — Double Ratchet E2EE via @matrix-org/olm WASM.
 * Each peer has one Olm Account (identity key pair). Each conversation
 * gets its own Olm Session (Double Ratchet state machine).
 */
import { initOlm, loadOrCreateIdentityKeys, saveIdentityKeys, loadIdentityKeys } from './olm.js'

export { initOlm, loadOrCreateIdentityKeys, saveIdentityKeys, loadIdentityKeys, isOlmReady } from './olm.js'

// ─── Session registry ────────────────────────────────────────────────────────
// One active Olm.Session per peer, stored in memory for performance.
// Persisted (pickled) to localStorage so sessions survive page reloads.

const SESSION_PREFIX = 'squawk_session_'

/** In-memory cache: peerId → { session, side } */
const activeSessions = new Map()

/**
 * Get (or create) an Olm Session for a peer.
 * Side 'outbound' = we initiated the conversation.
 * Side 'inbound' = they initiated (we received a pre-key bundle).
 */
export async function getOrCreateSession(peerId, side, keyBundle = null) {
  // Check if already created by a concurrent call before acquiring the session
  if (activeSessions.has(peerId)) {
    return activeSessions.get(peerId).session
  }

  // Import olm lazily so we don't block render
  const { createOutboundSession, createInboundSession } = await import('./olm.js')

  let session
  const sessionId = `${side}_${peerId}`
  if (side === 'outbound') {
    if (!keyBundle?.identityKey || !keyBundle?.oneTimeKey) {
      throw new Error('Outbound session requires keyBundle with identityKey and oneTimeKey')
    }
    await createOutboundSession(keyBundle.identityKey, keyBundle.oneTimeKey, peerId)
  } else {
    if (!keyBundle?.identityKey || !keyBundle?.oneTimeKey) {
      throw new Error('Inbound session requires keyBundle with identityKey and oneTimeKey')
    }
    await createInboundSession(keyBundle.identityKey, keyBundle.oneTimeKey, peerId)
  }

  // Load the pickled session into memory
  const { loadSession } = await import('./olm.js')
  session = loadSession(sessionId)
  if (!session) throw new Error(`Failed to load session for ${peerId}`)

  activeSessions.set(peerId, { session, side })
  return session
}

/**
 * Encrypt a plaintext payload for a specific peer.
 * Returns { type, body } suitable for the Olm message envelope.
 */
export async function encryptForPeer(peerId, plaintext) {
  const entry = activeSessions.get(peerId)
  if (!entry) throw new Error(`No session for peer: ${peerId}`)
  const { encrypt } = await import('./olm.js')
  const body = await encrypt(`outbound_${peerId}`, plaintext)
  return { type: 'olm_message', body }
}

/**
 * Decrypt an Olm ciphertext body from a specific peer.
 * Returns the plaintext string.
 */
export async function decryptFromPeer(peerId, body) {
  const entry = activeSessions.get(peerId)
  if (!entry) throw new Error(`No session for peer: ${peerId}`)
  const { decrypt } = await import('./olm.js')
  const sessionId = entry.side === 'outbound' ? `outbound_${peerId}` : `inbound_${peerId}`
  return decrypt(sessionId, body)
}

/** True if we have an active Olm session for this peer */
export function hasSession(peerId) {
  return activeSessions.has(peerId)
}

/** Remove session for a peer (e.g. on disconnect) */
export function removeSession(peerId) {
  activeSessions.delete(peerId)
}