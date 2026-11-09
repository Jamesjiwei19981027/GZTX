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
  return apiRequest<{ smtp_host: string; smtp_port: number; smtp_user: string; smtp_from: string; has_password: boolean }>('/notifications/smtp-config', { method: 'PUT', body: JSON.stringify(body) })
}

export async function getLlmConfig() {
  return apiRequest<{ provider: string; base_url: string; model: string; enabled: boolean; configured: boolean; has_api_key: boolean }>('/notifications/llm-config')
}

export async function putLlmConfig(body: Record<string, unknown>) {
  return apiRequest<{ provider: string; base_url: string; model: string; enabled: boolean; configured: boolean; has_api_key: boolean }>('/notifications/llm-config', { method: 'PUT', body: JSON.stringify(body) })
}

export async function sendTestPush() {
  return apiRequest('/notifications/test-push', { method: 'POST', body: '{}' })
}

export async function sendTestEmail() {
  return apiRequest('/notifications/send-test-email', { method: 'POST', body: '{}' })
}

export async function testLlmConfig() {
  return apiRequest('/notifications/llm-test', { method: 'POST', body: '{}' })
}

/** 通知渠道立即测试发送（email / webpush），返回成败与失败原因 */
export async function sendNotifyTest(channel: 'email' | 'webpush') {
  return apiRequest<{ ok: boolean; error?: string }>('/notify/test-send', {
    method: 'POST',
    body: JSON.stringify({ channel }),
  })
}

export type NotifyRecord = {
  channel: string
  status: string
  error?: string | null
  task_title?: string | null
  created_at: string
}

/** 当前用户最近的通知发送记录（失败行带原因） */
export async function listNotifyRecords(limit = 50) {
  return apiRequest<{ items: NotifyRecord[] }>(`/notify/records?limit=${limit}`)
}

// ---- 公司级配置（企业管理页使用；验证码、AI 建议、材料研判都读公司级）----
type SmtpView = { smtp_host: string; smtp_port: number; smtp_user: string; smtp_from: string; has_password: boolean }
type LlmView = { provider: string; base_url: string; model: string; enabled: boolean; configured: boolean; has_api_key: boolean }

export async function getCompanySmtpConfig(companyId: number | string) {
  return apiRequest<SmtpView>(`/companies/${companyId}/smtp`)
}

export async function putCompanySmtpConfig(
  companyId: number | string,
  body: { smtp_host?: string; smtp_port?: number; smtp_user?: string; smtp_password?: string; smtp_from?: string },
) {
  return apiRequest<SmtpView>(`/companies/${companyId}/smtp`, { method: 'PUT', body: JSON.stringify(body) })
}

export async function testCompanySmtpConfig(companyId: number | string) {
  return apiRequest(`/companies/${companyId}/smtp/test`, { method: 'POST', body: '{}' })
}

export async function getCompanyLlmConfig(companyId: number | string) {
  return apiRequest<LlmView>(`/companies/${companyId}/llm`)
}

export async function putCompanyLlmConfig(companyId: number | string, body: Record<string, unknown>) {
  return apiRequest<LlmView>(`/companies/${companyId}/llm`, { method: 'PUT', body: JSON.stringify(body) })
}

export async function testCompanyLlmConfig(companyId: number | string) {
  return apiRequest(`/companies/${companyId}/llm/test`, { method: 'POST', body: '{}' })
}
