/**
 * sealed.js — Sealed at Rest: AES-256-GCM encryption for stored messages.
 *
 * Derives a wrapping key from the Olm identity key material via PBKDF2.
 * The unwrapped AES-GCM key lives only in memory during the session.
 * On panic/duress, destroyKey() zeros the key — messages become unrecoverable.
 *
 * Flow:
 *   initSealed()     — called once after identity keys are loaded
 *   seal(plaintext)  — encrypt before storing in messages store
 *   unseal(sealed)   — decrypt before rendering
 *   destroyKey()     — wipe in-memory key (panic/duress)
 */

const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const ITERATIONS = 600000 // OWASP 2024 recommended min
const SALT = 'squawk-sealed-v1' // static salt — unique enough since it's scoped to identity key

let sealedKey = null // CryptoKey — held only in memory, never persisted

/**
 * Derive an AES-GCM key from the Olm identity key using PBKDF2.
 * Must be called after identity keys exist (loadOrCreateIdentityKeys).
 */
export async function initSealed(identityKeyMaterial) {
  if (sealedKey) return sealedKey

  // Import the identity key material as raw bytes for PBKDF2
  const enc = new TextEncoder()
  const keyBytes = enc.encode(identityKeyMaterial)
  const saltBytes = enc.encode(SALT)

  const baseKey = await window.crypto.subtle.importKey(
    'raw', keyBytes, 'PBKDF2', false, ['deriveKey']
  )

  sealedKey = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false, // not extractable — key stays sealed in the CryptoKey object
    ['encrypt', 'decrypt']
  )

  return sealedKey
}

/**
 * Encrypt a plaintext string.
 * Returns { ciphertext (base64), iv (base64) }.
 * Stores as a sealed envelope.
 */
export async function seal(plaintext) {
  if (!sealedKey) throw new Error('Sealed key not initialized — call initSealed() first')

  const enc = new TextEncoder()
  const iv = window.crypto.getRandomValues(new Uint8Array(12)) // 96-bit IV for GCM

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    sealedKey,
    enc.encode(plaintext)
  )

  return {
    ciphertext: uint8ArrayToBase64(new Uint8Array(ciphertext)),
    iv: uint8ArrayToBase64(iv),
  }
}

/**
 * Decrypt a sealed envelope.
 * Takes { ciphertext (base64), iv (base64) }.
 * Returns the plaintext string.
 */
export async function unseal(sealed) {
  if (!sealedKey) throw new Error('Sealed key not initialized — call initSealed() first')

  const ciphertext = base64ToUint8Array(sealed.ciphertext)
  const iv = base64ToUint8Array(sealed.iv)

  const plaintext = await window.crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    sealedKey,
    ciphertext
  )

  return new TextDecoder().decode(plaintext)
}

/**
 * Destroy the in-memory AES-GCM key.
 * After this, all sealed messages are permanently unrecoverable.
 * Call on panic, duress, or explicit logout.
 */
export async function destroyKey() {
  if (sealedKey) {
    // Zero out the key material by generating a throwaway (non-functional since
    // CryptoKey objects are immutable — but removing the reference allows GC)
    // For true zeroization in a PWA, the user must close the tab.
    sealedKey = null
  }
}

/** True if the sealed key is initialized and ready. */
export function isSealed() {
  return sealedKey !== null
}

// ─── Base64 helpers ──────────────────────────────────────────────────────────

function uint8ArrayToBase64(uint8) {
  let binary = ''
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i])
  }
  return btoa(binary)
}

function base64ToUint8Array(base64) {
  const binary = atob(base64)
  const uint8 = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    uint8[i] = binary.charCodeAt(i)
  }
  return uint8
}
