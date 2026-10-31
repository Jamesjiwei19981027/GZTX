import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import {
  ReactFlow, ReactFlowProvider, Panel, BaseEdge, Handle, Position, Background,
  ViewportPortal, useInternalNode, useNodesState, useReactFlow, useViewport, useStore, useNodesInitialized,
  type Node, type Edge, type NodeProps, type EdgeProps, type InternalNode,
} from '@xyflow/react'
import { ChevronDown, ChevronRight, Minus, Plus, Maximize, LocateFixed, Move, Pencil, GitBranch, X } from 'lucide-react'
import '@xyflow/react/dist/style.css'
import type { PeopleAxisNode, Language } from '../../types'
import { borderAnchor, floatingEdgePath, subordinatePortAnchor, averagePeopleAxisProgress, type RectCoords, type BorderAnchor } from './peopleAxisUtils'
import { type AxisOrientation, CARD_W, CARD_H, TERMINUS_W, TERMINUS_H } from './peopleAxisFlowLayout'
import { AxisAvatar, AxisProgress, AxisOriginBadge } from './ResponsibilityParts'

export interface PersonNodeData extends Record<string, unknown> {
  node: PeopleAxisNode
  lang: Language
  level: number
  isMine: boolean
  isScopeContext: boolean
  isOverallLeader: boolean
  isMainAxisLeader: boolean
  isSelected: boolean
  isExpanded: boolean
  childCount: number
  linkingActive: boolean
  isLinkingSource: boolean
  isLinkingTarget: boolean
  canEdit: boolean
  canAddSubordinate: boolean
  canAddWorkItem: boolean
  canSubmitEvidence: boolean
  canReadEvidence: boolean
  evidenceItemPermissions: Record<string, boolean>
  orientation: AxisOrientation
  mobile: boolean
  canRelink: boolean
  onCardClick: (id: string) => void
  onToggleExpand: (id: string) => void
  onAddWorkItem: (id: string) => void
  onAddChild: (id: string) => void
  onEditPerson: (id: string) => void
  onToggleLinking: (id: string) => void
  onHoverTarget: (id: string | null) => void
}
export interface TerminusNodeData extends Record<string, unknown> {
  lang: Language
  progress: number
  name?: string
  avatar?: string
}
export interface SpineEdgeData extends Record<string, unknown> {
  orientation: AxisOrientation
  spineCoord: number
  attachmentKind?: 'project' | 'subordinate'
}
type PersonFlowNode = Node<PersonNodeData, 'person'>
type TerminusFlowNode = Node<TerminusNodeData, 'terminus'>
export type AxisFlowNode = PersonFlowNode | TerminusFlowNode
const HiddenHandles = () => <>
  <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: 'none' }} isConnectable={false} />
  <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none' }} isConnectable={false} />
</>

const PersonNode: React.FC<NodeProps<PersonFlowNode>> = ({ data: d }) => {
  const { node: n, lang } = d
  const { zoom } = useViewport()
  const compactTouch = d.mobile && zoom < 0.65
  const port = useSubordinatePort(n.id,d.orientation)
  return <div
    data-node-anchor={n.id}
    style={{ width: CARD_W, height: CARD_H }}
    data-node-origin={n.nodeOrigin || 'project'}
    className={`axis-map-card${n.nodeOrigin === 'subordinate' ? ' is-subordinate' : ''}${d.isSelected ? ' is-selected' : ''}${d.isLinkingSource ? ' is-link-source' : ''}${d.linkingActive ? ' nopan' : ''}${d.linkingActive && !d.isLinkingSource ? ' is-link-target' : ''}`}
    onMouseEnter={() => d.linkingActive && !d.isLinkingSource && d.onHoverTarget(n.id)}
    onMouseLeave={() => d.linkingActive && d.onHoverTarget(null)}
  >
    <HiddenHandles />
    <div className="axis-rank-row"><span>{responsibilityLevelLabel(d.level, lang)}</span><AxisOriginBadge origin={n.nodeOrigin} lang={lang} />{d.isMine ? <b>{lang === 'zh' ? '我负责' : 'My role'}</b> : d.isScopeContext && <small>{lang === 'zh' ? '上级链路' : 'Reporting path'}</small>}</div>
    <div className="axis-person-heading">
      <AxisAvatar person={n.person} small />
      <div className="axis-person-label"><strong>{n.person.name}</strong><span>{n.roleTitle}</span></div>
      {d.childCount > 0 ? <button className="axis-icon-button nodrag" aria-label={lang === 'zh' ? `${d.isExpanded ? '折叠' : '展开'}${n.person.name}的下级` : 'Toggle subordinates'}
        disabled={d.linkingActive || compactTouch} style={d.linkingActive || compactTouch ? { pointerEvents: 'none' } : undefined}
        aria-expanded={d.isExpanded} onClick={e => { e.stopPropagation(); d.onToggleExpand(n.id) }}>
        {d.isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<small>{d.childCount}</small>
      </button> : <span className={`axis-risk-dot ${n.aiContext?.riskLevel || ''}`} title={n.aiContext?.summary || ''} />}
    </div>
    <AxisProgress value={averagePeopleAxisProgress([n])} label />
    <div className="axis-map-card-foot">
      <span>{n.workItems.length} {lang === 'zh' ? '个事项' : 'items'}</span>
      {n.workItems[0] && <span className="axis-truncate">{n.workItems[0].title}</span>}
    </div>
    <div className={`axis-node-actions nodrag nopan${d.isSelected ? ' is-active' : ''}`} style={compactTouch ? {visibility:'hidden',pointerEvents:'none'} : undefined}>
      {d.canEdit && !d.linkingActive && <>
        {d.canAddSubordinate && <button aria-label={`${lang === 'zh' ? '新增下级' : 'Add subordinate'} · ${n.person.name}`} onClick={e => { e.stopPropagation(); d.onAddChild(n.id) }}><Plus size={14} />{lang === 'zh' ? '新增下级' : 'Add person'}</button>}
        <button aria-label={`${lang === 'zh' ? '编辑人员' : 'Edit person'} · ${n.person.name}`} onClick={e => { e.stopPropagation(); d.onEditPerson(n.id) }}><Pencil size={13} />{lang === 'zh' ? '编辑' : 'Edit'}</button>
      </>}
      {d.canRelink && !d.linkingActive && <button aria-label={`${lang === 'zh' ? '调整上级' : 'Change manager'} · ${n.person.name}`} onClick={e => { e.stopPropagation(); d.onToggleLinking(n.id) }}><GitBranch size={14} /></button>}
    </div>
    <button className={`axis-subordinate-port nodrag nopan is-${d.orientation}`} disabled={!d.canAddSubordinate || d.linkingActive || compactTouch}
      style={port ? {left:port.offsetX-1,top:port.offsetY-1,right:'auto',bottom:'auto',transform:'translate(-50%, -50%)'} : undefined}
      aria-label={`${lang === 'zh' ? '下辖挂载点' : 'Subordinate attachment'} · ${n.person.name}`}
      title={lang === 'zh' ? '下辖分支挂载点' : 'Subordinate attachment point'}
      onClick={event => { event.stopPropagation(); d.onAddChild(n.id) }}><Plus size={14} /></button>
    {d.linkingActive && <div className="axis-link-label">{d.isLinkingSource ? (lang === 'zh' ? '选择上级人员' : 'Choose a parent') : (lang === 'zh' ? '点击设为上级' : 'Set as parent')}</div>}
  </div>
}
const TerminusNode: React.FC<NodeProps<TerminusFlowNode>> = ({ data: d }) => <div className="axis-terminus" style={{ width: TERMINUS_W, height: TERMINUS_H }}>
  <HiddenHandles /><AxisAvatar person={{ name: d.name || 'PM', avatar: d.avatar || '' }} small />
  <div><strong>{d.lang === 'zh' ? '终责' : 'Final owner'} · {d.name || (d.lang === 'zh' ? '待指定' : 'Unassigned')}</strong><span>{d.lang === 'zh' ? '项目终责 · 统筹各级负责人' : 'Project lead · accountable owner'}</span></div>
</div>

export function responsibilityLevelLabel(level: number, lang: Language) {
  const rank = ['一', '二', '三', '四', '五', '六', '七', '八', '九'][level - 1] || String(level)
  return lang === 'zh' ? `${rank}级负责人` : `Level ${level} owner`
}

function internalToRect(n: InternalNode): RectCoords | null {
  const w = n.measured?.width, h = n.measured?.height
  if (!w || !h) return null
  const { x, y } = n.internals.positionAbsolute
  return { left: x, right: x + w, top: y, bottom: y + h, width: w, height: h, centerX: x + w / 2, centerY: y + h / 2 }
}
type SubordinatePort = BorderAnchor & {offsetX:number;offsetY:number}
function useSubordinatePort(sourceId: string, orientation: AxisOrientation) {
  return useStore(useCallback(state => {
    const node = state.nodeLookup.get(sourceId)
    const source = node && internalToRect(node)
    if(!source) return null
    const targets: RectCoords[] = []
    for(const edge of state.edges) {
      if(edge.source !== sourceId || edge.data?.attachmentKind !== 'subordinate') continue
      const target = state.nodeLookup.get(edge.target)
      const rect = target && !target.hidden && internalToRect(target)
      if(rect) targets.push(rect)
    }
    const anchor = subordinatePortAnchor(source,targets,orientation)
    return {...anchor,offsetX:anchor.x-source.left,offsetY:anchor.y-source.top}
  },[sourceId,orientation]),(a: SubordinatePort|null,b: SubordinatePort|null) => a===b || !!a && !!b && a.x===b.x && a.y===b.y && a.side===b.side && a.offsetX===b.offsetX && a.offsetY===b.offsetY)
}
const SpineEdge: React.FC<EdgeProps> = ({ source, target, data }) => {
  const sn = useInternalNode(source), tn = useInternalNode(target)
  const d = data as SpineEdgeData | undefined
  if (!sn || !tn || !d) return null
  const s = internalToRect(sn), t = internalToRect(tn)
  if (!s || !t) return null
  // Floating curves remain attached to the card boundaries after a drag.
  return <BaseEdge path={floatingEdgePath(s, t)} style={{ stroke: 'var(--axis-blue, #0058be)', strokeWidth: 2, strokeLinecap: 'round' }} />
}
const BranchEdge: React.FC<EdgeProps> = ({ source, target, data }) => {
  const sn = useInternalNode(source), tn = useInternalNode(target)
  const port = useSubordinatePort(source,(data as SpineEdgeData)?.orientation || 'vertical')
  if (!sn || !tn) return null
  const s = internalToRect(sn), t = internalToRect(tn)
  if (!s || !t) return null
  const subordinate = (data as SpineEdgeData)?.attachmentKind === 'subordinate'
  return <g data-attachment-kind={subordinate ? 'subordinate' : 'project'}><BaseEdge path={floatingEdgePath(s, t, subordinate ? port || undefined : undefined)} style={{ stroke: subordinate ? 'var(--axis-extension, #319588)' : 'var(--axis-branch, #8daed5)', strokeDasharray: subordinate ? '5 5' : undefined, strokeWidth: 1.6, strokeLinecap: 'round' }} /></g>
}
const nodeTypes = { person: PersonNode, terminus: TerminusNode }
const edgeTypes = { spine: SpineEdge, branch: BranchEdge }

const LinkingPreview: React.FC<{ sourceId: string | null }> = ({ sourceId }) => {
  const { screenToFlowPosition } = useReactFlow()
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const sn = useInternalNode(sourceId ?? '__none__')
  useEffect(() => {
    if (!sourceId) { setCursor(null); return }
    const move = (e: PointerEvent) => setCursor(screenToFlowPosition({ x: e.clientX, y: e.clientY }))
    window.addEventListener('pointermove', move)
    return () => window.removeEventListener('pointermove', move)
  }, [sourceId, screenToFlowPosition])
  if (!sourceId || !sn || !cursor) return null
  const r = internalToRect(sn)
  if (!r) return null
  const a = borderAnchor(r, cursor.x, cursor.y)
  return <ViewportPortal><svg style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 50 }}>
    <path d={`M ${a.x} ${a.y} Q ${a.x} ${cursor.y} ${cursor.x} ${cursor.y}`} fill="none" stroke="var(--axis-blue)" strokeWidth={2} strokeDasharray="5 5" />
  </svg></ViewportPortal>
}
export interface PeopleAxisFlowCanvasProps {
  lang: Language
  nodes: AxisFlowNode[]
  edges: Edge[]
  orientation: AxisOrientation
  linkingSourceNodeId: string | null
  onNodeDragStop: (id: string, position: { x: number; y: number }) => void
  onPaneClick: () => void
  onResetLayout: () => void
  resetToken?: number
  mobile?: boolean
  hasPreview?: boolean
  focusNodeId?: string | null
  focusToken?: number
  onCancelLinking?: () => void
  onConnectToSpine?: () => void
  canConnectToSpine?: boolean
}
const ZoomReadout = () => {
  const { zoom } = useViewport()
  return <span className="axis-zoom-readout">{Math.round(zoom * 100)}%</span>
}
const CanvasInner: React.FC<PeopleAxisFlowCanvasProps> = ({
  lang, nodes, edges, orientation, linkingSourceNodeId, onNodeDragStop, onPaneClick,
  onResetLayout, resetToken, mobile, hasPreview, focusNodeId, focusToken, onCancelLinking, onConnectToSpine, canConnectToSpine = true,
}) => {
  const { zoomIn, zoomOut, fitView, setCenter, getNode, getZoom } = useReactFlow()
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<AxisFlowNode>(nodes)
  const [moving, setMoving] = useState(false)
  const canMoveCards = nodes.some(node => node.type === 'person' && node.draggable)
  useEffect(() => { if (linkingSourceNodeId || !canMoveCards) setMoving(false) }, [linkingSourceNodeId, canMoveCards])
  const dragging = useRef(false)
  const reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const duration = reducedMotion ? 0 : 280
  const width = useStore(s => s.width)
  const height = useStore(s => s.height)
  const initialized = useNodesInitialized()
  useEffect(() => { if (!dragging.current) setRfNodes(nodes) }, [nodes, setRfNodes])
  const visibleKey = nodes.filter(n => !n.hidden).map(n => n.type === 'person'
    ? `${n.id}:${(n.data as PersonNodeData).node.parentId || ''}`
    : `${n.id}:${n.position.x}:${n.position.y}`).join(',')
  const padding = useMemo(() => ({ top: linkingSourceNodeId ? '76px' : '32px', right: '28px', bottom: mobile && hasPreview ? '312px' : '90px', left: '28px' }), [linkingSourceNodeId, mobile, hasPreview])
  const fit = useCallback(() => void fitView({ duration, padding, minZoom: 0.05, maxZoom: 1 }), [fitView, padding, duration])
  const lastAutoFit = useRef('')
  useEffect(() => {
    // Fit after measurement without a delayed animation that can move a card
    // between a touch starting and ending. Explicit zoom/fit controls animate.
    // Replacing a saved node can reinitialize its measurements. Preserve the
    // user's viewport unless the actual layout context changed.
    const fitKey = JSON.stringify([orientation, visibleKey, resetToken, width, height, padding])
    if (initialized && width && height && lastAutoFit.current !== fitKey) {
      lastAutoFit.current = fitKey
      void fitView({ duration: 0, padding, minZoom: 0.05, maxZoom: 1 })
    }
  }, [orientation, visibleKey, resetToken, width, height, initialized, fitView, padding])
  useEffect(() => {
    if (!focusToken || !focusNodeId) return
    const node = getNode(focusNodeId)
    if (node) void setCenter(node.position.x + CARD_W / 2, node.position.y + CARD_H / 2 + (mobile && hasPreview ? 95 : 0), { zoom: Math.max(getZoom(), mobile ? 0.85 : 1), duration })
  }, [focusToken, focusNodeId, getNode, setCenter, getZoom, mobile, hasPreview, duration])
  return <ReactFlow
    nodes={rfNodes.map(n => mobile && !moving ? { ...n, draggable: false } : n)} edges={edges}
    nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange}
    onNodeDragStart={() => { dragging.current = true }}
    onNodeDragStop={(_, n) => { dragging.current = false; onNodeDragStop(n.id, n.position) }}
    onNodeClick={(_, n) => { if (n.type === 'person') (n.data as PersonNodeData).onCardClick(n.id) }}
    onPaneClick={onPaneClick} fitView fitViewOptions={{ padding, minZoom: 0.05, maxZoom: 1 }}
    minZoom={0.05} maxZoom={2} nodesConnectable={false} nodesFocusable edgesFocusable={false}
    elementsSelectable={false} selectionOnDrag={false} panOnDrag zoomOnPinch zoomOnDoubleClick={false}
    nodeDragThreshold={8} className="axis-flow"
  >
    <Background color="var(--axis-dot, #dce2eb)" gap={22} size={1} />
    <LinkingPreview sourceId={linkingSourceNodeId} />
    {linkingSourceNodeId && <Panel position="top-center" className="axis-link-panel">
      <span>{lang === 'zh' ? '点击人员设为直属上级' : 'Tap the new parent'}</span>
      {canConnectToSpine && <button onClick={onConnectToSpine}>{lang === 'zh' ? '移至主干' : 'To trunk'}</button>}
      <button aria-label={lang === 'zh' ? '取消连线' : 'Cancel linking'} onClick={onCancelLinking}><X size={16} /></button>
    </Panel>}
    <Panel position="bottom-left" className={`axis-canvas-controls${mobile && hasPreview ? ' has-preview' : ''}`}>
      <div className="axis-control-pill">
        <button aria-label={lang === 'zh' ? '缩小' : 'Zoom out'} onClick={() => void zoomOut({ duration })}><Minus size={18} /></button>
        <ZoomReadout />
        <button aria-label={lang === 'zh' ? '放大' : 'Zoom in'} onClick={() => void zoomIn({ duration })}><Plus size={18} /></button>
      </div>
      <button className="axis-control-square" aria-label={lang === 'zh' ? '适配全部节点' : 'Fit all nodes'} onClick={fit}><Maximize size={18} /></button>
      {!mobile && <button className="axis-control-square" aria-label={lang === 'zh' ? '重置布局' : 'Reset layout'} onClick={() => { onResetLayout(); setTimeout(fit, 100) }}><LocateFixed size={18} /></button>}
      {mobile && canMoveCards && <button className={`axis-control-square axis-move-mode${moving ? ' is-active' : ''}`} aria-label={lang === 'zh' ? '调整位置' : 'Move nodes'} aria-pressed={moving} onClick={() => setMoving(value => !value)}><Move size={18} /><span>{lang === 'zh' ? moving ? '完成' : '调整位置' : moving ? 'Done' : 'Move'}</span></button>}
    </Panel>
    {mobile && moving && <Panel position="top-center" className="axis-move-hint">{lang === 'zh' ? '拖动人员调整位置 · 拖动空白浏览' : 'Drag a person to move · drag blank space to pan'}</Panel>}
  </ReactFlow>
}
export const PeopleAxisFlowCanvas: React.FC<PeopleAxisFlowCanvasProps> = props => <ReactFlowProvider><CanvasInner {...props} /></ReactFlowProvider>
