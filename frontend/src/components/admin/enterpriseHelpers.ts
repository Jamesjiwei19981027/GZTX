import type { LlmPreset } from '../../api/notifications'

/** 后端未返回预设时的兜底；id 必须与 backend LLM_PROVIDER_PRESETS 一致 */
const FALLBACK_PROVIDERS: { id: string; label: string }[] = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'openai_compatible', label: 'OpenAI 兼容（DeepSeek / 通义 / 自建）' },
  { id: 'custom', label: '自定义' },
]

/** 厂商选项：直接取后端预设（排除本地桩），id 与后端一致，刷新后选中项才对得上 */
export function providerOptions(presets?: Record<string, LlmPreset> | null): { id: string; label: string }[] {
  if (!presets || Object.keys(presets).length === 0) return FALLBACK_PROVIDERS
  return Object.entries(presets)
    .filter(([id]) => id !== 'fake')
    .map(([id, p]) => ({ id, label: p.label || id }))
}

/** 更新密钥只提交密钥本身，绝不带厂商/模型，避免改掉公司当前配置 */
export function keyOnlyPayload(newKey: string): { api_key: string } {
  return { api_key: newKey.trim() }
}

export type IntegrationLike = {
  provider: string
  enabled?: boolean
  status?: string
  last_sync_at?: string | null
  has_credentials?: boolean
}

export type IntegrationBadge = { label: string; tone: 'ok' | 'warn' | 'none'; detail: string }

/** 集成卡片状态：只看后端 has_credentials / enabled / last_sync_at，不写死“已接入” */
export function integrationBadge(item?: IntegrationLike | null): IntegrationBadge {
  if (!item || !item.has_credentials) {
    return { label: '未配置', tone: 'none', detail: '' }
  }
  const sync = item.last_sync_at ? `上次同步 ${String(item.last_sync_at).replace('T', ' ').slice(0, 16)}` : '尚未同步'
  if (item.enabled === false) {
    return { label: '已配置（未启用）', tone: 'warn', detail: sync }
  }
  return { label: '已配置', tone: 'ok', detail: sync }
}
