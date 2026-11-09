import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow, Background, Controls, Handle, Position, MarkerType, applyNodeChanges,
  type Connection, type Node, type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Project } from '../types'
import {
  getPersonalKnowledge, createPersonalKnowledgeEntry, updatePersonalKnowledgeEntry,
  deletePersonalKnowledgeEntry, syncPersonalKnowledge, createPersonalKnowledgeLink,
  updatePersonalKnowledgeLink, deletePersonalKnowledgeLink,
  suggestKnowledgeRelationships, applyKnowledgeRelationships, type KnowledgeSuggestion,
  type PersonalKnowledgeEntry, type PersonalKnowledgeLink, type PersonalKnowledgeEntryInput,
} from '../api/personalKnowledge'
import './PersonalKnowledgeSpace.css'
import { ProjectKnowledgeSpace } from './ProjectKnowledgeSpace'
import { KnowledgeDialog } from './KnowledgeDialog'
import { AutoGrowingTextarea } from './AutoGrowingTextarea'
import { MaterialTextInput } from './MaterialTextInput'

export type PersonalKnowledgeSpaceProps = {
  userId?: string
  projects: Project[]
  currentProject: Project
  onSelectProject: (project: Project) => void
  onBack?: () => void
  onOpenSource?: (entry: PersonalKnowledgeEntry) => void
  initialSpace?: 'personal' | 'project'
  onAskKnowledge?: () => void
  onRecordProgress?: () => void
}
type WikiNode = Node<{ title: string; excerpt: string; tags: string[] }, 'wiki'>
const sourceNames: Record<PersonalKnowledgeEntry['source_type'], string> = {
  manual: '我的笔记', evidence_package: '我的材料', evidence_file: '上传文件', agent_report: '我的汇报', agent_message: '与 AI 的交流', project_summary: '项目知识总结',
}
const referenceNames: Record<string, string> = { node_id: '事项 ID', package_id: '材料包 ID', file_id: '文件 ID', report_id: '汇报 ID', session_id: '会话 ID', message_id: '消息 ID', file_name: '文件名', quote: '原文引用' }
const messageOf = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试。'
const emptyDraft = (): PersonalKnowledgeEntryInput => ({ title: '', body_text: '', tags: [] })
const concreteProject = (id: string) => /^[1-9]\d*$/.test(id)

function KnowledgeNode({ data }: NodeProps<WikiNode>) {
  return <div className="pk-node">
    <Handle type="target" position={Position.Left} aria-label="关联终点连接点" />
    <strong className="font-medium">{data.title}</strong>
    <p>{data.excerpt || '点击补充正文'}</p>
    {data.tags.length > 0 && <small>{data.tags.slice(0, 2).map(tag => `#${tag}`).join(' ')}</small>}
    <Handle type="source" position={Position.Right} aria-label="关联起点连接点" />
  </div>
}
const nodeTypes = { wiki: KnowledgeNode }

export function PersonalKnowledgeSpace(props: PersonalKnowledgeSpaceProps) {
  const { projects, currentProject, onSelectProject, onBack } = props
  const valid = concreteProject(String(currentProject.id)) && projects.some(p => p.id === currentProject.id)
  return <section className="personal-knowledge" aria-label="我的知识空间">
    <header className="pk-header">
      <div className="pk-heading">{onBack && <button type="button" className="pk-back" onClick={onBack} aria-label="返回">←</button>}
        <div><h1>我的知识空间</h1><p>随手记录，让 AI 帮你整理和关联</p></div>
      </div>
      <label className="pk-project">当前项目<select aria-label="知识空间项目" value={valid ? currentProject.id : ''} onChange={event => {
        const project = projects.find(p => p.id === event.target.value)
        if (project) onSelectProject(project)
      }}><option value="" disabled>请选择具体项目</option>{projects.filter(p => concreteProject(String(p.id))).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    </header>
    {valid && props.onAskKnowledge && <button type="button" className="pk-ask" onClick={props.onAskKnowledge}>问知识助手</button>}
    {valid ? React.createElement(KnowledgeSpaceTabs, { key: `${props.userId ?? 'authenticated'}:${currentProject.id}`, projectId: Number(currentProject.id), userId: props.userId, onOpenSource: props.onOpenSource, initialSpace: props.initialSpace, onRecordProgress: props.onRecordProgress })
      : <div className="pk-empty"><span aria-hidden="true">◇</span><h2>先选择一个项目</h2><p>选择项目后，就能记录、整理和查找自己的知识。</p></div>}
  </section>
}

function KnowledgeSpaceTabs({ projectId, userId, onOpenSource, initialSpace = 'personal', onRecordProgress }: { projectId: number; userId?: string; onOpenSource?: (entry: PersonalKnowledgeEntry) => void; initialSpace?: 'personal' | 'project'; onRecordProgress?: () => void }) {
  const [space, setSpace] = useState<'personal' | 'project'>(initialSpace)
  const [projectVisited, setProjectVisited] = useState(initialSpace === 'project')
  const [personalVisited, setPersonalVisited] = useState(initialSpace === 'personal')
  const [reloadToken, setReloadToken] = useState(0)
  return <>
    <div className="pk-space-tabs" role="tablist" aria-label="知识范围">
      <button type="button" role="tab" id="pk-personal-tab" aria-controls="pk-personal-panel" aria-selected={space === 'personal'} onClick={() => { setPersonalVisited(true); setSpace('personal') }}>我的知识</button>
      <button type="button" role="tab" id="pk-project-tab" aria-controls="pk-project-panel" aria-selected={space === 'project'} onClick={() => { setProjectVisited(true); setSpace('project') }}>项目知识</button>
    </div>
    <div role="tabpanel" id="pk-personal-panel" aria-labelledby="pk-personal-tab" hidden={space !== 'personal'}>{personalVisited && <ScopedKnowledgeSpace active={space === 'personal'} projectId={projectId} userId={userId} onOpenSource={onOpenSource} reloadToken={reloadToken} onRecordProgress={onRecordProgress} />}</div>
    <div role="tabpanel" id="pk-project-panel" aria-labelledby="pk-project-tab" hidden={space !== 'project'}>{projectVisited && <ProjectKnowledgeSpace active={space === 'project'} projectId={projectId} userId={userId} onSaved={() => { setReloadToken(value => value + 1); setPersonalVisited(true); setSpace('personal') }} />}</div>
  </>
}

function ScopedKnowledgeSpace({ projectId, userId, onOpenSource, reloadToken, active, onRecordProgress }: { projectId: number; userId?: string; onOpenSource?: (entry: PersonalKnowledgeEntry) => void; reloadToken: number; active: boolean; onRecordProgress?: () => void }) {
  const [entries, setEntries] = useState<PersonalKnowledgeEntry[]>([])
  const [catalogScope, setCatalogScope] = useState<{ company_id: number; project_id: number } | null>(null)
  const [links, setLinks] = useState<PersonalKnowledgeLink[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'list' | 'graph'>('list')
  const [selectedId, setSelectedId] = useState<number | 'new' | null>(null)
  const [draft, setDraft] = useState<PersonalKnowledgeEntryInput>(emptyDraft)
  const [tagsText, setTagsText] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [linkSource, setLinkSource] = useState('')
  const [linkTarget, setLinkTarget] = useState('')
  const [linkLabel, setLinkLabel] = useState('')
  const [editingLink, setEditingLink] = useState<number | null>(null)
  const [nodes, setNodes] = useState<WikiNode[]>([])
  const [relationsOpen, setRelationsOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<KnowledgeSuggestion[]>([])
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [chosenSuggestions, setChosenSuggestions] = useState<number[]>([])
  const [organizing, setOrganizing] = useState(false)
  const alive = useRef(false)
  const busy = useRef(false)
  const readVersion = useRef(0)

  async function load(signal?: AbortSignal) {
    const version = ++readVersion.current
    setLoading(true); setError('')
    try {
      const result = await getPersonalKnowledge(projectId, signal)
      if (!alive.current || version !== readVersion.current) return
      if (result.scope.project_id !== projectId || (userId && String(result.scope.owner_user_id) !== userId)) throw new Error('知识空间归属不匹配，请重新选择项目。')
      setEntries(result.entries); setLinks(result.links); setCatalogScope(result.scope)
    } catch (cause) {
      if (alive.current && version === readVersion.current && !signal?.aborted) setError(messageOf(cause))
    } finally {
      if (alive.current && version === readVersion.current) setLoading(false)
    }
  }
  useEffect(() => {
    alive.current = true
    const controller = new AbortController()
    void load(controller.signal)
    return () => { alive.current = false; readVersion.current++; controller.abort() }
  }, [projectId, userId])
  useEffect(() => { if (reloadToken > 0 && alive.current) void load() }, [reloadToken])

  async function operate<T,>(action: () => Promise<T>, apply: (result: T) => void) {
    if (busy.current || loading) return
    busy.current = true; setPending(true); setError(''); setNotice(''); readVersion.current++
    try {
      const result = await action()
      if (alive.current) apply(result)
    } catch (cause) {
      if (alive.current) setError(messageOf(cause))
    } finally {
      if (alive.current) { busy.current = false; setPending(false) }
    }
  }
  const disabled = loading || pending
  const selectedEntry = entries.find(item => item.id === selectedId)
  const visibleEntries = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return entries.filter(item => !query || `${item.title}\n${item.body_text}\n${item.tags.join(' ')}`.toLocaleLowerCase().includes(query))
  }, [entries, search])
  const entryPositions = useMemo(() => {
    const positions = new Map<number, { x: number; y: number }>()
    const occupied: { x: number; y: number }[] = []
    entries.forEach(item => { if (item.position) { positions.set(item.id, item.position); occupied.push(item.position) } })
    let cell = 0
    entries.forEach(item => {
      if (positions.has(item.id)) return
      let position: { x: number; y: number }
      do { position = { x: (cell % 3) * 280, y: Math.floor(cell / 3) * 180 }; cell++ }
      while (occupied.some(other => Math.abs(other.x - position.x) < 240 && Math.abs(other.y - position.y) < 150))
      positions.set(item.id, position); occupied.push(position)
    })
    return positions
  }, [entries])
  useEffect(() => {
    setNodes(visibleEntries.map(item => {
      return { id: String(item.id), type: 'wiki', position: entryPositions.get(item.id)!,
        data: { title: item.title, excerpt: item.body_text.slice(0, 65), tags: item.tags }, selected: selectedId === item.id,
        ariaLabel: `知识条目 ${item.title}` }
    }))
  }, [visibleEntries, entryPositions, selectedId])
  const edges = useMemo(() => {
    const ids = new Set(visibleEntries.map(item => item.id))
    return links.filter(link => ids.has(link.source_entry_id) && ids.has(link.target_entry_id)).map(link => ({
      id: String(link.id), source: String(link.source_entry_id), target: String(link.target_entry_id), label: link.label,
      type: 'default', markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 2 },
      ariaLabel: `关联 ${link.label || '未命名关联'}`,
    }))
  }, [links, visibleEntries])

  function openEntry(item: PersonalKnowledgeEntry) {
    if (disabled) return
    setSelectedId(item.id); setDraft({ title: item.title, body_text: item.body_text, tags: [...item.tags] }); setTagsText(item.tags.join('，')); setError(''); setNotice('')
  }
  function editLink(link: PersonalKnowledgeLink) {
    if (disabled) return
    setRelationsOpen(true); setEditingLink(link.id); setLinkSource(String(link.source_entry_id)); setLinkTarget(String(link.target_entry_id)); setLinkLabel(link.label)
  }
  function clearLink() { setEditingLink(null); setLinkSource(''); setLinkTarget(''); setLinkLabel('') }
  function connect(connection: Connection) {
    if (disabled || !connection.source || !connection.target || connection.source === connection.target) return
    setRelationsOpen(true); setEditingLink(null); setLinkSource(connection.source); setLinkTarget(connection.target); setLinkLabel(''); setNotice('已选择两条笔记，可以补充关联说明。')
  }
  function saveEntry(event: React.FormEvent) {
    event.preventDefault()
    if ((!draft.title.trim() && !draft.body_text.trim()) || selectedId === null) return
    const input: PersonalKnowledgeEntryInput = { title: draft.title.trim() || draft.body_text.trim().split('\n')[0].slice(0, 60), body_text: draft.body_text, tags: [...new Set<string>(tagsText.split(/[,，\n]/).map(tag => tag.trim()).filter(Boolean))] }
    void operate(() => selectedId === 'new' ? createPersonalKnowledgeEntry(projectId, input) : updatePersonalKnowledgeEntry(projectId, selectedId, input), result => {
      setEntries(previous => previous.some(item => item.id === result.id) ? previous.map(item => item.id === result.id ? result : item) : [...previous, result])
      setSelectedId(null); setConfirmDelete(false); setDraft(emptyDraft()); setTagsText(''); setNotice('笔记已保存，可让 AI 帮你整理关联')
    })
  }
  function saveLink(event: React.FormEvent) {
    event.preventDefault()
    if (!linkSource || !linkTarget || linkSource === linkTarget) return
    void operate(() => editingLink !== null ? updatePersonalKnowledgeLink(projectId, editingLink, linkLabel.trim()) : createPersonalKnowledgeLink(projectId, { source_entry_id: Number(linkSource), target_entry_id: Number(linkTarget), label: linkLabel.trim() }), result => {
      setLinks(previous => previous.some(link => link.id === result.id) ? previous.map(link => link.id === result.id ? result : link) : [...previous, result]); clearLink(); setNotice('关联已保存')
    })
  }
  function removeEntry() {
    if (!selectedEntry) return
    const id = selectedEntry.id
    void operate(() => deletePersonalKnowledgeEntry(projectId, id), () => {
      setEntries(previous => previous.filter(item => item.id !== id)); setLinks(previous => previous.filter(link => link.source_entry_id !== id && link.target_entry_id !== id))
      setConfirmDelete(false); setSelectedId(null); setDraft(emptyDraft()); clearLink(); setNotice('条目已删除，原始来源保留')
    })
  }
  function savePosition(id: number, position: { x: number; y: number }) {
    const original = entries.find(item => item.id === id)
    void operate(async () => {
      try { return await updatePersonalKnowledgeEntry(projectId, id, { position }) }
      catch (cause) {
        if (alive.current && original) setNodes(previous => previous.map(node => node.id === String(id) ? { ...node, position: entryPositions.get(id)! } : node))
        throw cause
      }
    }, result => { setEntries(previous => previous.map(item => item.id === result.id ? result : item)); setNotice('节点位置已保存') })
  }

  function organize() {
    setOrganizing(true)
    void operate(async () => {
      await syncPersonalKnowledge(projectId)
      const catalog = await getPersonalKnowledge(projectId)
      if (!alive.current) return { suggestions: [] as KnowledgeSuggestion[], analyzed: 0 }
      setEntries(catalog.entries); setLinks(catalog.links)
      const ids = search.trim() ? catalog.entries.filter(item => `${item.title}\n${item.body_text}\n${item.tags.join(' ')}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map(item => item.id) : undefined
      return suggestKnowledgeRelationships(projectId, ids)
    }, result => {
      setSuggestions(result.suggestions); setChosenSuggestions(result.suggestions.map((_, index) => index)); setSuggestionsOpen(result.suggestions.length > 0)
      setNotice(result.suggestions.length ? `AI 找到了 ${result.suggestions.length} 条关联建议` : result.analyzed < 2 ? '资料已收集，再积累几条笔记就能发现更多关联。' : `已整理 ${result.analyzed} 条笔记，暂无需要新增的关联。`)
    }).finally(() => { if (alive.current) setOrganizing(false) })
  }
  const editorDirty = selectedId === 'new' ? Boolean(draft.title || draft.body_text || tagsText) : Boolean(selectedEntry && (draft.title !== selectedEntry.title || draft.body_text !== selectedEntry.body_text || tagsText !== selectedEntry.tags.join('，')))
  const errorPanel = error && <div role="alert" className="pk-error"><span>{error}</span><small>内容仍保留，可以修改后重试。</small></div>

  return <>
    <div className="pk-scope-note"><span aria-hidden="true">◈</span> 仅自己可见 <span>AI 帮你找关联，原始资料保留</span></div>
    <div className="pk-main-actions"><button type="button" className="pk-primary" disabled={disabled} onClick={() => { if (onRecordProgress) { onRecordProgress(); return; } setSelectedId('new'); setDraft(emptyDraft()); setTagsText(''); setConfirmDelete(false); setNotice(''); setError('') }}>记一条</button><button type="button" disabled={disabled} onClick={organize}>{organizing ? 'AI 正在整理…' : 'AI 整理'}</button><details className="pk-more"><summary>更多</summary><div><button type="button" onClick={() => setRelationsOpen(true)}>手动调整关联</button><button type="button" disabled={disabled} onClick={() => void operate(() => syncPersonalKnowledge(projectId), result => { setNotice(`已收集 ${result.created} 条新资料`); void load() })}>仅收集资料</button></div></details></div>
    <div className="pk-toolbar">
      <label className="pk-search"><span aria-hidden="true">⌕</span><input aria-label="搜索知识" type="search" placeholder="搜索标题、正文或标签" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <div className="pk-view-toggle" aria-label="知识视图"><button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>笔记与资料</button><button type="button" aria-pressed={view === 'graph'} onClick={() => setView('graph')}>关联图</button></div>
    </div>
    {error && selectedId === null && !relationsOpen && !suggestionsOpen && <div role="alert" className="pk-error"><span>{error}</span><button type="button" disabled={disabled} onClick={() => void load()}>重新加载</button></div>}
    <div role="status" aria-live="polite" className="pk-status">{organizing ? '正在收集资料并请 AI 寻找关联…' : pending ? '正在保存…' : loading ? '正在读取知识空间…' : notice}</div>
    <div className="pk-workspace">
      <div className="pk-content">
        <div className="pk-section-heading"><h2>{view === 'graph' ? '知识关联图' : '我的积累'}</h2><span>{visibleEntries.length} / {entries.length} 条</span></div>
        {view === 'graph' && <div className="pk-graph" aria-label="知识关联图画布"><ReactFlow<WikiNode>
          nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.25, maxZoom: 1 }} minZoom={0.2} maxZoom={2}
          nodesDraggable={!disabled} nodesConnectable={!disabled} deleteKeyCode={null}
          onNodesChange={changes => setNodes(previous => applyNodeChanges(changes, previous))}
          onNodeClick={(_, node) => { const item = entries.find(entry => String(entry.id) === node.id); if (item) openEntry(item) }}
          onNodeDragStop={(_, node) => savePosition(Number(node.id), node.position)} onConnect={connect}
          onEdgeClick={(_, edge) => { const link = links.find(item => String(item.id) === edge.id); if (link) editLink(link) }}
          proOptions={{ hideAttribution: true }}><Background gap={24} /><Controls showInteractive={false} /></ReactFlow></div>}
        {!loading && visibleEntries.length === 0 && <div className="pk-empty pk-empty-small"><span aria-hidden="true">◇</span><h3>{entries.length ? '没有找到相关内容' : '记下第一条工作积累'}</h3><p>{entries.length ? '换个关键词试试。' : '点“记一条”写下想法，或让 AI 整理你已有的材料和汇报。'}</p></div>}
        {view === 'list' && <ul className="pk-entry-list">{visibleEntries.map(item => <li key={item.id}>
          <button type="button" disabled={disabled} aria-label={`打开 ${item.title}`} aria-pressed={selectedId === item.id} onClick={() => openEntry(item)}>
            <span className="pk-entry-top"><strong className="font-medium">{item.title}</strong><small>{sourceNames[item.source_type] ?? item.source_type}</small></span>
            <span className="pk-excerpt">{item.body_text || '暂无正文'}</span>
            <span className="pk-tags">{item.tags.map(tag => <span key={tag}>#{tag}</span>)}</span>
          </button></li>)}</ul>}
        {active && relationsOpen && <KnowledgeDialog title="调整关联" onClose={() => { setRelationsOpen(false); clearLink() }}><section className="pk-relations" aria-label="条目关联">
          {errorPanel}
          <div className="pk-section-heading"><h3>条目关联</h3><span>{links.length} 条关联</span></div>
          <p>连接两条知识，写下它们的关系。也可在图中拖动连接点。</p>
          <form onSubmit={saveLink} className="pk-link-form">
            <label>关联起点<select aria-label="关联起点" disabled={disabled || editingLink !== null} value={linkSource} onChange={event => setLinkSource(event.target.value)} required><option value="">选择条目</option>{entries.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
            <label>关联终点<select aria-label="关联终点" disabled={disabled || editingLink !== null} value={linkTarget} onChange={event => setLinkTarget(event.target.value)} required><option value="">选择条目</option>{entries.filter(item => String(item.id) !== linkSource).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
            <label className="pk-link-label">关联说明<input aria-label="关联说明" placeholder="例如：提供验收依据" value={linkLabel} disabled={disabled} maxLength={200} onChange={event => setLinkLabel(event.target.value)} /></label>
            <button type="submit" disabled={disabled || !linkSource || !linkTarget || linkSource === linkTarget}>{editingLink !== null ? '保存关联' : '添加关联'}</button>
            {editingLink !== null && <button type="button" disabled={disabled} onClick={clearLink}>取消编辑关联</button>}
          </form>
          <ul className="pk-link-list">{links.map(link => <li key={link.id}><div><span>{entries.find(item => item.id === link.source_entry_id)?.title} → {entries.find(item => item.id === link.target_entry_id)?.title}</span><strong className="font-medium">{link.label || '未填写说明'}</strong></div><button type="button" aria-label={`编辑关联 ${link.label || '未命名关联'}`} disabled={disabled} onClick={() => editLink(link)}>编辑</button><button type="button" aria-label={`删除关联 ${link.label || '未命名关联'}`} disabled={disabled} onClick={() => void operate(() => deletePersonalKnowledgeLink(projectId, link.id), () => { setLinks(previous => previous.filter(item => item.id !== link.id)); if (editingLink === link.id) clearLink(); setNotice('关联已删除') })}>删除</button></li>)}</ul>
        </section></KnowledgeDialog>}
      </div>
      {active && selectedId !== null && <KnowledgeDialog title={selectedId === 'new' ? '记一条' : '查看笔记'} dirty={editorDirty} onClose={() => { setSelectedId(null); setConfirmDelete(false); setError('') }}><aside className="pk-editor" aria-label="笔记编辑区">
        {errorPanel}
        <form onSubmit={saveEntry}>
          <label>标题（可不填）<input aria-label="标题" maxLength={300} value={draft.title} disabled={pending} onChange={event => setDraft(previous => ({ ...previous, title: event.target.value }))} placeholder="不填时会从正文生成" /></label>
          <label>记下想法、经验或资料<AutoGrowingTextarea aria-label="正文" rows={4} maxRows={10} value={draft.body_text} disabled={pending} onChange={event => setDraft(previous => ({ ...previous, body_text: event.target.value }))} placeholder="写下内容就能保存，稍后可让 AI 整理关联…" /></label>
          {catalogScope && <MaterialTextInput compact value={draft.body_text} onChange={value => setDraft(previous => ({ ...previous, body_text: value }))} companyId={catalogScope.company_id} projectId={projectId} scopeKey={`${projectId}:${selectedId ?? 'new'}`} disabled={pending} />}
          <details><summary>标签与更多</summary><label>标签<input aria-label="标签" value={tagsText} disabled={pending} onChange={event => setTagsText(event.target.value)} placeholder="例如：验收，接口" /></label></details>
          <div className="pk-editor-actions"><button type="submit" className="pk-primary" disabled={disabled || (!draft.title.trim() && !draft.body_text.trim())}>保存笔记</button>{selectedEntry && <button type="button" className="pk-danger" disabled={disabled} onClick={() => setConfirmDelete(true)}>删除笔记</button>}</div>
        </form>
        {selectedEntry && <details className="pk-source" aria-label="来源引用"><summary>查看来源</summary><p>{sourceNames[selectedEntry.source_type] ?? selectedEntry.source_type}</p>
          {selectedEntry.source_type === 'manual' ? <p>你在这个项目中写下的知识。</p> : <p>从本人资料整理，原始材料保留。</p>}
          <dl>{Object.entries(selectedEntry.source_ref ?? {}).map(([key, value]) => <div key={key}><dt>{referenceNames[key] ?? key}</dt><dd>{typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '')}</dd></div>)}</dl>
          {onOpenSource && selectedEntry.source_type !== 'manual' && <button type="button" onClick={() => onOpenSource(selectedEntry)}>查看原始来源</button>}
          {selectedEntry.updated_at && <small>更新于 {new Date(selectedEntry.updated_at).toLocaleString('zh-CN')}</small>}
        </details>}
        {confirmDelete && selectedEntry && <div role="alertdialog" aria-label="删除这条笔记？" className="pk-delete-confirm"><h3>删除这条笔记？</h3><p>原始材料、汇报和对话会保留。</p><button type="button" disabled={pending} onClick={() => setConfirmDelete(false)}>取消</button><button type="button" disabled={pending} className="pk-danger" onClick={removeEntry}>确认删除笔记</button></div>}
      </aside></KnowledgeDialog>}
    </div>
    {active && suggestionsOpen && <KnowledgeDialog title="AI 发现的关联" onClose={() => setSuggestionsOpen(false)}>{errorPanel}<p className="pk-help">已根据你的笔记找到这些关联，确认后加入关联图。</p><ul className="pk-ai-suggestions">{suggestions.map((item, index) => <li key={index}><label><input type="checkbox" checked={chosenSuggestions.includes(index)} onChange={event => setChosenSuggestions(previous => event.target.checked ? [...previous, index] : previous.filter(id => id !== index))} /><strong className="font-medium">{entries.find(entry => entry.id === item.source_entry_id)?.title} → {entries.find(entry => entry.id === item.target_entry_id)?.title}</strong></label><p>{item.label} · {item.reason}</p><details><summary>查看依据</summary><blockquote>{item.source_quote}</blockquote><blockquote>{item.target_quote}</blockquote></details></li>)}</ul><div className="knowledge-save-row"><button type="button" className="pk-primary" disabled={disabled || !chosenSuggestions.length} onClick={() => void operate(() => applyKnowledgeRelationships(projectId, chosenSuggestions.map(index => suggestions[index])), result => { setLinks(previous => [...previous, ...result.links]); setSuggestionsOpen(false); setNotice(`已加入 ${result.created} 条关联`); setView('graph') })}>确认关联（{chosenSuggestions.length}）</button></div></KnowledgeDialog>}
  </>
}

export default PersonalKnowledgeSpace
