/**
 * Session Manager — wraps the Web Crypto ECDH session operations.
 * Exports compat shims for the old Olm-based API.
 */
import { createSession, hasSession, removeSession, encrypt, decrypt, getKeyBundle } from './olm.js'

export { initOlm, isOlmReady, loadIdentityKeys, saveIdentityKeys } from './olm.js'

export async function getOrCreateSession(peerId, side, keyBundle) {
  if (!hasSession(peerId)) {
    await createSession(peerId, keyBundle.identityKey)
  }
  return true
}

export async function encryptForPeer(peerId, plaintext) {
  const result = await encrypt(peerId, plaintext)
  return { type: 'crypto_message', body: JSON.stringify(result) }
}

export async function decryptFromPeer(peerId, body) {
  const envelope = JSON.parse(body)
  return decrypt(peerId, envelope.iv, envelope.ct)
}

// List sessions from in-memory Map
export function listSessions() {
  return [] // Web Crypto sessions are in-memory only, not persisted
}
