// Squawk Voice Messaging — WebSocket Signaling Server
// Deploy target: tvashtar VPS via Tailscale
// Purpose: relay WebRTC offer/answer/ICE between peers — no media routing

import { WebSocketServer, WebSocket } from 'ws';

const PORT = process.env.PORT || 8443;
const PEER_TTL_MS = 5 * 60 * 1000; // 5 min idle timeout

// Peer registry: peerId -> { ws, identity, lastSeen }
const peers = new Map();

// Message types
const MSG = {
  REGISTER: 'register',
  OFFER: 'offer',
  ANSWER: 'answer',
  ICE: 'ice',
  LEAVE: 'leave',
  PEER_LIST: 'peer_list',
  ERROR: 'error',
};

// Generate a short peer ID
function genPeerId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// Broadcast to all peers except sender
function broadcast(senderId, msg) {
  const data = JSON.stringify({ ...msg, from: senderId });
  for (const [id, peer] of peers) {
    if (id !== senderId && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(data);
    }
  }
}

// Send to specific peer
function sendTo(peerId, msg) {
  const peer = peers.get(peerId);
  if (peer && peer.ws.readyState === WebSocket.OPEN) {
    peer.ws.send(JSON.stringify(msg));
  }
}

// Clean up stale peers every 60s
setInterval(() => {
  const now = Date.now();
  for (const [id, peer] of peers) {
    if (now - peer.lastSeen > PEER_TTL_MS) {
      peer.ws.close(1000, 'idle timeout');
      peers.delete(id);
      console.log(`[signaling] peer ${id} timed out`);
    }
  }
}, 60_000);

const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });

wss.on('listening', () => {
  console.log(`[signaling] Squawk signaling server listening on 0.0.0.0:${PORT}`);
});

wss.on('connection', (ws, req) => {
  let peerId = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ type: MSG.ERROR, error: 'invalid JSON' }));
      return;
    }

    switch (msg.type) {
      case MSG.REGISTER: {
        // Client registers with an identity hint
        if (peerId) {
          // Already registered, ignore
          break;
        }
        peerId = genPeerId();
        const identity = (msg.identity || '').slice(0, 64);
        peers.set(peerId, { ws, identity, lastSeen: Date.now() });
        console.log(`[signaling] peer registered: ${peerId} (${identity})`);

        // Send back peer list (excluding self)
        const peerList = [];
        for (const [id, p] of peers) {
          if (id !== peerId) {
            peerList.push({ peerId: id, identity: p.identity });
          }
        }

        ws.send(JSON.stringify({
          type: MSG.PEER_LIST,
          peerId,
          peers: peerList,
        }));
        break;
      }

      case MSG.OFFER:
      case MSG.ANSWER:
      case MSG.ICE: {
        // Relay to target peer
        if (!peerId) {
          ws.send(JSON.stringify({ type: MSG.ERROR, error: 'not registered' }));
          break;
        }
        if (!msg.to) {
          ws.send(JSON.stringify({ type: MSG.ERROR, error: 'missing "to" field' }));
          break;
        }
        const targetPeer = peers.get(msg.to);
        if (!targetPeer) {
          ws.send(JSON.stringify({ type: MSG.ERROR, error: `peer ${msg.to} not found` }));
          break;
        }
        // Relay the signaling message with sender
        const relay = { type: msg.type, sdp: msg.sdp, candidate: msg.candidate, from: peerId };
        targetPeer.ws.send(JSON.stringify(relay));
        targetPeer.lastSeen = Date.now();
        peers.get(peerId).lastSeen = Date.now();
        console.log(`[signaling] ${msg.type} relayed ${peerId} → ${msg.to}`);
        break;
      }

      case MSG.LEAVE: {
        if (peerId) {
          peers.delete(peerId);
          console.log(`[signaling] peer ${peerId} left`);
        }
        break;
      }

      default:
        ws.send(JSON.stringify({ type: MSG.ERROR, error: `unknown type: ${msg.type}` }));
    }
  });

  ws.on('close', () => {
    if (peerId) {
      // Notify others
      broadcast(peerId, { type: MSG.LEAVE });
      peers.delete(peerId);
      console.log(`[signaling] peer ${peerId} disconnected`);
    }
  });

  ws.on('error', (err) => {
    console.error(`[signaling] ws error for ${peerId}: ${err.message}`);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  wss.close(() => {
    console.log('[signaling] server shut down');
    process.exit(0);
  });
});