import request from './request'
import type {
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  RefreshResponse,
  SendCodeResult,
  User,
  VerificationStatus,
} from '@/types'

// 账号密码登录
export function login(data: LoginRequest) {
  return request.post<AuthResponse>('/auth/login', data)
}

// 注册（响应可能含 company_join）
export function register(data: RegisterRequest) {
  return request.post<AuthResponse>('/auth/register', data)
}

// 注册前发送验证码（匿名）
export function sendRegisterCode(channel: 'email' | 'sms', target: string) {
  return request.post<SendCodeResult>('/auth/send-code', { channel, target })
}

// 登录后双验证状态
export function getVerificationStatus() {
  return request.get<VerificationStatus>('/users/me/verification')
}

// 登录后补验/换绑：发码
export function sendBindCode(channel: 'email' | 'sms', target: string) {
  return request.post<SendCodeResult>('/users/me/verification/send-code', { channel, target })
}

// 登录后补验/换绑：确认
export function confirmBindCode(channel: 'email' | 'sms', target: string, code: string) {
  return request.post<VerificationStatus>('/users/me/verification/confirm', {
    channel,
    target,
    code,
  })
}

// 刷新 Token
export function refreshToken(refresh_token: string) {
  return request.post<RefreshResponse>('/auth/refresh', { refresh_token })
}

// 登出
export function logout() {
  return request.post('/auth/logout')
}

// 获取当前用户信息
export function getCurrentUser() {
  return request.get<User>('/users/me')
}

// 更新用户信息
export function updateUser(data: Partial<User>) {
  return request.put<User>('/users/me', data)
}

// 修改密码
export function changePassword(data: { old_password: string; new_password: string }) {
  return request.put('/users/me/password', data)
}

// 绑定微信
export function bindWechat(code: string) {
  return request.post('/users/me/bind-wx', { code })
}
