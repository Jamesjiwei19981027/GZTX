import { apiRequest, getRefreshToken, setRefreshToken, setToken } from './client'

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
  project_id?: number
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

export type RegistrationConfig = {
  mode: 'open' | 'invite_only'
  phone_required: boolean
}

export const DEFAULT_REGISTRATION_CONFIG: RegistrationConfig = {
  mode: 'open',
  phone_required: false,
}

export async function getRegistrationConfig(): Promise<RegistrationConfig> {
  try {
    const data = await apiRequest<RegistrationConfig>('/auth/registration-config')
    return {
      mode: data?.mode === 'invite_only' ? 'invite_only' : 'open',
      phone_required: Boolean(data?.phone_required),
    }
  } catch {
    return DEFAULT_REGISTRATION_CONFIG
  }
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
  invite_token?: string
}) {
  const data = await apiRequest<AuthTokenPayload>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return rememberTokens(data)
}

export async function sendRegisterCode(
  channel: 'email' | 'sms',
  target: string,
  invite_token?: string,
) {
  return apiRequest<SendCodeResult>('/auth/send-code', {
    method: 'POST',
    body: JSON.stringify({
      channel,
      target,
      purpose: 'register',
      ...(invite_token ? { invite_token } : {}),
    }),
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

/** 绑定成功后，刚绑定的邮箱/手机立即写进状态，页面不用刷新就能显示已绑定地址 */
export function withBoundTarget(
  status: VerificationStatus,
  channel: 'email' | 'sms',
  target: string,
): VerificationStatus {
  return {
    ...status,
    email: channel === 'email' ? status.email || target : status.email,
    phone: channel === 'sms' ? status.phone || target : status.phone,
  }
}

export async function confirmBindCode(
  channel: 'email' | 'sms',
  target: string,
  code: string,
) {
  const status = await apiRequest<VerificationStatus>('/users/me/verification/confirm', {
    method: 'POST',
    body: JSON.stringify({ channel, target, code }),
  })
  return withBoundTarget(status, channel, target)
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

export async function uploadAvatar(file: File) {
  const body = new FormData()
  body.append('file', file)
  return apiRequest<{ avatar_url: string }>('/users/me/avatar', { method: 'POST', body })
}

export async function getPrivacySummary() {
  return apiRequest<{ stored_data: Record<string, unknown>; retention: string; export_endpoint: string; delete_endpoint: string }>('/users/me/privacy')
}

export async function getBillingSummary() {
  return apiRequest<{ company_id?: number; company_name?: string; plan_code?: string; status: string; managed_by: string }>('/users/me/billing')
}

export async function deleteMyAccount(password: string, confirmation = 'DELETE') {
  return apiRequest<{ deleted: boolean }>('/users/me/delete', {
    method: 'POST',
    body: JSON.stringify({ password, confirmation }),
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
    // 携带 refresh_token 让服务端撤销其 jti（旧后端忽略该字段，向后兼容）
    const refresh = getRefreshToken()
    await apiRequest('/auth/logout', {
      method: 'POST',
      body: JSON.stringify(refresh ? { refresh_token: refresh } : {}),
    })
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
