<script>
  import { connectionStatus, myPeerId, contacts } from '../stores.js'
  import { persistentMessages, persistentContacts, initPersistence } from './storage/persistentStores.svelte.js'
  import { openVault } from './storage/SecureVault.js'
  import { initOlm, loadOrCreateIdentityKeys, getKeyBundle } from './crypto/olm.js'
  import { getOrCreateSession, encryptForPeer, decryptFromPeer, hasSession } from './crypto/sessionManager.js'
  import { registerSender } from './crypto/sender.js'
  import { initSealed } from './crypto/sealed.js'
  import { onMount } from 'svelte'

  // Message queue for handling session-init race conditions
  // Queues payloads while waiting for outbound session to be established
  const messageQueue = new Map() // Map<peerId, payload[]>

  // Signaling URL: dev = localhost, prod = VPS via Tailscale
  let signalingUrl = $state(
    import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:8083'
  )
  let ws = null
  let pc = null
  let dataChannel = null
  let targetPeerId = ''
  let OlmInitialized = $state(false)

  async function ensureOlm() {
    if (OlmInitialized) return
    await initOlm()
    const keys = await loadOrCreateIdentityKeys()
    // Initialize Sealed at Rest key from identity key material
    const keyMaterial = keys.ed25519 + keys.curve25519
    await initSealed(keyMaterial).catch(err => console.warn('[sealed] init failed:', err))
    // Open encrypted IndexedDB vault for message persistence
    await openVault(keyMaterial)
    await initPersistence()
    OlmInitialized = true
  }

  function generatePeerId() {
    const id = 'squawk-' + Math.random().toString(36).substring(2, 10)
    myPeerId.set(id)
    return id
  }

  async function createPeerConnection() {
    try {
      await ensureOlm()
      pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      })

      pc.onicecandidate = e => {
        if (e.candidate) {
          sendSignal({ type: 'ice', candidate: e.candidate, from: $myPeerId, to: targetPeerId })
        }
      }

      pc.onconnectionstatechange = () => {
        connectionStatus.set(pc.connectionState)
      }

      pc.ondatachannel = e => {
        setupDataChannel(e.channel)
      }

    } catch (err) {
      console.error('Failed to create peer connection:', err)
      connectionStatus.set('failed')
    }
    return pc
  }

  function setupDataChannel(channel) {
    dataChannel = channel
    channel.onopen = () => {
      connectionStatus.set('connected')
    }
    channel.onmessage = async e => {
      try {
        const msg = JSON.parse(e.data)

        if (msg.type === 'olm_prekey') {
          // First message from a new peer — create inbound session then decrypt
          await getOrCreateSession(msg.from, 'inbound', {
            identityKey: msg.identityKey,
            oneTimeKey: msg.oneTimeKey,
          })
          const plaintext = await decryptFromPeer(msg.from, msg.body)
          const payload = JSON.parse(plaintext)
          persistentMessages.add({
            id: payload.id || Date.now(),
            type: payload.type || 'audio',
            text: payload.text,
            audioUrl: payload.audioUrl,
            from: msg.from,
            to: $myPeerId,
            time: Date.now(),
            received: true
          })
        } else if (msg.type === 'olm_message') {
          // Subsequent encrypted message
          if (!hasSession(msg.from)) return
          const plaintext = await decryptFromPeer(msg.from, msg.body)
          const payload = JSON.parse(plaintext)
          persistentMessages.add({
            id: payload.id || Date.now(),
            type: payload.type || 'audio',
            text: payload.text,
            audioUrl: payload.audioUrl,
            from: msg.from,
            to: $myPeerId,
            time: Date.now(),
            received: true
          })
        }
      } catch (err) {
        console.error('Failed to decrypt message:', err)
      }
    }
  }

  /**
   * Flush queued messages for a peer after session is established.
   */
  async function flushQueue(peerId) {
    const queue = messageQueue.get(peerId)
    if (!queue || queue.length === 0) return

    console.log(`[${peerId}] Flushing ${queue.length} queued messages`)
    for (const payload of queue) {
      await sendMessageImpl(peerId, payload)
    }
    messageQueue.delete(peerId)
  }

  /**
   * Core send implementation — encrypts and sends a single payload.
   * Returns true on success, false on failure.
   */
  async function sendMessageImpl(peerId, payload) {
    if (!dataChannel || dataChannel.readyState !== 'open') {
      console.warn('Data channel not open')
      return false
    }
    try {
      const plaintext = JSON.stringify(payload)
      const { type, body } = await encryptForPeer(peerId, plaintext)

      // Use olm_prekey only for the first message to a new peer (so recipient
      // can create inbound session without a separate round-trip).
      // Subsequent messages use olm_message — cheaper, already has session.
      const isFirst = !hasSession(peerId) || messageQueue.get(peerId)?.length === 0
      const kb = isFirst ? await getKeyBundle() : null
      const envelope = isFirst
        ? {
            type: 'olm_prekey',
            identityKey: kb.identityKey,
            oneTimeKey: kb.oneTimeKey,
            body,
            from: $myPeerId,
            to: peerId,
          }
        : {
            type: 'olm_message',
            body,
            from: $myPeerId,
            to: peerId,
          }
      dataChannel.send(JSON.stringify(envelope))
      return true
    } catch (err) {
      console.error('Failed to send encrypted message:', err)
      return false
    }
  }

  /**
   * Main send function — registered as the global sender.
   * Queues messages when no session exists, flushes once session is ready.
   */
  async function sendEncryptedMessage(payload) {
    const peerId = targetPeerId

    if (!hasSession(peerId)) {
      // No session yet — queue the message and request key bundle
      messageQueue.set(peerId, [...(messageQueue.get(peerId) || []), payload])
      sendSignal({ type: 'prekey_request', from: $myPeerId, to: peerId })
      return false
    }

    const sent = await sendMessageImpl(peerId, payload)
    return sent
  }

  function sendSignal(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data))
    }
  }

  async function connectToSignaling() {
    try {
      if (ws) { ws.close(); ws = null }
      await ensureOlm()
      const id = generatePeerId()
      ws = new WebSocket(signalingUrl)

      ws.onopen = async () => {
        const kb = await getKeyBundle()
        ws.send(JSON.stringify({
          type: 'register',
          peerId: id,
          keyBundle: kb,
        }))
        connectionStatus.set('signaling')
      }

      ws.onerror = () => {
        connectionStatus.set('failed')
      }

      ws.onclose = () => {
        connectionStatus.set('disconnected')
      }

      ws.onmessage = async e => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'offer') {
            await handleOffer(msg)
          } else if (msg.type === 'answer') {
            await pc?.setRemoteDescription(new RTCSessionDescription(msg.sdp))
          } else if (msg.type === 'ice') {
            await pc?.addIceCandidate(new RTCIceCandidate(msg.candidate))
          } else if (msg.type === 'prekey_response') {
            // Server relayed peer's key bundle — create outbound session
            const peerId = msg.from
            await getOrCreateSession(peerId, 'outbound', msg.keyBundle)
            // Flush queued messages now that session exists
            await flushQueue(peerId)
          } else if (msg.type === 'peer_online') {
            const { updatePeerStatus } = await import('../stores.js')
            updatePeerStatus(msg.peerId, 'online', msg.keyBundle || null)
          } else if (msg.type === 'peer_offline') {
            const { updatePeerStatus } = await import('../stores.js')
            updatePeerStatus(msg.peerId, 'offline')
          }
        } catch (err) {
          console.error('Signaling message error:', err)
        }
      }
    } catch (err) {
      console.error('Failed to connect to signaling server:', err)
      connectionStatus.set('failed')
    }
  }

  async function callPeer(peerId) {
    try {
      targetPeerId = peerId
      await createPeerConnection()

      // Fetch keyBundle BEFORE creating the offer — the Olm one-time key
      // must be reserved in our account before the offer is sent, otherwise
      // the recipient cannot build a valid inbound session.
      const kb = await getKeyBundle()

      dataChannel = pc.createDataChannel('squawk')
      setupDataChannel(dataChannel)

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // Attach keyBundle to the signaling offer so the recipient can
      // immediately create an inbound Olm session without an extra round-trip
      sendSignal({ type: 'offer', sdp: offer, from: $myPeerId, to: peerId, keyBundle: kb })
    } catch (err) {
      console.error('Failed to call peer:', err)
      connectionStatus.set('failed')
    }
  }

  async function handleOffer(msg) {
    try {
      targetPeerId = msg.from
      await createPeerConnection()
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))

      // If offer includes the caller's keyBundle, create inbound session now
      // so we can decrypt the first message immediately
      if (msg.keyBundle?.identityKey && msg.keyBundle?.oneTimeKey) {
        await getOrCreateSession(msg.from, 'inbound', {
          identityKey: msg.keyBundle.identityKey,
          oneTimeKey: msg.keyBundle.oneTimeKey,
        })
      }

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      sendSignal({ type: 'answer', sdp: answer, from: $myPeerId, to: msg.from })
    } catch (err) {
      console.error('Failed to handle offer:', err)
      connectionStatus.set('failed')
    }
  }

  // Expose sendEncryptedMessage for use by App.svelte
  // Expose callPeer so parent can initiate calls
  let { onCallReady } = $props()

  export { sendEncryptedMessage, connectToSignaling, callPeer }

  // Register the sender + expose callPeer when PeerConnection mounts
  $effect(() => {
    registerSender(sendEncryptedMessage)
    if (onCallReady) onCallReady(callPeer)
    return () => { registerSender(null) }
  })

  // Auto-connect to signaling server on mount
  onMount(() => {
    connectToSignaling()
  })
</script>