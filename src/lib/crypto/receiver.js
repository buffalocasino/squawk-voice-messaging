/**
 * Receiver — decrypts and dispatches incoming Olm messages.
 * Extracted from PeerConnection.svelte for testability.
 *
 * Usage:
 *   const { handleEncryptedMessage } = await import('./crypto/receiver.js')
 *   await handleEncryptedMessage(msg.from, msg.body)
 */
import { decryptFromPeer, hasSession } from './sessionManager.js'
import { messages } from '../../stores.js'

/**
 * Handle an encrypted message from a peer.
 * Returns the parsed payload on success, null on failure.
 */
export async function handleEncryptedMessage(from, body) {
  if (!hasSession(from)) {
    console.warn('[receiver] No session for', from)
    return null
  }
  try {
    const plaintext = await decryptFromPeer(from, body)
    const payload = JSON.parse(plaintext)
    messages.update(m => [
      ...m,
      {
        id: payload.id || Date.now(),
        type: payload.type || 'audio',
        text: payload.text,
        audioUrl: payload.audioUrl,
        duration: payload.duration,
        from,
        time: Date.now(),
        received: true,
      },
    ])
    return payload
  } catch (err) {
    console.error('[receiver] Decrypt failed:', err)
    return null
  }
}