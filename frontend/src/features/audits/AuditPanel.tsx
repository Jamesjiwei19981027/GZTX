import React, { useEffect, useRef, useState } from 'react'
import { getAuditOptions, getAuditRun, listAuditRuns, runAxisAudit, type AuditOptions, type AuditRun } from '../../api/shell'
import { parseApiDateTime } from '../../utils/datetime'
import { buildAuditRequest, riskLabel, scopeKey } from './model'
import { AuditResultView } from './AuditResultView'
import './audits.css'

const message = (error: unknown) => error instanceof Error ? error.message : '审计加载失败，请重试'

/** 桌面、手机网页及正式 APP Web Shell 共用；进入页面不触发模型费用。 */
export const AuditPanel: React.FC<{ projectId: number; projectName?: string }> = ({ projectId, projectName }) => {
  const [options, setOptions] = useState<AuditOptions | null>(null)
  const [scope, setScope] = useState('self')
  const [instruction, setInstruction] = useState('')
  const [history, setHistory] = useState<AuditRun[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [result, setResult] = useState<AuditRun | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const epoch = useRef(0)
  const resultElement = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const ticket = ++epoch.current
    setOptions(null); setHistory([]); setResult(null); setHasMore(false); setScope('self'); setInstruction(''); setError(''); setLoading(true); setBusy(false)
    if (!Number.isInteger(projectId) || projectId <= 0) { setError('请先选择具体项目'); setLoading(false); return }
    void Promise.all([getAuditOptions(projectId), listAuditRuns(projectId)]).then(([available, records]) => {
      if (ticket !== epoch.current) return
      setOptions(available); setHistory(records.items); setHasMore(records.has_more)
    }).catch(e => { if (ticket === epoch.current) setError(message(e)) }).finally(() => { if (ticket === epoch.current) setLoading(false) })
    return () => { epoch.current++ }
  }, [projectId, reload])
  async function run() {
    const ticket = epoch.current
    setBusy(true); setError('')
    try {
      const response = await runAxisAudit(projectId, buildAuditRequest(scope, instruction, options?.scopes || []))
      if (ticket !== epoch.current) return
      setResult(response)
      try {
        const records = await listAuditRuns(projectId)
        if (ticket !== epoch.current) return
        setHistory(records.items); setHasMore(records.has_more)
      } catch (e) { if (ticket === epoch.current) setError(`审计已存档，历史刷新失败：${message(e)}`) }
    } catch (e) { if (ticket === epoch.current) setError(message(e)) }
    finally { if (ticket === epoch.current) setBusy(false) }
  }
  async function open(id: number) {
    const ticket = epoch.current
    setBusy(true); setError('')
    try {
      const response = await getAuditRun(projectId, id)
      if (ticket !== epoch.current) return
      setResult(response)
      resultElement.current?.scrollIntoView?.({ block: 'start' })
    } catch (e) { if (ticket === epoch.current) setError(message(e)) }
    finally { if (ticket === epoch.current) setBusy(false) }
  }
  async function more() {
    const ticket = epoch.current
    setBusy(true); setError('')
    try {
      const records = await listAuditRuns(projectId, history.length)
      if (ticket !== epoch.current) return
      setHistory(previous => [...new Map([...previous, ...records.items].map(row => [row.id, row])).values()]); setHasMore(records.has_more)
    } catch (e) { if (ticket === epoch.current) setError(message(e)) }
    finally { if (ticket === epoch.current) setBusy(false) }
  }
  return <div className="audit-panel" aria-busy={busy || loading}>
    {projectName && <p className="audit-muted">{projectName}</p>}
    {loading && <p role="status">正在加载审计范围与历史…</p>}
    {error && <div role="alert" className="audit-error">{error}{!options && <button type="button" onClick={() => setReload(n => n + 1)}>重试加载</button>}</div>}
    {options && <section className="audit-section"><h2>发起审计</h2>
      <label>审计范围<select aria-label="审计范围" value={scope} disabled={busy} onChange={e => setScope(e.target.value)}>
        {options.scopes.map(option => <option value={scopeKey(option)} key={scopeKey(option)}>{option.label}</option>)}
      </select></label>
      <label>自定义审查要求（选填）<textarea aria-label="自定义审查要求" value={instruction} disabled={busy} maxLength={500} rows={3} placeholder="例如：核验验收事项是否有材料支撑" onChange={e => setInstruction(e.target.value)} /></label>
      <p className="audit-muted">{[...instruction].length}/500 · 填写要求时优先使用你的个人 AI，未填写时使用企业 AI</p>
      <p className="audit-muted">结果会存档，被审人可查看针对本人的部分</p>
      <button type="button" className="audit-primary" disabled={busy || !options.scopes.length} onClick={() => void run()}>{busy ? '处理中…' : '开始审计'}</button>
    </section>}
    <div ref={resultElement}>{result && <AuditResultView result={result} />}</div>
    <section className="audit-section"><h2>审计历史</h2>
      <p className="audit-muted">我发起的和针对本人的审计</p>
      {!loading && history.length === 0 && <p>暂无审计记录</p>}
      <ul className="audit-history">{history.map(row => <li key={row.id}><button type="button" disabled={busy} onClick={() => void open(row.id)} aria-label={`查看审计记录 ${row.id}`}>
        <span>{parseApiDateTime(row.generated_at).toLocaleString('zh-CN')}<small>{row.restricted ? '针对本人' : '我发起的'} · {row.mode === 'ai' ? 'AI 审计' : '规则检查'}</small></span>
        <span className={`audit-risk audit-risk-${row.overall_risk}`}><i />{riskLabel(row.overall_risk)}</span>
      </button></li>)}</ul>
      {hasMore && <button type="button" disabled={busy} onClick={() => void more()}>加载更多</button>}
    </section>
  </div>
}
