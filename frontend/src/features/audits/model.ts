import type { AuditRequest, AuditScopeOption } from '../../api/shell'

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
