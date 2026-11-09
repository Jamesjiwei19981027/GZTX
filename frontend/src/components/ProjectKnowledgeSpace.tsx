import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlow, Background, Controls, Handle, Position, applyNodeChanges, MarkerType, type Node, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  getProjectKnowledgeSpace, setProjectKnowledgeGrant, generateProjectKnowledgeSummary,
  getProjectKnowledgeSummary, saveProjectKnowledgeSummary,
  type ProjectKnowledgePage, type ProjectKnowledgeCatalog, type ProjectKnowledgeSummary,
} from '../api/projectKnowledge'
import type { PersonalKnowledgeEntryInput } from '../api/personalKnowledge'
import './ProjectKnowledgeSpace.css'
import { KnowledgeDialog } from './KnowledgeDialog'
import { AutoGrowingTextarea } from './AutoGrowingTextarea'

export type ProjectKnowledgeSpaceProps = { projectId: number; userId?: string; onSaved: () => void; active?: boolean }
type SourceFact = { package_id?: number; text?: string; quote?: string; source_name?: string; line_start?: number; line_end?: number }
type SourceNode = Node<{ title: string; kind: 'page' | 'package' }, 'source'>
const factsOf = (page: ProjectKnowledgePage): SourceFact[] => Array.isArray(page.meta?.facts) ? page.meta.facts.filter(value => value && typeof value === 'object') as SourceFact[] : []
const messageOf = (cause: unknown) => cause instanceof Error ? cause.message : '操作失败，请重试。'
const pageSource = (page: ProjectKnowledgePage) => page.source === 'llm_wiki' ? 'AI 整理 · 已发布' : '项目共享笔记'

function CitationNode({ data }: NodeProps<SourceNode>) {
  return <div className={`pjk-graph-node pjk-graph-${data.kind}`}>
    <Handle type="target" position={Position.Left} /><small>{data.kind === 'page' ? '共享知识页' : '来源引用'}</small><strong className="font-medium">{data.title}</strong><Handle type="source" position={Position.Right} />
  </div>
}
const nodeTypes = { source: CitationNode }

export function ProjectKnowledgeSpace(props: ProjectKnowledgeSpaceProps) {
  return React.createElement(ProjectKnowledgeScope, { ...props, key: `${props.userId ?? 'authenticated'}:${props.projectId}` })
}

function ProjectKnowledgeScope({ projectId, userId, onSaved, active = true }: ProjectKnowledgeSpaceProps) {
  const [catalog, setCatalog] = useState<ProjectKnowledgeCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const [openedId, setOpenedId] = useState<number | null>(null)
  const [instruction, setInstruction] = useState('')
  const [showGraph, setShowGraph] = useState(false)
  const [nodes, setNodes] = useState<SourceNode[]>([])
  const [summary, setSummary] = useState<ProjectKnowledgeSummary | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [draftTags, setDraftTags] = useState('')
  const [summaryOpen, setSummaryOpen] = useState(false)
  const alive = useRef(false)
  const busy = useRef(false)
  const readVersion = useRef(0)
  const storageKey = `project-knowledge-summary:${userId ?? 'authenticated'}:${projectId}`
  const pages = useMemo(() => (catalog?.pages ?? []).filter(page => page.source === 'manual' || page.source === 'llm_wiki'), [catalog])
  const opened = pages.find(page => page.id === openedId)
  const disabled = loading || !!pending
  const canSummarize = catalog?.permissions.can_summarize === true

  function rememberSummary(id: number | null) {
    try { if (id === null) sessionStorage.removeItem(storageKey); else sessionStorage.setItem(storageKey, String(id)) } catch { /* Storage is optional; server ownership remains authoritative. */ }
  }
  function preview(value: ProjectKnowledgeSummary, open = true) {
    setSummary(value); setDraftTitle(value.title); setDraftBody(value.body_text); setDraftTags(''); setSummaryOpen(open); setOpenedId(null)
    if (!open) setSummaryOpen(false)
  }
  async function load(signal?: AbortSignal, restore = false) {
    const version = ++readVersion.current
    setLoading(true); setError('')
    try {
      const result = await getProjectKnowledgeSpace(projectId, signal)
      if (!alive.current || version !== readVersion.current) return
      if (result.scope.project_id !== projectId || (userId && String(result.scope.owner_user_id) !== userId)) throw new Error('项目知识归属不匹配，请重新选择项目。')
      setCatalog(result)
      if (restore) {
        let previousId: string | null = null
        try { previousId = sessionStorage.getItem(storageKey) } catch { /* A blocked session store does not prevent normal use. */ }
        if (previousId && /^[1-9]\d*$/.test(previousId)) {
          try {
            const restored = await getProjectKnowledgeSummary(projectId, Number(previousId), signal)
            if (alive.current && version === readVersion.current) { preview(restored, false); setSelected(restored.page_ids) }
          } catch (cause) {
            if (alive.current && version === readVersion.current && !signal?.aborted) { rememberSummary(null); setError(`先前草稿无法恢复：${messageOf(cause)}`) }
          }
        }
      }
    } catch (cause) {
      if (alive.current && version === readVersion.current && !signal?.aborted) setError(messageOf(cause))
    } finally {
      if (alive.current && version === readVersion.current) setLoading(false)
    }
  }
  useEffect(() => {
    alive.current = true
    const controller = new AbortController()
    if (Number.isSafeInteger(projectId) && projectId > 0) void load(controller.signal, true)
    else { setError('请选择具体项目。'); setLoading(false) }
    return () => { alive.current = false; readVersion.current++; controller.abort() }
  }, [projectId, userId])

  async function operate<T,>(kind: string, action: () => Promise<T>, apply: (result: T) => void) {
    if (busy.current || loading) return
    busy.current = true; setPending(kind); setError(''); setNotice(''); readVersion.current++
    try {
      const result = await action()
      if (alive.current) apply(result)
    } catch (cause) {
      if (alive.current) setError(messageOf(cause))
    } finally {
      if (alive.current) { busy.current = false; setPending('') }
    }
  }
  const graph = useMemo(() => {
    const graphNodes: SourceNode[] = pages.map((page, index) => ({ id: `page:${page.id}`, type: 'source', position: { x: 340, y: index * 160 }, draggable: true, data: { title: page.title, kind: 'page' }, ariaLabel: `共享知识页 ${page.title}` }))
    const packages = new Set<number>()
    const edges: { id: string; source: string; target: string; label: string; type: string; markerEnd: { type: MarkerType } }[] = []
    for (const page of pages) {
      const pagePackages = new Set<number>()
      for (const fact of factsOf(page)) if (Number.isSafeInteger(fact.package_id) && fact.package_id! > 0) pagePackages.add(fact.package_id!)
      for (const packageId of pagePackages) {
        packages.add(packageId)
        edges.push({ id: `citation:${packageId}:${page.id}`, source: `package:${packageId}`, target: `page:${page.id}`, label: '来源引用', type: 'default', markerEnd: { type: MarkerType.ArrowClosed } })
      }
    }
    Array.from(packages).forEach((id, index) => graphNodes.push({ id: `package:${id}`, type: 'source', position: { x: 0, y: index * 160 + 60 }, draggable: true, data: { title: `材料包 #${id}`, kind: 'package' }, ariaLabel: `来源材料包 ${id}` }))
    return { nodes: graphNodes, edges }
  }, [pages])
  useEffect(() => { setNodes(graph.nodes) }, [graph.nodes])

  function generate(event: React.FormEvent) {
    event.preventDefault()
    if (!canSummarize || !pages.length) return
    void operate('generate', () => generateProjectKnowledgeSummary(projectId, selected.length ? selected : pages.map(page => page.id), instruction.trim()), result => { preview(result); rememberSummary(result.id); setNotice('总结已准备好，确认后即可存入我的知识。') })
  }
  function save(event: React.FormEvent) {
    event.preventDefault()
    if (!summary || !canSummarize || !draftTitle.trim()) return
    const input: PersonalKnowledgeEntryInput = { title: draftTitle.trim(), body_text: draftBody, tags: [...new Set<string>(draftTags.split(/[,，\n]/).map(tag => tag.trim()).filter(Boolean))] }
    void operate('save', () => saveProjectKnowledgeSummary(projectId, summary.id, input), result => {
      setSummary(previous => previous ? { ...previous, status: 'saved', personal_entry_id: result.entry.id } : previous)
      setNotice(result.already_saved ? '这份总结已存在于我的知识，保留原有条目。' : '已存入我的知识。')
      setSummaryOpen(false); setOpenedId(null)
      onSaved()
    })
  }

  const pageDetails = opened && <article className="pjk-page-detail"><h3>{opened.title}</h3><small>{pageSource(opened)}</small><p className="pjk-page-body">{opened.body_text || '暂无正文'}</p><details><summary>查看原始依据</summary>{factsOf(opened).length ? <ul className="pjk-facts">{factsOf(opened).map((fact, index) => <li key={index}>{fact.text && <p>{fact.text}</p>}{fact.quote && <blockquote>{fact.quote}</blockquote>}<small>{fact.source_name || '来源材料'}{fact.package_id ? ` · 材料 #${fact.package_id}` : ''}{fact.line_start ? ` · 第 ${fact.line_start}${fact.line_end ? `–${fact.line_end}` : ''} 行` : ''}</small></li>)}</ul> : <p className="pjk-muted">暂无额外引用。</p>}</details></article>
  const errorPanel = error && <div role="alert" className="pjk-error"><span>{error}</span><small>内容仍保留，可以重试。</small></div>
  return <section className="project-knowledge" aria-label="项目共享知识">
    <div className="pjk-heading"><div><h2>项目知识</h2><p>查看团队积累，让 AI 帮你提炼成自己的知识。</p></div><span>项目共享</span></div>
    {!summaryOpen && !opened && error && <div role="alert" className="pjk-error"><span>{error}</span><button type="button" disabled={disabled} onClick={() => void load()}>重新读取</button></div>}
    <div role="status" aria-live="polite" className="pjk-status">{loading ? '正在读取项目知识…' : pending === 'generate' ? '我的 AI 正在整理，请稍候…' : pending === 'save' ? '正在存入我的知识…' : pending === 'grant' ? '正在更新授权…' : notice}</div>
    {catalog && <>
      <form className="pjk-generate pjk-generate-top" onSubmit={generate}><div className="pjk-section-heading"><h3>让 AI 帮我整理</h3><span>{selected.length ? `已选 ${selected.length} 份资料` : '默认整理全部共享资料'}</span></div>{!canSummarize && <p className="pjk-permission">请联系项目经理开通 AI 总结权限。</p>}<button type="submit" className="pjk-primary" disabled={disabled || !canSummarize || !pages.length}>{pending === 'generate' ? 'AI 正在整理…' : 'AI 总结到我的知识'}</button>{summary && <button type="button" onClick={() => { setSummaryOpen(true); setError('') }}>继续查看总结</button>}<details><summary>补充整理要求</summary><label>整理要求（可选）<textarea aria-label="整理要求" rows={2} value={instruction} disabled={disabled} onChange={event => setInstruction(event.target.value)} placeholder="例如：提炼验收要点" maxLength={2000} /></label></details></form>
      {catalog.permissions.can_manage_grants && <details className="pjk-grants"><summary>管理总结授权</summary><p>授权成员使用自己的 AI 整理本项目共享知识。</p><ul>{catalog.members.map(member => <li key={member.user_id}><div><strong className="font-medium">{member.name}</strong><small>{member.is_manager ? '项目经理 · 默认授权' : '当前项目成员'}</small></div><label><input type="checkbox" aria-label={`允许 ${member.name} 总结项目知识`} checked={member.can_summarize} disabled={disabled || member.is_manager} onChange={event => {
        const requested = event.target.checked
        void operate('grant', () => setProjectKnowledgeGrant(projectId, member.user_id, requested), result => { setCatalog(previous => previous ? { ...previous, members: previous.members.map(item => item.user_id === result.user_id ? result : item), permissions: result.user_id === Number(userId) ? { ...previous.permissions, can_summarize: result.can_summarize } : previous.permissions } : previous); setNotice('总结授权已更新') })
      }} />允许总结</label></li>)}</ul></details>}
      <div className="pjk-catalog-layout"><div className="pjk-catalog"><div className="pjk-section-heading"><h3>团队共享资料</h3><span>{pages.length} 份</span></div>
        {!pages.length && <div className="pjk-empty"><h3>暂无共享知识</h3><p>团队已发布的资料和笔记会显示在这里。</p></div>}
        <ul className="pjk-pages">{pages.map(page => <li key={page.id} className={openedId === page.id ? 'pjk-page-active' : ''}><label className="pjk-select"><input type="checkbox" aria-label={`选择 ${page.title}`} checked={selected.includes(page.id)} disabled={disabled} onChange={event => setSelected(previous => event.target.checked ? [...previous, page.id] : previous.filter(id => id !== page.id))} /></label><button type="button" aria-label={`查看项目知识 ${page.title}`} onClick={() => setOpenedId(page.id)}><strong className="font-medium">{page.title}</strong><small>{pageSource(page)}</small><span>{page.body_text || '暂无正文'}</span></button></li>)}</ul>
      </div>
      {active && opened && !summaryOpen && <KnowledgeDialog title="查看项目资料" onClose={() => setOpenedId(null)}>{pageDetails}{errorPanel}</KnowledgeDialog>}
      </div>
      <div className="pjk-graph-section"><button type="button" aria-expanded={showGraph} onClick={() => setShowGraph(previous => !previous)}>来源关系图</button><p>连线来自共享资料中的明确引用。拖动卡片可调整视图。</p>{showGraph && <div className="pjk-graph" aria-label="项目知识来源图"><ReactFlow<SourceNode> nodes={nodes} edges={graph.edges} nodeTypes={nodeTypes} fitView panOnDrag={false} fitViewOptions={{ padding: 0.2, maxZoom: 1 }} minZoom={0.2} maxZoom={2} nodesDraggable nodesConnectable={false} nodeDragThreshold={0} deleteKeyCode={null} onNodesChange={changes => setNodes(previous => applyNodeChanges(changes, previous))} onNodeDrag={(_, node) => setNodes(previous => previous.map(item => item.id === node.id ? { ...item, position: node.position } : item))} onNodeDragStop={(_, node) => setNodes(previous => previous.map(item => item.id === node.id ? { ...item, position: node.position } : item))} onNodeClick={(_, node) => { if (node.id.startsWith('page:')) setOpenedId(Number(node.id.slice(5))) }} proOptions={{ hideAttribution: true }}><Background gap={24} /><Controls showInteractive={false} /></ReactFlow></div>}</div>
    </>}
    {active && summary && summaryOpen && <KnowledgeDialog title="确认 AI 总结" dirty={draftTitle !== summary.title || draftBody !== summary.body_text || !!draftTags} onClose={() => preview(summary, false)}><section className="pjk-preview project-knowledge" aria-label="我的总结草稿"><div className="pjk-section-heading"><h3>总结草稿</h3><span>{summary.status === 'saved' ? '已保存' : '仅自己可见'}</span></div><p className="pjk-muted">可以直接保存，也可以补充自己的想法。</p>{errorPanel}<form onSubmit={save}><label>总结标题<input aria-label="总结标题" value={draftTitle} disabled={!!pending} required maxLength={300} onChange={event => setDraftTitle(event.target.value)} /></label><label>总结正文<AutoGrowingTextarea aria-label="总结正文" value={draftBody} disabled={!!pending} rows={5} maxRows={12} onChange={event => setDraftBody(event.target.value)} /></label><details><summary>标签与来源</summary><label>总结标签<input aria-label="总结标签" value={draftTags} disabled={!!pending} placeholder="例如：验收，交付" onChange={event => setDraftTags(event.target.value)} /></label><section className="pjk-summary-sources" aria-label="总结来源引用"><h4>原始依据</h4><ul>{summary.sources.map((source, index) => <li key={`${source.page_id}:${index}`}><button type="button" onClick={() => setOpenedId(source.page_id)}>{source.title}</button><blockquote>{source.quote}</blockquote></li>)}</ul>{pageDetails}</section></details><div className="knowledge-save-row"><button type="submit" className="pjk-primary" disabled={disabled || !canSummarize || !draftTitle.trim()}>确认存入我的知识</button></div></form></section></KnowledgeDialog>}
  </section>
}

export default ProjectKnowledgeSpace

