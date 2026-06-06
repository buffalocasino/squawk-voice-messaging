/**
 * Olm wrapper — loads WASM, exposes typed E2EE primitives.
 * Double Ratchet per peer. Stores pickled state in localStorage.
 */

let olm = null
let wasmReady = false

export async function initOlm() {
  if (wasmReady) return olm

  // Try the CJS global first (some builds expose window.Olm)
  if (typeof window !== 'undefined' && window.Olm) {
    olm = window.Olm
    await olm.init()
    wasmReady = true
    return olm
  }

  // Dynamic import with Vite CJS→ESM interop
  // Vite wraps CJS modules differently than Node — try every possible path
  const mod = await import('@matrix-org/olm')

  // Debug what we got
  const keys = Object.keys(mod)
  console.log('[olm] import keys:', keys)

  // Try all known access patterns
  const candidates = [
    mod.default,      // standard CJS→ESM wrapping
    mod.Module,       // Vite sometimes nests under .Module
    mod.Olm,          // raw IIFE export
    mod,              // the module itself (ESM export)
  ]

  for (const c of candidates) {
    if (c && typeof c.init === 'function') {
      await c.init()
      olm = c
      wasmReady = true
      return olm
    }
    // Some builds have Account on the object but init elsewhere
    if (c && c.Account && typeof c.Account === 'function') {
      olm = c
      await c.init()
      wasmReady = true
      return olm
    }
  }

  // Last resort: check if any nested property has init
  for (const key of keys) {
    const c = mod[key]
    if (c && typeof c.init === 'function') {
      await c.init()
      olm = c
      wasmReady = true
      return olm
    }
  }

  throw new Error(`Olm failed to load — no init() found. Got keys: ${keys.join(', ')}`)
}

export function isOlmReady() {
  return wasmReady
}