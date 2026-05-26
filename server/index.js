import { WebSocketServer } from 'ws'

let PORT = process.env.PORT || 8443; // Prioritize 8443 based on Tailscale
// Ensure binding to all interfaces (0.0.0.0)
const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' })

// Peer registry: peerId -> { ws, keyBundle, lastSeen, connectedAt }
const peers = new Map()

function broadcast(senderId, message) {
  const data = JSON.stringify(message)
  for (const [peerId, peer] of peers) {
    if (peerId !== senderId && peer.ws.readyState === 1) {
      peer.ws.send(data)
    }
  }
}

function sendTo(targetId, message) {
  const peer = peers.get(targetId)
  if (peer && peer.ws.readyState === 1) {
    peer.ws.send(JSON.stringify(message))
    return true
  }
  return false
}

wss.on('connection', (ws) => {
  let myPeerId = null

  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw) } catch { return }

    switch (msg.type) {

      case 'register': {
        if (myPeerId) peers.delete(myPeerId)
        myPeerId = msg.peerId
        peers.set(myPeerId, {
          ws,
          keyBundle: msg.keyBundle || null,
          lastSeen: Date.now(),
          connectedAt: Date.now(),
        })
        console.log(`[+] ${myPeerId} registered (${peers.size} peers)`)
        // Broadcast our arrival to all peers so they know we're online
        broadcast(myPeerId, { type: 'peer_online', peerId: myPeerId, keyBundle: msg.keyBundle })
        break
      }

      case 'prekey_request': {
        // A peer is requesting our key bundle so they can initiate an Olm session
        const target = peers.get(msg.to)
        if (target && target.keyBundle) {
          // Send our bundle directly to the requester
          sendTo(msg.from, {
            type: 'prekey_response',
            from: msg.to,
            to: msg.from,
            keyBundle: target.keyBundle,
          })
        } else {
          // We don't have a key bundle yet — request it from the target
          sendTo(msg.to, {
            type: 'prekey_request',
            from: msg.from,
            to: msg.to,
          })
        }
        break
      }

      case 'offer': {
        // WebRTC SDP offer — forward with optional key bundle
        sendTo(msg.to, {
          type: 'offer',
          from: msg.from,
          to: msg.to,
          sdp: msg.sdp,
          keyBundle: msg.keyBundle || null,
        })
        break
      }

      case 'answer': {
        sendTo(msg.to, { type: 'answer', from: msg.from, to: msg.to, sdp: msg.sdp })
        break
      }

      case 'ice': {
        if (!msg.to) break
        sendTo(msg.to, { type: 'ice', from: msg.from, to: msg.to, candidate: msg.candidate })
        break
      }

      case 'direct': {
        // App-level encrypted payload relay
        if (!msg.to) break
        sendTo(msg.to, { type: 'direct', from: myPeerId, payload: msg.payload, id: msg.id })
        break
      }

      case 'peer_online': {
        // New peer announced themselves — update contact list in clients
        console.log(`[~] ${msg.peerId} is online`)
        break
      }

      case 'ping': {
        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }))
        break
      }

      default:
        console.warn('Unknown message type:', msg.type)
    }
  })

  ws.on('close', () => {
    if (myPeerId) {
      peers.delete(myPeerId)
      broadcast(myPeerId, { type: 'peer_offline', peerId: myPeerId })
      console.log(`[-] ${myPeerId} disconnected (${peers.size} peers)`)
    }
  })

  ws.on('error', (err) => {
    console.error('WS error:', err.message)
    if (myPeerId) peers.delete(myPeerId)
  })
})

// Keepalive + clean stale entries
setInterval(() => {
  for (const [peerId, peer] of peers) {
    if (peer.ws.readyState === 1) {
      peer.lastSeen = Date.now()
    }
  }
}, 30_000)

console.log(`Squawk signaling server running on ws://0.0.0.0:${PORT}`)