# Squawk — Encrypted P2P Voice Messaging

A PWA for end-to-end encrypted voice messages between peers via WebRTC data channels.

## Stack

- **Svelte 5** (runes mode)
- **Vite** + **Tailwind CSS v4**
- **Olm** (`@matrix-org/olm`) — Double Ratchet E2EE
- **WebRTC** — P2P data channels over DTLS-SRTP
- **vite-plugin-pwa** — service worker, offline, install prompt
- **Node.js** signaling server (WebSocket, deployed to VPS)

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Squawk    │────▶│ Signaling Server │────▶│   Squawk    │
│  (browser)  │     │  (ws:// VPS)     │     │  (browser)  │
└─────────────┘     └──────────────────┘     └─────────────┘
       │                                           │
       └───────── WebRTC Data Channel (E2EE) ──────┘

Olm Double Ratchet: identity keys + one-time keys → per-message forward secrecy
```

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/crypto/olm.js` | WASM init, identity keygen, session persistence |
| `src/lib/crypto/sessionManager.js` | per-peer session cache, encryptForPeer/decryptFromPeer |
| `src/lib/crypto/sender.js` | shared sender reference between components |
| `src/lib/PeerConnection.svelte` | WebRTC + signaling, Olm message send/receive |
| `src/lib/Recorder.svelte` | audio capture → blob → parent callback |
| `server/index.js` | Node WebSocket signaling server |

## Development

```bash
npm run dev        # dev server at localhost:5175
npm run build      # production build
npm run preview    # preview production build
```

## Signaling Server (VPS deploy)

```bash
cd server
npm install
npm start           # starts on port 8080
```

Set `signalingUrl` in PeerConnection.svelte to your VPS Tailscale address.

## PWA Install

Serves offline via Workbox service worker. Add to home screen from the install banner.

## Security Notes

- Identity keys stored in `localStorage` — device-only, no server
- Olm sessions pickled with per-device key
- Audio blobs encrypted before leaving the browser
- Signaling server only routes WebRTC handshakes — no message content