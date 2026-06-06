import { WebSocketServer, WebSocket } from 'ws'
import http from 'http';
import { EventEmitter } from 'events';

// --- Configuration ---
let PORT = process.env.PORT || 8443;
const HOST = '0.0.0.0';

// Simple in-memory peer registry: peerId -> { ws, keyBundle, lastSeen, connectedAt }
const peers = new Map()

// --- Signaling Server Core ---
const wss = new WebSocketServer({ port: PORT, host: HOST });

/**
 * Broadcasts a message to all connected peers, excluding the sender.
 * @param {string} senderId - The ID of the sender.
 * @param {object} message - The message object to broadcast.
 */
function broadcast(senderId, message) {
  const data = JSON.stringify(message);
  for (const [peerId, peer] of peers) {
    if (peerId !== senderId && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(data);
    }
  }
}

/**
 * Sends a message to a specific target peer.
 * @param {string} targetId - The ID of the target peer.
 * @param {object} message - The message object to send.
 * @returns {boolean} True if successfully sent, false otherwise.
 */
function sendTo(targetId, message) {
  const peer = peers.get(targetId);
  if (peer && peer.ws.readyState === WebSocket.OPEN) {
    peer.ws.send(JSON.stringify(message));
    return true;
  }
  return false;
}

/**
 * Signal: List current available peers.
 * @param {string} fromId - The initiating peer ID.
 * @param {string} targetId - The target peer ID (optional).
 * @returns {object} List of peers.
 */
function getPeerList(fromId, targetId) {
    const list = Array.from(peers.entries()).map(([id, peer]) => ({
        peerId: id,
        keyBundle: peer.keyBundle || null,
        lastSeen: Date.now() - (Date.now() - peer.lastSeen), // Approximation
    }));
    
    return { 
        type: 'peer_list', 
        listingPeerId: fromId, 
        targetId: targetId, 
        peers: list 
    };
}

wss.on('connection', (ws, req) => {
  let myPeerId = null;
  
  // Assuming handshake/initial message provides identity if not explicitly handled
  // For simplicity, we'll wait for the 'register' type message.

  ws.on('message', (raw) => {
    let msg;
    try { 
      msg = JSON.parse(raw); 
    } catch (e) { 
      console.error('Error parsing message:', e); 
      return; 
    }

    switch (msg.type) {
      
      // --- Essential Signaling Handlers ---
      
      case 'register': {
        if (myPeerId) peers.delete(myPeerId);
        myPeerId = msg.peerId;
        
        peers.set(myPeerId, {
          ws,
          keyBundle: msg.keyBundle || null,
          lastSeen: Date.now(),
          connectedAt: Date.now(),
        });
        console.log(`[+] ${myPeerId} registered (${peers.size} peers)`);

        // Broadcast our arrival
        broadcast(myPeerId, { 
            type: 'peer_online', 
            peerId: myPeerId, 
            keyBundle: msg.keyBundle 
        });
        break;
      }

      case 'peer_announce': {
        // New specific type for state updates/announcements
        const { keyBundle, targetId } = msg;
        console.log(`[ANNOUNCE] ${msg.peerId} announced. Key Bundle: ${keyBundle ? 'YES' : 'NO'}`);
        
        // Update self state or specific target state
        if (msg.peerId === myPeerId) {
            peers.set(msg.peerId, {
                ws,
                keyBundle: keyBundle || null,
                lastSeen: Date.now(),
                connectedAt: Date.now(),
            });
        }
        
        if (targetId && !sendTo(targetId, { type: 'prekey_response', from: msg.peerId, to: targetId, keyBundle: keyBundle })) {
             // Attempt to message target
        }
        break;
      }

      // --- WebRTC Signal Handlers ---
      
      case 'offer': {
        // WebRTC SDP offer — forward with optional key bundle
        sendTo(msg.to, { 
            type: 'offer', 
            from: msg.from, 
            to: msg.to, 
            sdp: msg.sdp, 
            keyBundle: msg.keyBundle || null 
        });
        break;
      }

      case 'answer': {
        sendTo(msg.to, { type: 'answer', from: msg.from, to: msg.to, sdp: msg.sdp }
        );
        break;
      }

      case 'ice': {
        if (!msg.to) break;
        sendTo(msg.to, { type: 'ice', from: msg.from, to: msg.to, candidate: msg.candidate }
        );
        break;
      }

      // --- Utility/List Handlers ---
      
      case 'peer_list': {
        // Triggered to get the current list of available peers
        const listMsg = getPeerList(msg.from, msg.to);
        sendTo(msg.to, listMsg);
        break;
      }
      
      case 'direct': {
        // App-level encrypted payload relay
        if (!msg.to) break;
        sendTo(msg.to, { type: 'direct', from: myPeerId, payload: msg.payload, id: msg.id }
        );
        break;
      }
      
      case 'peer_online': {
        // New peer announced themselves — update contact list in clients
        console.log(`[~] ${msg.peerId} is online`);
        // broadcast(myPeerId, { type: 'peer_online', peerId: myPeerId, keyBundle: msg.keyBundle }}); // Already handled by register broadcast
        break;
      }

      case 'ping': {
        // Keepalive response
        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        break;
      }

      default: {
        console.warn('Unknown message type:', msg.type);
      }
    }
  });

  // --- Connection Lifecycle ---
  ws.on('close', () => {
    if (myPeerId) {
      peers.delete(myPeerId);
      // Announce disconnection to all others
      broadcast(myPeerId, { type: 'peer_offline', peerId: myPeerId });
      console.log(`[-] ${myPeerId} disconnected (${peers.size} peers)`);
    }
  });

  ws.on('error', (err) => {
    console.error('WS error:', err.message);
    if (myPeerId) peers.delete(myPeerId);
  });
});

// Keepalive + clean stale entries
setInterval(() => {
  for (const [peerId, peer] of peers) {
    // Update lastSeen on all connected pairs, even if they haven't explicitly pinged
    if (peer.ws.readyState === WebSocket.OPEN) {
      peer.lastSeen = Date.now();
    }
  }
}, 30_000);


// =======================================================================
// HTTP Health Check Implementation
// =======================================================================

const httpServer = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK - Signaling Server Operational\n');
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found\n');
    }
});

// Exporting server for deployment convenience
export const signalingServer = {
    ws: wss,
    http: httpServer,
    broadcast,
    sendTo
};

// Start function for simplicity
export const startServer = () => {
    // Start the HTTP server (which carries the health check)
    httpServer.listen(PORT, HOST, () => {
        console.log(`[HTTP] Signaling server listening on http://${HOST}:${PORT}/health`);
    });
    
    // Start the WS server (which runs on the same port)
    // Note: The 'ws' library handles port conflict automatically if running alongside http.
    console.log(`[WS] Signaling server running on ws://${HOST}:${PORT}`);
};

// Running the logic immediately upon module load (for development/simple start)
startServer();