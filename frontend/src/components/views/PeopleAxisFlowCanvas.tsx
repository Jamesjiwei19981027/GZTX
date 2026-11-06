import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import {
  ReactFlow, ReactFlowProvider, Panel, BaseEdge, Handle, Position, Background,
  ViewportPortal, useInternalNode, useNodesState, useReactFlow, useViewport, useStore, useNodesInitialized,
  type Node, type Edge, type NodeProps, type EdgeProps, type InternalNode,
} from '@xyflow/react'
import { ChevronDown, ChevronRight, Minus, Plus, Maximize, LocateFixed, Move, Pencil, GitBranch, X, Undo2 } from 'lucide-react'
import type { PeopleAxisNode, Language } from '../../types'
// 样式跟着画布走：手机网页路径不经过 ResponsibilityWorkspace，不能依赖它去加载
import './responsibility.css'
import {
  borderAnchor, floatingEdgePath, straightEdgePath, highlightEdgeIds,
  snapToParentAxis, reparentVerdict, calculateCanvasDefaultCenter, type RectCoords, type BorderAnchor,
} from './peopleAxisUtils'
import { type AxisOrientation, CARD_W, CARD_H, FOLDED_ROW_H, FOLDED_ROW_H_MOBILE } from './peopleAxisFlowLayout'
import { summarizeCardTasks, cardTaskChip, cardOverdueCount } from '../../api/mappers'

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
  dropState?: 'ok' | 'bad' | null
  dropTip?: string
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
  /** 「项目全貌」折叠成员（折叠行 / 就地展开的卡片）才有的字段 */
  foldedMember?: boolean
  /** 折叠组里的第一行：在领导卡片与它之间画一小段竖线 */
  foldedFirst?: boolean
  /** 上轴非根、且不在当前用户上级链上：可「收回」 */
  canReturn?: boolean
  /** 领导卡片连同折叠组的整块高度：纵向连线从整块底部出发，不穿过折叠行 */
  footprintHeight?: number
  onToggleRow?: (id: string) => void
  onPull?: (id: string) => void
  onReturn?: (id: string) => void
}

export interface BranchEdgeData extends Record<string, unknown> {
  orientation: AxisOrientation
  attachmentKind?: 'project' | 'subordinate'
  edgeStyle?: 'curve' | 'straight'
  emphasis?: 'normal' | 'highlight' | 'dim'
}

type PersonFlowNode = Node<PersonNodeData, 'person'>
type FoldedRowFlowNode = Node<PersonNodeData, 'foldedRow'>
export type AxisFlowNode = PersonFlowNode | FoldedRowFlowNode

const HiddenHandles = () => <>
  <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: 'none' }} isConnectable={false} />
  <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none' }} isConnectable={false} />
</>

function formatTaskDate(dueDate: string): string {
  if (!dueDate) return ''
  const m = dueDate.match(/\d{4}-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}/${m[2]}`
  return dueDate.slice(0, 10)
}

/** 领导卡片下方的折叠行：姓名、职责、任务数、逾期数、向下箭头；整行可点，高度不小于 44 */
const FoldedRowNode: React.FC<NodeProps<FoldedRowFlowNode>> = ({ data: d }) => {
  const { node: n, lang } = d
  const today = useMemo(() => new Date(), [])
  const total = useMemo(() => summarizeCardTasks(n.workItems, today).total, [n.workItems, today])
  const overdue = useMemo(() => cardOverdueCount(n.workItems, today), [n.workItems, today])
  const zh = lang === 'zh'
  return (
    <div className={`axis-folded-row-wrap${d.mobile ? ' is-mobile' : ''}`} data-node-anchor={n.id}>
      <HiddenHandles />
      {d.foldedFirst && <i className="axis-fold-stem" aria-hidden="true" />}
      <button
        type="button"
        className="axis-folded-row nodrag nopan"
        data-testid={`axis-folded-row-${n.id}`}
        aria-expanded={false}
        aria-label={zh ? `展开 ${n.person.name}` : `Expand ${n.person.name}`}
        onClick={e => {
          e.stopPropagation()
          d.onToggleRow?.(n.id)
        }}
      >
        <strong className="axis-folded-name">{n.person.name}</strong>
        <span className="axis-folded-role">{n.roleTitle}</span>
        <span className="axis-folded-count">{zh ? `任务 ${total}` : `Tasks ${total}`}</span>
        {overdue > 0 ? <span className="axis-folded-over">{zh ? `逾期 ${overdue}` : `Overdue ${overdue}`}</span> : <span aria-hidden="true" />}
        <ChevronDown size={16} aria-hidden="true" />
      </button>
    </div>
  )
}

const PersonNode: React.FC<NodeProps<PersonFlowNode>> = ({ data: d }) => {
  const { node: n, lang } = d
  const { zoom } = useViewport()
  const isCompact = zoom < 0.6
  const isTerminal = Boolean(d.isOverallLeader || n.isTerminalPM)
  const today = useMemo(() => new Date(), [])
  const summary = useMemo(() => summarizeCardTasks(n.workItems, today), [n.workItems, today])
  const overdueCount = useMemo(() => cardOverdueCount(n.workItems, today), [n.workItems, today])
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as unknown as globalThis.Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  return (
    <div
      data-node-anchor={n.id}
      data-node-origin={n.nodeOrigin || 'project'}
      data-testid={d.mobile ? `mobile-axis-node-${n.id}` : undefined}
      className={`axis-map-card${d.foldedMember ? ' is-folded-member' : ''}${isTerminal ? ' is-terminal' : ''}${isCompact ? ' is-compact' : ''}${d.isSelected ? ' is-selected' : ''}${d.isLinkingSource ? ' is-link-source' : ''}${d.linkingActive ? ' nopan' : ''}${d.linkingActive && !d.isLinkingSource ? ' is-link-target' : ''}${d.dropState === 'ok' ? ' drop-ok' : d.dropState === 'bad' ? ' drop-bad' : ''}`}
      onMouseEnter={() => d.linkingActive && !d.isLinkingSource && d.onHoverTarget(n.id)}
      onMouseLeave={() => d.linkingActive && d.onHoverTarget(null)}
    >
      <HiddenHandles />
      {d.foldedFirst && <i className="axis-fold-stem" aria-hidden="true" />}
      {d.dropTip && <div className={`axis-drop-tip axis-drop-bubble ${d.dropState || ''}`}>{d.dropTip}</div>}

      <div className="axis-card-head">
        <div className="axis-card-avatar">
          {n.person.avatar ? (
            <img src={n.person.avatar} alt="" draggable={false} onError={e => { e.currentTarget.hidden = true }} />
          ) : null}
          <span aria-hidden="true">{n.person.name.slice(0, 1)}</span>
        </div>

        <div className="axis-card-who axis-person-label">
          <div className="axis-card-name">
            <strong>{n.person.name}</strong>
            {isTerminal && <span className="axis-card-tag final axis-terminal-badge">{lang === 'zh' ? '终责' : 'Final owner'}</span>}
            {!isCompact && d.foldedMember && <span className="axis-card-tag subordinate">{lang === 'zh' ? '下属' : 'Report'}</span>}
            {!isCompact && d.isMine && <span className="axis-card-tag me">{lang === 'zh' ? '我' : 'Me'}</span>}
            {!isCompact && n.nodeOrigin === 'subordinate' && (
              <span className="axis-card-tag self-added">{lang === 'zh' ? '下级自建' : 'Self-added'}</span>
            )}
          </div>
          {!isCompact && <div className="axis-card-role">{n.roleTitle}</div>}
        </div>

        {!isCompact && (
          <div className="axis-card-corner" ref={menuRef}>
            {d.canAddSubordinate && (!d.mobile || d.isSelected) && (
              <button
                type="button"
                className="axis-card-icon-btn add nodrag"
                title={lang === 'zh' ? '新增下级' : 'Add subordinate'}
                aria-label={lang === 'zh' ? `新增下级 · ${n.person.name}` : `Add subordinate for ${n.person.name}`}
                data-testid="add-subordinate-btn"
                onClick={e => {
                  e.stopPropagation()
                  d.onAddChild(n.id)
                }}
              >
                <Plus size={14} />
              </button>
            )}
            {d.canReturn && !d.mobile && (
              <button
                type="button"
                className="axis-card-icon-btn nodrag"
                title={lang === 'zh' ? '收回' : 'Return'}
                aria-label={lang === 'zh' ? `收回 · ${n.person.name}` : `Return ${n.person.name}`}
                data-testid={`axis-return-${n.id}`}
                onClick={e => {
                  e.stopPropagation()
                  d.onReturn?.(n.id)
                }}
              >
                <Undo2 size={14} />
              </button>
            )}
            {(d.canEdit || d.canRelink) && (!d.mobile || d.isSelected) && (
              <button
                type="button"
                className="axis-card-icon-btn nodrag"
                title={lang === 'zh' ? '更多' : 'More'}
                aria-label={lang === 'zh' ? `${n.person.name} · 更多` : `More actions for ${n.person.name}`}
                data-testid="card-more-menu-btn"
                onClick={e => {
                  e.stopPropagation()
                  setMenuOpen(v => !v)
                }}
              >
                ⋯
              </button>
            )}
            {menuOpen && (
              <div className="axis-card-menu nodrag" onClick={e => e.stopPropagation()}>
                {d.canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      d.onEditPerson(n.id)
                    }}
                  >
                    {lang === 'zh' ? '编辑人员' : 'Edit person'}
                  </button>
                )}
                {d.canRelink && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      d.onToggleLinking(n.id)
                    }}
                  >
                    {lang === 'zh' ? '调整上级（备用）' : 'Change manager'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    d.onCardClick(n.id)
                  }}
                >
                  {lang === 'zh' ? '查看全部任务' : 'View all tasks'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {isCompact && (d.foldedMember || d.canReturn) && (
        <div className="axis-compact-actions">
          {d.foldedMember && (
            <>
              <button
                type="button"
                className="foot-link nodrag"
                data-testid={`axis-fold-${n.id}`}
                onClick={e => { e.stopPropagation(); d.onToggleRow?.(n.id) }}
              >
                {lang === 'zh' ? '折叠' : 'Fold'}
              </button>
              <button
                type="button"
                className="foot-link nodrag"
                data-testid={`axis-pull-${n.id}`}
                onClick={e => { e.stopPropagation(); d.onPull?.(n.id) }}
              >
                {lang === 'zh' ? '拉到人轴' : 'Pull to axis'}
              </button>
            </>
          )}
          {d.canReturn && (
            <button
              type="button"
              className="foot-link nodrag"
              data-testid={`axis-return-${n.id}`}
              onClick={e => { e.stopPropagation(); d.onReturn?.(n.id) }}
            >
              {lang === 'zh' ? '收回' : 'Return'}
            </button>
          )}
        </div>
      )}
      {isCompact ? (
        <div className="axis-compact-status">
          {overdueCount > 0 ? (
            <>
              <span className="axis-compact-over">{lang === 'zh' ? `逾期 ${overdueCount}` : `Overdue ${overdueCount}`}</span>
              <span className="axis-compact-count">{lang === 'zh' ? `共 ${n.workItems.length} 项` : `${n.workItems.length} items`}</span>
            </>
          ) : n.workItems.length > 0 ? (
            <>
              <span className="axis-compact-ok">{lang === 'zh' ? '无逾期' : 'No overdue'}</span>
              <span className="axis-compact-count">{lang === 'zh' ? `共 ${n.workItems.length} 项` : `${n.workItems.length} items`}</span>
            </>
          ) : (
            <span className="axis-compact-count">{lang === 'zh' ? '暂无任务' : 'No tasks'}</span>
          )}
        </div>
      ) : (
        <>
          <div className="axis-card-tasks-panel">
            <div className="axis-card-tasks-title">
              {lang === 'zh' ? `任务 ${summary.total}` : `Tasks ${summary.total}`}
            </div>
            {summary.visible.length === 0 ? (
              <div className="axis-tasks-empty">{lang === 'zh' ? '暂无任务' : 'No tasks'}</div>
            ) : (
              summary.visible.map(item => {
                const chip = cardTaskChip(item, today, lang)
                return (
                  <div
                    key={item.id}
                    className="axis-task-row nodrag"
                    title={item.title}
                    onClick={e => {
                      e.stopPropagation()
                      d.onCardClick(n.id)
                    }}
                  >
                    <i className={`axis-task-dot ${chip.tone}`} />
                    <span className="axis-task-title">{item.title}</span>
                    <span className={`axis-task-chip ${chip.tone}`}>{chip.text}</span>
                  </div>
                )
              })
            )}
          </div>

          <div className="axis-card-foot-row">
            {summary.total > 0 ? (
              <button
                type="button"
                className="foot-link nodrag"
                onClick={e => {
                  e.stopPropagation()
                  d.onCardClick(n.id)
                }}
              >
                {lang === 'zh' ? '查看全部 →' : 'View all →'}
              </button>
            ) : (
              <span />
            )}
            {d.foldedMember ? (
              <span className="axis-card-fold-actions">
                <button
                  type="button"
                  className="foot-link nodrag"
                  data-testid={`axis-fold-${n.id}`}
                  onClick={e => {
                    e.stopPropagation()
                    d.onToggleRow?.(n.id)
                  }}
                >
                  {lang === 'zh' ? '折叠' : 'Fold'}
                </button>
                <button
                  type="button"
                  className="foot-link nodrag"
                  data-testid={`axis-pull-${n.id}`}
                  onClick={e => {
                    e.stopPropagation()
                    d.onPull?.(n.id)
                  }}
                >
                  {lang === 'zh' ? '拉到人轴' : 'Pull to axis'}
                </button>
              </span>
            ) : d.childCount > 0 ? (
              <button
                type="button"
                className="axis-card-subordinate-toggle nodrag"
                aria-label={lang === 'zh' ? `${d.isExpanded ? '折叠' : '展开'}${n.person.name}的下级` : 'Toggle subordinates'}
                onClick={e => {
                  e.stopPropagation()
                  d.onToggleExpand(n.id)
                }}
              >
                {lang === 'zh' ? `下属 ${d.childCount} ⌄` : `Reports ${d.childCount} ⌄`}
              </button>
            ) : (
              <span />
            )}
          </div>
        </>
      )}

      {d.linkingActive && (
        <div className="axis-link-label">
          {d.isLinkingSource ? (lang === 'zh' ? '选择上级人员' : 'Choose a parent') : (lang === 'zh' ? '点击设为上级' : 'Set as parent')}
        </div>
      )}
    </div>
  )
}

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

const BranchEdge: React.FC<EdgeProps> = ({ source, target, data }) => {
  const sn = useInternalNode(source), tn = useInternalNode(target)
  const d = data as BranchEdgeData | undefined
  if (!sn || !tn) return null
  const s = internalToRect(sn), t = internalToRect(tn)
  if (!s || !t) return null
  // 纵向时领导卡片下方挂着折叠组：连线从整块（卡片 + 折叠组）底部出发，不穿过折叠行
  const footprint = (sn.data as PersonNodeData | undefined)?.footprintHeight
  if (d?.orientation === 'vertical' && footprint && footprint > s.height) {
    s.height = footprint
    s.bottom = s.top + footprint
    s.centerY = s.top + footprint / 2
  }

  const subordinate = d?.attachmentKind === 'subordinate'
  const isStraight = d?.edgeStyle === 'straight'
  const path = isStraight
    ? straightEdgePath(s, t)
    : floatingEdgePath(s, t)

  const emphasis = d?.emphasis || 'normal'
  let stroke = subordinate ? 'var(--axis-extension, #278c7f)' : 'var(--axis-branch, #8daed5)'
  let strokeWidth = 1.6
  let opacity = 1

  if (emphasis === 'highlight') {
    stroke = 'var(--axis-blue, #0058be)'
    strokeWidth = 2.4
  } else if (emphasis === 'dim') {
    opacity = 0.25
  }

  return (
    <g data-attachment-kind={subordinate ? 'subordinate' : 'project'} style={{ opacity }}>
      <BaseEdge
        path={path}
        className="axis-edge-flow"
        style={{
          stroke,
          strokeWidth,
          strokeLinecap: 'round',
        }}
      />
    </g>
  )
}

const nodeTypes = { person: PersonNode, foldedRow: FoldedRowNode }
const edgeTypes = { branch: BranchEdge }

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
  return (
    <ViewportPortal>
      <svg style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 50 }}>
        <path d={`M ${a.x} ${a.y} Q ${a.x} ${cursor.y} ${cursor.x} ${cursor.y}`} fill="none" stroke="var(--axis-blue)" strokeWidth={2} strokeDasharray="5 5" />
      </svg>
    </ViewportPortal>
  )
}

export interface PeopleAxisFlowCanvasProps {
  lang: Language
  nodes: AxisFlowNode[]
  edges: Edge[]
  orientation: AxisOrientation
  edgeStyle?: 'curve' | 'straight'
  linkingSourceNodeId: string | null
  onNodeDragStop: (id: string, position: { x: number; y: number }) => void
  onPaneClick: () => void
  onResetLayout: () => void
  onRequestReparent?: (sourceId: string, targetId: string) => void
  onShowToast?: (message: string) => void
  resetToken?: number
  mobile?: boolean
  focusNodeId?: string | null
  focusToken?: number
  onCancelLinking?: () => void
  fitToken?: number
  /** 变化时等节点量好后自动适应一次（折叠相关的批量操作用） */
  refitToken?: number
  centerMeToken?: number
  /** 一次性定位请求（含折叠成员）：节点出现后居中，随后回调 onLocateDone */
  locate?: { id: string; seq: number } | null
  onLocateDone?: () => void
}

/** 折叠成员用 parentId 挂在领导下，position 相对领导；取绝对位置用于居中 */
function absolutePositionOf(nodes: AxisFlowNode[]) {
  const byId = new Map(nodes.map(n => [n.id, n]))
  return (n: AxisFlowNode) => {
    const parent = n.parentId ? byId.get(n.parentId) : undefined
    return parent ? { x: parent.position.x + n.position.x, y: parent.position.y + n.position.y } : n.position
  }
}

const ZoomReadout = () => {
  const { zoom } = useViewport()
  return <span className="axis-zoom-readout">{Math.round(zoom * 100)}%</span>
}

const CanvasInner: React.FC<PeopleAxisFlowCanvasProps> = ({
  lang, nodes, edges, orientation, edgeStyle = 'curve', linkingSourceNodeId, onNodeDragStop, onPaneClick,
  onResetLayout, onRequestReparent, onShowToast, resetToken, mobile, focusNodeId, focusToken, onCancelLinking,
  fitToken, refitToken, centerMeToken, locate, onLocateDone,
}) => {
  const { zoomIn, zoomOut, fitView, setCenter, getNode, getZoom, screenToFlowPosition } = useReactFlow()
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<AxisFlowNode>(nodes)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [snapGuide, setSnapGuide] = useState<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null)
  const lastSnappedPos = useRef<Map<string, { x: number; y: number }>>(new Map())
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentDropTargetId = useRef<string | null>(null)
  const dropVerdictRef = useRef<{ targetId: string; verdict: { ok: boolean; reason: string } } | null>(null)
  const dragStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  // 手机操作提示：首次进入画布显示 5 秒或点击后隐藏，写入 localStorage（读写异常安全处理）
  const [showMobileHint, setShowMobileHint] = useState(() => {
    if (!mobile) return false
    try {
      return localStorage.getItem('axis_canvas_hint_seen') !== 'true'
    } catch {
      return false
    }
  })

  const dismissMobileHint = useCallback(() => {
    setShowMobileHint(false)
    try {
      localStorage.setItem('axis_canvas_hint_seen', 'true')
    } catch {
      // 读写失败当作已看过
    }
  }, [])

  useEffect(() => {
    if (!showMobileHint) return
    const timer = setTimeout(() => {
      dismissMobileHint()
    }, 5000)
    return () => clearTimeout(timer)
  }, [showMobileHint, dismissMobileHint])

  useEffect(() => {
    return () => {
      if (dwellTimer.current) clearTimeout(dwellTimer.current)
    }
  }, [])

  const dragging = useRef(false)
  const reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const duration = reducedMotion ? 0 : 280
  const width = useStore(s => s.width)
  const height = useStore(s => s.height)
  const initialized = useNodesInitialized()
  useEffect(() => { if (!dragging.current) setRfNodes(nodes) }, [nodes, setRfNodes])

  const visibleKey = nodes.filter(n => !n.hidden && !(n.data as PersonNodeData).foldedMember).map(n =>
    `${n.id}:${(n.data as PersonNodeData).node.parentId || ''}`,
  ).join(',')

  const padding = useMemo(() => ({
    top: linkingSourceNodeId ? '76px' : '32px',
    right: '28px',
    bottom: '90px',
    left: '28px',
  }), [linkingSourceNodeId])

  const fit = useCallback(() => {
    void fitView({ duration, padding, minZoom: mobile ? 0.25 : 0.05, maxZoom: 1 })
  }, [fitView, padding, duration, mobile])

  const centerOnTarget = useCallback(() => {
    const shown = nodes.filter(n => !n.hidden)
    const absolute = absolutePositionOf(nodes)
    const targetNodes = (shown.length ? shown : nodes).map(n => ({
      id: n.id,
      parentId: (n.data as PersonNodeData)?.node?.parentId,
      isTerminal: Boolean((n.data as PersonNodeData)?.isOverallLeader || (n.data as PersonNodeData)?.node?.isTerminalPM),
      isMine: Boolean((n.data as PersonNodeData)?.isMine),
      position: absolute(n),
    }))
    const center = calculateCanvasDefaultCenter(targetNodes, CARD_W, CARD_H)
    void setCenter(center.x, center.y, { zoom: 0.75, duration: 0 })
  }, [nodes, setCenter])

  // 外部动作（定位我 / 适应屏幕）只在令牌变化时执行一次；回调走 ref，节点变化不会重复触发
  const centerOnTargetRef = useRef(centerOnTarget)
  centerOnTargetRef.current = centerOnTarget
  const fitRef = useRef(fit)
  fitRef.current = fit

  // 手机模式进入画布：以"我"为中心、缩放 0.75；找不到"我"以根为中心。切换方向后同样处理。
  const lastOrientKey = useRef<string | null>(null)
  useEffect(() => {
    if (!initialized || !width || !height) return
    const key = `${orientation}`
    if (lastOrientKey.current === key) return
    lastOrientKey.current = key

    if (mobile) {
      centerOnTargetRef.current()
    } else {
      void fitView({ duration: 0, padding, minZoom: 0.05, maxZoom: 1 })
    }
  }, [orientation, initialized, width, height, mobile, fitView, padding])

  // 电脑端在增删节点或重置时自适应
  const lastAutoFit = useRef('')
  useEffect(() => {
    if (mobile) return
    const fitKey = JSON.stringify([orientation, visibleKey, resetToken, width, height, padding])
    if (initialized && width && height && lastAutoFit.current !== fitKey) {
      lastAutoFit.current = fitKey
      void fitView({ duration: 0, padding, minZoom: 0.05, maxZoom: 1 })
    }
  }, [mobile, orientation, visibleKey, resetToken, width, height, initialized, fitView, padding])

  // 批量折叠操作后：新节点要先被量好（measured）再取景，否则按旧节点取景会留下空白画面
  const lastRefitToken = useRef(refitToken ?? 0)
  const [refitPending, setRefitPending] = useState(false)
  useEffect(() => {
    if (!refitToken || lastRefitToken.current === refitToken) return
    lastRefitToken.current = refitToken
    setRefitPending(true)
  }, [refitToken])
  useEffect(() => {
    if (!refitPending || !initialized || !width || !height) return
    const shown = rfNodes.filter(n => !n.hidden)
    const rfKey = shown.filter(n => !(n.data as PersonNodeData).foldedMember).map(n =>
      `${n.id}:${(n.data as PersonNodeData).node.parentId || ''}`,
    ).join(',')
    if (rfKey !== visibleKey || !shown.every(n => n.measured?.width)) return
    setRefitPending(false)
    const frame = requestAnimationFrame(() => {
      void fitView({ duration: 0, padding, minZoom: mobile ? 0.25 : 0.05, maxZoom: 1 })
    })
    return () => cancelAnimationFrame(frame)
  }, [refitPending, rfNodes, visibleKey, initialized, width, height, fitView, padding, mobile])

  // 响应外部工具条动作
  const lastFitToken = useRef(fitToken ?? 0)
  useEffect(() => {
    if (!fitToken || lastFitToken.current === fitToken) return
    lastFitToken.current = fitToken
    fitRef.current()
  }, [fitToken])

  const lastCenterMeToken = useRef(centerMeToken ?? 0)
  useEffect(() => {
    if (!centerMeToken || lastCenterMeToken.current === centerMeToken) return
    lastCenterMeToken.current = centerMeToken
    centerOnTargetRef.current()
  }, [centerMeToken])

  useEffect(() => {
    if (!focusToken || !focusNodeId) return
    const target = nodes.find(n => n.id === focusNodeId)
    if (target) {
      const pos = absolutePositionOf(nodes)(target)
      const h = target.type === 'foldedRow' ? (mobile ? FOLDED_ROW_H_MOBILE : FOLDED_ROW_H) : CARD_H
      void setCenter(pos.x + CARD_W / 2, pos.y + h / 2, { zoom: Math.max(getZoom(), mobile ? 0.85 : 1), duration: mobile ? 0 : duration })
    }
  }, [focusToken, focusNodeId, nodes, setCenter, getZoom, mobile, duration])

  // 定位请求：目标可能刚被拉到人轴或刚展开，等它出现在节点里（且画布已量好尺寸）再居中；
  // 声明在自动取景之后，同一轮提交里它最后执行，不会被取景盖掉
  const handledLocateSeq = useRef(0)
  useEffect(() => {
    if (!locate || handledLocateSeq.current === locate.seq) return
    if (!initialized || !width || !height) return
    const target = nodes.find(n => n.id === locate.id && !n.hidden)
    if (!target) return
    handledLocateSeq.current = locate.seq
    const pos = absolutePositionOf(nodes)(target)
    const h = target.type === 'foldedRow' ? (mobile ? FOLDED_ROW_H_MOBILE : FOLDED_ROW_H) : CARD_H
    void setCenter(pos.x + CARD_W / 2, pos.y + h / 2, { zoom: Math.max(getZoom(), mobile ? 0.85 : 1), duration: mobile ? 0 : duration })
    onLocateDone?.()
  }, [locate, nodes, initialized, width, height, setCenter, getZoom, mobile, duration, onLocateDone])

  const effectiveFocusId = hoveredNodeId || focusNodeId || null

  const nodeTreeForHighlight = useMemo(() => {
    return rfNodes.map(n => ({
      id: n.id,
      parentId: (n.data as PersonNodeData)?.node?.parentId ?? null,
    }))
  }, [rfNodes])

  const highlightedEdges = useMemo(() => {
    return highlightEdgeIds(nodeTreeForHighlight, effectiveFocusId)
  }, [nodeTreeForHighlight, effectiveFocusId])

  const styledEdges = useMemo(() => {
    return edges.map(edge => {
      let emphasis: 'normal' | 'highlight' | 'dim' = 'normal'
      if (effectiveFocusId) {
        emphasis = highlightedEdges.has(edge.id) ? 'highlight' : 'dim'
      }
      return {
        ...edge,
        data: {
          ...(edge.data || {}),
          orientation,
          edgeStyle,
          emphasis,
        },
      }
    })
  }, [edges, effectiveFocusId, highlightedEdges, orientation, edgeStyle])

  const handleNodeDrag = useCallback((event: React.MouseEvent | React.TouchEvent, node: Node) => {
    let clientX: number | undefined
    let clientY: number | undefined
    if ('clientX' in event && typeof event.clientX === 'number') {
      clientX = event.clientX
      clientY = event.clientY
    } else if ('touches' in event && event.touches && event.touches.length > 0) {
      clientX = event.touches[0].clientX
      clientY = event.touches[0].clientY
    }

    let targetId: string | null = null
    if (clientX != null && clientY != null) {
      const flowPos = screenToFlowPosition({ x: clientX, y: clientY })
      const targetNode = rfNodes.find(n =>
        n.id !== node.id &&
        !n.hidden &&
        n.type === 'person' &&
        !(n.data as PersonNodeData).foldedMember &&
        flowPos.x >= n.position.x &&
        flowPos.x <= n.position.x + CARD_W &&
        flowPos.y >= n.position.y &&
        flowPos.y <= n.position.y + CARD_H,
      )
      targetId = targetNode?.id || null
    }

    if (targetId !== currentDropTargetId.current) {
      if (dwellTimer.current) {
        clearTimeout(dwellTimer.current)
        dwellTimer.current = null
      }
      currentDropTargetId.current = targetId
      dropVerdictRef.current = null

      setRfNodes(nds => nds.map(n => {
        const d = n.data as PersonNodeData
        if (d.dropState || d.dropTip) {
          return {
            ...n,
            data: { ...d, dropState: null, dropTip: '' },
          }
        }
        return n
      }))

      if (targetId) {
        const capturedTargetId = targetId
        dwellTimer.current = setTimeout(() => {
          const allPeopleNodes = rfNodes.map(n => {
            const d = n.data as PersonNodeData
            return {
              ...d.node,
              isTerminal: Boolean(d.isOverallLeader || d.node.isTerminalPM),
            }
          })
          const canRelinkCheck = (id: string) => {
            const targetNodeData = rfNodes.find(n => n.id === id)?.data as PersonNodeData | undefined
            return Boolean(targetNodeData?.canRelink)
          }
          const verdict = reparentVerdict(allPeopleNodes, node.id, capturedTargetId, {
            canRelink: canRelinkCheck,
            lang,
          })
          if (verdict) {
            dropVerdictRef.current = { targetId: capturedTargetId, verdict }
            setRfNodes(nds => nds.map(n => {
              if (n.id === capturedTargetId) {
                return {
                  ...n,
                  data: {
                    ...(n.data as PersonNodeData),
                    dropState: verdict.ok ? 'ok' : 'bad',
                    dropTip: verdict.reason,
                  },
                }
              }
              return n
            }))
          }
        }, 300)
      }
    }

    if (targetId) {
      if (snapGuide) setSnapGuide(null)
      return
    }

    if (edgeStyle !== 'straight') {
      if (snapGuide) setSnapGuide(null)
      return
    }
    const personData = node.data as PersonNodeData | undefined
    const parentId = personData?.node?.parentId
    if (!parentId) {
      if (snapGuide) setSnapGuide(null)
      return
    }
    const parentNode = rfNodes.find(n => n.id === parentId)
    if (!parentNode) {
      if (snapGuide) setSnapGuide(null)
      return
    }
    const snapResult = snapToParentAxis(
      node.position,
      { width: CARD_W, height: CARD_H },
      parentNode.position,
      orientation,
      16,
    )
    if (snapResult.snapped) {
      setSnapGuide(snapResult.guide)
      lastSnappedPos.current.set(node.id, snapResult.pos)
      setRfNodes(nds => nds.map(n => n.id === node.id ? { ...n, position: snapResult.pos } : n))
    } else {
      setSnapGuide(null)
      lastSnappedPos.current.delete(node.id)
    }
  }, [edgeStyle, orientation, rfNodes, snapGuide, screenToFlowPosition, lang, setRfNodes])

  const handleNodeDragStop = useCallback((_: React.MouseEvent | React.TouchEvent, node: Node) => {
    dragging.current = false
    setSnapGuide(null)
    if (dwellTimer.current) {
      clearTimeout(dwellTimer.current)
      dwellTimer.current = null
    }

    setRfNodes(nds => nds.map(n => {
      const d = n.data as PersonNodeData
      if (d.dropState || d.dropTip) {
        return {
          ...n,
          data: { ...d, dropState: null, dropTip: '' },
        }
      }
      return n
    }))

    const decided = dropVerdictRef.current
    dropVerdictRef.current = null
    currentDropTargetId.current = null

    if (decided && decided.verdict) {
      const initialPos = dragStartPos.current
      lastSnappedPos.current.delete(node.id)
      setRfNodes(nds => nds.map(n => n.id === node.id ? { ...n, position: initialPos } : n))

      if (decided.verdict.ok) {
        onRequestReparent?.(node.id, decided.targetId)
      } else {
        onShowToast?.(decided.verdict.reason)
      }
      return
    }

    const snapped = lastSnappedPos.current.get(node.id)
    lastSnappedPos.current.delete(node.id)
    const finalPos = snapped || node.position
    onNodeDragStop(node.id, finalPos)
  }, [onNodeDragStop, onRequestReparent, onShowToast, setRfNodes])

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={styledEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStart={(_, n) => {
        dragging.current = true
        dragStartPos.current = { ...n.position }
        currentDropTargetId.current = null
        dropVerdictRef.current = null
        if (dwellTimer.current) {
          clearTimeout(dwellTimer.current)
          dwellTimer.current = null
        }
      }}
      onNodeDrag={handleNodeDrag}
      onNodeDragStop={handleNodeDragStop}
      onNodeMouseEnter={(_, n) => { setHoveredNodeId(n.id) }}
      onNodeMouseLeave={() => { setHoveredNodeId(null) }}
      onNodeClick={(_, n) => {
        if (n.type === 'person') (n.data as PersonNodeData).onCardClick(n.id)
      }}
      onPaneClick={() => {
        setHoveredNodeId(null)
        onPaneClick()
      }}
      fitView={!mobile}
      fitViewOptions={{ padding, minZoom: mobile ? 0.25 : 0.05, maxZoom: 1 }}
      minZoom={0.05}
      maxZoom={2}
      nodesConnectable={false}
      nodesFocusable
      edgesFocusable={false}
      elementsSelectable={false}
      selectionOnDrag={false}
      panOnDrag
      zoomOnPinch
      zoomOnDoubleClick={false}
      nodeDragThreshold={8}
      className={`axis-flow${mobile ? ' axis-theme' : ''}`}
      data-testid={mobile ? 'mobile-axis-graph' : undefined}
    >
      <Background color="var(--axis-dot, #dce2eb)" gap={22} size={1} />
      <LinkingPreview sourceId={linkingSourceNodeId} />
      {snapGuide && (
        <ViewportPortal>
          <svg
            className="axis-snap-guide"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              overflow: 'visible',
              pointerEvents: 'none',
              zIndex: 100,
            }}
          >
            <line
              x1={snapGuide.from.x}
              y1={snapGuide.from.y}
              x2={snapGuide.to.x}
              y2={snapGuide.to.y}
            />
          </svg>
        </ViewportPortal>
      )}
      {linkingSourceNodeId && (
        <Panel position="top-center" className="axis-link-panel">
          <span>{lang === 'zh' ? '点击人员设为直属上级' : 'Tap the new parent'}</span>
          <button aria-label={lang === 'zh' ? '取消连线' : 'Cancel linking'} onClick={onCancelLinking}><X size={16} /></button>
        </Panel>
      )}
      {mobile && showMobileHint && (
        <Panel position="top-center" className="axis-canvas-hint-panel">
          <div
            className="axis-canvas-hint-bubble"
            data-testid="axis-canvas-hint"
            onClick={dismissMobileHint}
            role="button"
            tabIndex={0}
          >
            <span>{lang === 'zh' ? '拖到别人卡片上停一下＝换上级 · 拖到空白处＝挪位置' : 'Drag onto a card and hold = change manager · drag to empty space = move'}</span>
          </div>
        </Panel>
      )}
      <Panel position="bottom-left" className="axis-canvas-controls">
        <div className="axis-control-pill">
          <button aria-label={lang === 'zh' ? '缩小' : 'Zoom out'} onClick={() => void zoomOut({ duration })}><Minus size={18} /></button>
          <ZoomReadout />
          <button aria-label={lang === 'zh' ? '放大' : 'Zoom in'} onClick={() => void zoomIn({ duration })}><Plus size={18} /></button>
        </div>
        <button className="axis-control-square" aria-label={lang === 'zh' ? '适应屏幕' : 'Fit all nodes'} title={lang === 'zh' ? '适应屏幕' : 'Fit all nodes'} onClick={fit}><Maximize size={18} /></button>
        {!mobile && <button className="axis-control-square" aria-label={lang === 'zh' ? '重置布局' : 'Reset layout'} onClick={() => { onResetLayout(); setTimeout(fit, 100) }}><LocateFixed size={18} /></button>}
      </Panel>
    </ReactFlow>
  )
}

export const PeopleAxisFlowCanvas: React.FC<PeopleAxisFlowCanvasProps> = props => (
  <ReactFlowProvider>
    <CanvasInner {...props} />
  </ReactFlowProvider>
)
