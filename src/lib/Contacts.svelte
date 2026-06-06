<script>
  import { messages } from '../stores.js'

  const STORAGE_KEY = 'squawk_contacts'

  let contacts = $state([])
  let newName = $state('')
  let newPeerId = $state('')
  let newKey = $state('')
  let showAdd = $state(false)
  let added = $state(false)

  import { onMount } from 'svelte'

  onMount(() => {
    loadContacts()
  })

  function loadContacts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      contacts = raw ? JSON.parse(raw) : []
    } catch {
      contacts = []
    }
    contacts.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
  }

  function saveContacts(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    contacts = list
  }

  function addContact() {
    if (!newName.trim() || !newPeerId.trim()) return
    const contact = {
      id: Date.now(),
      name: newName.trim(),
      peerId: newPeerId.trim(),
      publicKey: newKey.trim() || null,
      lastSeen: Date.now(),
    }
    saveContacts([contact, ...contacts])
    newName = ''
    newPeerId = ''
    newKey = ''
    showAdd = false
    added = true
    setTimeout(() => { added = false }, 1500)
  }

  function removeContact(id) {
    saveContacts(contacts.filter(c => c.id !== id))
  }

  function lastMessageFor(contactId) {
    const msgs = $messages.filter(m => m.to === contactId || m.from === contactId)
    if (!msgs.length) return null
    return msgs[msgs.length - 1]
  }

  function relTime(ts) {
    if (!ts) return ''
    const diff = Date.now() - ts
    if (diff < 60000) return 'now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
    return new Date(ts).toLocaleDateString()
  }
</script>

<div class="space-y-2 px-4 py-3">
  <div class="flex items-center justify-between">
    <h3 class="font-medium text-xs text-gray-500 uppercase tracking-wider">Contacts</h3>
    <button
      onclick={() => { showAdd = !showAdd }}
      class="text-xs text-phantom-400 hover:text-phantom-300 transition-colors font-medium"
    >
      {showAdd ? 'Cancel' : '+ Add'}
    </button>
  </div>

  {#if showAdd}
    <div class="bg-card rounded-xl p-3 space-y-2 border border-border-subtle">
      <input
        bind:value={newName}
        placeholder="Display name"
        class="w-full bg-surface text-white/90 text-sm px-3 py-2 rounded-lg placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-phantom-500/40 font-normal"
      />
      <input
        bind:value={newPeerId}
        placeholder="Peer ID"
        class="w-full bg-surface text-white/90 text-sm px-3 py-2 rounded-lg placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-phantom-500/40 font-normal"
      />
      <input
        bind:value={newKey}
        placeholder="Public key (optional)"
        class="w-full bg-surface text-white/90 text-sm px-3 py-2 rounded-lg placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-phantom-500/40 font-normal"
      />
      <button
        onclick={addContact}
        class="w-full py-2 bg-phantom-500 hover:bg-phantom-400 rounded-lg text-sm font-medium transition-colors text-white"
      >
        {added ? '✓ Added' : 'Add Contact'}
      </button>
    </div>
  {/if}

  {#if contacts.length === 0}
    <p class="text-xs text-gray-600 py-6 text-center">No saved contacts. Add someone to start chatting.</p>
  {:else}
    <div class="divide-y divide-border-subtle">
      {#each contacts as contact (contact.id)}
        {@const lastMsg = lastMessageFor(contact.id)}
        <div class="flex items-center gap-3 py-3">
          <div class="w-10 h-10 rounded-full bg-phantom-500/15 flex items-center justify-center text-base font-medium text-phantom-300 flex-shrink-0">
            {contact.name[0]?.toUpperCase() || '?'}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between">
              <p class="font-medium text-sm text-white/90 truncate">{contact.name}</p>
              {#if lastMsg}
                <span class="text-[10px] text-gray-600 flex-shrink-0 ml-2">{relTime(lastMsg.time)}</span>
              {:else}
                <span class="text-[10px] text-gray-600 flex-shrink-0 ml-2">{relTime(contact.lastSeen)}</span>
              {/if}
            </div>
            <p class="text-xs text-gray-600 truncate mt-0.5">
              {#if lastMsg}
                {lastMsg.type === 'audio' ? '🎙️ Voice message' : lastMsg.text}
              {:else}
                Peer {contact.peerId?.slice(0, 12)}...
              {/if}
            </p>
          </div>
          <button
            onclick={() => removeContact(contact.id)}
            class="p-1.5 text-gray-700 hover:text-red-400 transition-colors flex-shrink-0 rounded-full hover:bg-card-hover"
            aria-label="Remove contact"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>
