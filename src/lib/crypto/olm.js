/**
 * Olm wrapper — loads WASM, exposes typed E2EE primitives.
 * Double Ratchet per peer. Stores pickled state in localStorage.
 */

let olm = null
let wasmReady = false

export async function initOlm() {
  if (wasmReady) return olm
  const module = await import('@matrix-org/olm')
  await module.init()
  olm = module
  wasmReady = true
  return olm
}

export function isOlmReady() {
  return wasmReady
}

// ─── Identity key management ───────────────────────────────────────────────────

/**
 * Create a new Olm Account (which holds the Ed25519 identity key pair).
 * Store the pickled account in localStorage.
 */
export async function generateIdentityKeys() {
  await initOlm()

  // Creating a new Account automatically generates the Ed25519 identity key pair
  const account = new olm.Account()
  account.generateOneTimeKeys(1) // also ensures identity keys are generated

  // Extract our Ed25519 identity key (the public part we share with peers)
  const ik = JSON.parse(account.identityKeys())
  const ed25519Key = ik.ed25519

  const identityKeys = {
    ed25519: ed25519Key,
    pickled: account.pickle({ pickleKey: 'squawk-local-key' }),
    createdAt: Date.now(),
  }
  account.free()
  saveIdentityKeys(identityKeys)
  return identityKeys
}

export async function loadOrCreateIdentityKeys() {
  const stored = loadIdentityKeys()
  if (stored) return stored
  return generateIdentityKeys()
}

export function saveIdentityKeys(keys) {
  localStorage.setItem('squawk_identity', JSON.stringify(keys))
}

export function loadIdentityKeys() {
  try {
    const raw = localStorage.getItem('squawk_identity')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Unpickle our Olm Account for read/write operations.
 */
function unpickleAccount() {
  const identity = loadIdentityKeys()
  if (!identity) throw new Error('No identity keys — call loadOrCreateIdentityKeys first')
  const account = new olm.Account()
  account.unpickle({ pickleKey: 'squawk-local-key', pickled: identity.pickled })
  return { account, identity }
}

// ─── One-time key management ───────────────────────────────────────────────────

/**
 * Generate and publish one or more one-time keys (Curve25519).
 * Returns the raw key objects needed for session creation by peers.
 */
export async function publishOneTimeKeys(count = 1) {
  await initOlm()
  const { account, identity } = unpickleAccount()
  account.generateOneTimeKeys(count)
  const raw = account.getOneTimeKeys()
  identity.pickled = account.pickle({ pickleKey: 'squawk-local-key' })
  saveIdentityKeys(identity)
  account.free()
  return JSON.parse(raw)
}

/**
 * Get our current one-time key bundle (identity key + next OTK).
 * This is what we send to the signaling server so peers can initiate sessions.
 */
export async function getKeyBundle() {
  await initOlm()
  const identity = loadOrCreateIdentityKeys()
  const otks = await publishOneTimeKeys(1)
  // First OTK: the key from the first (and only) identity in the curve25519 object
  const curveKeys = Object.values(otks.curve25519)
  const firstOtKey = curveKeys[0]
  return {
    identityKey: identity.ed25519,
    oneTimeKey: firstOtKey,
  }
}

// ─── Session management ────────────────────────────────────────────────────────

const SESSION_PREFIX = 'squawk_session_'

/**
 * Initiate an outbound session with a peer using their identity key + OTK.
 * @param {string} theirIdentityKey  — peer's Ed25519 identity key (base64)
 * @param {string} theirOneTimeKey  — one of their OTKs (base64)
 * @param {string} theirPeerId      — peer identifier for session namespacing
 */
export async function createOutboundSession(theirIdentityKey, theirOneTimeKey, theirPeerId) {
  await initOlm()

  const { account, identity } = unpickleAccount()

  const session = new olm.Session()
  session.create_outbound({
    account,
    their_identity_key: theirIdentityKey,
    their_one_time_key: theirOneTimeKey,
  })

  // Consuming an OTK modifies the account — persist the new state
  identity.pickled = account.pickle({ pickleKey: 'squawk-local-key' })
  saveIdentityKeys(identity)
  account.free()

  const sessionId = `outbound_${theirPeerId}`
  saveSession(sessionId, session)
  return sessionId
}

/**
 * Accept an inbound session from a peer's pre-key bundle.
 * Used when a peer initiates contact with us.
 */
export async function createInboundSession(theirIdentityKey, theirOneTimeKey, theirPeerId) {
  await initOlm()

  const { account, identity } = unpickleAccount()

  const session = new olm.Session()
  session.create_inbound({
    account,
    their_identity_key: theirIdentityKey,
    their_one_time_key: theirOneTimeKey,
  })

  // Remove the consumed OTK from our account
  account.removeOneTimeKeys(session)
  identity.pickled = account.pickle({ pickleKey: 'squawk-local-key' })
  saveIdentityKeys(identity)
  account.free()

  const sessionId = `inbound_${theirPeerId}`
  saveSession(sessionId, session)
  return sessionId
}

/**
 * Encrypt a plaintext string. Returns the Olm message body (base64).
 * The caller wraps this in an envelope with type and sender info.
 */
export async function encrypt(sessionId, plaintext) {
  await initOlm()
  const session = loadSession(sessionId)
  if (!session) throw new Error(`Session not found: ${sessionId}`)

  // Olm encrypt returns { type: number, body: string }
  const result = session.encrypt(plaintext)
  saveSession(sessionId, session) // ratchet state advances after encrypt

  // Return just the body — the type prefix is handled by the session for decrypt
  return result.body
}

/**
 * Decrypt an Olm message body. Returns plaintext string.
 * The session automatically handles the message type prefix internally.
 */
export async function decrypt(sessionId, body) {
  await initOlm()
  const session = loadSession(sessionId)
  if (!session) throw new Error(`Session not found: ${sessionId}`)

  // Olm decrypt returns the plaintext directly
  const plaintext = session.decrypt(body)
  saveSession(sessionId, session) // ratchet state advances after decrypt
  return plaintext
}

// ─── Session persistence ───────────────────────────────────────────────────────

function sessionKey(sessionId) {
  return `${SESSION_PREFIX}${sessionId}`
}

export function saveSession(sessionId, session) {
  try {
    const pickled = session.pickle({ pickleKey: 'squawk-session-key' })
    localStorage.setItem(sessionKey(sessionId), JSON.stringify({
      sessionId,
      pickled,
      updatedAt: Date.now(),
    }))
  } catch (err) {
    console.warn('Failed to persist session:', err)
  }
}

export function loadSession(sessionId) {
  try {
    const raw = localStorage.getItem(sessionKey(sessionId))
    if (!raw) return null
    const { pickled } = JSON.parse(raw)
    const session = new olm.Session()
    session.unpickle({ pickleKey: 'squawk-session-key', pickled })
    return session
  } catch {
    return null
  }
}

export function listSessions() {
  const sessions = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key.startsWith(SESSION_PREFIX)) {
      try {
        const raw = localStorage.getItem(key)
        sessions.push(JSON.parse(raw))
      } catch {}
    }
  }
  return sessions
}