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
  import { stampWithConfig, onRead, startSweep, stopSweep, endChat, getExpiry, formatExpiry } from './lib/ephemeral/timerEngine.js'
  import ViewOnceOverlay from './lib/components/ViewOnceOverlay.svelte'
  import BottomNav from './lib/components/BottomNav.svelte'
  import EphemeralSettings from './lib/components/EphemeralSettings.svelte'

  let currentView = $state('contacts')
  let newMessageText = $state('')
  let virtualList = $state(null)
  let appReady = $state(false)
  let sidebarOpen = $state(false)
  let mobileTab = $state('chats')           // 'chats' | 'settings' for bottom nav
  let peerCallInput = $state('')
  let expiredIds = $state(new Set())    // reactive set of recently expired msg IDs
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
          <button class="call-peer-btn" onclick={() => { if (callPeerFn && peerCallInput.trim()) { callPeerFn(peerCallInput.trim()); selectContact({ id: peerCallInput.trim(), name: peerCallInput.trim() }) } }} disabled={!peerCallInput.trim() || !callPeerFn}>Call</button>
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
    {:else if currentView === 'chat'}
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
        <Recorder onSendAudio={handleRecordedAudio} />
        <div class="input-wrapper">
          <input
            bind:value={newMessageText}
            onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText() } }}
            placeholder="Message..."
            class="msg-input"
          />
        </div>
        <button class="send-btn" onclick={sendText} disabled={!newMessageText.trim()} aria-label="Send">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
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

<style>
  .app-shell {
    display: flex;
    height: 100%;
    height: 100dvh;
    width: 100%;
    overflow: hidden;
  }

  /* ── Top bar (mobile) ────────────────────────────────────────── */
  .top-bar {
    display: none;
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    height: 56px; padding-top: env(safe-area-inset-top);
    height: calc(56px + env(safe-area-inset-top));
    background: var(--bg-base);
    border-bottom: 1px solid var(--border);
    align-items: flex-end; padding-bottom: 8px;
    padding-left: 12px; padding-right: 12px; gap: 10px;
  }
  .top-bar-title { font-size: 18px; font-weight: 700; flex: 1; }
  .top-bar-actions { display: flex; align-items: center; gap: 4px; }

  .icon-btn {
    display: flex; align-items: center; justify-content: center;
    width: 36px; height: 36px; border-radius: 10px;
    background: transparent; color: var(--text-muted);
    border: none; cursor: pointer; transition: all 0.15s;
  }
  .icon-btn:hover { background: var(--bg-elevated); color: var(--gold); }

  /* ── Sidebar ─────────────────────────────────────────────────── */
  .sidebar {
    width: 280px; min-width: 280px; height: 100%;
    background: var(--bg-surface);
    border-right: 1px solid var(--border);
    display: flex; flex-direction: column;
    z-index: 50;
  }
  .sidebar-header {
    padding: 20px 16px 12px; padding-top: calc(20px + env(safe-area-inset-top));
    border-bottom: 1px solid var(--border);
  }
  .sidebar-logo { font-size: 22px; font-weight: 700; }
  .status-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
  .status-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--text-muted); transition: background 0.3s;
  }
  .status-dot.connected { background: #4ade80; box-shadow: 0 0 8px rgba(74,222,128,0.4); }
  .status-dot.large { width: 10px; height: 10px; }
  .status-text { font-size: 11px; color: var(--text-muted); text-transform: capitalize; }
  .my-peer-id { margin-top: 8px; }
  .my-peer-label { font-size: 9px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; display: block; }
  .my-peer-code {
    font-family: var(--font-mono); font-size: 11px; color: var(--gold-light);
    background: var(--bg-elevated); padding: 2px 6px; border-radius: 4px;
    display: inline-block; margin-top: 2px; word-break: break-all;
  }

  .sidebar-section-label {
    padding: 12px 16px 6px; font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--text-muted);
  }

  .chat-list { flex: 1; overflow-y: auto; padding-bottom: 8px; }
  .chat-row {
    display: flex; align-items: center; gap: 12px;
    width: 100%; padding: 10px 16px; border: none; background: transparent;
    cursor: pointer; transition: background 0.12s; text-align: left;
  }
  .chat-row:hover { background: var(--bg-elevated); }
  .chat-row.active { background: var(--gold-glow2); border-left: 2px solid var(--gold); }

  .avatar {
    width: 40px; height: 40px; border-radius: 50%;
    background: var(--gold-glow); color: var(--gold-light);
    display: flex; align-items: center; justify-content: center;
    font-weight: 600; font-size: 15px; flex-shrink: 0;
  }
  .avatar.small { width: 32px; height: 32px; font-size: 13px; }

  .chat-row-info { flex: 1; min-width: 0; }
  .chat-row-top { display: flex; justify-content: space-between; align-items: baseline; }
  .chat-row-name { font-size: 14px; font-weight: 500; color: var(--text-primary); }
  .chat-row-time { font-size: 10px; color: var(--text-muted); flex-shrink: 0; margin-left: 8px; }
  .chat-row-preview { font-size: 12px; color: var(--text-muted); display: block; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .sidebar-footer { padding: 12px 16px; border-top: 1px solid var(--border); }
  .sidebar-footer-text { font-size: 10px; color: var(--text-muted); }
  .call-peer-section { margin-bottom: 10px; }
  .call-peer-row { display: flex; gap: 6px; margin-top: 6px; }
  .call-peer-input {
    flex: 1; padding: 6px 10px; border-radius: 8px;
    border: 1px solid var(--border); background: var(--bg-elevated);
    color: var(--text-primary); font-size: 12px; outline: none;
    font-family: var(--font-mono);
  }
  .call-peer-input:focus { border-color: var(--gold-dim); }
  .call-peer-input::placeholder { color: var(--text-muted); }
  .call-peer-btn {
    padding: 6px 14px; border-radius: 8px; border: none;
    background: var(--gold-dim); color: var(--bg-base);
    font-size: 12px; font-weight: 600; cursor: pointer;
    transition: background 0.15s;
  }
  .call-peer-btn:hover { background: var(--gold); }
  .call-peer-btn:disabled { opacity: 0.3; cursor: default; }

  .empty-state { text-align: center; padding: 40px 20px; }
  .empty-icon { font-size: 32px; margin-bottom: 8px; }
  .empty-title { font-size: 14px; color: var(--text-secondary); margin-bottom: 4px; }
  .empty-sub { font-size: 11px; color: var(--text-muted); }

  /* ── Main area ────────────────────────────────────────────────── */
  .main-area {
    flex: 1; display: flex; flex-direction: column;
    height: 100%; overflow: hidden;
  }

  /* ── Desktop welcome ─────────────────────────────────────────── */
  .desktop-welcome {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 12px;
    padding: 40px;
  }
  .welcome-logo { font-size: 56px; }
  .welcome-title { font-size: 32px; font-weight: 700; }
  .welcome-sub { font-size: 14px; color: var(--text-secondary); text-align: center; line-height: 1.6; }
  .welcome-status { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-muted); margin-top: 8px; }
  .welcome-hint { font-size: 12px; color: var(--text-muted); text-align: center; margin-top: 20px; line-height: 1.6; }
  .welcome-peer-id {
    margin-top: 12px; padding: 12px 20px;
    background: var(--bg-elevated); border-radius: 12px;
    border: 1px solid var(--border); text-align: center;
  }
  .welcome-peer-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; display: block; }
  .welcome-peer-code {
    font-family: var(--font-mono); font-size: 14px; color: var(--gold-light);
    display: block; margin-top: 4px; word-break: break-all;
  }
  .welcome-actions { margin-top: 12px; }
  .welcome-btn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 10px 20px; border-radius: 10px;
    border: 1px solid var(--border); background: var(--bg-elevated);
    color: var(--text-secondary); font-size: 13px; cursor: pointer;
    transition: all 0.15s;
  }
  .welcome-btn:hover { border-color: var(--gold-dim); color: var(--gold); }

  /* ── Chat header ──────────────────────────────────────────────── */
  .chat-header {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; padding-top: calc(10px + env(safe-area-inset-top));
    flex-shrink: 0;
  }
  .chat-header-info { flex: 1; min-width: 0; }
  .chat-header-name { font-size: 15px; font-weight: 600; color: var(--text-primary); display: block; }
  .chat-header-status { font-size: 11px; color: #4ade80; }
  .end-chat-btn {
    width: 32px; height: 32px; border-radius: 50%;
    border: 1px solid rgba(239, 68, 68, 0.25); background: transparent;
    color: #f87171; font-size: 14px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.15s; flex-shrink: 0;
  }
  .end-chat-btn:hover { background: rgba(239, 68, 68, 0.15); border-color: #ef4444; }

  /* ── Messages ─────────────────────────────────────────────────── */
  .msg-row { display: flex; padding: 2px 12px 2px 40px; animation: msgIn 0.2s var(--ease-out); }
  .msg-row.me { justify-content: flex-end; padding: 2px 40px 2px 12px; }
  .msg-bubble {
    max-width: 72%; padding: 10px 14px; border-radius: 16px;
    background: var(--bg-surface); border: 1px solid var(--border);
  }
  .msg-bubble.me {
    background: linear-gradient(135deg, rgba(201,168,76,0.15), rgba(201,168,76,0.06));
    border-color: var(--gold-glow);
  }
  .msg-bubble.expired {
    background: rgba(239, 68, 68, 0.08); border-color: rgba(239, 68, 68, 0.15);
    color: #f87171; font-size: 12px; text-align: center; padding: 8px 16px;
  }
  .msg-bubble.view-once-bubble {
    background: rgba(239, 68, 68, 0.04); border-color: rgba(239, 68, 68, 0.1);
  }
  .msg-text { font-size: 14px; line-height: 1.5; color: var(--text-primary); }
  .msg-meta { display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-top: 4px; }
  .msg-time { font-size: 10px; color: var(--text-muted); }
  .msg-expiry { font-size: 10px; color: #f87171; font-family: var(--font-mono); }
  .msg-status { color: var(--text-muted); display: flex; }

  /* ── Empty chat ───────────────────────────────────────────────── */
  .empty-chat { text-align: center; padding: 60px 20px; color: var(--text-muted); }

  /* ── Input bar ────────────────────────────────────────────────── */
  .input-bar {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px; padding-bottom: calc(8px + env(safe-area-inset-bottom));
    flex-shrink: 0;
  }
  .input-wrapper { flex: 1; }
  .msg-input {
    width: 100%; padding: 10px 14px; border-radius: 12px;
    border: 1px solid var(--border); background: var(--bg-elevated);
    color: var(--text-primary); font-size: 14px; outline: none;
    transition: border-color 0.15s; font-family: var(--font-main);
  }
  .msg-input:focus { border-color: var(--gold-dim); }
  .msg-input::placeholder { color: var(--text-muted); }
  .send-btn {
    display: flex; align-items: center; justify-content: center;
    width: 38px; height: 38px; border-radius: 50%;
    background: var(--gold-dim); color: var(--bg-base);
    border: none; cursor: pointer; transition: all 0.15s;
    flex-shrink: 0;
  }
  .send-btn:hover { background: var(--gold); transform: scale(1.05); }
  .send-btn:disabled { opacity: 0.3; cursor: default; transform: none; }

  /* ── Settings scroll ──────────────────────────────────────────── */
  .settings-scroll { flex: 1; overflow-y: auto; }

  /* ── Overlay ──────────────────────────────────────────────────── */
  .sidebar-overlay {
    display: none; position: fixed; inset: 0; z-index: 45;
    background: rgba(0,0,0,0.5); backdrop-filter: blur(2px);
    border: none; cursor: pointer;
  }

  /* ── Settings divider ────────────────────────────────────────── */
  .settings-divider {
    height: 1px; background: var(--border); margin: 0 16px;
  }

  /* ── Bottom nav wrapper ─────────────────────────────────────── */
  .bottom-nav-wrapper {
    display: none;
  }

  /* ── Mobile responsive ────────────────────────────────────────── */
  @media (max-width: 768px) {
    .top-bar { display: flex; }
    .sidebar {
      position: fixed; top: 0; left: 0; bottom: 0; z-index: 60;
      transform: translateX(-100%); transition: transform 0.25s var(--ease-out);
    }
    .sidebar.open { transform: translateX(0); }
    .sidebar-overlay { display: block; }
    .main-area {
      margin-top: calc(56px + env(safe-area-inset-top));
      height: calc(100% - 56px - env(safe-area-inset-top));
    }
    .bottom-nav-wrapper { display: block; }
    .main-area { padding-bottom: 60px; } /* space for bottom nav */
    .msg-row { padding: 2px 8px 2px 20px; }
    .msg-row.me { padding: 2px 20px 2px 8px; }
  }
</style>
