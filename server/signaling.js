// Squawk Signaling Server — local dev
// npm start (needs "type":"module" in package.json)
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 9443;
const peers = new Map();

const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });

wss.on('listening', () => console.log(`[signaling] ws://0.0.0.0:${PORT}`));

wss.on('connection', (ws) => {
  let myId = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'register': {
        myId = msg.peerId;
        peers.set(myId, { ws, keyBundle: msg.keyBundle, since: Date.now() });
        console.log(`[+] ${myId} (${peers.size} peers)`);

        // Send peer list back
        const list = [];
        for (const [id, p] of peers) {
          if (id !== myId) list.push({ peerId: id, keyBundle: p.keyBundle });
        }
        ws.send(JSON.stringify({ type: 'peer_list', peers: list }));

        // Broadcast to others
        for (const [id, p] of peers) {
          if (id !== myId && p.ws.readyState === 1) {
            p.ws.send(JSON.stringify({ type: 'peer_online', peerId: myId, keyBundle: msg.keyBundle }));
          }
        }
        break;
      }

      case 'offer':
      case 'answer':
      case 'ice':
      case 'prekey_request':
      case 'prekey_response': {
        const target = peers.get(msg.to);
        if (target && target.ws.readyState === 1) {
          target.ws.send(JSON.stringify({ ...msg, from: myId }));
        }
        break;
      }

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
    }
  });

  ws.on('close', () => {
    if (myId) {
      peers.delete(myId);
      for (const [, p] of peers) {
        if (p.ws.readyState === 1) {
          p.ws.send(JSON.stringify({ type: 'peer_offline', peerId: myId }));
        }
      }
      console.log(`[-] ${myId} (${peers.size} peers)`);
    }
  });
});
