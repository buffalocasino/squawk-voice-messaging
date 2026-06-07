import { WebSocketServer } from 'ws';
const wss = new WebSocketServer({ port: 8083 });
const peers = new Map();
wss.on('listening', () => console.log('SIGNALING_READY'));
wss.on('connection', (ws) => {
  let myId = null;
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === 'register') {
      myId = msg.peerId;
      peers.set(myId, { ws, keyBundle: msg.keyBundle });
      const list = [];
      for (const [id, p] of peers) if (id !== myId) list.push({ peerId: id, keyBundle: p.keyBundle });
      ws.send(JSON.stringify({ type: 'peer_list', peers: list }));
      for (const [id, p] of peers) {
        if (id !== myId && p.ws.readyState === 1)
          p.ws.send(JSON.stringify({ type: 'peer_online', peerId: myId, keyBundle: msg.keyBundle }));
      }
      return;
    }
    if (['offer','answer','ice','prekey_request','prekey_response','olm_prekey','olm_message'].includes(msg.type)) {
      const t = peers.get(msg.to);
      if (t && t.ws.readyState === 1) t.ws.send(JSON.stringify({ ...msg, from: myId }));
    }
  });
  ws.on('close', () => {
    if (myId) { peers.delete(myId); for (const [,p] of peers) if (p.ws.readyState===1) p.ws.send(JSON.stringify({type:'peer_offline',peerId:myId})); }
  });
});
setInterval(() => {}, 5000);
