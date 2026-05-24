import { writable } from 'svelte/store'

// Static demo contacts — in production these come from the signaling server
export const contacts = writable([
  { id: 1, name: 'Alice',   peerId: 'peer-alice-001',   status: 'offline', keyBundle: null },
  { id: 2, name: 'Bob',     peerId: 'peer-bob-002',     status: 'offline', keyBundle: null },
  { id: 3, name: 'Charlie', peerId: 'peer-charlie-003',  status: 'offline', keyBundle: null },
])

export const messages = writable([])
export const selectedContact = writable(null)
export const isRecording = writable(false)
export const recordingDuration = writable(0)
export const connectionStatus = writable('disconnected')
export const myPeerId = writable('')

/** Dynamically tracked peer key bundles from the signaling server */
export const peerKeyBundles = writable({}) // peerId -> { identityKey, oneTimeKey }

/** Online peers registry — updated on peer_online / peer_offline signals */
export const onlinePeers = writable(new Set())

export function updatePeerStatus(peerId, status, keyBundle = null) {
  peerKeyBundles.update(bundles => {
    const updated = { ...bundles }
    if (keyBundle) updated[peerId] = keyBundle
    return updated
  })
  onlinePeers.update(peers => {
    const next = new Set(peers)
    if (status === 'online') next.add(peerId)
    else next.delete(peerId)
    return next
  })
  contacts.update(list =>
    list.map(c =>
      c.peerId === peerId
        ? { ...c, status: status === 'online' ? 'online' : 'offline' }
        : c
    )
  )
}