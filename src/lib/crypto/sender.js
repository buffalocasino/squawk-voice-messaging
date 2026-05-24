/**
 * Shared sender reference — set by PeerConnection.svelte once data channel is open.
 * Used by App.svelte to send encrypted messages / voice blobs.
 */
export let sender = null

export function registerSender(fn) {
  sender = fn
}

export function unregisterSender() {
  sender = null
}