import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, BookOpen, Check, ChevronDown, ChevronRight, FileText, GitBranch, LocateFixed, MoreHorizontal, Pencil, Plus, RefreshCw, ShieldCheck, Users, X } from 'lucide-react'
import type { Language, PeopleAxisNode, Project } from '../../types'
import { PeopleAxisFlowCanvas, responsibilityLevelLabel, type PeopleAxisFlowCanvasProps, type PersonNodeData } from './PeopleAxisFlowCanvas'
import { averagePeopleAxisProgress } from './peopleAxisUtils'
import { responsibilityScope } from './peopleAxisFlowLayout'
import { AxisAvatar, AxisMatter, AxisProgress, AxisOriginBadge } from './ResponsibilityParts'
import './responsibility.css'

export function useAxisMobile() {
  const [mobile, setMobile] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 767px)').matches)
  useEffect(() => {
    const query = matchMedia('(max-width: 767px)')
    const update = () => setMobile(query.matches)
    query.addEventListener('change', update)
    update()
    return () => query.removeEventListener('change', update)
  }, [])
  return mobile
}

/** Modal surface shared by the phone detail sheet and canvas settings. */
export function AxisDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeRef.current(); return }
      if (e.key !== 'Tab') return
      const elements = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, textarea, [tabindex="0"]') || [])].filter(el => el.getClientRects().length)
      const first = elements[0], last = elements.at(-1)
      if (!first) { e.preventDefault(); return }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keydown, true)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', keydown, true)
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  return createPortal(<div className="axis-theme axis-sheet-layer">
    <div className="axis-sheet-backdrop" onClick={onClose} />
    <div className="axis-sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
      <div className="axis-sheet-handle" />
      <button className="axis-icon-button axis-sheet-close" aria-label="关闭" onClick={onClose}><X size={20} /></button>
      {children}
    </div>
  </div>, document.body)
}

export type AxisProjectSummary = { id: string; name: string; nodes: PeopleAxisNode[]; myRole: string; ownedNodeIds: string[] }
type Props = {
  lang: Language
  projectId?: string
  projects?: Project[]
  projectName: string
  projectSummaries: AxisProjectSummary[]
  currentUserId: number | null
  scope: 'mine' | 'project'
  onScopeChange: (scope: 'mine' | 'project') => void
  roleLabel: string
  isProjectPM: boolean
  hasResponsibilities: boolean
  onSelectProject?: (project: Project) => void
  nodes: PeopleAxisNode[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  expanded: Record<string, boolean>
  onToggleExpand: (id: string) => void
  progress: number
  syncing: boolean
  error: string | null
  mobile: boolean
  finalOwner: { name: string; avatar: string }
  canAdd: boolean
  onAdd: () => void
  canvas: PeopleAxisFlowCanvasProps
  onOrientation: (orientation: 'horizontal' | 'vertical') => void
  edgeStyle: 'curve' | 'straight'
  onEdgeStyle: (style: 'curve' | 'straight') => void
  extraRoots?: string[]
  onAddEvidence: (itemId: string) => void
  onAudit: () => void
  onOpenWiki?: () => void
  auditing: boolean
  onReload: () => void
  onDelegate?: () => void
  onSeed: () => void
  seeding: boolean
  isProject: boolean
}

function NodeDetails({ node, data, nodes, lang, onSelect, onAddEvidence, onAction }: {
  node: PeopleAxisNode; data?: PersonNodeData; nodes: PeopleAxisNode[]; lang: Language
  onSelect: (id: string) => void; onAddEvidence: (id: string) => void; onAction: () => void
}) {
  const [tab, setTab] = useState<'items' | 'evidence' | 'people'>('items')
  useEffect(() => setTab('items'), [node.id])
  const zh = lang === 'zh'
  const children = nodes.filter(n => n.parentId === node.id)
  const parent = nodes.find(n => n.id === node.parentId)
  const evidence = node.workItems.flatMap(item => item.evidences.map(ev => ({ ...ev, item: item.title })))
  const progress = averagePeopleAxisProgress([node])
  const act = (fn: () => void) => { onAction(); fn() }
  const firstSubmissionItem = node.workItems.find(item => data?.evidenceItemPermissions[item.id])
  return <div className="axis-detail-content">
    <div className="axis-detail-profile"><AxisAvatar person={node.person} /><div><h2>{node.person.name}</h2><p>{node.roleTitle}</p></div></div>
    {data && <div className="axis-rank-row"><span>{responsibilityLevelLabel(data.level, lang)}</span><AxisOriginBadge origin={node.nodeOrigin} lang={lang} />{data.isMine && <b>{zh ? '我负责' : 'My role'}</b>}</div>}
    {node.nodeOrigin === 'subordinate' && <p className="axis-muted">{zh ? `下辖挂载点 · ${parent?.person.name || '直属上级'}` : `Subordinate attachment · ${parent?.person.name || 'Parent'}`}</p>}
    {data && <div className="axis-node-permissions" data-testid="axis-node-permissions" aria-label={zh ? '当前权限' : 'Current permissions'}>
      <span className={data.canReadEvidence ? 'is-allowed' : ''}>{zh ? data.canReadEvidence ? '可查看材料' : '不可查看材料' : data.canReadEvidence ? 'Read evidence' : 'No evidence access'}</span>
      <span className={data.canSubmitEvidence ? 'is-allowed' : ''}>{zh ? data.canSubmitEvidence ? '可提交材料' : '不可提交材料' : data.canSubmitEvidence ? 'Submit evidence' : 'No submissions'}</span>
      <span className={data.canAddSubordinate ? 'is-allowed' : ''}>{zh ? data.canAddSubordinate ? '可新增下级' : '不可新增下级' : data.canAddSubordinate ? 'Add subordinates' : 'No new subordinates'}</span>
      <span className={data.canAddWorkItem ? 'is-allowed' : ''}>{zh ? data.canAddWorkItem ? '可新增事项' : '不可新增事项' : data.canAddWorkItem ? 'Add work items' : 'No new work items'}</span>
    </div>}
    {data?.canEdit && <div className="axis-person-management">
      {data.canAddSubordinate && <button className="axis-secondary-button" onClick={() => act(() => data.onAddChild(node.id))}><Plus size={16} />{zh ? '新增下级' : 'Add subordinate'}</button>}
      <button className="axis-secondary-button" onClick={() => act(() => data.onEditPerson(node.id))}><Pencil size={15} />{zh ? '编辑人员' : 'Edit person'}</button>
    </div>}
    {node.aiContext?.summary && <p className="axis-detail-description">{node.aiContext.summary}</p>}
    <div className="axis-detail-progress"><strong>{progress}%</strong><AxisProgress value={progress} /></div>
    <p className="axis-muted">{node.workItems.length} {zh ? '个事项' : 'items'} · {children.length} {zh ? '位下级' : 'subordinates'}</p>
    <div className="axis-segment axis-detail-tabs" role="tablist" aria-label={zh ? '节点内容' : 'Node content'}>
      {([['items', zh ? '事项' : 'Items'], ['evidence', zh ? '材料' : 'Evidence'], ['people', zh ? '协作' : 'People']] as const).map(([id, label]) =>
        <button key={id} role="tab" aria-selected={tab === id} disabled={id === 'evidence' && !data?.canReadEvidence} onClick={() => setTab(id)}>{label}</button>)}
    </div>
    <div className="axis-detail-tabpanel" role="tabpanel" aria-label={zh ? tab === 'items' ? '事项' : tab === 'evidence' ? '材料' : '协作' : tab}>
      {tab === 'items' && <div className="axis-detail-items">
        {node.workItems.map(item => <div className="axis-detail-item" key={item.id}>
          <AxisMatter item={item} lang={lang} />
          <div className="axis-item-meta"><span>{item.dueDate || (zh ? '未设截止日期' : 'No due date')} · {item.evidences.length} {zh ? '份材料' : 'files'}</span>
            {data?.evidenceItemPermissions[item.id] && <button onClick={() => act(() => onAddEvidence(item.id))}>{zh ? '提交材料' : 'Submit evidence'}</button>}
          </div>
        </div>)}
        {!node.workItems.length && <p className="axis-empty-text">{zh ? '暂无事项，为这位负责人添加第一项工作。' : 'No work items yet.'}</p>}
      </div>}
      {tab === 'evidence' && <div className="axis-evidence-list">
        {firstSubmissionItem && <button className="axis-primary-button" onClick={() => act(() => onAddEvidence(firstSubmissionItem.id))}><Plus size={16} />{zh ? '提交材料' : 'Submit evidence'}</button>}
        {evidence.map(ev => {
          let href: string | undefined
          try { const url = new URL(ev.url); if (['https:', 'http:'].includes(url.protocol)) href = url.href } catch { /* no external link */ }
          return <div className="axis-evidence-row" key={ev.id}><FileText size={19} />
            <div>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{ev.title}</a> : <strong>{ev.title}</strong>}
              <small>{ev.item} · {ev.timestamp}</small></div>
            <span className="axis-status">{zh ? ev.status === 'verified' ? '已采纳' : ev.status === 'rejected' ? '已驳回' : '待审核' : ev.status}</span>
          </div>
        })}
        {!evidence.length && <p className="axis-empty-text">{zh ? '暂无提交材料。可在事项下提交交付材料。' : 'No evidence submitted yet.'}</p>}
      </div>}
      {tab === 'people' && <div className="axis-people-list">
        {parent && <><h3>{zh ? '直属上级' : 'Parent owner'}</h3><PersonRow node={parent} onClick={() => onSelect(parent.id)} /></>}
        <h3>{zh ? '下级责任人' : 'Subordinate owners'}</h3>
        {children.map(child => <PersonRow key={child.id} node={child} onClick={() => onSelect(child.id)} />)}
        {!children.length && <p className="axis-empty-text">{zh ? '暂无下级责任人' : 'No subordinate owners'}</p>}
      </div>}
    </div>
    <div className="axis-detail-actions">
      {data?.canAddWorkItem ? <button className="axis-primary-button" onClick={() => act(() => data.onAddWorkItem(node.id))}><Plus size={18} />{zh ? '添加事项' : 'Add work item'}</button>
        : <span className="axis-read-only"><ShieldCheck size={17} />{zh ? data?.canEdit ? '不可新增事项' : '只读' : data?.canEdit ? 'No new work items' : 'Read-only'}</span>}
      {data?.canRelink && <button className="axis-text-button" onClick={() => act(() => data.onToggleLinking(node.id))}><GitBranch size={16} />{zh ? '管理责任关系' : 'Manage relationship'}</button>}
    </div>
  </div>
}

const PersonRow: React.FC<{ node: PeopleAxisNode; onClick: () => void }> = ({ node, onClick }) => {
  return <button className="axis-person-row" onClick={onClick}><AxisAvatar person={node.person} small /><span><strong>{node.person.name}</strong><small>{node.roleTitle}</small></span><ChevronRight size={17} /></button>
}

export function ResponsibilityWorkspace(p: Props) {
  const zh = p.lang === 'zh'
  const [mode, setMode] = useState<'chain' | 'overview'>(() => p.mobile ? 'chain' : 'overview')
  const [detailOpen, setDetailOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [focusToken, setFocusToken] = useState(0)
  const selected = p.nodes.find(n => n.id === p.selectedId)
  const selectedData = p.canvas.nodes.find(n => n.id === p.selectedId)?.data as PersonNodeData | undefined
  const allData = useMemo(() => new Map(p.canvas.nodes.filter(n => n.type === 'person').map(n => [n.id, n.data as PersonNodeData])), [p.canvas.nodes])
  const summaryNodes = p.isProject ? p.nodes : p.projectSummaries.flatMap(project => project.nodes)
  const count = summaryNodes.reduce((sum, n) => sum + n.workItems.length, 0)
  const hasPreview = p.mobile && mode === 'overview' && !!selected && !detailOpen && !p.canvas.linkingSourceNodeId
  const prevMobile = useRef(p.mobile)
  useEffect(() => {
    if (p.mobile !== prevMobile.current) { setMode(p.mobile ? 'chain' : 'overview'); setDetailOpen(false); prevMobile.current = p.mobile }
  }, [p.mobile])
  useEffect(() => { setDetailOpen(false); setSettingsOpen(false) }, [p.projectId])
  useEffect(() => { if (!selected) setDetailOpen(false) }, [selected])
  useEffect(() => {
    if (p.canvas.linkingSourceNodeId) { setMode('overview'); setDetailOpen(false) }
  }, [p.canvas.linkingSourceNodeId])
  const choose = (id: string) => {
    allData.get(id)?.onCardClick(id)
    if (!p.canvas.linkingSourceNodeId) setDetailOpen(true)
  }
  const detail = selected && <NodeDetails node={selected} data={selectedData} nodes={p.nodes} lang={p.lang}
    onSelect={p.onSelect} onAddEvidence={p.onAddEvidence} onAction={() => { setDetailOpen(false) }} />
  const renderChain = () => {
    const sorted = [...p.nodes].sort((a, b) => a.orderOnAxis - b.orderOnAxis)
    const roots = sorted.filter(n => !n.parentId || !p.nodes.some(parent => parent.id === n.parentId))
    const seen = new Set<string>()
    const render = (node: PeopleAxisNode, depth = 0): React.ReactNode => {
      if (seen.has(node.id)) return null
      seen.add(node.id)
      const kids = sorted.filter(n => n.parentId === node.id)
      const expanded = p.expanded[node.id] !== false
      return <div className={`axis-chain-branch ${depth > 0 ? 'is-child' : ''}${node.nodeOrigin === 'subordinate' ? ' is-subordinate' : ''}`} key={node.id}>
        <article className={`axis-chain-card${node.nodeOrigin === 'subordinate' ? ' is-subordinate' : ''}`}>
          <button className="axis-chain-select" data-testid={`axis-chain-node-${node.id}`} data-node-origin={node.nodeOrigin || 'project'} onClick={() => choose(node.id)}>
            <div className="axis-rank-row"><span>{responsibilityLevelLabel(depth + 1, p.lang)}</span><AxisOriginBadge origin={node.nodeOrigin} lang={p.lang} />{allData.get(node.id)?.isMine ? <b>{zh ? '我负责' : 'My role'}</b> : allData.get(node.id)?.isScopeContext && <small>{zh ? '上级链路' : 'Reporting path'}</small>}</div>
            <div className="axis-person-heading"><AxisAvatar person={node.person} /><div className="axis-person-label"><strong>{node.person.name}</strong><span>{node.roleTitle}</span></div>
              {node.aiContext?.riskLevel === 'high' ? <span className="axis-status is-risk">{zh ? '需关注' : 'At risk'}</span> : <ChevronRight size={18} className="axis-muted-icon" />}
            </div>
            <AxisProgress value={averagePeopleAxisProgress([node])} label />
            {node.workItems[0] && <AxisMatter item={node.workItems[0]} lang={p.lang} />}
            <span className="axis-chain-count">{node.workItems.length} {zh ? '个事项' : 'items'}{kids.length > 0 ? ` · ${kids.length} ${zh ? '位下级' : 'subordinates'}` : ''}</span>
          </button>
          {allData.get(node.id)?.canEdit && <div className="axis-chain-management">
            {allData.get(node.id)?.canAddSubordinate && <button onClick={() => allData.get(node.id)?.onAddChild(node.id)}><Plus size={15} />{zh ? '新增下级' : 'Add subordinate'}</button>}
            <button onClick={() => allData.get(node.id)?.onEditPerson(node.id)}><Pencil size={14} />{zh ? '编辑人员' : 'Edit person'}</button>
            {allData.get(node.id)?.canRelink && <button onClick={() => allData.get(node.id)?.onToggleLinking(node.id)}><GitBranch size={14} />{zh ? '调整上级' : 'Change manager'}</button>}
          </div>}
          {kids.length > 0 && <button className="axis-chain-expand" aria-expanded={expanded} onClick={() => p.onToggleExpand(node.id)}>
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}{zh ? `${expanded ? '收起' : '展开'}下级` : 'Subordinates'}
          </button>}
        </article>
        {expanded && kids.map(child => render(child, depth + 1))}
      </div>
    }
    return <div className="axis-chain-scroll"><div className="axis-chain-list">
      {roots.length > 0 && <div className="axis-chain-final"><AxisAvatar person={p.finalOwner} small /><div><strong>{zh ? '终责' : 'Final owner'} · {p.finalOwner.name}</strong><span>{zh ? '项目终责 · 统筹各级负责人' : 'Project lead · accountable owner'}</span></div></div>}
      {roots.map(n => render(n))}
    </div></div>
  }
  return <section className="axis-theme axis-workspace" aria-label={zh ? '项目管理' : 'Project management'}>
    <header className="axis-workspace-header"><div><h1>{zh ? '人轴责任链' : 'Responsibility chain'}</h1><span className="axis-desktop-subtitle">{p.isProject ? p.projectName : (zh ? '每个项目独立分工，每份职责落实到人' : 'A separate responsibility chain for every project')}</span></div>
      <div className="axis-header-actions">
        <label className="axis-project-picker"><span className="sr-only">{zh ? '选择项目' : 'Select project'}</span>
          <select aria-label={zh ? '选择项目' : 'Select project'} value={p.projectId || 'all'} onChange={e => { const project = p.projects?.find(project => project.id === e.target.value); if (project) p.onSelectProject?.(project) }}>
            <option value="all">{zh ? '全部项目' : 'All projects'}</option>
            {p.projects?.filter(project => project.id !== 'all').map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
            {!p.projects?.some(project => project.id === p.projectId) && p.isProject && <option value={p.projectId}>{p.projectName}</option>}
          </select><ChevronDown size={15} />
        </label>
        {p.isProject && <button className="axis-icon-button" aria-label={zh ? '项目知识' : 'Project knowledge'} onClick={p.onOpenWiki}><BookOpen size={20} /></button>}
        {p.isProject && <button className="axis-icon-button" aria-label={zh ? '画布设置' : 'Canvas settings'} onClick={() => setSettingsOpen(true)}><MoreHorizontal size={21} /></button>}
        {!p.mobile && p.canAdd && <button className="axis-primary-button" aria-label="添加责任人" onClick={p.onAdd}><Plus size={17} />{zh ? '添加成员' : 'Add person'}</button>}
      </div>
    </header>
    {p.isProject && <nav className="axis-quick-actions" aria-label={zh ? '人轴协作与检查' : 'Delegation and review'}>
      {p.onDelegate && <button className="axis-settings-row" onClick={p.onDelegate}><ShieldCheck size={19} />{zh ? '委托授权' : 'Manage delegations'}</button>}
      <button className="axis-settings-row" disabled={p.auditing} onClick={p.onAudit}><Check size={19} />{zh ? p.auditing ? '审计中…' : 'AI 责任链审计' : 'AI responsibility audit'}</button>
    </nav>}
    <div className="axis-summary"><div className="axis-summary-progress"><strong>{p.isProject ? (zh ? p.scope === 'mine' ? '我的职责' : '项目全貌' : 'Responsibility') : (zh ? `${p.projectSummaries.length} 个项目` : `${p.projectSummaries.length} projects`)}</strong><AxisProgress value={p.isProject ? p.progress : averagePeopleAxisProgress(summaryNodes)} /><b>{p.isProject ? p.progress : averagePeopleAxisProgress(summaryNodes)}%</b></div>
      <span className="axis-summary-count"><Users size={16} />{summaryNodes.length} {zh ? '位负责人' : 'owners'}<span>·</span>{count} {zh ? '个事项' : 'items'}</span>
      <span className={`axis-sync ${p.syncing ? 'is-syncing' : ''}`} role="status"><i />{p.syncing ? (zh ? '同步中' : 'Syncing') : (zh ? '已同步' : 'Synced')}</span>
    </div>
    {p.error && <div className="axis-load-notice" role="status">{p.error}<button onClick={p.onReload}>{zh ? '重新加载' : 'Reload'}</button></div>}
    {p.isProject && <div className="axis-role-context"><div><span>{zh ? '我在此项目' : 'My role in this project'}</span><strong data-testid="axis-my-role">{p.roleLabel}</strong></div>
      <div className="axis-scope-switch" role="group" aria-label={zh ? '职责范围' : 'Responsibility scope'}>
        <button aria-pressed={p.scope === 'mine'} onClick={() => p.onScopeChange('mine')}>{zh ? '我的职责' : 'My responsibilities'}</button>
        <button aria-pressed={p.scope === 'project'} onClick={() => p.onScopeChange('project')}>{zh ? '项目全貌' : 'Whole project'}</button>
      </div>
    </div>}
    {!p.isProject ? <div className="axis-project-catalog" data-testid="axis-project-catalog">
      <p className="axis-catalog-intro">{zh ? '选择项目，查看你在该项目的岗位、责任范围与汇报关系。' : 'Choose a project to see your role, responsibilities and reporting path.'}</p>
      <div className="axis-project-grid">{p.projectSummaries.map(project => {
        const direct = responsibilityScope(project.nodes, project.ownedNodeIds.length ? new Set(project.ownedNodeIds) : null, p.currentUserId).direct
        const roles = [...new Set(project.nodes.filter(n => direct.has(n.id)).map(n => n.roleTitle))]
        const role = project.myRole === 'pm' ? (zh ? '项目 PM · 统筹项目' : 'Project PM') : roles.join(' / ') || (zh ? '项目成员 · 尚未分配职责' : 'Member · no assigned responsibility')
        return <button className="axis-project-card" key={project.id} data-testid={`axis-project-${project.id}`} onClick={() => p.onSelectProject?.(p.projects?.find(item => item.id === project.id) || { id: project.id, name: project.name, color: '#0058BE', description: '', active: true })}>
          <span className="axis-project-card-heading"><GitBranch size={22} /><strong>{project.name}</strong><ChevronRight size={19} /></span>
          <span className="axis-project-role">{zh ? '我的岗位' : 'My role'} · {role}</span>
          <AxisProgress value={averagePeopleAxisProgress(project.nodes)} label />
          <span className="axis-summary-count">{project.nodes.length} {zh ? '位负责人' : 'owners'} · {project.nodes.reduce((sum, n) => sum + n.workItems.length, 0)} {zh ? '个事项' : 'items'}</span>
          <span className="axis-project-enter">{zh ? '查看项目责任链' : 'Open responsibility chain'}<ArrowRight size={15} /></span>
        </button>
      })}</div>
      {!p.projectSummaries.length && <p className="axis-empty-text">{p.syncing ? (zh ? '正在加载项目…' : 'Loading projects…') : (zh ? '暂无可查看的项目。' : 'No visible projects.')}</p>}
    </div> : <div className="axis-workbench">
      <div className="axis-board">
        <div className="axis-view-toolbar"><div className="axis-segment axis-view-tabs" role="tablist" aria-label={zh ? '项目视图' : 'Project view'}>
          <button role="tab" aria-selected={mode === 'chain'} aria-controls="axis-view-panel" onClick={() => { p.canvas.onCancelLinking?.(); setMode('chain'); setDetailOpen(false) }}>{zh ? '责任链' : 'Chain'}</button>
          <button role="tab" aria-selected={mode === 'overview'} aria-controls="axis-view-panel" onClick={() => { setMode('overview'); setDetailOpen(false); p.onSelect(null) }}>{zh ? '总览' : 'Overview'}</button>
        </div>
          {mode === 'overview' && <div className="flex items-center gap-2">
            <div className="axis-orientation" role="group" aria-label={zh ? '主轴方向' : 'Orientation'}>
              {(['vertical', 'horizontal'] as const).map(direction => <button key={direction} aria-pressed={p.canvas.orientation === direction} onClick={() => p.onOrientation(direction)}>
                {zh ? direction === 'vertical' ? '纵向' : '横向' : direction === 'vertical' ? 'Vertical' : 'Horizontal'}
              </button>)}
            </div>
            <div className="axis-orientation" role="group" aria-label={zh ? '连线样式' : 'Edge style'}>
              <button aria-pressed={p.edgeStyle !== 'straight'} onClick={() => p.onEdgeStyle('curve')}>
                {zh ? '曲线' : 'Curve'}
              </button>
              <button aria-pressed={p.edgeStyle === 'straight'} onClick={() => p.onEdgeStyle('straight')}>
                {zh ? '直线' : 'Straight'}
              </button>
            </div>
          </div>}
        </div>
        <div className="axis-attachment-legend" aria-label={zh ? '责任结构图例' : 'Structure legend'}><span><i />{zh ? '项目定义' : 'Project definition'}</span><span className="is-subordinate"><i />{zh ? '下辖分支 · 独立挂载' : 'Subordinate attachment'}</span></div>
        <div className="axis-view-panel" role="tabpanel" id="axis-view-panel" aria-label={zh ? mode === 'chain' ? '责任链' : '总览' : mode}>
          {p.nodes.length > 0 ? mode === 'chain' ? renderChain() : <div className="axis-overview" data-testid="axis-overview">
            {p.extraRoots && p.extraRoots.length > 0 && (
              <div className="axis-multi-root-notice" role="alert">
                {zh ? '该项目存在多个根节点，请联系管理员整理' : '该项目存在多个根节点，请联系管理员整理'}
              </div>
            )}
            <PeopleAxisFlowCanvas {...p.canvas} edgeStyle={p.edgeStyle} mobile={p.mobile} hasPreview={hasPreview} focusNodeId={p.selectedId} focusToken={focusToken} />
            {!p.canvas.linkingSourceNodeId && <p className="axis-canvas-hint">{zh ? p.mobile ? '双指缩放 · 拖动浏览' : '拖动节点调整位置 · 拖动空白浏览' : 'Drag cards to move · drag blank space to pan'}</p>}
            {hasPreview && selected && <div className="axis-node-preview" data-testid="axis-node-preview"><div className="axis-sheet-handle" />
              <button className="axis-preview-close axis-icon-button" aria-label={zh ? '关闭预览' : 'Close preview'} onClick={() => p.onSelect(null)}><X size={17} /></button>
              <div className="axis-person-heading"><AxisAvatar person={selected.person} small /><div className="axis-person-label"><strong>{selected.person.name}</strong><span>{selected.roleTitle}</span></div><b>{averagePeopleAxisProgress([selected])}%</b></div>
              <div className="axis-preview-actions"><button className="axis-primary-button" onClick={() => setDetailOpen(true)}>{zh ? '查看详情' : 'View details'}<ArrowRight size={17} /></button>
                <button className="axis-secondary-button" onClick={() => setFocusToken(t => t + 1)}><LocateFixed size={17} />{zh ? '定位' : 'Locate'}</button></div>
              {selectedData?.canEdit && <div className="axis-preview-management">
                {selectedData.canAddSubordinate && <button onClick={() => selectedData.onAddChild(selected.id)}><Plus size={15} />{zh ? '新增下级' : 'Add subordinate'}</button>}
                <button onClick={() => selectedData.onEditPerson(selected.id)}><Pencil size={14} />{zh ? '编辑人员' : 'Edit person'}</button>
                {selectedData.canRelink && <button onClick={() => selectedData.onToggleLinking(selected.id)}><GitBranch size={14} />{zh ? '调整上级' : 'Change manager'}</button>}
              </div>}
            </div>}
          </div> : <div className="axis-empty-state"><span className="axis-empty-icon"><GitBranch size={34} /></span>
            <h2>{p.syncing ? (zh ? '正在加载责任链…' : 'Loading…') : p.error ? (zh ? '暂时无法显示责任链' : 'Unable to load') : p.scope === 'mine' && !p.hasResponsibilities && !p.isProjectPM ? (zh ? '你在此项目尚未分配职责' : 'No assigned responsibilities') : (zh ? '从一位负责人开始' : 'Start with an owner')}</h2>
            <p>{zh ? p.scope === 'mine' && !p.hasResponsibilities && !p.isProjectPM ? '可切换项目全貌查看分工，或联系项目 PM 分配职责。' : '项目终责统筹，负责人逐级分工，事项落实到人。' : 'The project lead oversees a hierarchy of owners and their work.'}</p>
            {p.canAdd && !p.syncing && !(p.scope === 'mine' && !p.hasResponsibilities && !p.isProjectPM) && <><button className="axis-primary-button" onClick={p.onAdd}><Plus size={18} />{zh ? '先添加终责人' : 'Add final owner'}</button>
              <button className="axis-text-button" disabled={p.seeding} onClick={p.onSeed}>{p.seeding ? (zh ? '生成中…' : 'Creating…') : (zh ? '一键生成示例人轴' : 'Create a sample axis')}</button></>}
          </div>}
          {p.mobile && p.canAdd && !detailOpen && p.nodes.length > 0 && <button className={`axis-add-fab ${hasPreview ? 'has-preview' : ''}`} aria-label="添加责任人" onClick={p.onAdd}><Plus size={28} /></button>}
        </div>
      </div>
      {!p.mobile && selected && <aside className="axis-inspector" data-testid="axis-inspector"><div className="axis-inspector-title"><h2>{zh ? '节点详情' : 'Node details'}</h2>
        {selected && <button className="axis-icon-button" aria-label="关闭详情" onClick={() => p.onSelect(null)}><X size={18} /></button>}</div>
        {detail || <div className="axis-inspector-empty"><Users size={30} /><p>{zh ? '选择一位负责人' : 'Select an owner'}</p><small>{zh ? '查看事项、材料与协作关系' : 'Explore work items, evidence and relationships'}</small></div>}
      </aside>}
    </div>}
    {p.mobile && detailOpen && selected && <AxisDialog title={zh ? '节点详情' : 'Node details'} onClose={() => setDetailOpen(false)}>{detail}</AxisDialog>}
    {settingsOpen && <AxisDialog title={zh ? '画布设置' : 'Canvas settings'} onClose={() => setSettingsOpen(false)}><div className="axis-settings"><h2>{zh ? '画布设置' : 'Canvas settings'}</h2>
      <p className="axis-muted">{zh ? '浏览方式随时切换，责任关系保持同步。' : 'Switch views while keeping the same responsibility data.'}</p>
      <button className="axis-settings-row" onClick={() => { p.canvas.onResetLayout(); setSettingsOpen(false) }}><RefreshCw size={19} />{zh ? '重置卡片布局' : 'Reset card layout'}</button>
    </div></AxisDialog>}
  </section>
}
