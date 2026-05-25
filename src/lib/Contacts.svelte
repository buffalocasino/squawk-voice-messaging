<script>
  /**
   * T5-3 — Contact Management
   * Stores contacts in localStorage key 'squawk_contacts'
   * Contacts: { id, name, peerId, publicKey, lastSeen }
   */
  import { onMount } from 'svelte'

  const STORAGE_KEY = 'squawk_contacts'

  let contacts = $state([])
  let newName = $state('')
  let newPeerId = $state('')
  let newKey = $state('')
  let showAdd = $state(false)
  let added = $state(false)

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
    // Sort by lastSeen desc
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

  function formatTime(ts) {
    if (!ts) return 'Never'
    const d = new Date(ts)
    const now = new Date()
    const diff = now - d
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return d.toLocaleDateString()
  }
</script>

<div class="space-y-3">
  <div class="flex items-center justify-between">
    <h3 class="font-semibold text-sm text-gray-300">Contacts</h3>
    <button
      onclick={() => { showAdd = !showAdd }}
      class="text-xs text-brand-400 hover:text-brand-300 transition-colors font-medium"
    >
      {showAdd ? 'Cancel' : '+ Add'}
    </button>
  </div>

  {#if showAdd}
    <div class="bg-gray-900 rounded-xl p-3 space-y-2">
      <input
        bind:value={newName}
        placeholder="Display name"
        class="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      <input
        bind:value={newPeerId}
        placeholder="Peer ID"
        class="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      <input
        bind:value={newKey}
        placeholder="Public key (optional)"
        class="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      <button
        onclick={addContact}
        class="w-full py-2 bg-brand-600 hover:bg-brand-500 rounded-lg text-sm font-semibold transition-colors"
      >
        {added ? '✓ Added' : 'Add Contact'}
      </button>
    </div>
  {/if}

  {#if contacts.length === 0}
    <p class="text-xs text-gray-500 py-3 text-center">No contacts yet. Add someone to start chatting.</p>
  {:else}
    <div class="space-y-1">
      {#each contacts as contact (contact.id)}
        <div class="flex items-center gap-2 bg-gray-900 rounded-xl px-3 py-2.5">
          <div class="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
            {contact.name[0]?.toUpperCase() || '?'}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-white truncate">{contact.name}</p>
            <p class="text-[10px] text-gray-500 truncate">{contact.peerId}</p>
          </div>
          <span class="text-[10px] text-gray-600 flex-shrink-0">{formatTime(contact.lastSeen)}</span>
          <button
            onclick={() => removeContact(contact.id)}
            class="p-1 text-gray-600 hover:text-red-400 transition-colors flex-shrink-0"
            aria-label="Remove contact"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>