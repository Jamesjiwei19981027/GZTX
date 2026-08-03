import { apiRequest, setRefreshToken, setToken } from './client'

export type BackendUser = {
  id: number
  username?: string
  nickname?: string
  email?: string
  phone?: string
  avatar_url?: string
  email_verified?: boolean
  phone_verified?: boolean
  is_verified?: boolean
  notify_pref?: Record<string, unknown>
}

export type AuthTokenPayload = {
  access_token: string
  refresh_token?: string
  user?: BackendUser
  company_join?: {
    joined?: boolean
    company_id?: number | null
    company_slug?: string | null
    reason?: string
  }
}

export type SendCodeResult = {
  ok?: boolean
  debug_code?: string
  cooldown_seconds?: number
}

export type VerificationStatus = {
  email?: string | null
  phone?: string | null
  email_verified: boolean
  phone_verified: boolean
  is_verified: boolean
}

export type NotificationPreferenceUpdate = {
  channels?: Partial<Record<'email' | 'push' | 'desktop' | 'wechat', { enabled?: boolean }>>
  quiet_hours?: { start?: string; end?: string }
  weekend_mute?: boolean
}

function rememberTokens(data: AuthTokenPayload) {
  setToken(data.access_token)
  if (data.refresh_token) setRefreshToken(data.refresh_token)
  return data
}

export async function loginPassword(username: string, password: string) {
  const data = await apiRequest<AuthTokenPayload>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  return rememberTokens(data)
}

export async function loginWithCode(
  channel: 'email' | 'sms',
  target: string,
  code: string,
) {
  const data = await apiRequest<AuthTokenPayload>('/auth/login-code', {
    method: 'POST',
    body: JSON.stringify({ channel, target, code }),
  })
  return rememberTokens(data)
}

export async function register(body: {
  username: string
  password: string
  email?: string
  phone?: string
  email_code?: string
  phone_code?: string
  nickname?: string
}) {
  const data = await apiRequest<AuthTokenPayload>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return rememberTokens(data)
}

export async function sendRegisterCode(channel: 'email' | 'sms', target: string) {
  return apiRequest<SendCodeResult>('/auth/send-code', {
    method: 'POST',
    body: JSON.stringify({ channel, target, purpose: 'register' }),
  })
}

export async function sendLoginCode(channel: 'email' | 'sms', target: string) {
  return apiRequest<SendCodeResult>('/auth/send-code', {
    method: 'POST',
    body: JSON.stringify({ channel, target, purpose: 'login' }),
  })
}

export async function getVerificationStatus() {
  return apiRequest<VerificationStatus>('/users/me/verification')
}

export async function sendBindCode(channel: 'email' | 'sms', target: string) {
  return apiRequest<SendCodeResult>('/users/me/verification/send-code', {
    method: 'POST',
    body: JSON.stringify({ channel, target }),
  })
}

export async function confirmBindCode(
  channel: 'email' | 'sms',
  target: string,
  code: string,
) {
  return apiRequest<VerificationStatus>('/users/me/verification/confirm', {
    method: 'POST',
    body: JSON.stringify({ channel, target, code }),
  })
}

export async function fetchMe() {
  return apiRequest<BackendUser>('/users/me')
}

export async function updateMe(body: {
  nickname?: string
  avatar_url?: string
  notify_pref?: NotificationPreferenceUpdate
}) {
  return apiRequest<BackendUser>('/users/me', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function changePassword(oldPassword: string, newPassword: string) {
  return apiRequest('/users/me/password', {
    method: 'PUT',
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  })
}

export async function logout() {
  try {
    await apiRequest('/auth/logout', { method: 'POST', body: '{}' })
  } catch {
    /* ignore */
  }
  setToken(null)
  setRefreshToken(null)
}

/** 根据输入自动识别邮箱 / 短信通道 */
export function detectChannel(target: string): 'email' | 'sms' | null {
  const t = target.trim()
  if (!t) return null
  if (t.includes('@')) return 'email'
  if (/^\+?\d{6,20}$/.test(t.replace(/[\s-]/g, ''))) return 'sms'
  return null
}
