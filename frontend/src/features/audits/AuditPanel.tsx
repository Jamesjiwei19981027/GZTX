import React, { useEffect, useRef, useState } from 'react'
import { getAuditOptions, getAuditRun, listAuditRuns, runAxisAudit, type AuditOptions, type AuditRun } from '../../api/shell'
import { getAuthSessionGeneration, getToken, subscribeAuthSession } from '../../api/client'
import { buildAuditRequest, latestAuditRun, scopeKey } from './model'
import { AuditHistory } from './AuditHistory'
import { AuditResultView } from './AuditResultView'
import { startAuditPolling } from './polling'
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
  const [sessionGeneration, setSessionGeneration] = useState(getAuthSessionGeneration)
  const epoch = useRef(0)
  const stopActivePolling = useRef<(() => void) | null>(null)
  const resultElement = useRef<HTMLDivElement>(null)
  const currentRuns = useRef({ projectId, history, result })
  currentRuns.current = { projectId, history, result }
  const detailRequests = useRef(new Map<string, Promise<AuditRun>>())
  function isCurrent(ticket: number, session: number) {
    const activeSession = getAuthSessionGeneration()
    return ticket === epoch.current && session === activeSession
  }
  useEffect(() => subscribeAuthSession(generation => {
    epoch.current++
    stopActivePolling.current?.()
    detailRequests.current = new Map()
    currentRuns.current = { ...currentRuns.current, history: [], result: null }
    setOptions(null); setHistory([]); setResult(null); setHasMore(false); setScope('self'); setInstruction(''); setError(''); setLoading(true); setBusy(false)
    setSessionGeneration(generation)
  }), [])
  function fetchDetail(id: number) {
    const key = `${projectId}:${id}`
    const pending = detailRequests.current
    if (!pending.has(key)) {
      const request = getAuditRun(projectId, id).finally(() => { if (pending.get(key) === request) pending.delete(key) })
      pending.set(key, request)
    }
    return pending.get(key)!
  }
  useEffect(() => {
    const ticket = ++epoch.current
    const session = sessionGeneration
    setOptions(null); setHistory([]); setResult(null); setHasMore(false); setScope('self'); setInstruction(''); setError(''); setLoading(true); setBusy(false)
    detailRequests.current = new Map()
    if (!Number.isInteger(projectId) || projectId <= 0) { setError('请先选择具体项目'); setLoading(false); return }
    if (!getToken()) { setError('请重新登录后查看审计'); setLoading(false); return }
    const stopPolling = startAuditPolling({
      projectId,
      getRuns: () => {
        const current = currentRuns.current
        if (current.projectId !== projectId || !isCurrent(ticket, session)) return []
        // 详情和列表可能处于不同快照；任一仍在运行就补取详情，由轮询器去重。
        return [...current.history, ...(current.result ? [current.result] : [])]
      },
      fetchRun: fetchDetail,
      onUpdate: row => {
        if (!isCurrent(ticket, session)) return
        setHistory(previous => previous.map(record => record.id === row.id ? latestAuditRun(record, row) : record))
        setResult(previous => previous?.id === row.id ? latestAuditRun(previous, row) : previous)
      },
    })
    stopActivePolling.current = stopPolling
    void Promise.all([getAuditOptions(projectId), listAuditRuns(projectId)]).then(([available, records]) => {
      if (!isCurrent(ticket, session)) return
      setOptions(available); setHistory(records.items); setHasMore(records.has_more)
    }).catch(e => { if (isCurrent(ticket, session)) setError(message(e)) }).finally(() => { if (isCurrent(ticket, session)) setLoading(false) })
    return () => { epoch.current++; stopPolling() }
  }, [projectId, reload, sessionGeneration])
  async function run() {
    const ticket = epoch.current
    const session = sessionGeneration
    if (!isCurrent(ticket, session)) return
    setBusy(true); setError('')
    try {
      const response = await runAxisAudit(projectId, buildAuditRequest(scope, instruction, options?.scopes || []))
      if (!isCurrent(ticket, session)) return
      setResult(response)
      setHistory(previous => [response, ...previous.filter(row => row.id !== response.id)])
      try {
        const records = await listAuditRuns(projectId)
        if (!isCurrent(ticket, session)) return
        setHistory(previous => records.items.map(row => latestAuditRun(previous.find(record => record.id === row.id), row))); setHasMore(records.has_more)
      } catch (e) { if (isCurrent(ticket, session)) setError(`审计已存档，历史刷新失败：${message(e)}`) }
    } catch (e) { if (isCurrent(ticket, session)) setError(message(e)) }
    finally { if (isCurrent(ticket, session)) setBusy(false) }
  }
  async function open(id: number) {
    const ticket = epoch.current
    const session = sessionGeneration
    if (!isCurrent(ticket, session)) return
    setBusy(true); setError('')
    try {
      const response = await fetchDetail(id)
      if (!isCurrent(ticket, session)) return
      const known = currentRuns.current.history.find(row => row.id === response.id)
      setResult(previous => latestAuditRun(previous?.id === response.id ? previous : known, response))
      setHistory(previous => previous.map(row => row.id === response.id ? latestAuditRun(row, response) : row))
      resultElement.current?.scrollIntoView?.({ block: 'start' })
    } catch (e) { if (isCurrent(ticket, session)) setError(message(e)) }
    finally { if (isCurrent(ticket, session)) setBusy(false) }
  }
  async function more() {
    const ticket = epoch.current
    const session = sessionGeneration
    if (!isCurrent(ticket, session)) return
    setBusy(true); setError('')
    try {
      const records = await listAuditRuns(projectId, history.length)
      if (!isCurrent(ticket, session)) return
      setHistory(previous => {
        const rows = new Map<number, AuditRun>(previous.map(row => [row.id, row] as const))
        records.items.forEach(row => rows.set(row.id, latestAuditRun(rows.get(row.id), row)))
        return [...rows.values()]
      }); setHasMore(records.has_more)
    } catch (e) { if (isCurrent(ticket, session)) setError(message(e)) }
    finally { if (isCurrent(ticket, session)) setBusy(false) }
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
      <AuditHistory records={history} busy={busy} onOpen={id => void open(id)} />
      {hasMore && <button type="button" disabled={busy} onClick={() => void more()}>加载更多</button>}
    </section>
  </div>
}
