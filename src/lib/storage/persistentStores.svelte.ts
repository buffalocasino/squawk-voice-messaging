/**
 * persistentStores.svelte.ts — Svelte 5 rune-based message and contact stores
 * with encrypted IndexedDB persistence via SecureVault.
 *
 * Messages and contacts survive page reloads. All data is AES-256-GCM encrypted
 * at rest using a key derived from the user's Olm identity keys. The vault must
 * be opened via initPersistence() before the stores are used.
 *
 * Key design decisions:
 * - $state at module scope (NOT inside a factory function) — required by Svelte 5
 * - Writes are async to vault, reads are sync from $state
 * - The vault is the source of truth on startup, $state is the runtime cache
 */

import { getVault } from './SecureVault.js'

// ─── Module-level reactive state ───────────────────────────────────────────

let _ready = $state(false)
let _messages = $state([])
let _contacts = $state([])
let _selectedContact = $state(null)

// ─── Public store interface ────────────────────────────────────────────────

export const persistentMessages = {
  get ready() { return _ready },
  get items() { return _messages },

  /** Initialize: load all messages from vault */
  async init() {
    const vault = getVault()
    if (!vault) return
    const rows = await vault.getAll('messages')
    _messages = rows.map(r => r.value)
    _ready = true
  },

  /** Add a message — updates $state immediately, persists async */
  async add(msg) {
    _messages = [..._messages, msg]
    const vault = getVault()
    if (vault) {
      vault.put('messages', msg.id, msg).catch(err =>
        console.warn('[persistentMessages] persist failed:', err)
      )
    }
    return msg
  },

  /** Update a message by id (e.g., status change) */
  async update(id, patch) {
    _messages = _messages.map(m => m.id === id ? { ...m, ...patch } : m)
    const updated = _messages.find(m => m.id === id)
    const vault = getVault()
    if (vault && updated) {
      vault.put('messages', id, updated).catch(err =>
        console.warn('[persistentMessages] update persist failed:', err)
      )
    }
  },

  /** Delete a message (DOD overwrite first, then remove from store + vault) */
  async delete(id) {
    _messages = _messages.filter(m => m.id !== id)
    const vault = getVault()
    if (vault) {
      vault.delete('messages', id).catch(err =>
        console.warn('[persistentMessages] delete failed:', err)
      )
    }
  },

  /** Wipe all messages — overwrite each in vault before clearing */
  async wipeAll() {
    _messages = []
    const vault = getVault()
    if (vault) {
      await vault.clear('messages').catch(() => {})
    }
  },

  /** Get all messages for a specific chat (by contact id) */
  forChat(contactId) {
    return _messages.filter(m => m.to === contactId || m.from === contactId)
  },

  /** Get last message for a contact (for chat preview) */
  lastFor(contactId) {
    const msgs = this.forChat(contactId)
    return msgs.length ? msgs[msgs.length - 1] : null
  },

  /** Count */
  get count() { return _messages.length },
}

export const persistentContacts = {
  get ready() { return _ready },
  get items() { return _contacts },

  async init() {
    const vault = getVault()
    if (!vault) return
    const rows = await vault.getAll('contacts')
    _contacts = rows.map(r => r.value)
  },

  async add(contact) {
    _contacts = [..._contacts, contact]
    const vault = getVault()
    if (vault) {
      vault.put('contacts', contact.id, contact).catch(() => {})
    }
  },

  async update(id, patch) {
    _contacts = _contacts.map(c => c.id === id ? { ...c, ...patch } : c)
    const updated = _contacts.find(c => c.id === id)
    const vault = getVault()
    if (vault && updated) {
      vault.put('contacts', id, updated).catch(() => {})
    }
  },

  async delete(id) {
    _contacts = _contacts.filter(c => c.id !== id)
    const vault = getVault()
    if (vault) vault.delete('contacts', id).catch(() => {})
  },

  findByPeerId(peerId) {
    return _contacts.find(c => c.peerId === peerId)
  },

  get count() { return _contacts.length },
}

export const persistentSelectedContact = {
  get current() { return _selectedContact },
  set(contact) { _selectedContact = contact },
  clear() { _selectedContact = null },
}

// ─── Bootstrap — call once after vault is opened ───────────────────────────

let _initialized = false

export async function initPersistence() {
  if (_initialized) return
  await persistentMessages.init()
  await persistentContacts.init()
  _initialized = true
}

export function isPersistenceReady() {
  return _ready && _initialized
}
