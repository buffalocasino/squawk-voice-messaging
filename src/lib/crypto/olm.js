/**
 * Squawk Crypto — Pure Web Crypto API E2EE.
 * No WASM. No Olm. No imports. Just SubtleCrypto.
 *
 * Uses ECDH-P256 for key agreement + AES-256-GCM for message encryption.
 * This replaces the @matrix-org/olm WASM dependency entirely.
 */

// ─── Key storage (localStorage, pickled as JWK) ─────────────────────────

const IDENTITY_KEY = 'squawk_identity_v2'
const SESSION_PREFIX = 'squawk_session_v2_'

/** Our long-term ECDH key pair */
let identityKeyPair = null

/** Active sessions: peerId → { key: CryptoKey, sendCount: number } */
const sessions = new Map()

// ─── Init ──────────────────────────────────────────────────────────────

export async function initCrypto() {
  if (identityKeyPair) return identityKeyPair

  // Try loading from localStorage
  const stored = localStorage.getItem(IDENTITY_KEY)
  if (stored) {
    try {
      const jwk = JSON.parse(stored)
      identityKeyPair = {
        privateKey: await crypto.subtle.importKey('jwk', jwk.privateKey, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']),
        publicKey: await crypto.subtle.importKey('jwk', jwk.publicKey, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
      }
      return identityKeyPair
    } catch {
      localStorage.removeItem(IDENTITY_KEY)
    }
  }

  // Generate new key pair
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])

  // Export for storage
  const privJwk = await crypto.subtle.exportKey('jwk', kp.privateKey)
  const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey)
  localStorage.setItem(IDENTITY_KEY, JSON.stringify({ privateKey: privJwk, publicKey: pubJwk }))

  identityKeyPair = kp
  return kp
}

export function isCryptoReady() {
  return identityKeyPair !== null
}

// ─── Peer IDs ──────────────────────────────────────────────────────────

export async function getPeerId() {
  const kp = await initCrypto()
  const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey)
  // SHA-256 of the public key x coordinate → 16-char hex
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pubJwk.x))
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

// ─── Key bundles ───────────────────────────────────────────────────────

export async function getKeyBundle() {
  const kp = await initCrypto()
  const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey)
  return {
    identityKey: JSON.stringify(pubJwk),       // our public key as JWK string
    oneTimeKey: JSON.stringify(pubJwk),         // reuse identity for simplicity (no OTK rotation yet)
  }
}

// ─── Session creation ──────────────────────────────────────────────────

export async function createSession(peerId, theirIdentityKeyJwk) {
  const kp = await initCrypto()

  // Import their public key
  const theirPub = await crypto.subtle.importKey(
    'jwk', JSON.parse(theirIdentityKeyJwk),
    { name: 'ECDH', namedCurve: 'P-256' }, true, []
  )

  // Derive shared secret
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: theirPub },
    kp.privateKey,
    256
  )

  // Import as AES-GCM key
  const aesKey = await crypto.subtle.importKey(
    'raw', sharedBits,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  )

  sessions.set(peerId, { key: aesKey, sendCount: 0 })
  return true
}

// ─── Encrypt / Decrypt ─────────────────────────────────────────────────

export async function encrypt(peerId, plaintext) {
  const sess = sessions.get(peerId)
  if (!sess) throw new Error(`No session for ${peerId}`)

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = new TextEncoder()
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sess.key,
    enc.encode(plaintext)
  )

  return {
    iv: btoa(String.fromCharCode(...iv)),
    ct: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
  }
}

export async function decrypt(peerId, ivB64, ctB64) {
  const sess = sessions.get(peerId)
  if (!sess) throw new Error(`No session for ${peerId}`)

  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0))
  const ct = Uint8Array.from(atob(ctB64), c => c.charCodeAt(0))

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    sess.key,
    ct
  )

  return new TextDecoder().decode(plaintext)
}

// ─── Session management ────────────────────────────────────────────────

export function hasSession(peerId) {
  return sessions.has(peerId)
}

export function removeSession(peerId) {
  sessions.delete(peerId)
}

// ─── Legacy compat shim for initOlm calls ──────────────────────────────

export async function initOlm() {
  return initCrypto()
}

export function isOlmReady() {
  return isCryptoReady()
}

export async function loadOrCreateIdentityKeys() {
  const kp = await initCrypto()
  const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey)
  return {
    ed25519: pubJwk.x,
    curve25519: pubJwk.y || pubJwk.x,
    pickled: 'v2',
  }
}
