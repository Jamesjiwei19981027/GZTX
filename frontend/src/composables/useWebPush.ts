import { ref } from 'vue'
import request from '@/api/request'

export interface PushSubscriptionData {
  endpoint: string
  keys: {
    auth: string
    p256dh: string
  }
}

const isSupported = ref(false)
const isSubscribed = ref(false)
const permissionState = ref<NotificationPermission | 'unknown'>('unknown')
const vapidPublicKey = ref<string | null>(null)

// Convert base64url to Uint8Array for applicationServerKey
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function useWebPush() {
  // Check if web push is supported
  function checkSupport(): boolean {
    isSupported.value = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    if (isSupported.value && 'Notification' in window) {
      permissionState.value = Notification.permission
    }
    return isSupported.value
  }

  // Fetch VAPID public key from backend
  async function fetchVapidPublicKey(): Promise<string | null> {
    try {
      const response = await request.get('/notifications/vapid-public-key') as any
      const key = response?.publicKey || response?.data?.publicKey
      if (key) {
        vapidPublicKey.value = key
        return key
      }
    } catch (error) {
      console.error('Failed to fetch VAPID public key:', error)
    }
    return null
  }

  // Request notification permission
  async function requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      return 'denied'
    }
    const permission = await Notification.requestPermission()
    permissionState.value = permission
    return permission
  }

  // Register service worker
  async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) {
      return null
    }
    try {
      const registration = await navigator.serviceWorker.register('/sw.js')
      return registration
    } catch (error) {
      console.error('Service worker registration failed:', error)
      return null
    }
  }

  // Subscribe to push notifications
  async function subscribe(): Promise<PushSubscriptionData | null> {
    if (!checkSupport()) {
      console.warn('Web Push not supported')
      return null
    }

    // Request permission if not granted
    if (permissionState.value !== 'granted') {
      const permission = await requestPermission()
      if (permission !== 'granted') {
        console.warn('Notification permission denied')
        return null
      }
    }

    // Get VAPID public key
    let publicKey = vapidPublicKey.value
    if (!publicKey) {
      publicKey = await fetchVapidPublicKey()
      if (!publicKey) {
        console.error('VAPID public key not available')
        return null
      }
    }

    // Register service worker
    const registration = await registerServiceWorker()
    if (!registration) {
      console.error('Service worker registration failed')
      return null
    }

    try {
      const serverKeyBytes = urlBase64ToUint8Array(publicKey)
      // Always start fresh — unsubscribe any existing subscription
      // This ensures the subscription matches the current VAPID key
      const existing = await registration.pushManager.getSubscription()
      if (existing) {
        await existing.unsubscribe()
      }

      // Create new subscription with current VAPID key
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: serverKeyBytes
      })

      const subscriptionData: PushSubscriptionData = {
        endpoint: subscription.endpoint,
        keys: {
          auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'),
          p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
        }
      }

      // Send subscription to backend
      await sendSubscriptionToBackend(subscriptionData)
      isSubscribed.value = true
      return subscriptionData
    } catch (error) {
      console.error('Push subscription failed:', error)
      return null
    }
  }

  // Unsubscribe from push notifications
  async function unsubscribe(): Promise<boolean> {
    if (!('serviceWorker' in navigator)) return false

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        // Remove from backend first
        try {
          await request.delete('/notifications/unsubscribe', { params: { endpoint: subscription.endpoint } })
        } catch {
          // Continue even if backend call fails
        }
        // Unsubscribe from push manager
        await subscription.unsubscribe()
        isSubscribed.value = false
        return true
      }
    } catch (error) {
      console.error('Unsubscribe failed:', error)
    }
    return false
  }

  // Send subscription to backend
  async function sendSubscriptionToBackend(subscription: PushSubscriptionData): Promise<void> {
    try {
      await request.post('/notifications/subscribe', subscription)
    } catch (error) {
      console.error('Failed to send subscription to backend:', error)
      throw error
    }
  }

  // Check current subscription status
  async function checkSubscriptionStatus(): Promise<boolean> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return false
    }
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      if (registration) {
        const subscription = await registration.pushManager.getSubscription()
        isSubscribed.value = !!subscription
        return isSubscribed.value
      }
    } catch {
      // ignore
    }
    return false
  }

  // Initialize on load
  checkSupport()

  return {
    isSupported,
    isSubscribed,
    permissionState,
    vapidPublicKey,
    checkSupport,
    requestPermission,
    subscribe,
    unsubscribe,
    checkSubscriptionStatus,
    fetchVapidPublicKey
  }
}
