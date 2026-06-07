import { WebSocketServer } from 'ws'
import { createServer } from 'http'

const PORT = process.env.PORT || 8082
const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('squawk-signaling ok')
    return
  }
  res.writeHead(404).end()
})

const wss = new WebSocketServer({ server: httpServer })
const peers = new Map()

wss.on('connection', (ws) => {
  let myId = null
  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw.toString()) } catch { return }
    if (msg.type === 'register') {
      myId = msg.peerId
      peers.set(myId, { ws, keyBundle: msg.keyBundle })
      console.log('+', myId, peers.size)
      const list = []
      for (const [id, p] of peers) if (id !== myId) list.push({ peerId: id, keyBundle: p.keyBundle })
      ws.send(JSON.stringify({ type: 'peer_list', peers: list }))
      for (const [id, p] of peers) {
        if (id !== myId && p.ws.readyState === 1)
          p.ws.send(JSON.stringify({ type: 'peer_online', peerId: myId, keyBundle: msg.keyBundle }))
      }
      return
    }
    if (['offer', 'answer', 'ice', 'prekey_request', 'prekey_response'].includes(msg.type)) {
      console.log('RELAY', msg.type, '→', msg.to, peers.has(msg.to))
      const t = peers.get(msg.to)
      if (t && t.ws.readyState === 1) t.ws.send(JSON.stringify({ ...msg, from: myId }))
    }
  })
  ws.on('close', () => {
    if (myId) {
      peers.delete(myId)
      for (const [, p] of peers) if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ type: 'peer_offline', peerId: myId }))
    }
  })
})

httpServer.listen(PORT, () => console.log(`SIGNALING http://0.0.0.0:${PORT}`))
