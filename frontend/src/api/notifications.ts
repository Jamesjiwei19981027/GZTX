import { apiRequest } from './client'

export async function getVapidPublicKey() {
  return apiRequest<{ publicKey: string }>('/notifications/vapid-public-key')
}

export async function listPushSubscriptions() {
  return apiRequest<{ subscriptions: PushSubscriptionJSON[] }>('/notifications/subscriptions')
}

export async function unsubscribePush(endpoint: string) {
  return apiRequest(`/notifications/unsubscribe?endpoint=${encodeURIComponent(endpoint)}`, { method: 'DELETE' })
}

function base64ToUint8Array(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from(raw, (char) => char.charCodeAt(0))
}

/** Request browser permission and persist the subscription on the API. */
export async function enableWebPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    throw new Error('当前浏览器不支持 Web Push')
  }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('浏览器通知权限未授予')
  const key = await getVapidPublicKey()
  const registration = await navigator.serviceWorker.register('/sw.js')
  const existing = await registration.pushManager.getSubscription()
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64ToUint8Array(key.publicKey),
  })
  await apiRequest('/notifications/subscribe', {
    method: 'POST',
    body: JSON.stringify(subscription.toJSON()),
  })
  return subscription
}

export async function getWechatSubscribeStatus() {
  return apiRequest<{ wx_bound: boolean; subscription_enabled: boolean; template_ids?: string[] }>('/wx/subscribe-status')
}

export async function putWechatSubscribePreference(enabled: boolean, template_ids: string[] = []) {
  return apiRequest<{ wx_bound: boolean; subscription_enabled: boolean; template_ids?: string[] }>('/wx/subscribe-preference', {
    method: 'PUT',
    body: JSON.stringify({ enabled, template_ids }),
  })
}

export async function getEmailStatus() {
  return apiRequest<{ has_email: boolean; smtp_configured: boolean; smtp_source: string; email_address?: string }>('/notifications/email-status')
}

export async function getSmtpConfig() {
  return apiRequest<{ smtp_host: string; smtp_port: number; smtp_user: string; smtp_from: string; has_password: boolean }>('/notifications/smtp-config')
}

export async function putSmtpConfig(body: { smtp_host?: string; smtp_port?: number; smtp_user?: string; smtp_password?: string; smtp_from?: string }) {
  return apiRequest('/notifications/smtp-config', { method: 'PUT', body: JSON.stringify(body) })
}

export async function getLlmConfig() {
  return apiRequest<{ provider: string; base_url: string; model: string; enabled: boolean; configured: boolean; has_api_key: boolean }>('/notifications/llm-config')
}

export async function putLlmConfig(body: Record<string, unknown>) {
  return apiRequest('/notifications/llm-config', { method: 'PUT', body: JSON.stringify(body) })
}
