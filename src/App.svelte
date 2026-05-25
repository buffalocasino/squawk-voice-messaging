<script>
  import { selectedContact, messages } from './stores.js'
  import Recorder from './lib/Recorder.svelte'
  import PeerConnection from './lib/PeerConnection.svelte'
  import { swipe } from './lib/touch.js'
  import { installPrompt } from './main.js'
  import { sender } from './lib/crypto/sender.js'
  import { updateMessageStatus } from './stores.js'
  import AudioPlayer from './lib/AudioPlayer.svelte'
  import Settings from './lib/Settings.svelte'

  let currentView = $state('contacts') // contacts | chat | settings
  let newMessageText = $state('')
  let chatScrollEl = $state()

  $effect(() => {
    if (chatScrollEl && $messages.length) {
      setTimeout(() => chatScrollEl.scrollTo({ top: chatScrollEl.scrollHeight, behavior: 'smooth' }), 50)
    }
  })

  function selectContact(contact) {
    selectedContact.set(contact)
    currentView = 'chat'
  }

  function goBack() {
    currentView = 'contacts'
    selectedContact.set(null)
  }

  async function sendText() {
    if (!newMessageText.trim()) return
    const id = Date.now()
    const payload = {
      id,
      type: 'text',
      text: newMessageText,
      from: 'me',
      time: Date.now(),
      status: 'sending',
    }

    // Optimistically add locally
    messages.update(m => [...m, {
      ...payload,
      to: $selectedContact?.id,
      received: false,
    }])
    newMessageText = ''

    // Encrypt and send if we have an active sender
    if (sender) {
      await sender(payload)
      updateMessageStatus(id, 'sent')
    }
  }

  async function handleRecordedAudio(blob, duration) {
    if (!$selectedContact) return

    // Convert blob to base64 for transmission over data channel
    const arrayBuffer = await blob.arrayBuffer()
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

    const id = Date.now()
    const payload = {
      id,
      type: 'audio',
      audioUrl: base64, // inline base64 audio
      duration,
      from: 'me',
      time: Date.now(),
      status: 'sending',
    }

    messages.update(m => [...m, {
      ...payload,
      to: $selectedContact?.id,
      received: false,
    }])

    if (sender) {
      await sender(payload)
      updateMessageStatus(id, 'sent')
    }
  }

  function onSwipeRight() {
    if (currentView === 'chat') goBack()
  }

  function relTime(ts) {
    const diff = Date.now() - ts
    if (diff < 60000) return 'now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
    return new Date(ts).toLocaleDateString()
  }
</script>

{#if $installPrompt}
  <div class="sticky top-0 z-[60] bg-brand-700 px-4 py-2.5 flex items-center justify-between">
    <span class="text-xs font-medium">Install Squawk for encrypted messaging</span>
    <button
      onclick={() => { $installPrompt.prompt(); installPrompt.set(null) }}
      class="px-3 py-1 bg-white/20 rounded-lg text-xs font-semibold active:scale-95 transition-transform"
    >Install</button>
  </div>
{/if}

<div class="h-full flex flex-col bg-gray-950" use:swipe={{ onSwipeRight: onSwipeRight }}>
  <!-- Header -->
  <header class="sticky top-0 z-50 bg-gray-950/80 backdrop-blur-xl border-b border-gray-800 pt-safe-top">
    {#if currentView === 'contacts'}
      <div class="px-4 py-3 flex items-center justify-between">
        <h1 class="text-xl font-bold tracking-tight">Squawk</h1>
        <button onclick={() => { currentView = 'settings'; navigator.vibrate?.(30) }} class="p-2 text-gray-400 active:text-white" aria-label="Settings">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
        </button>
      </div>
    {:else if currentView === 'chat'}
      <div class="px-4 py-3 flex items-center gap-3">
        <button onclick={() => { goBack(); navigator.vibrate?.(30) }} class="p-1 -ml-1 text-gray-400 active:text-white" aria-label="Go back">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div class="w-8 h-8 rounded-full bg-brand-700 flex items-center justify-center text-sm font-bold">
          {$selectedContact?.name?.[0] || '?'}
        </div>
        <div class="flex-1 min-w-0">
          <h2 class="font-semibold text-base truncate">{$selectedContact?.name || 'Unknown'}</h2>
          <p class="text-xs text-green-400">{$selectedContact?.status || 'offline'}</p>
        </div>
      </div>
    {:else if currentView === 'settings'}
      <div class="px-4 py-3 flex items-center gap-3">
        <button onclick={() => currentView = 'contacts' } class="p-1 -ml-1 text-gray-400 active:text-white" aria-label="Go back">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <h2 class="font-semibold text-base">Settings</h2>
      </div>
    {/if}
  </header>

  <!-- Main Content -->
  <main class="flex-1 overflow-y-auto">
    {#if currentView === 'contacts'}
      <div class="p-4 space-y-4">
        <!-- Connection Card -->
        <PeerConnection />

        <!-- Recent Chats -->
        <div class="space-y-2">
          <p class="text-xs text-gray-500 font-medium uppercase tracking-wider px-1">Chats</p>
          {#each $messages.filter((v, i, a) => a.findIndex(t => t.to === v.to) === i).slice(0, 5) as msg}
            <button
              onclick={() => { selectContact({ id: msg.to, name: 'Chat ' + msg.to }); navigator.vibrate?.(30) }}
              class="w-full flex items-center gap-3 bg-gray-900 rounded-xl p-3 active:bg-gray-800 transition-colors"
            >
              <div class="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-lg">💬</div>
              <div class="flex-1 text-left">
                <p class="font-medium text-sm">Chat {msg.to}</p>
                <p class="text-xs text-gray-500 truncate">{msg.type === 'audio' ? '🎙️ Voice message' : msg.text}</p>
              </div>
              <span class="text-[10px] text-gray-600">{relTime(msg.time)}</span>
            </button>
          {:else}
            <div class="text-center py-8 text-gray-500">
              <p class="text-sm">No conversations yet</p>
              <p class="text-xs mt-1">Connect to a peer to start squawking</p>
            </div>
          {/each}
        </div>
      </div>
    {:else if currentView === 'chat'}
      <div class="h-full flex flex-col">
        <!-- Messages -->
        <div bind:this={chatScrollEl} class="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
          {#each $messages.filter(m => m.to === $selectedContact?.id || m.from === $selectedContact?.id) as msg (msg.id)}
            {@const isMe = msg.from === 'me'}
            <div class="flex animate-msg" class:justify-end={isMe} class:justify-start={!isMe}>
              <div
                class="max-w-[80%] rounded-2xl px-4 py-2.5"
                class:bg-brand-600={isMe}
                class:bg-gray-800={!isMe}
              >
                {#if msg.type === 'audio'}
                  <AudioPlayer src={msg.audioUrl} duration={msg.duration || 0} />
                {:else}
                  <p class="text-sm leading-relaxed">{msg.text}</p>
                {/if}
                <span class="text-[10px] opacity-50 mt-1 flex items-center justify-end gap-1">
                  {relTime(msg.time)}
                  {#if isMe}
                    {#if msg.status === 'sending'}
                      <svg class="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    {:else if msg.status === 'sent'}
                      <svg class="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                    {:else if msg.status === 'delivered'}
                      <svg class="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    {:else if msg.status === 'read'}
                      <svg class="w-3 h-3 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    {:else if msg.status === 'failed'}
                      <svg class="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    {/if}
                  {/if}
                </span>
              </div>
            </div>
          {/each}
        </div>

        <!-- Input Area -->
        <div class="p-3 border-t border-gray-800 bg-gray-950 pb-safe-bottom">
          <Recorder onSendAudio={handleRecordedAudio} />
          <div class="flex items-center gap-2 mt-3">
            <input
              bind:value={newMessageText}
              onkeydown={e => e.key === 'Enter' && sendText()}
              placeholder="Type a message..."
              class="flex-1 bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-gray-500"
            />
            <button
              onclick={() => { sendText(); navigator.vibrate?.(50) }}
              class="p-2.5 bg-brand-600 rounded-xl active:scale-90 transition-transform"
              aria-label="Send message"
            >
              <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
            </button>
          </div>
        </div>
      </div>
    {:else if currentView === 'settings'}
      <Settings />
    {/if}
  </main>
</div>