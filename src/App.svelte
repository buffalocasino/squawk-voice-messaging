<script>
  import { isRecording, recordingDuration, connectionStatus, myPeerId, onlinePeers, updatePeerStatus } from './stores.js'
  import { persistentMessages, persistentContacts, persistentSelectedContact, initPersistence, isPersistenceReady } from './lib/storage/persistentStores.svelte.js'
  import { guard, unguard, trackBlobUrl } from './lib/storage/MemoryGuard.js'
  import Recorder from './lib/Recorder.svelte'
  import PeerConnection from './lib/PeerConnection.svelte'
  import { sender } from './lib/crypto/sender.js'
  import AudioPlayer from './lib/AudioPlayer.svelte'
  import Settings from './lib/Settings.svelte'
  import VirtualList from './lib/components/VirtualList.svelte'
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'
  import { stampWithConfig, onRead, startSweep, stopSweep, endChat, getExpiry, formatExpiry } from './lib/ephemeral/timerEngine.js'
  import ViewOnceOverlay from './lib/components/ViewOnceOverlay.svelte'
  import BottomNav from './lib/components/BottomNav.svelte'
  import EphemeralSettings from './lib/components/EphemeralSettings.svelte'
  import VideoRecorder from './lib/components/VideoRecorder.svelte'
  import VideoPlayer from './lib/components/VideoPlayer.svelte'
  import { playSend, playReceive } from './lib/audio/SoundEngine.js'
  import SafetyNumber from './lib/components/SafetyNumber.svelte'
  import QRCodePair from './lib/components/QRCodePair.svelte'
  import { pageSlide, bubblePop, ripple, springScale } from './lib/motion/SquawkMotion.js'
  import { fade, fly, scale } from 'svelte/transition'

  let currentView = $state('contacts')
  let newMessageText = $state('')
  let virtualList = $state(null)
  let appReady = $state(false)
  let sidebarOpen = $state(false)
  let mobileTab = $state('chats')
  let showQR = $state(false)           // 'chats' | 'settings' for bottom nav
  let peerCallInput = $state('')
  let copyFeedback = $state(false)
  let expiredIds = $state(new Set())
  let viewOnceWipes = $state(new Map()) // msgId → cancel function

  // Reference to PeerConnection's callPeer
  let callPeerFn = $state(null)
  function onPeerMounted(fn) { callPeerFn = fn }

  onMount(async () => {
    const check = () => {
      if (isPersistenceReady()) { appReady = true }
      else { setTimeout(check, 200) }
    }
    check()

    // Start ephemeral sweep (24h expiry, view-once, dynamic timers)
    startSweep((msgId) => {
      expiredIds = new Set([...expiredIds, msgId])
      setTimeout(() => { expiredIds = new Set([...expiredIds].filter(id => id !== msgId)) }, 3000)
    })
    return () => {
      stopSweep()
      if (persistentSelectedContact.current) {
        unguard(`chat-${persistentSelectedContact.current.id}`)
      }
    }
  })

  let msgs = $derived(persistentMessages.items)
  let contactList = $derived(persistentContacts.items)

  let chatRows = $derived.by(() => {
    const seen = new Set()
    const rows = []
    for (const m of msgs) {
      const id = m.from === 'me' ? m.to : m.from
      if (id == null || seen.has(id)) continue
      seen.add(id)
      const contact = contactList.find(c => c.id === id || c.peerId === id)
      rows.push({ id, name: contact?.name || `Chat ${id}`, avatar: contact?.name?.[0] || '?' })
    }
    return rows.slice(0, 50)
  })

  let chatMessages = $derived.by(() => {
    const c = persistentSelectedContact.current
    return c ? persistentMessages.forChat(c.id) : []
  })

  $effect(() => {
    if (chatMessages.length && virtualList && currentView === 'chat') {
      requestAnimationFrame(() => virtualList.scrollToBottom(false))
    }
  })

  $effect(() => {
    const contact = persistentSelectedContact.current
    if (contact && currentView === 'chat') {
      const ids = chatMessages.map(m => m.id)
      guard(`chat-${contact.id}`, ids)
      return () => unguard(`chat-${contact.id}`)
    }
  })

  function selectContact(contact) {
    if (persistentSelectedContact.current) unguard(`chat-${persistentSelectedContact.current.id}`)
    persistentSelectedContact.set(contact)
    currentView = 'chat'
    sidebarOpen = false
  }

  function goBack() {
    if (persistentSelectedContact.current) unguard(`chat-${persistentSelectedContact.current.id}`)
    persistentSelectedContact.clear()
    currentView = 'contacts'
  }

  async function sendText() {
    if (!newMessageText.trim()) return
    const contact = persistentSelectedContact.current
    if (!contact) return
    const id = Date.now()
    const msg = { id, type: 'text', text: newMessageText, from: 'me', to: contact.id, time: Date.now(), status: 'sending' }
    stampWithConfig(msg) // 24h expiry via config
    persistentMessages.add(msg)
    newMessageText = ''
    playSend()
    if (sender) {
      try { await sender(msg) } catch {}
    }
    persistentMessages.update(id, { status: 'sent' })
  }

  async function handleRecordedVideo(blob, duration) {
    const contact = persistentSelectedContact.current
    if (!contact) return
    const buf = await blob.arrayBuffer()
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
    const id = Date.now()
    const msg = { id, type: 'video', videoUrl: b64, duration, from: 'me', to: contact.id, time: Date.now(), status: 'sending' }
    stampWithConfig(msg)
    persistentMessages.add(msg)
    trackBlobUrl(id, `data:video/webm;base64,${b64}`)
    playSend()
    if (sender) {
      try { await sender(msg) } catch {}
    }
    persistentMessages.update(id, { status: 'sent' })
  }

  async function handleRecordedAudio(blob, duration) {
    const contact = persistentSelectedContact.current
    if (!contact) return
    const buf = await blob.arrayBuffer()
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
    const id = Date.now()
    const msg = { id, type: 'audio', audioUrl: b64, duration, from: 'me', to: contact.id, time: Date.now(), status: 'sending' }
    stampWithConfig(msg)
    persistentMessages.add(msg)
    trackBlobUrl(id, `data:audio/webm;base64,${b64}`)
    if (sender) {
      try { await sender({ id, type: 'audio', audioUrl: b64, duration, from: 'me', to: contact.id, time: Date.now() }) } catch {}
    }
    persistentMessages.update(id, { status: 'sent' })
  }

  async function endChatHandler() {
    const contact = persistentSelectedContact.current
    if (!contact) return
    if (!confirm(`End Chat with ${contact.name}? All messages will be permanently wiped.`)) return

    const count = await endChat(contact.id, {
      destroySession: async () => {
        const { removeSession } = await import('./lib/crypto/sessionManager.js')
        removeSession(contact.id)
      }
    })

    goBack()
    console.log(`[End Chat] Wiped ${count} messages`)
  }

  function copyPeerId() {
    const id = get(myPeerId)
    if (!id) return

    // Try clipboard API first, fall back to execCommand
    let copied = false

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(id).then(() => {
        copied = true
        copyFeedback = true
        setTimeout(() => copyFeedback = false, 1500)
      }).catch(() => {
        fallbackCopy(id)
      })
    } else {
      fallbackCopy(id)
    }

    function fallbackCopy(text) {
      if (copied) return
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'
      el.style.left = '-9999px'
      el.style.top = '0'
      document.body.appendChild(el)
      el.focus()
      el.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(el)
      copyFeedback = true
      setTimeout(() => copyFeedback = false, 1500)
    }
  }

  function relTime(ts) { const d = Date.now() - ts; if (d < 60000) return 'now'; if (d < 3600000) return `${Math.floor(d/60000)}m`; if (d < 86400000) return `${Math.floor(d/3600000)}h`; return new Date(ts).toLocaleDateString() }
</script>

<div class="app-shell">
  <!-- Mobile top bar -->
  <header class="top-bar">
    <button class="icon-btn" onclick={() => sidebarOpen = !sidebarOpen} aria-label="Menu">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
    <div class="top-bar-title gold-text">Squawk</div>
    <div class="top-bar-actions">
      <PeerConnection onCallReady={onPeerMounted} />
      <button class="icon-btn" onclick={() => { currentView = 'settings' }} aria-label="Settings">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      </button>
    </div>
  </header>

  <!-- Sidebar (desktop) / overlay (mobile) -->
  <nav class="sidebar" class:open={sidebarOpen}>
    <div class="sidebar-header">
      <div class="sidebar-logo gold-text">Squawk</div>
      <div class="status-row">
        <span class="status-dot" class:connected={$connectionStatus === 'connected' || $connectionStatus === 'signaling'}></span>
        <span class="status-text">{$connectionStatus || 'offline'}</span>
      </div>
      {#if $myPeerId}
        <div class="my-peer-id">
          <span class="my-peer-label">My ID</span>
          <code class="my-peer-code">{$myPeerId}</code>
        </div>
      {/if}
    </div>

    <div class="sidebar-section-label">Conversations</div>

    <div class="chat-list">
      {#if chatRows.length === 0}
        <div class="empty-state">
          <div class="empty-icon">🎙️</div>
          <p class="empty-title">No conversations yet</p>
          <p class="empty-sub">Connect to a peer to start squawking</p>
        </div>
      {:else}
        {#each chatRows as row (row.id)}
          {@const lastMsg = persistentMessages.lastFor(row.id)}
          <button class="chat-row" class:active={persistentSelectedContact.current?.id === row.id} onclick={() => selectContact({ id: row.id, name: row.name })}>
            <div class="avatar">{row.avatar?.toUpperCase() || '?'}</div>
            <div class="chat-row-info">
              <div class="chat-row-top">
                <span class="chat-row-name">{row.name}</span>
                {#if lastMsg}<span class="chat-row-time">{relTime(lastMsg.time)}</span>{/if}
              </div>
              <span class="chat-row-preview">
                {#if lastMsg}{lastMsg.type === 'audio' ? '🎙️ Voice' : lastMsg.text}{:else}No messages{/if}
              </span>
            </div>
          </button>
        {/each}
      {/if}
    </div>

    <div class="sidebar-footer">
      <div class="call-peer-section">
        <div class="sidebar-section-label">Call a Peer</div>
        <div class="call-peer-row">
          <input class="call-peer-input" bind:value={peerCallInput} placeholder="Peer ID..." />
          <button class="call-peer-btn" onclick={() => { console.log('Call button clicked, callPeerFn:', !!callPeerFn, 'input:', peerCallInput.trim()); if (callPeerFn && peerCallInput.trim()) { callPeerFn(peerCallInput.trim()); selectContact({ id: peerCallInput.trim(), name: peerCallInput.trim() }) } }} disabled={!peerCallInput.trim() || !callPeerFn}>Call</button>
        </div>
      </div>
      <span class="sidebar-footer-text">Squawk v0.1 — E2E Encrypted</span>
    </div>
  </nav>

  <!-- Overlay for mobile sidebar -->
  {#if sidebarOpen}
    <button class="sidebar-overlay" onclick={() => sidebarOpen = false} aria-label="Close sidebar"></button>
  {/if}

  <!-- Main content -->
  <main class="main-area">
    {#if currentView === 'contacts'}
      <div in:pageSlide={{ direction: 'left' }} out:pageSlide>
      <!-- Desktop welcome (when sidebar items are clicked we go to chat) -->
      <div class="desktop-welcome">
        <div class="welcome-logo">🦜</div>
        <h1 class="gold-text welcome-title">Squawk</h1>
        <p class="welcome-sub">Encrypted voice messaging.<br>P2P. Zero-knowledge. Ephemeral.</p>
        <div class="welcome-status">
          <span class="status-dot large" class:connected={$connectionStatus === 'connected'}></span>
          {$connectionStatus === 'connected' ? 'Connected' : $connectionStatus === 'signaling' ? 'Connecting...' : 'Offline'}
        </div>
        {#if $myPeerId}
          <div class="welcome-peer-id">
            <span class="welcome-peer-label">Your Peer ID</span>
            <code class="welcome-peer-code">{$myPeerId}</code>
            <button class="copy-id-btn" onclick={copyPeerId} title="Copy Peer ID">
              {#if copyFeedback}
                ✓ Copied!
              {:else}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                Copy
              {/if}
          </div>
        {/if}
        <div class="welcome-actions">
          <button class="welcome-btn" onclick={() => currentView = 'settings'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            Settings
          </button>
        </div>
        <p class="welcome-hint">Select a conversation from the sidebar<br>or connect to a peer to get started.</p>
      </div>
      </div>
    {:else if currentView === 'chat'}
      <div in:pageSlide={{ direction: 'right' }} out:pageSlide>
      <!-- Chat header -->
      <div class="chat-header glass">
        <button class="icon-btn back-btn" onclick={goBack} aria-label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div class="avatar small">{persistentSelectedContact.current?.name?.[0]?.toUpperCase() || '?'}</div>
        <div class="chat-header-info">
          <span class="chat-header-name">{persistentSelectedContact.current?.name || 'Unknown'}</span>
          <span class="chat-header-status">online</span>
        </div>
        <button class="end-chat-btn" onclick={endChatHandler} title="End Chat — permanently wipe all messages">✕</button>
      </div>

      <!-- Messages -->
      <VirtualList bind:this={virtualList} items={chatMessages} key="id" estimateHeight={72} overscan={8}>
        {#snippet children({ item, index })}
          {@const msg = item}
          {@const isMe = msg.from === 'me'}
          {@const isViewOnce = msg.viewOnce === true}
          {@const isExpired = msg._wiped === true}
          {@const expirySec = isMe ? -1 : getExpiry(msg)}
          {@const showExpiry = expirySec > 0 && expirySec < 3600}

          {#if isExpired}
            <div class="msg-row"><div class="msg-bubble expired">🔥 Message expired</div></div>
          {:else if isViewOnce && !isMe}
            <div class="msg-row">
              <ViewOnceOverlay msgId={msg.id} graceS={5}
                onWipe={(id) => { expiredIds = new Set([...expiredIds, id]) }}
              >
                {#snippet children()}
                  <div class="msg-bubble view-once-bubble">
                    {#if msg.type === 'audio'}<AudioPlayer src={msg.audioUrl} duration={msg.duration || 0} />
                    {:else if msg.type === 'video'}<VideoPlayer src={msg.videoUrl} duration={msg.duration || 0} />
                    {:else}<span class="msg-text">{msg.text}</span>{/if}
                  </div>
                {/snippet}
              </ViewOnceOverlay>
            </div>
          {:else}
          <div class="msg-row" class:me={isMe}>
            <div class="msg-bubble" class:me={isMe}>
              {#if msg.type === 'audio'}
                <AudioPlayer src={msg.audioUrl} duration={msg.duration || 0} />
              {:else if msg.type === 'video'}
                <VideoPlayer src={msg.videoUrl} duration={msg.duration || 0} />
              {:else}
                <span class="msg-text">{msg.text}</span>
              {/if}
              <div class="msg-meta">
                {#if showExpiry}<span class="msg-expiry">⏳ {formatExpiry(expirySec)}</span>{/if}
                <span class="msg-time">{relTime(msg.time)}</span>
                {#if isMe}
                  <span class="msg-status">
                    {#if msg.status === 'sending'}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                    {:else if msg.status === 'sent'}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7"/></svg>
                    {:else if msg.status === 'failed'}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    {/if}
                  </span>
                {/if}
              </div>
            </div>
          </div>
          {/if}
        {/snippet}
        {#snippet empty()}
          <div class="empty-chat">
            <div class="empty-icon">💬</div>
            <p>Send a voice squawk or message</p>
          </div>
        {/snippet}
      </VirtualList>

      <!-- Input bar -->
      <div class="input-bar glass">
        <VideoRecorder onSendVideo={handleRecordedVideo} />
        <Recorder onSendAudio={handleRecordedAudio} />
        <div class="input-wrapper">
          <input
            bind:value={newMessageText}
            onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText() } }}
            placeholder="Message..."
            class="msg-input"
          />
        </div>
        <button class="send-btn" onclick={sendText} disabled={!newMessageText.trim()} aria-label="Send" use:ripple>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
      </div>
    {:else if currentView === 'settings' || mobileTab === 'settings'}
      <div class="chat-header glass">
        <button class="icon-btn back-btn" onclick={() => { currentView = 'contacts'; mobileTab = 'chats' }} aria-label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 19l-7-7 7-7"/></svg>
        </button>
        <span class="chat-header-name">Settings</span>
      </div>
      <div class="settings-scroll">
        <EphemeralSettings />
        <div class="settings-divider"></div>
        <Settings />
      </div>
    {/if}
  </main>

  <!-- Bottom nav (mobile) -->
  <div class="bottom-nav-wrapper">
    <BottomNav
      tabs={[
        { id: 'chats', label: 'Chats', icon: 'chats' },
        { id: 'settings', label: 'Settings', icon: 'settings' },
      ]}
      active={mobileTab}
      onchange={(tab) => {
        mobileTab = tab
        if (tab === 'chats') currentView = 'contacts'
        if (tab === 'settings') currentView = 'settings'
      }}
    />
  </div>
</div>

{#if showQR}
  <QRCodePair keyBundle={{ peerId: $myPeerId }} mode="show" onClose={() => showQR = false} />
{/if}

{#if persistentSelectedContact.current}
  <SafetyNumber
    peerName={persistentSelectedContact.current.name || persistentSelectedContact.current.id}
    onClose={() => {}}
  />
{/if}

<style lang="css">
  @import './app.css';
</style>
