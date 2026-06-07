/**
 * Push notification manager for Squawk.
 * Handles VAPID subscription, push event handling in SW, and notification routing.
 */

const VAPID_PUBLIC = 'BPr317Y62tfYs8qL4nmv5TLwocaKeB5s0ejCZ2KA_DQ82cwdqr-QHNwMP3veWX5vjL5vHCNDvHnIop7tM6Yi38U'

/**
 * Subscribe to push notifications.
 * Returns the subscription object or null if denied/unsupported.
 */
export async function subscribePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[push] Push notifications not supported')
    return null
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    console.warn('[push] Permission denied:', permission)
    return null
  }

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
  })

  console.log('[push] Subscribed:', subscription.endpoint.slice(0, 60))
  return subscription
}

/**
 * Unsubscribe from push notifications.
 */
export async function unsubscribePush() {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (subscription) {
    await subscription.unsubscribe()
    console.log('[push] Unsubscribed')
  }
}

/**
 * Check if currently subscribed.
 */
export async function isSubscribed() {
  const registration = await navigator.serviceWorker.ready
  const sub = await registration.pushManager.getSubscription()
  return sub !== null
}

/**
 * Send a push notification to a peer via the signaling server.
 * The signaling server forwards to the target peer's push endpoint.
 */
export async function sendPushNotification(peerId, title, body, data = {}) {
  // This requires the signaling server to have a push endpoint registry.
  // For now, push is browser-to-browser via the SW.
  // The signaling server stores push subscriptions per peer.
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  // Send subscription to signaling so it can push to us later
  // (Implementation depends on signaling server push relay)
  console.log('[push] Ready to send to', peerId, title)
}

// ─── Helpers ──────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from(rawData, c => c.charCodeAt(0))
}
