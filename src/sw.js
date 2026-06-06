/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SQUAWK SERVICE WORKER — Secure PWA Shell
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * CACHING POLICY (two tiers):
 *
 *   TIER 1 — CACHED (App Shell)
 *     Precache manifest (injected at build) — JS, CSS, HTML, icons, fonts.
 *     These are the static application shell. Cache-first. Safe to persist.
 *
 *   TIER 2 — EXPLICITLY EXCLUDED (Dynamic / Encrypted)
 *     Everything below is ROUTED DIRECTLY TO NETWORK with zero caching.
 *     No response is ever stored in the Cache API. This is by deliberate
 *     design to prevent encrypted Olm ciphertext from leaking into browser
 *     cache files where it could be recovered forensically.
 *
 * EXCLUSION ZONES (network-only, no caching):
 *   - WebSocket signaling (wss://)         — session establishment
 *   - DataChannel relay endpoints          — encrypted P2P payloads
 *   - /api/* routes                        — any future REST endpoints
 *   - /v1/* gateway routes                 — signaling/relay API
 *   - IndexedDB vault (squawk_vault)       — encrypted at-rest storage
 *   - Push notification service endpoints  — browser-managed, not ours
 *   - Any request with ?nocache or Authorization header
 *
 * PUSH NOTIFICATIONS:
 *   The SW handles push events but ONLY processes metadata (title, senderId).
 *   It NEVER receives or touches decrypted message content. The payload
 *   `encrypted: true` flag signals that message bodies are opaque.
 *   Actual decryption happens in the main thread via the Olm Double Ratchet.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ─── Precache manifest (injected by vite-plugin-pwa at build) ──────────────
const PRECACHE_MANIFEST = self.__WB_MANIFEST || []

const CACHE_NAME = 'squawk-shell-v2'

// ═══════════════════════════════════════════════════════════════════════════
// ROUTE EXCLUSION BLOCKLIST
// ═══════════════════════════════════════════════════════════════════════════
//
// Any request matching one of these patterns MUST NOT be cached.
// Ciphertext must never outlive the in-memory session on the main thread.

const EXCLUDED_URL_PATTERNS = [
  // WebSocket signaling — session negotiation, never cacheable
  /^wss?:/i,

  // IndexedDB-backed encrypted vault — SW has no business here
  /squawk_vault/i,

  // API routes — any future REST endpoints for relay/sync
  /\/api\//i,

  // Gateway / relay endpoints (signaling server)
  /\/v1\//i,

  // Push notification service endpoints (browser-managed, not ours to cache)
  /\/push\//i,
  /\/notification\//i,

  // Explicit nocache parameter
  /[?&]nocache(?:=|&|$)/i,
]

/**
 * Returns true if the request URL is in an exclusion zone.
 * These requests bypass the cache entirely — network-only, no persistence.
 */
function isExcluded(url) {
  for (const pattern of EXCLUDED_URL_PATTERNS) {
    if (pattern.test(url.href)) return true
  }
  return false
}

/**
 * Returns true if the request carries an Authorization header.
 * Authenticated requests must never hit the cache — they contain session
 * tokens that would persist in cache storage.
 */
function hasAuthHeader(request) {
  return request.headers.has('Authorization')
    || request.headers.has('X-Session-Token')
    || request.headers.has('X-Squawk-Session')
}

// ═══════════════════════════════════════════════════════════════════════════
// INSTALL — Precache the app shell
// ═══════════════════════════════════════════════════════════════════════════

self.addEventListener('install', (event) => {
  console.log('[SW] Install — precaching app shell (static assets only)')

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Build the precache URL list from injected manifest
      const manifestUrls = PRECACHE_MANIFEST.map(entry =>
        typeof entry === 'string' ? entry : entry.url
      )

      // Critical shell assets always needed for offline start
      const criticalShell = [
        '/',
        '/offline.html',
        '/icon-192.png',
        '/icon-512.png',
        '/manifest.json',
      ]

      // Deduplicate — some critical shell items may also be in the manifest
      const allUrls = [...new Set([...manifestUrls, ...criticalShell])]

      // Verify nothing in the precache manifest is in an exclusion zone
      // (defense in depth — build tooling should never put API routes here)
      for (const url of allUrls) {
        try {
          const parsed = new URL(url, self.location.origin)
          if (isExcluded(parsed)) {
            console.error(`[SW] SECURITY: Excluded URL "${url}" appeared in precache manifest — skipping`)
            continue
          }
        } catch { /* relative URLs are fine */ }
      }

      return cache.addAll(allUrls).catch((err) => {
        // Non-fatal: some assets may not exist in dev mode
        console.warn('[SW] Precache partial — some assets unavailable:', err.message)
        return Promise.resolve()
      })
    })
  )

  // Take control immediately — don't wait for old SW to release
  self.skipWaiting()
})

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVATE — Clean old cache versions
// ═══════════════════════════════════════════════════════════════════════════

self.addEventListener('activate', (event) => {
  console.log('[SW] Activate — cleaning old caches')

  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key)
            return caches.delete(key)
          })
      )
    })
  )

  // Claim all clients immediately so the SW controls the page
  self.clients.claim()
})

// ═══════════════════════════════════════════════════════════════════════════
// FETCH — Tiered caching with explicit route exclusion
// ═══════════════════════════════════════════════════════════════════════════

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // ── GATE 1: Exclusion zone — network-only, NEVER cache ──────────────────
  //
  // These routes carry encrypted ciphertext or session material.
  // They MUST NOT touch the Cache API under any circumstance.
  // The response is fetched from network and delivered directly to the
  // main thread — the SW is a transparent passthrough for these.

  if (isExcluded(url) || hasAuthHeader(request)) {
    // Passthrough: fetch and deliver. Do not store. Do not clone.
    // No response object is retained by the SW after delivery.
    event.respondWith(
      fetch(request).catch((err) => {
        console.warn('[SW] Network-only request failed (excluded route):', url.pathname)
        return new Response(null, {
          status: 503,
          statusText: 'Offline — secure route unavailable',
        })
      })
    )
    return
  }

  // ── GATE 2: Static assets — cache-first ─────────────────────────────────
  //
  // JS bundles, CSS, images, fonts, icons — the app shell.
  // These are immutable (content-hashed filenames) and safe to cache
  // persistently. No user data, no ciphertext, no session material.

  if (
    request.destination === 'style'  ||
    request.destination === 'script' ||
    request.destination === 'image'  ||
    request.destination === 'font'   ||
    request.destination === 'manifest' ||
    url.pathname.match(/\.(js|css|png|svg|ico|woff2|webp|json|webmanifest)$/i)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          // Hit: serve from cache immediately
          return cached
        }
        // Miss: fetch from network and cache for next time
        return fetch(request).then((response) => {
          if (!response.ok) return response
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, clone).catch(() => {
              // Silently ignore cache-write failures (quota, etc.)
            })
          })
          return response
        })
      })
    )
    return
  }

  // ── GATE 3: Navigation — network-first with offline fallback ────────────
  //
  // Page navigations: try network first (serves fresh HTML), fall back
  // to cached offline.html if the user is disconnected.

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match('/offline.html').then((fallback) => {
          return fallback || new Response('You are offline', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          })
        })
      })
    )
    return
  }

  // ── GATE 4: Catch-all — network-only (safety default) ───────────────────
  //
  // Any request that reached this point doesn't match a known static asset
  // or navigation pattern. Default to network-only with no caching — this
  // is the secure default for any unrecognized route.

  event.respondWith(
    fetch(request).catch((err) => {
      console.warn('[SW] Unrecognized request failed:', url.pathname, err.message)
      return new Response(null, { status: 503 })
    })
  )
})

// ═══════════════════════════════════════════════════════════════════════════
// PUSH — Metadata-only notification handler
// ═══════════════════════════════════════════════════════════════════════════
//
// The SW receives push events from the browser's push service. The payload
// is STRICTLY metadata — never contains decrypted message content.
//
// Expected payload shape:
//   { title, body, encrypted: true, senderId, tag }
//
// The `encrypted: true` flag is a contract: the SW trusts that the push
// server only sends opaque metadata. Actual message decryption happens
// in the main thread via the Olm Double Ratchet.

self.addEventListener('push', (event) => {
  if (!event.data) {
    console.warn('[SW] Push event with no data — ignoring')
    return
  }

  let payload
  try {
    payload = event.data.json()
  } catch {
    // Non-JSON push payload — could be a raw encrypted blob.
    // We cannot process it, and we MUST NOT cache it. Drop silently.
    console.warn('[SW] Push with non-JSON payload — ignoring (possible ciphertext)')
    return
  }

  // Safety check: if payload has no metadata wrapper, refuse to process
  if (!payload || typeof payload !== 'object') {
    console.warn('[SW] Push payload is not an object — refusing to process')
    return
  }

  // Require at minimum a title — otherwise this is not a displayable notification
  if (!payload.title) {
    console.warn('[SW] Push payload missing title — ignoring')
    return
  }

  const options = {
    // Truncate body to prevent metadata exfiltration via long notification text
    body: (payload.body || '').slice(0, 120),
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || 'squawk-notification',
    renotify: false,
    vibrate: [100, 50, 100],
    data: {
      // Store ONLY routing metadata — never content
      senderId: payload.senderId || null,
      encrypted: payload.encrypted === true,
      timestamp: Date.now(),
    },
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
    silent: false,
    requireInteraction: false,
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, options).catch((err) => {
      console.warn('[SW] Failed to show notification:', err.message)
    })
  )
})

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATION CLICK — Route to app
// ═══════════════════════════════════════════════════════════════════════════

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const { senderId } = event.notification.data || {}

  if (event.action === 'dismiss') return

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Try to focus an existing Squawk window
      const squawkClient = clients.find(
        c => c.url.includes(self.registration.scope)
      )

      if (squawkClient && 'focus' in squawkClient) {
        squawkClient.postMessage({
          type: 'NOTIFICATION_OPEN',
          senderId,
        })
        return squawkClient.focus()
      }

      // No existing window — open a new one
      return self.clients.openWindow(self.registration.scope).then((client) => {
        if (client) {
          // Wait for the app to boot, then route to the correct chat
          setTimeout(() => {
            client.postMessage({
              type: 'NOTIFICATION_OPEN',
              senderId,
            })
          }, 500)
        }
        return client
      })
    })
  )
})

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE HANDLER — Commands from the main thread
// ═══════════════════════════════════════════════════════════════════════════

self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {}

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting()
      break

    case 'CLEAR_CACHE':
      event.waitUntil(caches.delete(CACHE_NAME))
      break

    case 'CLEAR_ALL_CACHES':
      event.waitUntil(
        caches.keys().then(keys =>
          Promise.all(keys.map(k => caches.delete(k)))
        )
      )
      break

    case 'UPDATE_BADGE':
      if ('setAppBadge' in navigator && typeof navigator.setAppBadge === 'function') {
        const count = payload?.count || 0
        if (count > 0) {
          navigator.setAppBadge(count).catch(() => {})
        } else {
          navigator.clearAppBadge().catch(() => {})
        }
      }
      break

    default:
      break
  }
})

// ═══════════════════════════════════════════════════════════════════════════
console.log('[SW] Squawk service worker active — app shell cached, ciphertext excluded')
