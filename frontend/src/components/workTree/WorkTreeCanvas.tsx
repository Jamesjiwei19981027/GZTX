import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectMemberDTO, ProjectDTO, TreeNodeDTO } from '@/types/collab'
import { zhNodeType } from '@/utils/zhLabels'
import { PALETTE, canDropPalette } from './dropRules'
import {
  CARD,
  PREVIEW,
  computeLayout,
  displayAssigneeName,
  hasLeaderOnSpine,
  isPerson,
  type WorkTreeAxis,
  type WorkTreeSort,
} from './layout'

const LEADER_DELTA_KEY = (projectId: number) => `wt_${projectId}_leaderAlongDelta`

function accentFor(typeKey: string): string {
  switch (typeKey) {
    case 'person':
      return 'rgb(0, 88, 190)'
    case 'milestone':
      return 'rgb(146, 71, 0)'
    case 'scope':
      return 'rgb(0, 108, 73)'
    default:
      return 'rgb(33, 112, 228)'
  }
}

export type WorkTreeCanvasProps = {
  project: ProjectDTO
  tree: TreeNodeDTO[]
  members: ProjectMemberDTO[]
  currentUserId: number | null
  selectedId: number | null
  loading?: boolean
  onSelect: (node: TreeNodeDTO | null) => void
  onEnsureLeader: () => Promise<void>
  onCreate: (args: {
    nodeTypeKey: string
    title: string
    parentId?: number | null
  }) => Promise<void>
  onMove: (nodeId: number, newParentId: number | null) => Promise<void>
  onPatch: (nodeId: number, patch: { title?: string; node_type_key?: string }) => Promise<void>
  onSetAssignees: (nodeId: number, userIds: number[]) => Promise<void>
  onDelete: (nodeId: number) => Promise<void>
}

export default function WorkTreeCanvas(props: WorkTreeCanvasProps) {
  const {
    project,
    tree,
    members,
    currentUserId,
    selectedId,
    loading,
    onSelect,
    onEnsureLeader,
    onCreate,
    onMove,
    onPatch,
    onSetAssignees,
    onDelete,
  } = props

  const ownerId = project.final_owner_user_id ?? project.pm_user_id
  const canDragLeader =
    currentUserId != null &&
    (currentUserId === project.pm_user_id || currentUserId === project.created_by)

  const [axis, setAxis] = useState<WorkTreeAxis>('horizontal')
  const [sort, setSort] = useState<WorkTreeSort>('tree')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [leaderDelta, setLeaderDelta] = useState(0)
  const [scale, setScale] = useState(0.85)
  const [pan, setPan] = useState({ x: 40, y: 40 })
  const [draggingPalette, setDraggingPalette] = useState<string | null>(null)
  const [draggingNodeId, setDraggingNodeId] = useState<number | null>(null)
  const [dropTargetId, setDropTargetId] = useState<number | null>(null)
  const [panelNode, setPanelNode] = useState<TreeNodeDTO | null>(null)
  const panRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const leaderDragRef = useRef<{ startX: number; startDelta: number } | null>(null)

  useEffect(() => {
    const raw = localStorage.getItem(LEADER_DELTA_KEY(project.id))
    setLeaderDelta(raw ? Number(raw) || 0 : 0)
  }, [project.id])

  const layout = useMemo(
    () =>
      computeLayout({
        roots: tree,
        axis,
        sort,
        userId: currentUserId,
        expandedNodeId: expandedId,
        finalOwnerUserId: ownerId,
        leaderAlongDelta: leaderDelta,
        visibleLevels: 8,
      }),
    [tree, axis, sort, currentUserId, expandedId, ownerId, leaderDelta],
  )

  const hasLeader = hasLeaderOnSpine(tree, ownerId)
  const selected =
    layout.placed.find((p) => p.node.id === selectedId)?.node ||
    layout.previews.find((p) => p.node.id === selectedId)?.node ||
    null

  useEffect(() => {
    if (selected) setPanelNode(selected)
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  function persistLeaderDelta(v: number) {
    const next = Math.max(0, v)
    setLeaderDelta(next)
    localStorage.setItem(LEADER_DELTA_KEY(project.id), String(next))
  }

  async function handleBlankDrop() {
    if (draggingPalette === 'person') {
      await onCreate({ nodeTypeKey: 'person', title: '未命名', parentId: null })
    }
    setDraggingPalette(null)
    setDraggingNodeId(null)
    setDropTargetId(null)
  }

  async function handlePersonDrop(ontoId: number) {
    const onto = layout.placed.find((p) => p.node.id === ontoId)
    if (!onto) return
    if (draggingPalette) {
      if (!canDropPalette(draggingPalette, 'person')) return
      const item = PALETTE.find((p) => p.nodeTypeKey === draggingPalette)
      await onCreate({
        nodeTypeKey: draggingPalette,
        title: item?.defaultTitle || '未命名',
        parentId: ontoId,
      })
    } else if (draggingNodeId != null && draggingNodeId !== ontoId) {
      await onMove(draggingNodeId, ontoId)
    }
    setDraggingPalette(null)
    setDraggingNodeId(null)
    setDropTargetId(null)
  }

  return (
    <div className="h-full flex flex-col min-h-0 bg-[rgb(248,249,250)]">
      {!hasLeader && ownerId != null && (
        <div className="flex items-center gap-3 px-3 py-2 border-b border-[rgb(225,227,228)] bg-white">
          <p className="flex-1 text-xs text-[rgb(25,28,29)]">
            主干还没有项目负责人节点
            {project.final_owner?.nickname || project.final_owner?.username
              ? `（${project.final_owner.nickname || project.final_owner.username}）`
              : ''}
            。点右侧按钮放到主干终点。
          </p>
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded-xl bg-[rgb(0,88,190)] text-white"
            onClick={() => void onEnsureLeader()}
          >
            放到终点
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-2 border-b border-[rgb(225,227,228)] bg-white text-xs">
        <button
          type="button"
          className="px-2 py-1 rounded-lg border border-[rgb(194,198,214)]"
          onClick={() => setAxis((a) => (a === 'horizontal' ? 'vertical' : 'horizontal'))}
        >
          {axis === 'horizontal' ? '横向轴' : '纵向轴'}
        </button>
        <button
          type="button"
          className="px-2 py-1 rounded-lg border border-[rgb(194,198,214)]"
          onClick={() => setSort((s) => (s === 'tree' ? 'time' : 'tree'))}
        >
          {sort === 'tree' ? '树序' : '时间序'}
        </button>
        <button
          type="button"
          className="px-2 py-1 rounded-lg border border-[rgb(194,198,214)]"
          onClick={() => setScale((s) => Math.min(1.6, s + 0.1))}
        >
          放大
        </button>
        <button
          type="button"
          className="px-2 py-1 rounded-lg border border-[rgb(194,198,214)]"
          onClick={() => setScale((s) => Math.max(0.45, s - 0.1))}
        >
          缩小
        </button>
        {canDragLeader ? (
          <span className="text-[rgb(66,71,84)]">可拖动终责沿轴位置</span>
        ) : (
          <span className="text-[rgb(66,71,84)]">终责位置仅项目 PM 可调</span>
        )}
      </div>

      <div className="flex-1 flex min-h-0">
        <aside className="w-[88px] border-r border-[rgb(225,227,228)] bg-white p-2 flex flex-col gap-2 overflow-y-auto">
          {PALETTE.map((item) => (
            <div
              key={item.nodeTypeKey}
              draggable
              onDragStart={() => setDraggingPalette(item.nodeTypeKey)}
              onDragEnd={() => setDraggingPalette(null)}
              className="cursor-grab rounded-xl border border-[rgb(194,198,214)] px-1 py-2 text-center text-[11px] bg-[rgb(243,244,245)]"
              style={{ borderLeft: `3px solid ${accentFor(item.nodeTypeKey)}` }}
            >
              {item.label}
            </div>
          ))}
        </aside>

        <div
          className="flex-1 relative overflow-hidden cursor-grab"
          onWheel={(e) => {
            e.preventDefault()
            setScale((s) => Math.min(1.8, Math.max(0.4, s - e.deltaY * 0.001)))
          }}
          onMouseDown={(e) => {
            if (e.button !== 0) return
            panRef.current = { x: pan.x, y: pan.y, px: e.clientX, py: e.clientY }
          }}
          onMouseMove={(e) => {
            if (leaderDragRef.current && canDragLeader) {
              const dx = e.clientX - leaderDragRef.current.startX
              const delta = axis === 'horizontal' ? dx / scale : (e.clientY - leaderDragRef.current.startX) / scale
              // startX reused poorly for vertical — fix:
              void delta
            }
            if (!panRef.current) return
            setPan({
              x: panRef.current.x + (e.clientX - panRef.current.px),
              y: panRef.current.y + (e.clientY - panRef.current.py),
            })
          }}
          onMouseUp={() => {
            panRef.current = null
            leaderDragRef.current = null
          }}
          onMouseLeave={() => {
            panRef.current = null
          }}
          onDragOver={(e) => {
            e.preventDefault()
          }}
          onDrop={(e) => {
            e.preventDefault()
            if (dropTargetId == null) void handleBlankDrop()
          }}
        >
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-[rgb(66,71,84)]">
              加载中…
            </div>
          ) : null}
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: '0 0',
              width: layout.contentBounds.w,
              height: layout.contentBounds.h,
              position: 'relative',
            }}
          >
            <svg
              className="absolute inset-0 pointer-events-none"
              width={layout.contentBounds.w}
              height={layout.contentBounds.h}
            >
              <line
                x1={layout.axisStart.x}
                y1={layout.axisStart.y}
                x2={layout.axisEnd.x}
                y2={layout.axisEnd.y}
                stroke="rgba(0,88,190,0.25)"
                strokeWidth={14}
                strokeLinecap="round"
              />
              <line
                x1={layout.axisStart.x}
                y1={layout.axisStart.y}
                x2={layout.axisEnd.x}
                y2={layout.axisEnd.y}
                stroke="rgb(0,88,190)"
                strokeWidth={5.5}
                strokeLinecap="round"
              />
              {layout.placed.map((p) => {
                if (p.isOrigin) return null
                const joint =
                  axis === 'vertical'
                    ? { x: layout.axisStart.x, y: p.center.y }
                    : { x: p.center.x, y: layout.axisStart.y }
                const mx = (joint.x + p.center.x) / 2
                const my = (joint.y + p.center.y) / 2
                return (
                  <g key={`b-${p.node.id}`}>
                    <path
                      d={
                        axis === 'vertical'
                          ? `M ${joint.x} ${joint.y} C ${mx} ${joint.y}, ${mx} ${p.center.y}, ${p.center.x} ${p.center.y}`
                          : `M ${joint.x} ${joint.y} C ${joint.x} ${my}, ${p.center.x} ${my}, ${p.center.x} ${p.center.y}`
                      }
                      fill="none"
                      stroke="rgba(0,88,190,0.55)"
                      strokeWidth={2.2}
                    />
                    <circle cx={joint.x} cy={joint.y} r={4.5} fill="rgb(0,88,190)" />
                    <circle cx={joint.x} cy={joint.y} r={2} fill="#fff" />
                  </g>
                )
              })}
              {layout.placed.some((p) => p.isOrigin) ? (
                <>
                  <circle
                    cx={layout.axisEnd.x}
                    cy={layout.axisEnd.y}
                    r={22}
                    fill="rgba(0,88,190,0.16)"
                  />
                  <circle
                    cx={layout.axisEnd.x}
                    cy={layout.axisEnd.y}
                    r={12}
                    fill="rgba(0,88,190,0.28)"
                  />
                </>
              ) : (
                <circle cx={layout.axisEnd.x} cy={layout.axisEnd.y} r={5.5} fill="rgba(0,88,190,0.7)" />
              )}
              {layout.globalMarks.map((m) =>
                m.onAxis ? (
                  <g key={`t-${m.nodeId}`}>
                    <rect
                      x={m.onAxis.x - 5}
                      y={m.onAxis.y - 5}
                      width={10}
                      height={10}
                      fill="#fff"
                      stroke="rgb(114,119,133)"
                      strokeWidth={1.5}
                      transform={`rotate(45 ${m.onAxis.x} ${m.onAxis.y})`}
                    />
                    <text
                      x={m.onAxis.x + 10}
                      y={m.onAxis.y - 8}
                      fontSize={10}
                      fill="rgb(66,71,84)"
                    >
                      {m.at.toISOString().slice(0, 10)}
                    </text>
                  </g>
                ) : null,
              )}
            </svg>

            {layout.placed.map((p) => {
              const hot = dropTargetId === p.node.id
              return (
                <div
                  key={p.node.id}
                  draggable={!p.isOrigin}
                  onDragStart={() => setDraggingNodeId(p.node.id)}
                  onDragEnd={() => {
                    setDraggingNodeId(null)
                    setDropTargetId(null)
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setDropTargetId(p.node.id)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    void handlePersonDrop(p.node.id)
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelect(p.node)
                    setPanelNode(p.node)
                  }}
                  onMouseDown={(e) => {
                    if (!p.isOrigin || !canDragLeader) return
                    e.stopPropagation()
                    leaderDragRef.current = {
                      startX: axis === 'horizontal' ? e.clientX : e.clientY,
                      startDelta: leaderDelta,
                    }
                    const onMove = (ev: MouseEvent) => {
                      if (!leaderDragRef.current) return
                      const cur = axis === 'horizontal' ? ev.clientX : ev.clientY
                      const d = (cur - leaderDragRef.current.startX) / scale
                      persistLeaderDelta(leaderDragRef.current.startDelta + d)
                    }
                    const onUp = () => {
                      leaderDragRef.current = null
                      window.removeEventListener('mousemove', onMove)
                      window.removeEventListener('mouseup', onUp)
                    }
                    window.addEventListener('mousemove', onMove)
                    window.addEventListener('mouseup', onUp)
                  }}
                  className="absolute rounded-2xl bg-white shadow-sm flex items-stretch overflow-hidden cursor-pointer"
                  style={{
                    width: CARD.w,
                    height: CARD.h,
                    left: p.center.x - CARD.w / 2,
                    top: p.center.y - CARD.h / 2,
                    border: `${hot || selectedId === p.node.id || p.isOrigin ? 2.4 : 1}px solid ${
                      p.isOrigin ? 'rgb(0,88,190)' : accentFor('person')
                    }`,
                    boxShadow: p.isOrigin
                      ? '0 0 0 4px rgba(0,88,190,0.12)'
                      : '0 6px 16px rgba(0,0,0,0.06)',
                  }}
                >
                  <div
                    className="w-2.5 shrink-0"
                    style={{ background: p.isOrigin ? 'rgb(0,88,190)' : accentFor('person') }}
                  />
                  <div className="flex-1 px-2.5 py-2 min-w-0">
                    <div className="flex items-center gap-1">
                      {p.isOrigin && (
                        <span className="text-[10px] font-bold text-[rgb(0,88,190)] bg-[rgba(0,88,190,0.12)] px-1.5 py-0.5 rounded">
                          终责
                        </span>
                      )}
                      <span className="text-[13px] font-bold text-[rgb(25,28,29)] truncate">
                        {p.node.title}
                      </span>
                    </div>
                    <div className="text-[11px] text-[rgb(66,71,84)] mt-2 truncate">
                      {displayAssigneeName(p.node)}
                    </div>
                    {selectedId === p.node.id && isPerson(p.node) && (
                      <div className="absolute -right-3 top-1/2 -translate-y-1/2 flex flex-col gap-1">
                        {PALETTE.map((item) => (
                          <button
                            key={item.nodeTypeKey}
                            type="button"
                            title={`添加${item.label}`}
                            className="w-6 h-6 rounded-full bg-[rgb(0,88,190)] text-white text-sm leading-none"
                            onClick={(e) => {
                              e.stopPropagation()
                              void onCreate({
                                nodeTypeKey: item.nodeTypeKey,
                                title: item.defaultTitle,
                                parentId: p.node.id,
                              })
                            }}
                          >
                            +
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {layout.previews.map((p) => (
              <div
                key={`pv-${p.node.id}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect(p.node)
                  setPanelNode(p.node)
                  if (p.overflowCount > 0) setExpandedId(p.parentPersonId)
                }}
                className="absolute rounded-xl bg-white border border-[rgb(194,198,214)] px-2 py-1.5 cursor-pointer"
                style={{
                  width: PREVIEW.w,
                  height: PREVIEW.h,
                  left: p.center.x - PREVIEW.w / 2,
                  top: p.center.y - PREVIEW.h / 2,
                  borderLeft: `3px solid ${accentFor(p.node.node_type_key)}`,
                }}
              >
                <div className="text-[11px] font-semibold truncate text-[rgb(25,28,29)]">
                  {p.node.title}
                </div>
                <div className="text-[10px] text-[rgb(66,71,84)]">
                  {zhNodeType(p.node.node_type_key)}
                  {p.overflowCount > 0 ? ` · +${p.overflowCount}` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>

        {panelNode && (
          <PropertyPanel
            node={panelNode}
            members={members}
            onClose={() => setPanelNode(null)}
            onPatch={onPatch}
            onSetAssignees={onSetAssignees}
            onDelete={async (id) => {
              await onDelete(id)
              setPanelNode(null)
              onSelect(null)
            }}
          />
        )}
      </div>
    </div>
  )
}

function PropertyPanel(props: {
  node: TreeNodeDTO
  members: ProjectMemberDTO[]
  onClose: () => void
  onPatch: WorkTreeCanvasProps['onPatch']
  onSetAssignees: WorkTreeCanvasProps['onSetAssignees']
  onDelete: (id: number) => Promise<void>
}) {
  const { node, members, onClose, onPatch, onSetAssignees, onDelete } = props
  const [title, setTitle] = useState(node.title)
  const [typeKey, setTypeKey] = useState(node.node_type_key)
  const primary = node.assignees?.find((a) => a.role_key === 'primary') || node.assignees?.[0]
  const [assigneeId, setAssigneeId] = useState<number | ''>(primary?.user_id ?? '')

  useEffect(() => {
    setTitle(node.title)
    setTypeKey(node.node_type_key)
    const p = node.assignees?.find((a) => a.role_key === 'primary') || node.assignees?.[0]
    setAssigneeId(p?.user_id ?? '')
  }, [node])

  return (
    <aside className="w-72 border-l border-[rgb(225,227,228)] bg-white p-3 overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold">节点属性</h3>
        <button type="button" className="text-xs text-[rgb(66,71,84)]" onClick={onClose}>
          关闭
        </button>
      </div>
      <label className="block text-xs text-[rgb(66,71,84)] mb-1">标题</label>
      <input
        className="w-full border rounded-lg px-2 py-1.5 text-sm mb-3 border-[rgb(194,198,214)]"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          if (title.trim() && title.trim() !== node.title) {
            void onPatch(node.id, { title: title.trim() })
          }
        }}
      />
      <label className="block text-xs text-[rgb(66,71,84)] mb-1">类型</label>
      <select
        className="w-full border rounded-lg px-2 py-1.5 text-sm mb-3 border-[rgb(194,198,214)]"
        value={typeKey}
        onChange={(e) => {
          const v = e.target.value
          setTypeKey(v)
          void onPatch(node.id, { node_type_key: v })
        }}
      >
        {PALETTE.map((p) => (
          <option key={p.nodeTypeKey} value={p.nodeTypeKey}>
            {p.label}
          </option>
        ))}
      </select>
      {isPerson(node) && (
        <>
          <label className="block text-xs text-[rgb(66,71,84)] mb-1">负责人</label>
          <select
            className="w-full border rounded-lg px-2 py-1.5 text-sm mb-3 border-[rgb(194,198,214)]"
            value={assigneeId}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : ''
              setAssigneeId(v)
              void onSetAssignees(node.id, v === '' ? [] : [v])
            }}
          >
            <option value="">未指定</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name || m.nickname || m.username || `用户${m.user_id}`}
              </option>
            ))}
          </select>
        </>
      )}
      <button
        type="button"
        className="w-full text-sm py-2 rounded-xl border border-[rgb(186,26,26)] text-[rgb(186,26,26)]"
        onClick={() => {
          if (window.confirm('确认删除该节点？')) void onDelete(node.id)
        }}
      >
        删除节点
      </button>
    </aside>
  )
}
