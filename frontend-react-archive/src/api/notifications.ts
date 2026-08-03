import request from './request'
import type {
  EmailStatus,
  PushSubscriptionPayload,
  SmtpConfig,
  SmtpConfigUpdate,
  UserLlmConfig,
  UserLlmConfigUpdate,
  VapidPublicKeyResponse,
} from '@/types'

/** 获取 Web Push VAPID 公钥 */
export function getVapidPublicKey() {
  return request.get<VapidPublicKeyResponse>('/notifications/vapid-public-key')
}

/** 订阅 Web Push（成功时 data 可能为 null） */
export function subscribePush(subscription: PushSubscriptionPayload) {
  return request.post<null>('/notifications/subscribe', subscription)
}

/** 取消订阅 */
export function unsubscribePush(endpoint: string) {
  return request.delete<null>('/notifications/unsubscribe', {
    params: { endpoint },
  })
}

/** 发送测试推送 */
export function sendTestPush() {
  return request.post<null>('/notifications/test-push')
}

/** 发送测试邮件 */
export function sendTestEmail() {
  return request.post<null>('/notifications/send-test-email')
}

/** 邮件通道状态 */
export function getEmailStatus() {
  return request.get<EmailStatus>('/notifications/email-status')
}

/** 读取用户 SMTP 配置（密码脱敏） */
export function getSmtpConfig() {
  return request.get<SmtpConfig>('/notifications/smtp-config')
}

/** 保存用户 SMTP 配置 */
export function updateSmtpConfig(data: SmtpConfigUpdate) {
  return request.put<SmtpConfig>('/notifications/smtp-config', data)
}

/** 读取个人 LLM 配置（api_key 脱敏） */
export function getLlmConfig() {
  return request.get<UserLlmConfig>('/notifications/llm-config')
}

/** 保存个人 LLM；空 api_key 表示不改动 */
export function updateLlmConfig(data: UserLlmConfigUpdate) {
  return request.put<UserLlmConfig>('/notifications/llm-config', data)
}

/** 个人 LLM 连通性测试 */
export function testLlmConfig() {
  return request.post<{
    provider?: string
    model?: string
    base_url?: string
    content?: string
    source?: string
  } | null>('/notifications/llm-test')
}
