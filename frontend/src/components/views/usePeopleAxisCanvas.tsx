import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Edge } from '@xyflow/react'
import type { PeopleAxisNode, Language } from '../../types'
import {
  computeAxisLayout,
  collectHiddenNodeIds,
  FOLDED_ROW_H_MOBILE,
  type AxisOrientation,
} from './peopleAxisFlowLayout'
import {
  axisMemberIds, revealAncestors, pulledSubtree, loadPulled, savePulled, type AxisFoldSpec,
} from './peopleAxisFold'
import { pickUiOffset } from '../../api/mappers'
import { moveNode } from '../../api/backend'
import { putNodeLayout, type MyProjectPermissions } from '../../api/shell'
import type { AxisFlowNode, PersonNodeData } from './PeopleAxisFlowCanvas'

type Offset = { x: number; y: number }
type OffsetMap = Record<string, Offset>
/** 两个方向各存一份偏移；这是偏移的唯一来源（不再就地改 nodes 里的对象） */
type OffsetsByDir = Record<AxisOrientation, OffsetMap>

const EMPTY_OFFSETS: OffsetsByDir = { horizontal: {}, vertical: {} }
const ZERO: Offset = { x: 0, y: 0 }

function asBackendId(id: string): number | null {
  const n = Number(id)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** 自己是 primary/collaborator 责任人的节点及其全部后代（与服务端 _owns_path 同口径） */
export function computeEditableNodeIds(
  nodes: PeopleAxisNode[],
  isBackendProject: boolean,
  serverPerms: MyProjectPermissions | null | undefined,
  userId: number | null | undefined,
): Set<string> {
  const set = new Set<string>()
  if (!isBackendProject) return set
  const ownedFromServer = serverPerms ? new Set(serverPerms.owned_node_ids.map(String)) : null
  if (!ownedFromServer && userId == null) return set
  const childrenMap = new Map<string, string[]>()
  nodes.forEach(n => {
    if (!n.parentId) return
    childrenMap.set(n.parentId, [...(childrenMap.get(n.parentId) || []), n.id])
  })
  const queue = nodes
    .filter(n => (ownedFromServer ? ownedFromServer.has(n.id) : (n.ownerUserIds || []).includes(userId!)))
    .map(n => n.id)
  while (queue.length) {
    const id = queue.pop()!
    if (set.has(id)) continue
    set.add(id)
    ;(childrenMap.get(id) || []).forEach(c => queue.push(c))
  }
  return set
}

/** 按节点判定「加下级 / 加事项 / 交材料」权限；服务端 node_permissions 优先，回退客户端推断 */
export function makeNodeCapabilityCheckers(
  serverPerms: MyProjectPermissions | null | undefined,
  canEditAny: boolean,
  editableNodeIds: Set<string>,
) {
  return {
    canAddSubordinate: (id: string) =>
      serverPerms?.node_permissions
        ? !!serverPerms.node_permissions[id]?.can_add_subordinate
        : canEditAny || editableNodeIds.has(id),
    canAddWorkItem: (id: string) =>
      serverPerms?.node_permissions
        ? !!serverPerms.node_permissions[id]?.can_add_work_item
        : canEditAny || editableNodeIds.has(id),
    canSubmitEvidence: (id: string) =>
      serverPerms?.node_permissions
        ? !!serverPerms.node_permissions[id]?.can_submit_evidence
        : !!serverPerms?.can_submit_evidence,
  }
}

function isDescendantNode(all: PeopleAxisNode[], ancestorId: string, targetId: string): boolean {
  if (ancestorId === targetId) return true
  return all.filter(n => n.parentId === ancestorId).some(c => isDescendantNode(all, c.id, targetId))
}

export interface UsePeopleAxisCanvasOptions {
  nodes: PeopleAxisNode[]
  /** 参与布局与连线的节点（缺省等于 nodes）；「只看我的」范围时为 nodes 的子集 */
  scopedNodes?: PeopleAxisNode[]
  orientation: AxisOrientation
  edgeStyle?: 'curve' | 'straight'
  lang?: Language
  mobile?: boolean
  isBackendProject?: boolean
  backendProjectId?: number | null
  serverPerms?: MyProjectPermissions | null
  currentUserId?: number | null
  /** 数据重新载入的版本号：变化时重新读取节点里的偏移；缺省则 nodes 引用变化时读取 */
  seedKey?: unknown
  selectedNodeId?: string | null
  /** 「我」的节点集合；缺省按 currentUserId 与 ownerUserIds 推断 */
  mineNodeIds?: Set<string>
  /** 范围之外、只作上下文显示的节点集合 */
  scopeContextNodeIds?: Set<string>
  /** 「项目全貌」：只把根、被拉到人轴的人和我的上级画成卡片，其余直属下属折叠在领导下方 */
  foldSubordinates?: boolean
  onSelectNode?: (nodeId: string | null) => void
  onAddChild?: (parentId: string) => void
  onAddWorkItem?: (nodeId: string) => void
  onEditPerson?: (nodeId: string) => void
  onReloadAxis?: () => Promise<void>
  onShowToast?: (message: string) => void
  onSyncStatus?: (status: 'syncing' | 'synced') => void
  canEditAny?: boolean
  canMoveNodes?: boolean
  editableNodeIds?: Set<string>
}

/**
 * 人轴画布的唯一实现：电脑网页（PeopleAxisView）与手机网页（MobileAxisScreens）共用。
 * 负责布局、节点/连线构建、按方向独立的拖动偏移（保存串行化、失败回滚、重置）、
 * 拖放/连线换上级及确认。
 */
export function usePeopleAxisCanvas(options: UsePeopleAxisCanvasOptions) {
  const {
    nodes,
    orientation,
    edgeStyle = 'curve',
    lang = 'zh',
    mobile = false,
    isBackendProject = true,
    backendProjectId,
    serverPerms,
    currentUserId,
    seedKey,
    selectedNodeId,
    canEditAny: canEditAnyProp,
    canMoveNodes: canMoveNodesProp,
    editableNodeIds: editableNodeIdsProp,
  } = options
  const scopedNodes = options.scopedNodes ?? nodes
  const zh = lang === 'zh'

  // 回调类选项走 ref，避免调用方每次渲染传新函数导致节点数据反复重建
  const cb = useRef(options)
  cb.current = options
  const toast = useCallback((m: string) => cb.current.onShowToast?.(m), [])

  const activeProjectRef = useRef<number | null>(backendProjectId ?? null)
  activeProjectRef.current = backendProjectId ?? null

  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({})
  const foldOn = options.foldSubordinates === true
  const expandedNodesRef = useRef(expandedNodes)
  expandedNodesRef.current = expandedNodes
  const [linkingSourceNodeId, setLinkingSourceNodeId] = useState<string | null>(null)
  const [linkingHoveredTargetId, setLinkingHoveredTargetId] = useState<string | null>(null)
  const [reparentConfirm, setReparentConfirm] = useState<{
    sourceId: string
    targetId: string
    sourceName: string
    targetName: string
  } | null>(null)

  // ===== 偏移：唯一来源 =====
  const [offsetsByDir, setOffsetsByDirState] = useState<OffsetsByDir>(EMPTY_OFFSETS)
  const offsetsRef = useRef<OffsetsByDir>(EMPTY_OFFSETS)
  const commitOffsets = useCallback((update: (prev: OffsetsByDir) => OffsetsByDir) => {
    const next = update(offsetsRef.current)
    offsetsRef.current = next
    setOffsetsByDirState(next)
  }, [])
  const setOffset = useCallback((dir: AxisOrientation, id: string, off: Offset | null) => {
    commitOffsets(prev => {
      const map = { ...prev[dir] }
      if (off) map[id] = off
      else delete map[id]
      return { ...prev, [dir]: map }
    })
  }, [commitOffsets])

  const layoutSavesRef = useRef(new Map<number, Promise<unknown>>())
  /** 最近一次保存成功（或载入）的偏移，按「节点|方向」记，失败回滚用 */
  const savedOffsetsRef = useRef(new Map<string, Offset>())
  const savedKey = (backendId: number, dir: AxisOrientation) => `${backendId}|${dir}`

  const seedDep = seedKey === undefined ? nodes : seedKey
  useEffect(() => {
    const h: OffsetMap = {}
    const v: OffsetMap = {}
    nodes.forEach(n => {
      const backendId = asBackendId(n.id)
      // 有保存请求在途的节点保留本地值，避免被旧数据覆盖
      if (backendId != null && layoutSavesRef.current.has(backendId)) {
        if (offsetsRef.current.horizontal[n.id]) h[n.id] = offsetsRef.current.horizontal[n.id]
        if (offsetsRef.current.vertical[n.id]) v[n.id] = offsetsRef.current.vertical[n.id]
        return
      }
      const hOff = pickUiOffset(n, 'horizontal')
      const vOff = pickUiOffset(n, 'vertical')
      if (hOff.x !== 0 || hOff.y !== 0) h[n.id] = hOff
      if (vOff.x !== 0 || vOff.y !== 0) v[n.id] = vOff
      if (backendId != null) {
        savedOffsetsRef.current.set(savedKey(backendId, 'horizontal'), hOff)
        savedOffsetsRef.current.set(savedKey(backendId, 'vertical'), vOff)
      }
    })
    commitOffsets(() => ({ horizontal: h, vertical: v }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedDep])

  const dragOffsets = offsetsByDir[orientation]

  // ===== 下属默认折叠：拉出集合按「用户 id + 项目 id」存本机，展开行只在内存 =====
  type FoldState = { key: string; pulled: Set<string>; rows: Set<string> }
  const foldKey = `${currentUserId ?? ''}:${backendProjectId ?? ''}`
  const [foldStored, setFoldStored] = useState<FoldState>(
    () => ({ key: foldKey, pulled: loadPulled(currentUserId, backendProjectId), rows: new Set() }),
  )
  let fold = foldStored
  if (foldStored.key !== foldKey) {
    // 换用户或换项目：重新读本机，旧的展开行作废
    fold = { key: foldKey, pulled: loadPulled(currentUserId, backendProjectId), rows: new Set() }
    setFoldStored(fold)
  }
  const foldRef = useRef(fold)
  foldRef.current = fold
  const pulledIds = fold.pulled
  const expandedRows = fold.rows

  const selfNodeId = useMemo(() => {
    if (!foldOn) return null
    const mine = options.mineNodeIds
    const found = scopedNodes.find(n => mine
      ? mine.has(n.id)
      : currentUserId != null && (n.ownerUserIds || []).includes(currentUserId))
    return found?.id ?? null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foldOn, scopedNodes, options.mineNodeIds, currentUserId])
  const foldSpec = useMemo<AxisFoldSpec | undefined>(
    () => (foldOn ? { pulled: pulledIds, expandedRows, selfNodeId, rowHeight: mobile ? FOLDED_ROW_H_MOBILE : undefined } : undefined),
    [foldOn, pulledIds, expandedRows, selfNodeId, mobile],
  )
  const axisMembers = useMemo(
    () => (foldSpec ? axisMemberIds(scopedNodes, foldSpec) : null),
    [foldSpec, scopedNodes],
  )
  /** 我的所有上级：默认上轴，不提供「收回」 */
  const selfAncestorIds = useMemo(
    () => new Set(foldOn && selfNodeId ? revealAncestors(scopedNodes, selfNodeId) : []),
    [foldOn, selfNodeId, scopedNodes],
  )

  const updateFold = useCallback((change: (cur: FoldState) => { pulled?: Set<string>; rows?: Set<string> }) => {
    const cur = foldRef.current
    const patch = change(cur)
    const next: FoldState = { key: cur.key, pulled: patch.pulled ?? cur.pulled, rows: patch.rows ?? cur.rows }
    foldRef.current = next
    setFoldStored(next)
    if (patch.pulled) savePulled(cb.current.currentUserId, cb.current.backendProjectId, patch.pulled)
  }, [])

  const toggleFoldedRow = useCallback((id: string) => {
    updateFold(cur => {
      const rows = new Set(cur.rows)
      if (!rows.delete(id)) rows.add(id)
      return { rows }
    })
  }, [updateFold])

  const pullToAxis = useCallback((id: string) => {
    updateFold(cur => {
      const rows = new Set(cur.rows)
      rows.delete(id)
      return { pulled: new Set(cur.pulled).add(id), rows }
    })
  }, [updateFold])

  // 收回 / 全部拉到人轴 / 恢复默认折叠会大幅改变画面：计数变化时画布等节点量好后自动适应
  const [foldFitSeq, setFoldFitSeq] = useState(0)
  const requestFoldFit = useCallback(() => setFoldFitSeq(n => n + 1), [])

  const returnFromAxis = useCallback((id: string) => {
    requestFoldFit()
    updateFold(cur => {
      const drop = pulledSubtree(cb.current.scopedNodes ?? cb.current.nodes, id, cur.pulled)
      const pulled = new Set([...cur.pulled].filter(x => !drop.has(x)))
      const rows = new Set([...cur.rows].filter(x => !drop.has(x)))
      return { pulled, rows }
    })
  }, [updateFold, requestFoldFit])

  const pullAllToAxis = useCallback(() => {
    requestFoldFit()
    updateFold(() => ({ pulled: new Set(cb.current.nodes.map(n => n.id)), rows: new Set() }))
  }, [updateFold, requestFoldFit])

  const resetFold = useCallback(() => {
    requestFoldFit()
    updateFold(() => ({ pulled: new Set(), rows: new Set() }))
  }, [updateFold, requestFoldFit])

  /** 定位到未上轴的人：把他所有上级拉出并保存，再展开他这一行。返回画面是否有变化 */
  const revealPerson = useCallback((id: string): boolean => {
    if (!foldOn) return false
    const all = cb.current.scopedNodes ?? cb.current.nodes
    if (!all.some(n => n.id === id)) return false
    let changed = false
    const cur = foldRef.current
    const ancestors = revealAncestors(all, id)
    const members = axisMemberIds(all, { pulled: cur.pulled, expandedRows: cur.rows, selfNodeId })
    const row = all.find(n => n.id === id)
    const alreadyShown = members.has(id) || (!!row?.parentId && members.has(row.parentId) && cur.rows.has(id))
    if (!alreadyShown) {
      updateFold(c => {
        const pulled = new Set(c.pulled)
        ancestors.forEach(a => { if (!members.has(a)) pulled.add(a) })
        return { pulled, rows: new Set(c.rows).add(id) }
      })
      changed = true
    }
    // 被「下属 n」收起的上级要展开，目标才看得见
    const collapsed = ancestors.filter(a => expandedNodesRef.current[a] === false)
    if (collapsed.length) {
      setExpandedNodes(prev => ({ ...prev, ...Object.fromEntries(collapsed.map(a => [a, true])) }))
      changed = true
    }
    return changed
  }, [foldOn, selfNodeId, updateFold])

  const toggleExpandNode = useCallback((nodeId: string) => {
    setExpandedNodes(prev => ({ ...prev, [nodeId]: prev[nodeId] === false }))
  }, [])

  // ===== 权限 =====
  const canEditAny = useMemo(() => {
    if (canEditAnyProp !== undefined) return canEditAnyProp
    if (!isBackendProject) return false
    return serverPerms ? Boolean(serverPerms.can_edit_all) : false
  }, [canEditAnyProp, isBackendProject, serverPerms])

  const canMoveNodes = canMoveNodesProp !== undefined
    ? canMoveNodesProp
    : serverPerms ? Boolean(serverPerms.can_move) : canEditAny

  const editableNodeIds = useMemo(
    () => editableNodeIdsProp ?? computeEditableNodeIds(nodes, isBackendProject, serverPerms, currentUserId),
    [editableNodeIdsProp, nodes, isBackendProject, serverPerms, currentUserId],
  )

  const caps = useMemo(
    () => makeNodeCapabilityCheckers(serverPerms, canEditAny, editableNodeIds),
    [serverPerms, canEditAny, editableNodeIds],
  )

  // ===== 保存（同一节点串行，前一个失败不影响后一个） =====
  const saveNodeOffset = useCallback((nodeId: number, offset: Offset, dir: AxisOrientation) => {
    const pending = (layoutSavesRef.current.get(nodeId) || Promise.resolve())
      .catch(() => undefined)
      .then(() => putNodeLayout(nodeId, offset, dir))
      .then(result => {
        savedOffsetsRef.current.set(savedKey(nodeId, dir), offset)
        return result
      })
    layoutSavesRef.current.set(nodeId, pending)
    const clear = () => {
      if (layoutSavesRef.current.get(nodeId) === pending) layoutSavesRef.current.delete(nodeId)
    }
    void pending.then(clear, clear)
    return pending
  }, [])

  // ===== 布局 =====
  const layout = useMemo(
    () => computeAxisLayout(scopedNodes, orientation, expandedNodes, foldSpec),
    [scopedNodes, orientation, expandedNodes, foldSpec],
  )
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  const hiddenNodeIds = useMemo(() => collectHiddenNodeIds(nodes, expandedNodes), [nodes, expandedNodes])

  const headLeaderId = useMemo(
    () => nodes.filter(n => !n.parentId).sort((a, b) => a.orderOnAxis - b.orderOnAxis)[0]?.id ?? null,
    [nodes],
  )

  // ===== 拖动结束：换算偏移、写入当前方向、落盘 =====
  const handleNodeDragStop = useCallback((id: string, position: Offset) => {
    if (!isBackendProject || (!canEditAny && !editableNodeIds.has(id))) return
    const base = layoutRef.current.positions.get(id)
    if (!base) return
    const dir = orientation
    const off = { x: position.x - base.x, y: position.y - base.y }
    setOffset(dir, id, off)

    const backendId = asBackendId(id)
    if (backendId == null) return
    const projectAtSave = activeProjectRef.current
    void saveNodeOffset(backendId, off, dir).catch(error => {
      if (activeProjectRef.current !== projectAtSave) return
      const cur = offsetsRef.current[dir][id]
      // 已有更新的拖动时不回滚
      if (!cur || cur.x !== off.x || cur.y !== off.y) return
      setOffset(dir, id, savedOffsetsRef.current.get(savedKey(backendId, dir)) || ZERO)
      toast(error instanceof Error ? error.message : zh ? '位置保存失败' : 'Position could not be saved')
    })
  }, [isBackendProject, canEditAny, editableNodeIds, orientation, setOffset, saveNodeOffset, toast, zh])

  // ===== 重置当前方向的偏移 =====
  const resetAllDragOffsets = useCallback(() => {
    const dir = orientation
    const retained: OffsetMap = {}
    if (isBackendProject) {
      const current = offsetsRef.current[dir]
      Object.keys(current).forEach(id => {
        const off = current[id]
        // 无权节点保留，避免 403 后界面与服务端不一致
        if (!canEditAny && !editableNodeIds.has(id)) {
          retained[id] = off
          return
        }
        if (!off || (off.x === 0 && off.y === 0)) return
        const backendId = asBackendId(id)
        if (backendId == null) return
        const projectAtSave = activeProjectRef.current
        void saveNodeOffset(backendId, ZERO, dir).catch(error => {
          if (activeProjectRef.current !== projectAtSave) return
          if (offsetsRef.current[dir][id]) return
          setOffset(dir, id, savedOffsetsRef.current.get(savedKey(backendId, dir)) || ZERO)
          toast(error instanceof Error ? error.message : zh ? '位置重置失败' : 'Layout reset failed')
        })
      })
    }
    // 聚合只读视图只清本地
    commitOffsets(prev => ({ ...prev, [dir]: retained }))
  }, [isBackendProject, orientation, canEditAny, editableNodeIds, saveNodeOffset, setOffset, commitOffsets, toast, zh])

  // ===== 换上级 =====
  const executeReparent = useCallback(async (sourceId: string, targetId: string) => {
    if (!isBackendProject) return
    const sourceNode = nodes.find(n => n.id === sourceId)
    const targetNode = nodes.find(n => n.id === targetId)
    const src = asBackendId(sourceId)
    const tgt = asBackendId(targetId)
    if (src == null || tgt == null) {
      toast(zh ? '节点尚未同步到后端，无法挂载' : 'Node not on backend')
      return
    }
    try {
      cb.current.onSyncStatus?.('syncing')
      await moveNode(src, { new_parent_id: tgt, sort_order: 0 })
      // 后端 move_node 已清掉两个方向的偏移，前端只清本地，不再回写
      commitOffsets(prev => {
        const horizontal = { ...prev.horizontal }
        const vertical = { ...prev.vertical }
        delete horizontal[sourceId]
        delete vertical[sourceId]
        return { horizontal, vertical }
      })
      savedOffsetsRef.current.set(savedKey(src, 'horizontal'), ZERO)
      savedOffsetsRef.current.set(savedKey(src, 'vertical'), ZERO)
      setExpandedNodes(prev => ({ ...prev, [targetId]: true }))
      setLinkingSourceNodeId(null)
      setLinkingHoveredTargetId(null)
      await cb.current.onReloadAxis?.()
      toast(
        zh
          ? `已将【${sourceNode?.person.name || ''}】挂载到【${targetNode?.person.name || ''}】`
          : `Attached ${sourceNode?.person.name} under ${targetNode?.person.name}`,
      )
    } catch (err) {
      toast(err instanceof Error ? err.message : zh ? '挂载失败' : 'Failed to move node')
      cb.current.onSyncStatus?.('synced')
    }
  }, [isBackendProject, nodes, commitOffsets, toast, zh])

  const handleRequestReparent = useCallback((sourceId: string, targetId: string) => {
    const sourceNode = nodes.find(n => n.id === sourceId)
    const targetNode = nodes.find(n => n.id === targetId)
    if (!sourceNode || !targetNode) return
    setReparentConfirm({
      sourceId,
      targetId,
      sourceName: sourceNode.person.name,
      targetName: targetNode.person.name,
    })
  }, [nodes])

  const handleConfirmReparent = useCallback(async () => {
    if (!reparentConfirm) return
    const { sourceId, targetId } = reparentConfirm
    setReparentConfirm(null)
    await executeReparent(sourceId, targetId)
  }, [reparentConfirm, executeReparent])

  const handleCancelReparent = useCallback(() => {
    setReparentConfirm(null)
    setLinkingSourceNodeId(null)
    setLinkingHoveredTargetId(null)
  }, [])

  // 连线模式下点目标卡片（拖放之外的备用路径）
  const handleConnectToTarget = useCallback((targetNodeId: string) => {
    if (!linkingSourceNodeId || linkingSourceNodeId === targetNodeId) return
    if (isBackendProject && !canMoveNodes) {
      toast(zh ? '连线（改挂上级）仅项目 PM 可用' : 'Re-linking requires the project PM')
      return
    }
    if (isDescendantNode(nodes, linkingSourceNodeId, targetNodeId)) {
      toast(zh ? '⚠️ 不能挂载到自己的下属节点上（防止死循环）！' : 'Cannot attach to descendant node!')
      return
    }
    const sourceNode = nodes.find(n => n.id === linkingSourceNodeId)
    const targetNode = nodes.find(n => n.id === targetNodeId)
    if (sourceNode?.nodeOrigin !== 'subordinate' && targetNode?.nodeOrigin === 'subordinate') {
      toast(zh ? '项目成员不能挂到下级自建人员下面' : 'Project members cannot be assigned under self-added personnel')
      return
    }
    handleRequestReparent(linkingSourceNodeId, targetNodeId)
  }, [linkingSourceNodeId, isBackendProject, canMoveNodes, nodes, handleRequestReparent, toast, zh])

  // ===== 构建画布节点 =====
  const rfNodes = useMemo<AxisFlowNode[]>(() => {
    const mineIds = options.mineNodeIds
    const contextIds = options.scopeContextNodeIds
    const nodeById = new Map(nodes.map(n => [n.id, n]))
    const childCounts = new Map<string, number>()
    nodes.forEach(n => {
      if (n.parentId) childCounts.set(n.parentId, (childCounts.get(n.parentId) || 0) + 1)
    })
    const list: AxisFlowNode[] = []
    // 折叠成员由领导节点带出（父节点必须排在子节点之前），这里不再单独输出
    const stacked = new Set<string>()
    layout.stacks.forEach(entries => entries.forEach(e => stacked.add(e.memberId)))
    const buildData = (n: PeopleAxisNode): PersonNodeData => {
      const data: PersonNodeData = {
        node: n,
        lang,
        level: layout.levels.get(n.id) || 1,
        isMine: mineIds
          ? mineIds.has(n.id)
          : currentUserId != null && (n.ownerUserIds || []).includes(currentUserId),
        isScopeContext: contextIds ? contextIds.has(n.id) : false,
        isOverallLeader: headLeaderId === n.id,
        isMainAxisLeader: !n.parentId,
        isSelected: selectedNodeId === n.id,
        isExpanded: expandedNodes[n.id] ?? true,
        childCount: childCounts.get(n.id) || 0,
        linkingActive: linkingSourceNodeId !== null,
        isLinkingSource: linkingSourceNodeId === n.id,
        isLinkingTarget:
          linkingSourceNodeId !== null &&
          linkingHoveredTargetId === n.id &&
          linkingSourceNodeId !== n.id,
        canEdit: canEditAny || editableNodeIds.has(n.id),
        canAddSubordinate: caps.canAddSubordinate(n.id),
        canAddWorkItem: caps.canAddWorkItem(n.id),
        canSubmitEvidence: caps.canSubmitEvidence(n.id) || n.workItems.some(item => caps.canSubmitEvidence(item.id)),
        evidenceItemPermissions: Object.fromEntries(n.workItems.map(item => [item.id, caps.canSubmitEvidence(item.id)])),
        canReadEvidence: !!serverPerms?.can_read_evidence,
        orientation,
        mobile,
        canRelink: canMoveNodes,
        onCardClick: id => {
          if (linkingSourceNodeId) {
            if (id !== linkingSourceNodeId) handleConnectToTarget(id)
          } else {
            cb.current.onSelectNode?.(id)
          }
        },
        onToggleExpand: toggleExpandNode,
        onAddWorkItem: id => {
          if (!caps.canAddWorkItem(id)) {
            toast(zh ? '只能给自己负责的节点挂载事项' : 'You can only attach items under nodes you own')
            return
          }
          cb.current.onAddWorkItem?.(id)
        },
        onAddChild: id => {
          if (!isBackendProject) {
            toast(zh ? '聚合视图只读：请先在上方横幅选择要编辑的项目' : 'Select a concrete project first')
            return
          }
          if (!caps.canAddSubordinate(id)) {
            toast(zh ? '只能在自己负责的节点下挂载下属' : 'You can only mount under nodes you own')
            return
          }
          cb.current.onAddChild?.(id)
        },
        onEditPerson: id => {
          if (!isBackendProject || (!canEditAny && !editableNodeIds.has(id))) return
          cb.current.onEditPerson?.(id)
        },
        onToggleLinking: id => {
          if (!canMoveNodes) {
            toast(zh ? '连线（改挂上级）仅项目 PM 可用' : 'Re-linking requires the project PM')
            return
          }
          if (linkingSourceNodeId === id) {
            setLinkingSourceNodeId(null)
            setLinkingHoveredTargetId(null)
            toast(zh ? '已取消连线操作' : 'Cancelled linking')
          } else {
            setLinkingSourceNodeId(id)
            toast(
              zh
                ? `🔗 连线模式已激活：点击目标卡片将【${n.person.name}】挂载过去`
                : 'Linking active: click a target card',
            )
          }
        },
        onHoverTarget: setLinkingHoveredTargetId,
        canReturn: foldOn && !!n.parentId && !!axisMembers?.has(n.id)
          && pulledIds.has(n.id) && !selfAncestorIds.has(n.id),
        footprintHeight: layout.footprints.get(n.id)?.height,
        onToggleRow: toggleFoldedRow,
        onPull: pullToAxis,
        onReturn: returnFromAxis,
      }
      return data
    }
    nodes.forEach(n => {
      if (stacked.has(n.id)) return
      const hidden = hiddenNodeIds.has(n.id) || !layout.positions.has(n.id)
      const base = layout.positions.get(n.id) || ZERO
      const off = dragOffsets[n.id] || ZERO
      list.push({
        id: n.id,
        type: 'person',
        hidden,
        position: { x: base.x + off.x, y: base.y + off.y },
        data: buildData(n),
        // 布局偏移的持久化接口同样要求编辑权限，无权节点不可拖，避免 403
        draggable: !linkingSourceNodeId && (canEditAny || editableNodeIds.has(n.id)),
      })
      // 折叠组：行或就地展开的卡片，位置相对领导，拖领导时实时跟随；不读已保存偏移、不可拖
      layout.stacks.get(n.id)?.forEach((entry, index) => {
        const member = nodeById.get(entry.memberId)
        if (!member) return
        const memberData: PersonNodeData = {
          ...buildData(member),
          foldedMember: true,
          foldedFirst: index === 0,
          canReturn: false,
        }
        list.push({
          id: member.id,
          type: entry.expanded ? 'person' : 'foldedRow',
          parentId: n.id,
          position: { x: 0, y: entry.y },
          data: memberData,
          draggable: false,
        } as AxisFlowNode)
      })
    })
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    nodes, hiddenNodeIds, layout, dragOffsets, headLeaderId, lang, selectedNodeId, expandedNodes,
    linkingSourceNodeId, linkingHoveredTargetId, canEditAny, canMoveNodes, editableNodeIds, caps,
    serverPerms, orientation, mobile, isBackendProject, currentUserId,
    options.mineNodeIds, options.scopeContextNodeIds, handleConnectToTarget, toggleExpandNode, toast,
    foldOn, axisMembers, pulledIds, selfAncestorIds, toggleFoldedRow, pullToAxis, returnFromAxis,
  ])

  // ===== 构建连线 =====
  const rfEdges = useMemo<Edge[]>(() => {
    const edges: Edge[] = []
    scopedNodes.forEach(n => {
      if (!n.parentId) return
      if (hiddenNodeIds.has(n.id) || hiddenNodeIds.has(n.parentId)) return
      // 折叠成员不连线：只连上轴人员
      if (axisMembers && !(axisMembers.has(n.id) && axisMembers.has(n.parentId))) return
      edges.push({
        id: `branch-${n.id}`,
        source: n.parentId,
        target: n.id,
        type: 'branch',
        data: {
          orientation,
          attachmentKind: n.nodeOrigin || 'project',
          edgeStyle,
        },
      })
    })
    return edges
  }, [scopedNodes, hiddenNodeIds, orientation, edgeStyle, axisMembers])

  return {
    rfNodes,
    rfEdges,
    layout,
    expandedNodes,
    setExpandedNodes,
    toggleExpandNode,
    foldEnabled: foldOn,
    pulledIds,
    expandedRows,
    toggleFoldedRow,
    pullToAxis,
    returnFromAxis,
    pullAllToAxis,
    resetFold,
    foldFitSeq,
    revealPerson,
    handleNodeDragStop,
    resetAllDragOffsets,
    reparentConfirm,
    handleRequestReparent,
    handleConfirmReparent,
    handleCancelReparent,
    linkingSourceNodeId,
    setLinkingSourceNodeId,
    setLinkingHoveredTargetId,
    canEditAny,
    canMoveNodes,
    editableNodeIds,
    ...caps,
  }
}

/**
 * 置顶、背景不透明的换上级确认对话框
 * 遵循 CARD-SPEC 第 3 节和 MOBILE-SPEC 第 5 节规范
 */
export const ReparentConfirmDialog: React.FC<{
  confirm: { sourceId: string; targetId: string; sourceName: string; targetName: string } | null
  lang?: Language
  onConfirm: () => void
  onCancel: () => void
}> = ({ confirm, lang = 'zh', onConfirm, onCancel }) => {
  if (!confirm) return null
  return createPortal(
    <div
      className="axis-theme axis-dialog-mask"
      role="dialog"
      aria-modal="true"
      data-testid="reparent-confirm-dialog"
      style={{ zIndex: 99999 }}
    >
      <div className="axis-reparent-dialog">
        <h3>{lang === 'zh' ? '调整上级' : 'Change manager'}</h3>
        <p>
          {lang === 'zh'
            ? `把「${confirm.sourceName}」（连同他的下属和任务）调到「${confirm.targetName}」下面？`
            : `Move "${confirm.sourceName}" (along with subordinates and tasks) under "${confirm.targetName}"?`}
        </p>
        <div className="axis-reparent-dialog-actions">
          <button
            type="button"
            className="axis-secondary-button"
            data-testid="reparent-confirm-no"
            onClick={onCancel}
          >
            {lang === 'zh' ? '取消' : 'Cancel'}
          </button>
          <button
            type="button"
            className="axis-primary-button"
            data-testid="reparent-confirm-yes"
            onClick={onConfirm}
          >
            {lang === 'zh' ? '确定' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
