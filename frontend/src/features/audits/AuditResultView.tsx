import React from 'react'
import { parseApiDateTime } from '../../utils/datetime'
import { AUDIT_RUNNING_MESSAGE, auditStatusLabel, riskLabel, type AuditResult } from './model'

export function AuditResultView({ result }: { result: AuditResult }) {
  return <section className="audit-section" aria-label="审计详情">
    <div className="audit-heading"><h2>审计结果</h2><span className={`audit-risk audit-risk-${result.overall_risk}`}><i />{riskLabel(result.overall_risk)}</span></div>
    <p className="audit-mode" role="status">{auditStatusLabel(result)} · {result.status === 'running' ? AUDIT_RUNNING_MESSAGE : (result.mode_message || (result.mode === 'ai' ? 'AI 审计' : '未配置 AI，以下为规则检查'))}</p>
    {result.status === 'running' && <p className="audit-muted">以下为已完成的规则检查结果，AI 审计完成后会自动更新</p>}
    {result.status !== 'running' && result.fallback_reason && <p className="audit-muted">{result.fallback_reason}</p>}
    <p className="audit-muted">{parseApiDateTime(result.generated_at).toLocaleString('zh-CN')} · {result.restricted ? '针对本人的部分' : '我发起的审计'}</p>
    {!result.restricted && result.custom_instruction && <p className="audit-instruction">审查要求：{result.custom_instruction}</p>}
    {!result.restricted && result.overall_summary?.trim() && <div className="audit-overall" aria-label="总体结论">
      <h3>总体结论</h3><p>{result.overall_summary}</p>
    </div>}
    {result.nodes.length === 0 && <p>此范围暂无可审计的人员信息</p>}
    {result.nodes.map(node => <article className="audit-person" key={node.node_id}>
      <div className="audit-heading"><h3>{node.title}</h3><span className={`audit-risk audit-risk-${node.risk_level}`}><i />{riskLabel(node.risk_level)}</span></div>
      <p>{node.summary}</p>
      <ul className="audit-findings">{node.findings?.map((finding, i) => <li key={i}>
        <span className="audit-finding-type">{finding.type}</span><p>{finding.description}</p>
        {finding.matter_ids.length > 0 && <p className="audit-muted">关联事项：{finding.matter_ids.map(id => `#${id}`).join('、')}</p>}
      </li>)}</ul>
      {node.suggested_actions.length > 0 && <><h4>建议</h4><ul>{node.suggested_actions.map((action, i) => <li key={i}>{action}</li>)}</ul></>}
    </article>)}
    <p className="audit-muted">审计结论为待核验线索，请结合实际材料确认</p>
  </section>
}
