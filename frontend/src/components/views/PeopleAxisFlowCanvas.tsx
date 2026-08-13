import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Panel,
  BaseEdge,
  Handle,
  Position,
  ViewportPortal,
  useInternalNode,
  useNodesState,
  useReactFlow,
  useViewport,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
  type InternalNode,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { PeopleAxisNode, Language } from '../../types'
import { borderAnchor, floatingEdgePath, RectCoords } from './peopleAxisUtils'
import { AxisOrientation } from './peopleAxisFlowLayout'

/* ------------------------------------------------------------------ */
/* 类型                                                                */
/* ------------------------------------------------------------------ */

export interface PersonNodeData extends Record<string, unknown> {
  node: PeopleAxisNode
  lang: Language
  isOverallLeader: boolean
  isMainAxisLeader: boolean
  isSelected: boolean
  isExpanded: boolean
  childCount: number
  linkingActive: boolean
  isLinkingSource: boolean
  isLinkingTarget: boolean
  /** 当前用户可编辑该节点（PM/超管或本子树责任人）：控制「挂载事项/下属」入口 */
  canEdit: boolean
  /** 连线=移动节点，服务端仅 PM 可做 */
  canRelink: boolean
  onCardClick: (id: string) => void
  onToggleExpand: (id: string) => void
  onAddWorkItem: (id: string) => void
  onAddChild: (id: string) => void
  onToggleLinking: (id: string) => void
  onHoverTarget: (id: string | null) => void
}

export interface TerminusNodeData extends Record<string, unknown> {
  lang: Language
  progress: number
}

export interface SpineEdgeData extends Record<string, unknown> {
  orientation: AxisOrientation
  spineCoord: number
}

type PersonFlowNode = Node<PersonNodeData, 'person'>
type TerminusFlowNode = Node<TerminusNodeData, 'terminus'>
export type AxisFlowNode = PersonFlowNode | TerminusFlowNode

/** React Flow 只为带 Handle 的节点渲染边；锚点实际由自定义边动态计算，Handle 仅占位 */
const HiddenHandles: React.FC = () => (
  <>
    <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: 'none' }} isConnectable={false} />
    <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none' }} isConnectable={false} />
  </>
)

/* ------------------------------------------------------------------ */
/* 人卡片节点（沿用原手写画布的设计语言）                                 */
/* ------------------------------------------------------------------ */

const PersonNode: React.FC<NodeProps<PersonFlowNode>> = ({ data }) => {
  const {
    node, lang, isOverallLeader, isMainAxisLeader, isSelected, isExpanded,
    childCount, linkingActive, isLinkingSource, isLinkingTarget, canEdit, canRelink,
    onCardClick, onToggleExpand, onAddWorkItem, onAddChild, onToggleLinking, onHoverTarget,
  } = data

  return (
    <div
      data-node-anchor={node.id}
      onMouseEnter={() => {
        if (linkingActive && !isLinkingSource) onHoverTarget(node.id)
      }}
      onMouseLeave={() => {
        if (linkingActive) onHoverTarget(null)
      }}
      className={`rounded-3xl p-5 border relative select-none w-[350px] transition-shadow ${
        isLinkingSource
          ? 'bg-cyan-500/20 border-cyan-500 shadow-2xl ring-4 ring-cyan-500/80 z-30'
          : isLinkingTarget
          ? 'bg-emerald-500/25 border-emerald-500 shadow-2xl ring-4 ring-emerald-500 z-30 cursor-pointer animate-pulse'
          : linkingActive
          ? 'bg-surface dark:bg-[#191c1d] border-outline-variant/60 hover:border-emerald-400 hover:ring-2 hover:ring-emerald-400/50 cursor-pointer opacity-90'
          : isOverallLeader
          ? 'bg-gradient-to-br from-amber-500/15 via-surface to-surface-container border-amber-500/60 shadow-xl ring-2 ring-amber-500/30'
          : isMainAxisLeader
          ? 'bg-gradient-to-br from-primary/10 via-surface to-surface-container border-primary/50 shadow-lg ring-1 ring-primary/20'
          : isSelected
          ? 'bg-surface dark:bg-[#1f2224] border-primary shadow-lg ring-2 ring-primary/30'
          : 'bg-surface dark:bg-[#191c1d] border-outline-variant/40 hover:border-primary/50 shadow-md'
      }`}
    >
      <HiddenHandles />
      {linkingActive && !isLinkingSource && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-emerald-500 text-black text-[10px] font-black shadow-md flex items-center gap-1 z-20">
          <span className="material-symbols-outlined text-xs">south</span>
          <span>{lang === 'zh' ? '点击设为直属上级' : 'Set Parent'}</span>
        </div>
      )}

      <div className="absolute top-2 right-3 flex items-center gap-1 opacity-40 hover:opacity-100 text-on-surface-variant">
        <span className="material-symbols-outlined text-xs">drag_pan</span>
        <span className="text-[9px] font-bold uppercase">{lang === 'zh' ? '可拖拽' : 'Drag'}</span>
      </div>

      {/* Card Header Badge */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5">
          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
            isOverallLeader
              ? 'bg-amber-500 text-black shadow-xs'
              : isMainAxisLeader
              ? 'bg-primary text-on-primary shadow-xs'
              : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
          }`}>
            {isOverallLeader
              ? (lang === 'zh' ? '👑 项目总指挥 (Head Leader)' : '👑 Overall Director')
              : isMainAxisLeader
              ? (lang === 'zh' ? '🏢 部门/厂家主管 (Leader)' : '🏢 Vendor/Dept Leader')
              : (lang === 'zh' ? '🌿 部门下属成员' : '🌿 Subordinate Member')}
          </span>
          <span className="text-[11px] font-extrabold text-on-surface-variant/80 truncate max-w-[130px]" title={node.person.department}>
            {node.person.department || node.person.role}
          </span>
        </div>

        {childCount > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand(node.id)
            }}
            className="nodrag px-2 py-0.5 rounded-lg bg-surface-container-highest hover:bg-surface-variant text-on-surface text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer"
            title={lang === 'zh' ? '展开/折叠下属成员' : 'Toggle subordinates'}
          >
            <span className="material-symbols-outlined text-sm">
              {isExpanded ? 'folder_open' : 'folder'}
            </span>
            <span>{childCount}</span>
          </button>
        )}
      </div>

      {/* User Profile */}
      <div className="flex items-center gap-3.5 mb-3">
        {node.person.avatar ? (
          <img
            src={node.person.avatar}
            alt={node.person.name}
            draggable={false}
            className={`w-12 h-12 rounded-2xl object-cover shrink-0 ring-2 ${
              isOverallLeader ? 'ring-amber-500' : isMainAxisLeader ? 'ring-primary' : 'ring-outline-variant/30'
            }`}
          />
        ) : (
          <span
            className={`w-12 h-12 rounded-2xl shrink-0 ring-2 bg-primary/10 text-primary text-lg font-bold flex items-center justify-center select-none ${
              isOverallLeader ? 'ring-amber-500' : isMainAxisLeader ? 'ring-primary' : 'ring-outline-variant/30'
            }`}
          >
            {node.person.name.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-black text-on-surface truncate flex items-center gap-1.5">
            <span>{node.person.name}</span>
          </h3>
          <p className="text-xs font-bold text-primary truncate mt-0.5">
            {node.roleTitle}
          </p>
        </div>
      </div>

      {/* Work Items Summary */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center justify-between text-xs font-bold text-on-surface-variant">
          <span>{lang === 'zh' ? '责任归口事项' : 'Assigned Deliverables'}</span>
          <span className="text-primary">{node.workItems.length} {lang === 'zh' ? '项' : 'items'}</span>
        </div>

        {node.workItems.slice(0, 2).map((wi) => (
          <div
            key={wi.id}
            className="p-2.5 rounded-xl bg-surface-container dark:bg-[#232628] border border-outline-variant/30 text-xs flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                wi.status === 'Done' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
              }`} />
              <span className="font-bold text-on-surface truncate">{wi.title}</span>
            </div>
            <span className="text-[10px] font-extrabold text-on-surface-variant shrink-0 bg-surface px-1.5 py-0.5 rounded-md border border-outline-variant/20">
              {wi.evidences?.length || 0} {lang === 'zh' ? '证据' : 'proofs'}
            </span>
          </div>
        ))}

        {node.workItems.length === 0 && (
          <div className="p-3 rounded-xl bg-surface-container/50 border border-dashed border-outline-variant/40 text-center text-xs text-on-surface-variant font-medium">
            {lang === 'zh' ? '暂未挂载事项，点击添加' : 'No items attached'}
          </div>
        )}
      </div>

      {/* Footer Actions（按服务端 ACL 显隐：无权限的人看不到编辑入口） */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-outline-variant/30 text-xs">
        {canEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAddWorkItem(node.id)
            }}
            className="nodrag px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-bold transition-all flex items-center gap-1 cursor-pointer text-[11px]"
          >
            <span className="material-symbols-outlined text-sm">add_task</span>
            <span>{lang === 'zh' ? '挂载事项' : 'Task'}</span>
          </button>
        )}

        {canEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAddChild(node.id)
            }}
            className="nodrag px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 font-bold transition-all flex items-center gap-1 cursor-pointer text-[11px] border border-emerald-500/30"
            title={lang === 'zh' ? '在该责任人下挂载直属下属' : 'Add a subordinate under this person'}
          >
            <span className="material-symbols-outlined text-sm">person_add</span>
            <span>{lang === 'zh' ? '下属' : 'Sub'}</span>
          </button>
        )}

        {canRelink && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleLinking(node.id)
            }}
            className={`nodrag px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer ${
              isLinkingSource
                ? 'bg-cyan-500 text-black shadow-lg animate-pulse ring-2 ring-cyan-300'
                : 'bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30'
            }`}
            title={lang === 'zh' ? '连线模式：点击后再点另一张卡片，成为其直属下级（仅 PM）' : 'Re-link: change parent (PM only)'}
          >
            <span className="material-symbols-outlined text-sm">hub</span>
            <span>{isLinkingSource ? (lang === 'zh' ? '取消连线' : 'Cancel') : (lang === 'zh' ? '连线' : 'Re-link')}</span>
          </button>
        )}

        {!canEdit && !canRelink && (
          <span
            className="text-[10px] font-bold text-on-surface-variant/70 flex items-center gap-1 cursor-help"
            title={lang === 'zh'
              ? '只读：编辑需项目 PM 授权——可请 PM 把该节点指派给你负责，或由 PM 创建委托授权'
              : 'Read-only: editing requires PM authorization — ask the PM for a node assignment or a delegation grant'}
          >
            <span className="material-symbols-outlined text-sm">visibility</span>
            {lang === 'zh' ? '只读' : 'Read-only'}
          </span>
        )}

        <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md ${
          node.aiContext?.riskLevel === 'high'
            ? 'bg-error/20 text-error'
            : node.aiContext?.riskLevel === 'medium'
            ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
        }`}>
          AI {node.aiContext?.riskLevel?.toUpperCase() || 'LOW'}
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 终责站点节点                                                          */
/* ------------------------------------------------------------------ */

const TerminusNode: React.FC<NodeProps<TerminusFlowNode>> = ({ data }) => (
  <div className="w-[200px] rounded-2xl border-2 border-red-500/70 bg-red-500/10 backdrop-blur-sm px-4 py-3 flex items-center gap-3 shadow-lg select-none">
    <HiddenHandles />
    <span className="relative flex h-4 w-4 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60" />
      <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 border-2 border-white" />
    </span>
    <div className="min-w-0">
      <div className="text-xs font-black text-red-600 dark:text-red-400 truncate">
        🏁 {data.lang === 'zh' ? '终责交付 (Terminus)' : 'Terminus'}
      </div>
      <div className="text-[10px] font-bold text-on-surface-variant">
        {data.progress}% {data.lang === 'zh' ? '总进度' : 'complete'}
      </div>
    </div>
  </div>
)

/* ------------------------------------------------------------------ */
/* 边：主轴地铁线 + 浮动贝塞尔支线                                        */
/* ------------------------------------------------------------------ */

function internalToRect(n: InternalNode): RectCoords | null {
  const w = n.measured?.width
  const h = n.measured?.height
  if (!w || !h) return null
  const { x, y } = n.internals.positionAbsolute
  return {
    left: x,
    right: x + w,
    top: y,
    bottom: y + h,
    width: w,
    height: h,
    centerX: x + w / 2,
    centerY: y + h / 2,
  }
}

/** 主轴地铁线：站点卡片经垂直短撑接入主轴，主轴沿直线延伸，端点画站点圆点 */
const SpineEdge: React.FC<EdgeProps> = ({ source, target, data }) => {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const d = data as SpineEdgeData | undefined
  if (!sourceNode || !targetNode || !d) return null
  const sr = internalToRect(sourceNode)
  const tr = internalToRect(targetNode)
  if (!sr || !tr) return null

  const c = d.spineCoord
  let path: string
  let dotA: { x: number; y: number }
  let dotB: { x: number; y: number }
  if (d.orientation === 'horizontal') {
    path = `M ${sr.centerX} ${sr.centerY} L ${sr.centerX} ${c} L ${tr.centerX} ${c} L ${tr.centerX} ${tr.centerY}`
    dotA = { x: sr.centerX, y: c }
    dotB = { x: tr.centerX, y: c }
  } else {
    path = `M ${sr.centerX} ${sr.centerY} L ${c} ${sr.centerY} L ${c} ${tr.centerY} L ${tr.centerX} ${tr.centerY}`
    dotA = { x: c, y: sr.centerY }
    dotB = { x: c, y: tr.centerY }
  }

  return (
    <g>
      <BaseEdge
        path={path}
        style={{ stroke: '#ef4444', strokeWidth: 7, strokeLinejoin: 'round', strokeLinecap: 'round', opacity: 0.95 }}
      />
      <path
        d={path}
        fill="none"
        stroke="#ffffff"
        strokeWidth={2.5}
        strokeDasharray="10 9"
        strokeLinecap="round"
        style={{ pointerEvents: 'none', opacity: 0.9 }}
      />
      {[dotA, dotB].map((p, i) => (
        <g key={i} style={{ pointerEvents: 'none' }}>
          <circle cx={p.x} cy={p.y} r={7} fill="#ffffff" stroke="#ef4444" strokeWidth={3.5} />
          <circle cx={p.x} cy={p.y} r={2.5} fill="#ef4444" />
        </g>
      ))}
    </g>
  )
}

/** 支线：动态吸附卡片边缘的浮动三次贝塞尔曲线（复用 peopleAxisUtils） */
const BranchEdge: React.FC<EdgeProps> = ({ source, target }) => {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  if (!sourceNode || !targetNode) return null
  const sr = internalToRect(sourceNode)
  const tr = internalToRect(targetNode)
  if (!sr || !tr) return null

  const path = floatingEdgePath(sr, tr)
  return (
    <g>
      <BaseEdge
        path={path}
        style={{ stroke: '#10b981', strokeWidth: 2.5, strokeDasharray: '6 4', strokeLinecap: 'round', opacity: 0.9 }}
      />
      <circle cx={tr.centerX} cy={tr.centerY} r={0} fill="none" />
    </g>
  )
}

const nodeTypes = { person: PersonNode, terminus: TerminusNode }
const edgeTypes = { spine: SpineEdge, branch: BranchEdge }

/* ------------------------------------------------------------------ */
/* 连线模式预览：从源卡片边缘到指针的动态曲线                              */
/* ------------------------------------------------------------------ */

const LinkingPreview: React.FC<{ sourceId: string | null }> = ({ sourceId }) => {
  const { screenToFlowPosition } = useReactFlow()
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const sourceNode = useInternalNode(sourceId ?? '__none__')

  useEffect(() => {
    if (!sourceId) {
      setCursor(null)
      return
    }
    const handler = (e: PointerEvent) => {
      setCursor(screenToFlowPosition({ x: e.clientX, y: e.clientY }))
    }
    window.addEventListener('pointermove', handler)
    return () => window.removeEventListener('pointermove', handler)
  }, [sourceId, screenToFlowPosition])

  if (!sourceId || !sourceNode || !cursor) return null
  const sr = internalToRect(sourceNode)
  if (!sr) return null

  const anchor = borderAnchor(sr, cursor.x, cursor.y)
  const dist = Math.hypot(cursor.x - anchor.x, cursor.y - anchor.y)
  const k = Math.min(160, Math.max(28, dist * 0.42))
  const c1 =
    anchor.side === 'right' ? `${anchor.x + k} ${anchor.y}` :
    anchor.side === 'left' ? `${anchor.x - k} ${anchor.y}` :
    anchor.side === 'bottom' ? `${anchor.x} ${anchor.y + k}` :
    `${anchor.x} ${anchor.y - k}`
  const c2 = `${cursor.x - (cursor.x - anchor.x) * 0.3} ${cursor.y - (cursor.y - anchor.y) * 0.3}`
  const d = `M ${anchor.x} ${anchor.y} C ${c1}, ${c2}, ${cursor.x} ${cursor.y}`

  return (
    <ViewportPortal>
      <svg
        style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 50 }}
        width={1}
        height={1}
      >
        <path d={d} fill="none" stroke="#06b6d4" strokeWidth={4} strokeDasharray="10 6" strokeLinecap="round" opacity={0.9} />
        <circle cx={cursor.x} cy={cursor.y} r={7} fill="#06b6d4" opacity={0.65} />
      </svg>
    </ViewportPortal>
  )
}

/* ------------------------------------------------------------------ */
/* 画布容器                                                             */
/* ------------------------------------------------------------------ */

export interface PeopleAxisFlowCanvasProps {
  lang: Language
  nodes: AxisFlowNode[]
  edges: Edge[]
  orientation: AxisOrientation
  linkingSourceNodeId: string | null
  onNodeDragStop: (id: string, position: { x: number; y: number }) => void
  onPaneClick: () => void
  onResetLayout: () => void
  /** 画布外部触发重置布局时递增，用于通知画布重新取景（如移动端底部面板的重置按钮） */
  resetToken?: number
}

/** 缩放百分比单独成组件：useViewport 每帧触发重渲染，隔离开避免拖累整个画布 */
const ZoomReadout: React.FC = () => {
  const { zoom } = useViewport()
  return (
    <span className="text-xs font-black text-primary px-1 min-w-[42px] text-center">
      {Math.round(zoom * 100)}%
    </span>
  )
}

const CanvasInner: React.FC<PeopleAxisFlowCanvasProps> = ({
  lang, nodes, edges, orientation, linkingSourceNodeId,
  onNodeDragStop, onPaneClick, onResetLayout, resetToken,
}) => {
  const { zoomIn, zoomOut, fitView } = useReactFlow()

  // 拖拽期间节点位置由 React Flow 内部状态驱动，父组件不参与每帧渲染
  // （否则每帧重建全部节点数据会引起整片卡片重渲染、画面闪烁）；
  // 外部数据变化（布局/连线态/增删节点）时再整体回灌。
  const [rfNodes, setRfNodes, onNodesChangeInternal] = useNodesState<AxisFlowNode>(nodes)
  const draggingRef = useRef(false)
  useEffect(() => {
    if (!draggingRef.current) setRfNodes(nodes)
  }, [nodes, setRfNodes])

  // 切换主轴方向后重新取景
  useEffect(() => {
    const t = setTimeout(() => void fitView({ duration: 350, padding: 0.15, maxZoom: 1 }), 80)
    return () => clearTimeout(t)
  }, [orientation, fitView])

  // 外部重置布局后重新取景；首次挂载跳过，避免与初始 fitView 重复
  const lastResetTokenRef = useRef(resetToken)
  useEffect(() => {
    if (lastResetTokenRef.current === resetToken) return
    lastResetTokenRef.current = resetToken
    const t = setTimeout(() => void fitView({ duration: 350, padding: 0.15, maxZoom: 1 }), 80)
    return () => clearTimeout(t)
  }, [resetToken, fitView])

  const handleReset = useCallback(() => {
    onResetLayout()
    setTimeout(() => void fitView({ duration: 350, padding: 0.15, maxZoom: 1 }), 80)
  }, [onResetLayout, fitView])

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChangeInternal}
      onNodeDragStart={() => {
        draggingRef.current = true
      }}
      onNodeDragStop={(_, node) => {
        draggingRef.current = false
        onNodeDragStop(node.id, node.position)
      }}
      // 点击经由 React Flow 分发：既保证 wrapper 有 pointer-events（连线模式
      // 下节点不可拖拽也不可选中），也避免 DOM onClick 与 RF 双重触发。
      onNodeClick={(_, node) => {
        if (node.type === 'person') (node.data as PersonNodeData).onCardClick(node.id)
      }}
      onPaneClick={onPaneClick}
      fitView
      fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
      minZoom={0.25}
      maxZoom={2}
      nodesConnectable={false}
      nodesFocusable={false}
      edgesFocusable={false}
      elementsSelectable={false}
      selectionOnDrag={false}
      panOnDrag
      zoomOnPinch
      zoomOnDoubleClick={false}
      proOptions={{ hideAttribution: false }}
      className="!bg-transparent"
    >
      <LinkingPreview sourceId={linkingSourceNodeId} />

      {/* 缩放/复位工具条（沿用原浮动工具条设计） */}
      <Panel position="top-right" className="!m-3 md:!m-4">
        <div className="bg-surface/90 dark:bg-[#1a1c1e]/90 backdrop-blur-md border border-outline-variant/40 rounded-2xl p-1.5 md:p-2 shadow-xl flex items-center gap-1 md:gap-2">
          <div className="hidden md:flex items-center gap-1.5 text-xs font-black text-on-surface-variant px-2.5 border-r border-outline-variant/30">
            <span className="material-symbols-outlined text-base text-primary">drag_pan</span>
            <span>{lang === 'zh' ? '拖画布平移 · 滚轮/捏合缩放' : 'Drag to pan · pinch to zoom'}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => void zoomOut({ duration: 150 })}
              className="w-8 h-8 rounded-xl bg-surface-container hover:bg-primary/20 hover:text-primary text-on-surface font-black text-sm flex items-center justify-center transition-all cursor-pointer"
              title={lang === 'zh' ? '缩小' : 'Zoom Out'}
            >
              <span className="material-symbols-outlined text-base">zoom_out</span>
            </button>
            <ZoomReadout />
            <button
              onClick={() => void zoomIn({ duration: 150 })}
              className="w-8 h-8 rounded-xl bg-surface-container hover:bg-primary/20 hover:text-primary text-on-surface font-black text-sm flex items-center justify-center transition-all cursor-pointer"
              title={lang === 'zh' ? '放大' : 'Zoom In'}
            >
              <span className="material-symbols-outlined text-base">zoom_in</span>
            </button>
          </div>
          <div className="h-4 w-px bg-outline-variant/30 mx-1" />
          <button
            onClick={handleReset}
            className="px-2 md:px-3 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-extrabold transition-all flex items-center gap-1 cursor-pointer"
            title={lang === 'zh' ? '重置视角与卡片位置' : 'Reset View & Positions'}
          >
            <span className="material-symbols-outlined text-sm">fit_screen</span>
            <span className="hidden md:inline">{lang === 'zh' ? '视角复位' : 'Reset View'}</span>
          </button>
        </div>
      </Panel>
    </ReactFlow>
  )
}

export const PeopleAxisFlowCanvas: React.FC<PeopleAxisFlowCanvasProps> = (props) => (
  <ReactFlowProvider>
    <CanvasInner {...props} />
  </ReactFlowProvider>
)
