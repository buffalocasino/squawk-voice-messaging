<script>
  import { connectionStatus, myPeerId, contacts } from '../stores.js'
  import { persistentMessages, persistentContacts, initPersistence } from './storage/persistentStores.svelte.js'
  import { openVault } from './storage/SecureVault.js'
  import { initCrypto, getPeerId, getKeyBundle, createSession, encrypt, decrypt, hasSession, removeSession } from './crypto/olm.js'
  import { registerSender } from './crypto/sender.js'
  import { initSealed } from './crypto/sealed.js'
  import { onMount } from 'svelte'

  let signalingUrl = $state(import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:8083')
  let ws = null
  let pc = null
  let dataChannel = null
  let targetPeerId = ''
  let cryptoReady = $state(false)

  async function ensureCrypto() {
    if (cryptoReady) return
    await initCrypto()
    const id = await getPeerId()
    myPeerId.set(id)
    // Init sealed storage
    try {
      const kp = await initCrypto()
      const pub = await crypto.subtle.exportKey('jwk', kp.publicKey)
      await initSealed(pub.x)
      await openVault(pub.x)
      await initPersistence()
    } catch (err) { console.warn('[crypto] sealed init failed:', err) }
    cryptoReady = true
  }

  async function createPeerConnection() {
    try {
      await ensureCrypto()
      pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      })
      pc.onicecandidate = e => {
        if (e.candidate) sendSignal({ type: 'ice', candidate: e.candidate, from: $myPeerId, to: targetPeerId })
      }
      pc.onconnectionstatechange = () => connectionStatus.set(pc.connectionState)
      pc.ondatachannel = e => setupDataChannel(e.channel)
    } catch (err) {
      console.error('Failed to create peer connection:', err)
      connectionStatus.set('failed')
    }
    return pc
  }

  function setupDataChannel(channel) {
    dataChannel = channel
    channel.onopen = () => connectionStatus.set('connected')
    channel.onmessage = async e => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'crypto_session') {
          // First message from a peer — create session
          await createSession(msg.from, msg.identityKey)
          const payload = JSON.parse(await decrypt(msg.from, msg.iv, msg.ct))
          addIncomingMessage(msg.from, payload)
        } else if (msg.type === 'crypto_message') {
          if (!hasSession(msg.from)) return
          const plaintext = await decrypt(msg.from, msg.iv, msg.ct)
          addIncomingMessage(msg.from, JSON.parse(plaintext))
        }
      } catch (err) { console.error('Decrypt failed:', err) }
    }
  }

  function addIncomingMessage(from, payload) {
    persistentMessages.add({
      id: payload.id || Date.now(),
      type: payload.type || 'text',
      text: payload.text,
      audioUrl: payload.audioUrl,
      duration: payload.duration,
      from,
      to: $myPeerId,
      time: Date.now(),
      received: true,
    })
  }

  async function sendEncryptedMessage(msg) {
    if (!dataChannel || dataChannel.readyState !== 'open') return false
    const peerId = targetPeerId
    const plaintext = JSON.stringify(msg)

    if (!hasSession(peerId)) {
      // No session yet — request key bundle
      sendSignal({ type: 'prekey_request', from: $myPeerId, to: peerId })
      return false
    }

    try {
      const { iv, ct } = await encrypt(peerId, plaintext)
      const envelope = {
        type: 'crypto_message',
        iv, ct,
        from: $myPeerId,
        to: peerId,
      }
      dataChannel.send(JSON.stringify(envelope))
      return true
    } catch (err) {
      console.error('Encrypt failed:', err)
      return false
    }
  }

  function sendSignal(data) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data))
  }

  async function connectToSignaling() {
    try {
      if (ws) { ws.close(); ws = null }
      await ensureCrypto()
      ws = new WebSocket(signalingUrl)

      ws.onopen = async () => {
        const kb = await getKeyBundle()
        ws.send(JSON.stringify({ type: 'register', peerId: $myPeerId, keyBundle: kb }))
        connectionStatus.set('signaling')
      }

      ws.onerror = () => connectionStatus.set('failed')
      ws.onclose = () => connectionStatus.set('disconnected')

      ws.onmessage = async e => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'offer') await handleOffer(msg)
          else if (msg.type === 'answer') await pc?.setRemoteDescription(new RTCSessionDescription(msg.sdp))
          else if (msg.type === 'ice') await pc?.addIceCandidate(new RTCIceCandidate(msg.candidate))
          else if (msg.type === 'prekey_response') {
            await createSession(msg.from, msg.keyBundle.identityKey)
          }
          else if (msg.type === 'peer_online') {
            const { updatePeerStatus } = await import('../stores.js')
            updatePeerStatus(msg.peerId, 'online', msg.keyBundle || null)
          }
          else if (msg.type === 'peer_offline') {
            const { updatePeerStatus } = await import('../stores.js')
            updatePeerStatus(msg.peerId, 'offline')
          }
        } catch (err) { console.error('Signaling error:', err) }
      }
    } catch (err) {
      console.error('Failed to connect:', err)
      connectionStatus.set('failed')
    }
  }

  async function callPeer(peerId) {
    console.log('[callPeer] Calling:', peerId)
    try {
      targetPeerId = peerId
      await createPeerConnection()
      const kb = await getKeyBundle()
      console.log('[callPeer] Key bundle ready, creating data channel')
      dataChannel = pc.createDataChannel('squawk')
      setupDataChannel(dataChannel)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      console.log('[callPeer] Sending offer to signaling')
      sendSignal({ type: 'offer', sdp: offer, from: $myPeerId, to: peerId, keyBundle: kb })
    } catch (err) {
      console.error('Call failed:', err)
      connectionStatus.set('failed')
    }
  }

  async function handleOffer(msg) {
    try {
      targetPeerId = msg.from
      await createPeerConnection()
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
      if (msg.keyBundle?.identityKey) {
        await createSession(msg.from, msg.keyBundle.identityKey)
      }
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      sendSignal({ type: 'answer', sdp: answer, from: $myPeerId, to: msg.from })
    } catch (err) {
      console.error('Handle offer failed:', err)
      connectionStatus.set('failed')
    }
  }

  let { onCallReady } = $props()
  export { sendEncryptedMessage, connectToSignaling, callPeer }

  $effect(() => {
    registerSender(sendEncryptedMessage)
    if (onCallReady) onCallReady(callPeer)
    return () => { registerSender(null) }
  })

  onMount(() => { connectToSignaling() })
</script>
