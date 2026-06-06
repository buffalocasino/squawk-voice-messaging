/**
 * SecureVault — IndexedDB + AES-256-GCM encrypted persistence.
 *
 * Every stored object is sealed with a key derived from the user's Olm
 * identity keys. The vault key lives only in memory. On panic/destroy,
 * the key is zeroed and the database is deleted — all data is unrecoverable.
 *
 * Flow:
 *   vault = await SecureVault.open(identityKeyMaterial)
 *   await vault.put('messages', id, { text: 'hello' })
 *   const item = await vault.get('messages', id)
 *   await vault.destroy()  // wipe everything
 */

const DB_NAME = 'squawk_vault'
const DB_VERSION = 1
const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const ITERATIONS = 600000
const SALT = 'squawk-vault-v2'

// ─── Base64 helpers (zero-dependency) ───────────────────────────────────────

function uint8ToB64(uint8) {
  let binary = ''
  for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i])
  return btoa(binary)
}

function b64ToUint8(b64) {
  const binary = atob(b64)
  const uint8 = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) uint8[i] = binary.charCodeAt(i)
  return uint8
}

// ─── Single vault instance (module-level singleton) ─────────────────────────

let _instance = null
let _cryptoKey = null

/**
 * Open (or return existing) the SecureVault.
 * @param {string} identityKeyMaterial — Olm identity key material for KDF
 * @returns {Promise<SecureVault>}
 */
export async function openVault(identityKeyMaterial) {
  if (_instance) return _instance

  // Derive the AES-GCM key from identity material
  if (!_cryptoKey) {
    const enc = new TextEncoder()
    const keyBytes = enc.encode(identityKeyMaterial)
    const saltBytes = enc.encode(SALT)

    const baseKey = await crypto.subtle.importKey(
      'raw', keyBytes, 'PBKDF2', false, ['deriveKey']
    )

    _cryptoKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: saltBytes, iterations: ITERATIONS, hash: 'SHA-256' },
      baseKey,
      { name: ALGORITHM, length: KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    )
  }

  _instance = new SecureVault(_cryptoKey)
  await _instance._openDB()
  return _instance
}

/**
 * Get the current vault instance (null if not opened).
 */
export function getVault() {
  return _instance
}

/**
 * Destroy the vault: close DB, delete it, zero the key.
 * After this, all data is irrecoverable.
 */
export async function destroyVault() {
  if (_instance) {
    await _instance._closeDB()
    await _instance._deleteDB()
    _instance = null
  }
  _cryptoKey = null
}

// ─── SecureVault class ──────────────────────────────────────────────────────

class SecureVault {
  /** @param {CryptoKey} cryptoKey — AES-GCM key for encryption */
  constructor(cryptoKey) {
    this._cryptoKey = cryptoKey
    this._db = null
  }

  // ── IndexedDB lifecycle ──

  async _openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)

      req.onupgradeneeded = (e) => {
        const db = e.target.result
        if (!db.objectStoreNames.contains('messages')) {
          db.createObjectStore('messages', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('contacts')) {
          db.createObjectStore('contacts', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'sessionId' })
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' })
        }
      }

      req.onsuccess = (e) => {
        this._db = e.target.result
        this._db.onclose = () => { this._db = null }
        resolve()
      }
      req.onerror = () => reject(req.error)
    })
  }

  async _closeDB() {
    if (this._db) {
      this._db.close()
      this._db = null
    }
  }

  async _deleteDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
      req.onblocked = () => {
        console.warn('[SecureVault] Database deletion blocked — retrying in 100ms')
        setTimeout(() => {
          const retry = indexedDB.deleteDatabase(DB_NAME)
          retry.onsuccess = () => resolve()
          retry.onerror = () => reject(retry.error)
        }, 100)
      }
    })
  }

  // ── Encryption primitives ──

  async _encrypt(plaintext) {
    const enc = new TextEncoder()
    const iv = crypto.getRandomValues(new Uint8Array(12))

    const ciphertext = await crypto.subtle.encrypt(
      { name: ALGORITHM, iv },
      this._cryptoKey,
      enc.encode(plaintext)
    )

    return {
      ct: uint8ToB64(new Uint8Array(ciphertext)),
      iv: uint8ToB64(iv),
    }
  }

  async _decrypt(envelope) {
    const ciphertext = b64ToUint8(envelope.ct)
    const iv = b64ToUint8(envelope.iv)

    const plaintext = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      this._cryptoKey,
      ciphertext
    )

    return new TextDecoder().decode(plaintext)
  }

  // ── CRUD operations ──

  /**
   * Store a value. Encrypts before writing.
   * @param {string} store — object store name
   * @param {string|number} id — key
   * @param {*} value — JSON-serializable value
   */
  async put(store, id, value) {
    if (!this._db) throw new Error('Vault not open')
    const plaintext = JSON.stringify({ v: value, ts: Date.now() })
    const envelope = await this._encrypt(plaintext)
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(store, 'readwrite')
      const objStore = tx.objectStore(store)
      const req = objStore.put({ id, ...envelope })
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  /**
   * Retrieve a value. Decrypts after reading.
   * @returns {*} — the decrypted value, or null if not found
   */
  async get(store, id) {
    if (!this._db) throw new Error('Vault not open')
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(store, 'readonly')
      const objStore = tx.objectStore(store)
      const req = objStore.get(id)
      req.onsuccess = async () => {
        const row = req.result
        if (!row) return resolve(null)
        try {
          const plaintext = await this._decrypt(row)
          const parsed = JSON.parse(plaintext)
          resolve(parsed.v)
        } catch (err) {
          console.warn('[SecureVault] Decrypt failed for', store, id, err)
          resolve(null)
        }
      }
      req.onerror = () => reject(req.error)
    })
  }

  /**
   * Retrieve all values from a store. Decrypts each.
   * @returns {Array<{id, value}>}
   */
  async getAll(store) {
    if (!this._db) throw new Error('Vault not open')
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(store, 'readonly')
      const objStore = tx.objectStore(store)
      const req = objStore.getAll()
      req.onsuccess = async () => {
        const rows = req.result || []
        const results = []
        for (const row of rows) {
          try {
            const plaintext = await this._decrypt(row)
            const parsed = JSON.parse(plaintext)
            results.push({ id: row.id, value: parsed.v, ts: parsed.ts })
          } catch (err) {
            console.warn('[SecureVault] Decrypt failed for row', row.id, err)
          }
        }
        resolve(results)
      }
      req.onerror = () => reject(req.error)
    })
  }

  /**
   * Delete a single entry.
   */
  async delete(store, id) {
    if (!this._db) throw new Error('Vault not open')
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(store, 'readwrite')
      const objStore = tx.objectStore(store)
      const req = objStore.delete(id)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  /**
   * Delete all entries in a store.
   */
  async clear(store) {
    if (!this._db) throw new Error('Vault not open')
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(store, 'readwrite')
      const objStore = tx.objectStore(store)
      const req = objStore.clear()
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  /**
   * Count entries in a store.
   */
  async count(store) {
    if (!this._db) return 0
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(store, 'readonly')
      const req = tx.objectStore(store).count()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
}
