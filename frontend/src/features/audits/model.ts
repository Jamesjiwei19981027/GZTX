import type { AuditRequest, AuditRun, AuditScopeOption } from '../../api/shell'

export function scopeKey(option: AuditScopeOption): string {
  return option.scope === 'node' ? `node:${option.node_id}` : option.scope
}
export function buildAuditRequest(key: string, instruction: string, scopes: AuditScopeOption[]): AuditRequest {
  const option = scopes.find(item => scopeKey(item) === key)
  if (!option) throw new Error('请选择已授权的审计范围')
  const text = instruction.trim()
  if ([...text].length > 500) throw new Error('自定义审查要求最多 500 字')
  return { scope: option.scope, ...(option.scope === 'node' ? { node_id: option.node_id } : {}), ...(text ? { custom_instruction: text } : {}) }
}
export const riskLabel = (value: string) => ({ high: '高风险', medium: '中风险', low: '低风险' }[value] || '待核验')

export const AUDIT_RUNNING_MESSAGE = 'AI 正在审计，通常需要 1～3 分钟，可以离开此页，完成后在历史里查看'
export function auditStatusLabel(run: AuditRun): string {
  if (run.status === 'running') return '进行中'
  if (run.status === 'failed' || (run.mode === 'rule' && run.fallback_reason)) return '已退回规则检查'
  return '已完成'
}

/** 列表或手动打开的较早请求不能将已完成的详情覆盖回进行中。 */
export function latestAuditRun(previous: AuditRun | undefined, incoming: AuditRun): AuditRun {
  return previous?.id === incoming.id && previous.status !== 'running' && incoming.status === 'running' ? previous : incoming
}
