<script>
  import { myPeerId, connectionStatus, messages } from '../stores.js'
  import { loadIdentityKeys, isOlmReady, listSessions } from './crypto/olm.js'
  import { isSealed, destroyKey } from './crypto/sealed.js'
  import { initPanicShake, panic, shutdown } from './crypto/panic.js'
  import { secureWipeLocalStorage } from './crypto/wipe.js'
  import { hasPasscode, setPasscodes, clearPasscodes, verifyPasscode } from './crypto/duress.js'
  import { onMount } from 'svelte'

  let identity = $state(null)
  let sessions = $state([])
  let olmReady = $state(false)
  let copied = $state(false)

  onMount(() => {
    identity = loadIdentityKeys()
    sessions = listSessions()
    olmReady = isOlmReady()
  })

  async function refresh() {
    identity = loadIdentityKeys()
    sessions = listSessions()
    olmReady = isOlmReady()
  }

  function copyId(text) {
    navigator.clipboard.writeText(text)
    copied = true
    setTimeout(() => { copied = false }, 1500)
  }

  function formatKey(key) {
    if (!key) return 'Not generated'
    return key.length > 24 ? key.slice(0, 12) + '…' + key.slice(-8) : key
  }

  function statusClass(status) {
    if (status === 'connected' || status === 'signaling') return 'bg-green-500/10 text-green-400'
    return 'bg-gray-500/10 text-gray-400'
  }

  function olmClass(ready) {
    return ready ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'
  }
</script>

<div class="p-4 space-y-4">
  <!-- Connection Status -->
  <div class="bg-card rounded-2xl p-4 space-y-3">
    <h3 class="font-semibold text-sm text-gray-300">Connection</h3>
    <div class="flex items-center justify-between">
      <span class="text-sm text-gray-400">Signaling</span>
      <span class="text-xs px-2 py-1 rounded-full font-medium capitalize {statusClass($connectionStatus)}">
        {$connectionStatus}
      </span>
    </div>
    <div class="flex items-center justify-between">
      <span class="text-sm text-gray-400">Your Peer ID</span>
      <button onclick={() => copyId($myPeerId)} class="flex items-center gap-1.5 text-xs text-phantom-400 hover:text-phantom-300 transition-colors">
        {$myPeerId || 'Not connected'}
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
      </button>
    </div>
  </div>

  <!-- Encryption Info -->
  <div class="bg-card rounded-2xl p-4 space-y-3">
    <h3 class="font-semibold text-sm text-gray-300">Encryption</h3>
    <div class="flex items-center justify-between">
      <span class="text-sm text-gray-400">End-to-end encryption</span>
      <span class="text-xs text-green-400 font-medium bg-green-500/10 px-2 py-1 rounded-full">Enabled</span>
    </div>
    <div class="flex items-center justify-between">
      <span class="text-sm text-gray-400">Crypto library</span>
      <span class="text-xs text-phantom-400 font-medium bg-phantom-500/10 px-2 py-1 rounded-full">Olm (Matrix)</span>
    </div>
    <div class="flex items-center justify-between">
      <span class="text-sm text-gray-400">Olm state</span>
      <span class="text-xs px-2 py-1 rounded-full font-medium {olmClass(olmReady)}">
        {olmReady ? 'Ready' : 'Initializing…'}
      </span>
    </div>
    {#if identity}
      <div class="pt-2 border-t border-gray-800 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-500">Identity key (Ed25519)</span>
          <button onclick={() => copyId(identity.ed25519)} class="text-xs text-gray-400 hover:text-white transition-colors">
            {formatKey(identity.ed25519)}
            <svg class="w-3 h-3 inline ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
          </button>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-500">Active sessions</span>
          <span class="text-xs text-gray-400">{sessions.length}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-500">Identity created</span>
          <span class="text-xs text-gray-400">{new Date(identity.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
    {/if}
  </div>

  <!-- Peer-to-Peer Info -->
  <div class="bg-card rounded-2xl p-4 space-y-3">
    <h3 class="font-semibold text-sm text-gray-300">Network</h3>
    <div class="flex items-center justify-between">
      <span class="text-sm text-gray-400">Peer-to-peer only</span>
      <span class="text-xs text-phantom-400 font-medium bg-phantom-500/10 px-2 py-1 rounded-full">On</span>
    </div>
    <p class="text-xs text-gray-500 leading-relaxed">
      Squawk routes all voice data directly between peers. No central server stores your messages. The signaling server only helps establish the initial connection.
    </p>
  </div>

  <!-- Share Your Peer ID -->
  <div class="bg-card rounded-2xl p-4 space-y-3">
    <h3 class="font-semibold text-sm text-gray-300">Add Contacts</h3>
    <p class="text-xs text-gray-500 leading-relaxed">
      Share your Peer ID with others so they can connect to you. Your identity key is used to establish an encrypted session — no personal info is shared.
    </p>
    <button
      onclick={() => copyId($myPeerId)}
      class="w-full py-2.5 bg-phantom-500 hover:bg-phantom-400 rounded-xl text-sm font-medium transition-colors active:scale-[0.98]"
    >
      {copied ? '✓ Copied!' : 'Copy My Peer ID'}
    </button>
    <p class="text-xs text-gray-600 text-center">Send this ID to a contact to start a conversation</p>
  </div>

  <!-- Security & Panic -->
  <div class="bg-card rounded-2xl p-4 space-y-3">
    <h3 class="font-semibold text-sm text-gray-300">Security</h3>
    
    <div class="flex items-center justify-between">
      <span class="text-sm text-gray-400">Sealed at Rest</span>
      <span class="text-xs px-2 py-1 rounded-full font-medium {isSealed() ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}">
        {isSealed() ? 'Active (AES-256-GCM)' : 'Not initialized'}
      </span>
    </div>
    
    <div class="flex items-center justify-between">
      <span class="text-sm text-gray-400">Panic Shake</span>
      <span class="text-xs px-2 py-1 rounded-full font-medium bg-green-500/10 text-green-400">Active</span>
    </div>

    <div class="flex items-center justify-between">
      <span class="text-sm text-gray-400">Duress Passcode</span>
      <span class="text-xs px-2 py-1 rounded-full font-medium {hasPasscode() ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-400'}">
        {hasPasscode() ? 'Configured' : 'Not set'}
      </span>
    </div>

    <div class="pt-2 space-y-2">
      <button
        onclick={async () => {
          if (confirm('⚠️ This will wipe ALL messages, session keys, and identity keys. This cannot be undone. This looks like a legitimate panic button to an attacker.')) {
            await panic({ decoyUrl: 'https://google.com' })
          }
        }}
        class="w-full py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl text-sm font-medium transition-colors active:scale-[0.98]"
      >
        ⚠️ Panic & Wipe Everything
      </button>
    </div>
  </div>

  <!-- About -->
  <div class="bg-gray-900 rounded-2xl p-4 space-y-2">
    <h3 class="font-semibold text-sm text-gray-300">About</h3>
    <p class="text-xs text-gray-500">Squawk v0.0.1</p>
    <p class="text-xs text-gray-600">Identity keys are stored locally on this device. No account required.</p>
  </div>

  <!-- Refresh -->
  <button onclick={refresh} class="w-full py-2 bg-card-hover hover:bg-card rounded-xl text-xs text-gray-400 transition-colors">
    Refresh Status
  </button>
</div>