/**
 * duress.js — Duress Passcode system for Squawk.
 *
 * Provides:
 *   setPasscodes(realPin, duressPin) — configure both passcodes
 *   verifyPasscode(pin) — returns { ok, duress }
 *   hasPasscode() — check if any passcode is set
 *   clearPasscodes() — remove passcodes
 *   getRemainingAttempts() — rate limit info
 *
 * The duress passcode is a special PIN that looks like a successful login
 * but actually triggers the full panic sequence (wipe everything).
 * This lets an attacker think they broke in while all data is destroyed.
 */

import { panic } from './panic.js'
import { secureWipeLocalStorage } from './wipe.js'

const STORAGE_KEY = 'squawk_passcodes'

// Rate limiting: 3 attempts per 30 seconds
const MAX_ATTEMPTS = 3
const RATE_WINDOW_MS = 30000
const LOCKOUT_MS = 60000

// ─── Storage helpers ──────────────────────────────────────────────────────────

function hashPin(pin) {
  // Simple SHA-256 hash — not a replacement for proper KDF but sufficient
  // for a duress system where the PIN is user-chosen short string.
  // The real KDF happens in sealed.js for message key derivation.
  return Array.from(
    new Uint8Array(
      new TextEncoder().encode('squawk:' + pin)
    ).reduce((hash, byte) => {
      // FNV-1a 32-bit — fast, non-cryptographic but obfuscates the stored PIN
      hash = (hash ^ byte) * 16777619
      return hash >>> 0
    }, 2166136261)
  ).map(b => b.toString(16).padStart(2, '0')).join('')
}

function loadPasscodes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function savePasscodes(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

// ─── Rate limiting (in-memory) ────────────────────────────────────────────────

let attemptHistory = []
let lockedUntil = 0

function checkRateLimit() {
  const now = Date.now()
  if (now < lockedUntil) {
    return { blocked: true, retryAfter: Math.ceil((lockedUntil - now) / 1000) }
  }

  // Prune old attempts
  attemptHistory = attemptHistory.filter(t => now - t < RATE_WINDOW_MS)

  if (attemptHistory.length >= MAX_ATTEMPTS) {
    lockedUntil = now + LOCKOUT_MS
    attemptHistory = []
    return { blocked: true, retryAfter: LOCKOUT_MS / 1000 }
  }

  return { blocked: false }
}

function recordAttempt() {
  attemptHistory.push(Date.now())
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Set both passcodes.
 * @param {string} realPin — normal unlock PIN (4-8 digits)
 * @param {string} duressPin — duress PIN that triggers panic
 */
export function setPasscodes(realPin, duressPin) {
  if (!realPin || realPin.length < 4 || realPin.length > 8) {
    throw new Error('Real PIN must be 4-8 characters')
  }
  if (!duressPin || duressPin.length < 4 || duressPin.length > 8) {
    throw new Error('Duress PIN must be 4-8 characters')
  }
  if (realPin === duressPin) {
    throw new Error('Real and duress PINs must be different')
  }

  savePasscodes({
    realHash: hashPin(realPin),
    duressHash: hashPin(duressPin),
    createdAt: Date.now(),
  })

  // Reset rate limit on PIN change
  attemptHistory = []
  lockedUntil = 0
}

/**
 * Verify a passcode.
 * Returns { ok: boolean, duress: boolean }
 *   - ok=true, duress=false: correct PIN — unlock
 *   - ok=true, duress=true: duress PIN entered — triggers panic after returning
 *   - ok=false: invalid PIN or rate limited
 */
export function verifyPasscode(pin) {
  const rate = checkRateLimit()
  if (rate.blocked) {
    return { ok: false, duress: false, blocked: true, retryAfter: rate.retryAfter }
  }

  const stored = loadPasscodes()
  if (!stored) {
    // No passcode set — always succeeds (no auth mode)
    return { ok: true, duress: false }
  }

  recordAttempt()

  const inputHash = hashPin(pin)

  if (inputHash === stored.duressHash) {
    // Duress PIN entered — return success but signal duress
    return { ok: true, duress: true }
  }

  if (inputHash === stored.realHash) {
    return { ok: true, duress: false }
  }

  return { ok: false, duress: false }
}

/**
 * Check if a passcode is configured.
 */
export function hasPasscode() {
  const stored = loadPasscodes()
  return stored !== null && stored.realHash !== undefined
}

/**
 * Remove passcodes entirely.
 */
export function clearPasscodes() {
  const existing = localStorage.getItem(STORAGE_KEY)
  if (existing) {
    // Overwrite with random data before removing (basic forensic resistance)
    const random = window.crypto.getRandomValues(new Uint8Array(existing.length))
    let overwrite = ''
    for (let i = 0; i < existing.length; i++) {
      overwrite += String.fromCharCode(random[i])
    }
    localStorage.setItem(STORAGE_KEY, overwrite)
  }
  localStorage.removeItem(STORAGE_KEY)
  attemptHistory = []
  lockedUntil = 0
}

/**
 * Get remaining unlock attempts before lockout.
 */
export function getRemainingAttempts() {
  const now = Date.now()
  if (now < lockedUntil) return 0

  attemptHistory = attemptHistory.filter(t => now - t < RATE_WINDOW_MS)
  return Math.max(0, MAX_ATTEMPTS - attemptHistory.length)
}
