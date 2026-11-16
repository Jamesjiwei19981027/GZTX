import React from 'react'
import type { AuditRun } from '../../api/shell'
import { parseApiDateTime } from '../../utils/datetime'
import { auditStatusLabel, riskLabel } from './model'

export function AuditHistory({ records, busy, onOpen }: { records: AuditRun[]; busy: boolean; onOpen: (id: number) => void }) {
  return <ul className="audit-history">{records.map(row => <li key={row.id}><button type="button" disabled={busy} onClick={() => onOpen(row.id)} aria-label={`查看审计记录 ${row.id}`}>
    <span>{parseApiDateTime(row.generated_at).toLocaleString('zh-CN')}<small>{row.restricted ? '针对本人' : '我发起的'} · {auditStatusLabel(row)} · {row.mode === 'ai' ? 'AI 审计' : '规则检查'}</small></span>
    <span className={`audit-risk audit-risk-${row.overall_risk}`}><i />{riskLabel(row.overall_risk)}</span>
  </button></li>)}</ul>
}
