import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Edge } from '@xyflow/react'
import type { PeopleAxisNode, Language } from '../../types'
import {
  computeAxisLayout,
  collectHiddenNodeIds,
  type AxisOrientation,
} from './peopleAxisFlowLayout'
import { pickUiOffset } from '../../api/mappers'
import { putNodeLayout, moveNode } from '../../api/backend'
import { MyProjectPermissions } from '../../api/shell'
import { reparentVerdict } from './peopleAxisUtils'
import type { AxisFlowNode, PersonNodeData } from './PeopleAxisFlowCanvas'

export interface UsePeopleAxisCanvasOptions {
  nodes: PeopleAxisNode[]
  orientation: AxisOrientation
  edgeStyle?: 'curve' | 'straight'
  lang?: Language
  mobile?: boolean
  isBackendProject?: boolean
  backendProjectId?: number | null
  serverPerms?: MyProjectPermissions | null
  currentUserId?: number | null
  pmUserId?: number | null
  selectedNodeId?: string | null
  onSelectNode?: (nodeId: string | null) => void
  onCardClick?: (nodeId: string) => void
  onAddChild?: (parentId: string) => void
  onEditPerson?: (nodeId: string) => void
  onReloadAxis?: () => Promise<void>
  onShowToast?: (message: string) => void
  canEditAny?: boolean
  canMoveNodes?: boolean
  editableNodeIds?: Set<string>
  scope?: 'all' | 'mine' | 'project'
}

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
    pmUserId,
    selectedNodeId,
    onSelectNode,
    onCardClick,
    onAddChild,
    onEditPerson,
    onReloadAxis,
    onShowToast,
    canEditAny: canEditAnyProp,
    canMoveNodes: canMoveNodesProp,
    editableNodeIds: editableNodeIdsProp,
  } = options

  // 双向偏移字典管理：每个方向独立保存一份
  const offsetsByDirRef = useRef<{
    horizontal: Record<string, { x: number; y: number }>
    vertical: Record<string, { x: number; y: number }>
  }>({
    horizontal: {},
    vertical: {},
  })

  const [dragOffsets, setDragOffsets] = useState<Record<string, { x: number; y: number }>>({})
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({})
  const [linkingSourceNodeId, setLinkingSourceNodeId] = useState<string | null>(null)
  const [linkingHoveredTargetId, setLinkingHoveredTargetId] = useState<string | null>(null)

  // 换上级确认对话框状态
  const [reparentConfirm, setReparentConfirm] = useState<{
    sourceId: string
    targetId: string
    sourceName: string
    targetName: string
  } | null>(null)

  const activeProjectRef = useRef<number | null>(backendProjectId ?? null)
  activeProjectRef.current = backendProjectId ?? null

  const layoutSavesRef = useRef(new Map<number, Promise<unknown>>())
  const savedOffsetsRef = useRef(new Map<number, { x: number; y: number }>())

  // 初始化 / 刷新节点偏移
  useEffect(() => {
    const hMap: Record<string, { x: number; y: number }> = {}
    const vMap: Record<string, { x: number; y: number }> = {}
    const initialExpanded: Record<string, boolean> = {}

    nodes.forEach((n) => {
      initialExpanded[n.id] = true
      const hOff = pickUiOffset(n, 'horizontal')
      const vOff = pickUiOffset(n, 'vertical')
      if (hOff.x !== 0 || hOff.y !== 0) hMap[n.id] = hOff
      if (vOff.x !== 0 || vOff.y !== 0) vMap[n.id] = vOff

      const backendId = Number(n.id)
      if (!Number.isNaN(backendId) && !layoutSavesRef.current.has(backendId)) {
        savedOffsetsRef.current.set(backendId, orientation === 'horizontal' ? hOff : vOff)
      }
    })

    offsetsByDirRef.current = { horizontal: hMap, vertical: vMap }
    setDragOffsets(orientation === 'horizontal' ? hMap : vMap)
    setExpandedNodes(prev => ({ ...initialExpanded, ...prev }))
  }, [nodes, orientation])

  // 切换方向时：无缝切换为新方向的偏移
  useEffect(() => {
    const currentOffsets = offsetsByDirRef.current[orientation] || {}
    setDragOffsets({ ...currentOffsets })
  }, [orientation])

  const toggleExpandNode = useCallback((nodeId: string) => {
    setExpandedNodes(prev => ({
      ...prev,
      [nodeId]: prev[nodeId] === false,
    }))
  }, [])

  // 权限计算
  const canEditAny = useMemo(() => {
    if (canEditAnyProp !== undefined) return canEditAnyProp
    if (!isBackendProject) return false
    if (serverPerms) return Boolean(serverPerms.can_edit_all)
    if (currentUserId == null) return false
    return pmUserId != null && pmUserId === currentUserId
  }, [canEditAnyProp, isBackendProject, serverPerms, currentUserId, pmUserId])

  const canMoveNodes = useMemo(() => {
    if (canMoveNodesProp !== undefined) return canMoveNodesProp
    if (serverPerms) return Boolean(serverPerms.can_move)
    return canEditAny
  }, [canMoveNodesProp, serverPerms, canEditAny])

  const editableNodeIds = useMemo(() => {
    if (editableNodeIdsProp !== undefined) return editableNodeIdsProp
    const set = new Set<string>()
    if (!isBackendProject) return set
    const ownedFromServer = serverPerms ? new Set(serverPerms.owned_node_ids.map(String)) : null
    if (!ownedFromServer && currentUserId == null) return set

    const childrenMap = new Map<string, string[]>()
    nodes.forEach(n => {
      if (!n.parentId) return
      childrenMap.set(n.parentId, [...(childrenMap.get(n.parentId) || []), n.id])
    })

    const queue = nodes
      .filter(n =>
        ownedFromServer
          ? ownedFromServer.has(n.id)
          : (n.ownerUserIds || []).includes(currentUserId!),
      )
      .map(n => n.id)

    while (queue.length) {
      const id = queue.pop()!
      if (set.has(id)) continue
      set.add(id)
      ;(childrenMap.get(id) || []).forEach(c => queue.push(c))
    }
    return set
  }, [editableNodeIdsProp, isBackendProject, serverPerms, currentUserId, nodes])

  const canAddSubordinateCheck = useCallback((id: string) => {
    if (serverPerms?.node_permissions) {
      return Boolean(serverPerms.node_permissions[id]?.can_add_subordinate)
    }
    return canEditAny || editableNodeIds.has(id)
  }, [serverPerms, canEditAny, editableNodeIds])

  const canAddWorkItemCheck = useCallback((id: string) => {
    if (serverPerms?.node_permissions) {
      return Boolean(serverPerms.node_permissions[id]?.can_add_work_item)
    }
    return canEditAny || editableNodeIds.has(id)
  }, [serverPerms, canEditAny, editableNodeIds])

  const canSubmitEvidenceCheck = useCallback((id: string) => {
    if (serverPerms?.node_permissions) {
      return Boolean(serverPerms.node_permissions[id]?.can_submit_evidence)
    }
    return Boolean(serverPerms?.can_submit_evidence)
  }, [serverPerms])

  // 保存节点布局偏移到后端（携带当前 orientation）
  const saveNodeOffset = useCallback((nodeId: number, offset: { x: number; y: number }, targetDir = orientation) => {
    const pending = (layoutSavesRef.current.get(nodeId) || Promise.resolve())
      .catch(() => undefined)
      .then(() => putNodeLayout(nodeId, offset, targetDir))
      .then(result => {
        savedOffsetsRef.current.set(nodeId, offset)
        return result
      })
    layoutSavesRef.current.set(nodeId, pending)
    const clear = () => {
      if (layoutSavesRef.current.get(nodeId) === pending) layoutSavesRef.current.delete(nodeId)
    }
    void pending.then(clear, clear)
    return pending
  }, [orientation])

  // 布局计算
  const layout = useMemo(
    () => computeAxisLayout(nodes, orientation, expandedNodes),
    [nodes, orientation, expandedNodes],
  )
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  const hiddenNodeIds = useMemo(
    () => collectHiddenNodeIds(nodes, expandedNodes),
    [nodes, expandedNodes],
  )

  // 拖动结束：计算偏移、更新当前方向状态并落盘
  const handleNodeDragStop = useCallback((id: string, position: { x: number; y: number }) => {
    if (!isBackendProject || (!canEditAny && !editableNodeIds.has(id))) return
    const base = layoutRef.current.positions.get(id)
    if (!base) return
    const off = { x: position.x - base.x, y: position.y - base.y }

    offsetsByDirRef.current[orientation][id] = off
    setDragOffsets(prev => {
      const next = { ...prev, [id]: off }
      return next
    })

    // 同步更新节点本身的 uiOffsets
    const targetNode = nodes.find(n => n.id === id)
    if (targetNode) {
      targetNode.uiOffsets = {
        ...(targetNode.uiOffsets || {}),
        [orientation]: off,
      }
      if (orientation === 'horizontal') targetNode.uiOffset = off
      targetNode.layoutOffset = off
    }

    const backendId = Number(id)
    if (!Number.isNaN(backendId)) {
      void saveNodeOffset(backendId, off, orientation).catch(error => {
        if (activeProjectRef.current !== backendProjectId) return
        setDragOffsets(current => {
          if (current[id]?.x !== off.x || current[id]?.y !== off.y) return current
          const next = {
            ...current,
            [id]: savedOffsetsRef.current.get(backendId) || { x: 0, y: 0 },
          }
          offsetsByDirRef.current[orientation][id] = next[id]
          return next
        })
        onShowToast?.(
          error instanceof Error
            ? error.message
            : lang === 'zh'
              ? '位置保存失败'
              : 'Position could not be saved',
        )
      })
    }
  }, [
    isBackendProject,
    canEditAny,
    editableNodeIds,
    orientation,
    nodes,
    backendProjectId,
    saveNodeOffset,
    onShowToast,
    lang,
  ])

  // 重置布局：清空当前方向偏移
  const resetAllDragOffsets = useCallback(() => {
    const retained: Record<string, { x: number; y: number }> = {}
    if (isBackendProject) {
      const currentDirOffsets = offsetsByDirRef.current[orientation]
      Object.keys(currentDirOffsets).forEach(id => {
        const off = currentDirOffsets[id]
        if (!canEditAny && !editableNodeIds.has(id)) {
          retained[id] = off
          return
        }
        if (!off || (off.x === 0 && off.y === 0)) return
        const backendId = Number(id)
        if (!Number.isNaN(backendId)) {
          void saveNodeOffset(backendId, { x: 0, y: 0 }, orientation).catch(error => {
            if (activeProjectRef.current !== backendProjectId) return
            setDragOffsets(current => {
              if (current[id]) return current
              const next = {
                ...current,
                [id]: savedOffsetsRef.current.get(backendId) || { x: 0, y: 0 },
              }
              offsetsByDirRef.current[orientation][id] = next[id]
              return next
            })
            onShowToast?.(
              error instanceof Error
                ? error.message
                : lang === 'zh'
                  ? '位置重置失败'
                  : 'Layout reset failed',
            )
          })
        }
      })
    }
    offsetsByDirRef.current[orientation] = retained
    setDragOffsets(retained)
  }, [isBackendProject, orientation, canEditAny, editableNodeIds, backendProjectId, saveNodeOffset, onShowToast, lang])

  // 换上级拖放请求与确认处理
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

  // 执行换上级
  const executeReparent = useCallback(async (sourceId: string, targetId: string) => {
    const sourceNode = nodes.find(n => n.id === sourceId)
    const targetNode = nodes.find(n => n.id === targetId)
    const srcBackendId = Number(sourceId)
    const tgtBackendId = Number(targetId)

    if (isBackendProject) {
      if (Number.isNaN(srcBackendId) || Number.isNaN(tgtBackendId)) {
        onShowToast?.(lang === 'zh' ? '节点尚未同步到后端，无法挂载' : 'Node not on backend')
        return
      }
      try {
        await moveNode(srcBackendId, { new_parent_id: tgtBackendId, sort_order: 0 })

        // 成功后清除被移动节点在两个方向上的偏移
        delete offsetsByDirRef.current.horizontal[sourceId]
        delete offsetsByDirRef.current.vertical[sourceId]
        if (sourceNode) {
          sourceNode.uiOffsets = null
          sourceNode.uiOffset = null
          sourceNode.layoutOffset = { x: 0, y: 0 }
        }
        setDragOffsets(prev => {
          const next = { ...prev }
          delete next[sourceId]
          return next
        })

        // 向后端防御性清空位置
        void saveNodeOffset(srcBackendId, { x: 0, y: 0 }, 'horizontal').catch(() => {})
        void saveNodeOffset(srcBackendId, { x: 0, y: 0 }, 'vertical').catch(() => {})

        setExpandedNodes(prev => ({ ...prev, [targetId]: true }))
        setLinkingSourceNodeId(null)
        setLinkingHoveredTargetId(null)

        await onReloadAxis?.()
        onShowToast?.(
          lang === 'zh'
            ? `已将【${sourceNode?.person.name || ''}】挂载到【${targetNode?.person.name || ''}】`
            : `Attached ${sourceNode?.person.name} under ${targetNode?.person.name}`,
        )
      } catch (err) {
        onShowToast?.(err instanceof Error ? err.message : lang === 'zh' ? '挂载失败' : 'Failed to move node')
      }
    }
  }, [nodes, isBackendProject, onShowToast, lang, saveNodeOffset, onReloadAxis])

  const handleConfirmReparent = useCallback(async () => {
    if (!reparentConfirm) return
    const { sourceId, targetId } = reparentConfirm
    setReparentConfirm(null)
    await executeReparent(sourceId, targetId)
  }, [reparentConfirm, executeReparent])

  const handleCancelReparent = useCallback(() => {
    setReparentConfirm(null)
  }, [])

  // 连线目标点击备用操作
  const handleConnectToTarget = useCallback((targetNodeId: string) => {
    if (!linkingSourceNodeId || linkingSourceNodeId === targetNodeId) return
    if (isBackendProject && !canMoveNodes) {
      onShowToast?.(lang === 'zh' ? '连线（改挂上级）仅项目 PM 可用' : 'Re-linking requires the project PM')
      return
    }

    const allPeopleNodes = nodes.map(n => ({
      ...n,
      isTerminal: Boolean(n.isTerminalPM),
    }))
    const verdict = reparentVerdict(allPeopleNodes, linkingSourceNodeId, targetNodeId, {
      canRelink: id => canMoveNodes || editableNodeIds.has(id),
      lang,
    })

    if (!verdict.ok) {
      onShowToast?.(verdict.reason)
      return
    }
    handleRequestReparent(linkingSourceNodeId, targetNodeId)
  }, [linkingSourceNodeId, isBackendProject, canMoveNodes, nodes, editableNodeIds, lang, onShowToast, handleRequestReparent])

  // 构建 rfNodes
  const rfNodes = useMemo<AxisFlowNode[]>(() => {
    const list: AxisFlowNode[] = []
    const headLeader = nodes.find(n => !n.parentId) || null

    nodes.forEach(n => {
      const hidden = hiddenNodeIds.has(n.id) || !layout.positions.has(n.id)
      const base = layout.positions.get(n.id) || { x: 0, y: 0 }
      const off = dragOffsets[n.id] || { x: 0, y: 0 }
      const isMine = currentUserId != null && (n.ownerUserIds || []).includes(currentUserId)
      const childCount = nodes.filter(c => c.parentId === n.id).length

      const data: PersonNodeData = {
        node: n,
        lang,
        level: layout.levels.get(n.id) || 1,
        isMine,
        isScopeContext: false,
        isOverallLeader: headLeader?.id === n.id || Boolean(n.isTerminalPM),
        isMainAxisLeader: !n.parentId,
        isSelected: selectedNodeId === n.id,
        isExpanded: expandedNodes[n.id] ?? true,
        childCount,
        linkingActive: linkingSourceNodeId !== null,
        isLinkingSource: linkingSourceNodeId === n.id,
        isLinkingTarget:
          linkingSourceNodeId !== null &&
          linkingHoveredTargetId === n.id &&
          linkingSourceNodeId !== n.id,
        canEdit: canEditAny || editableNodeIds.has(n.id),
        canAddSubordinate: canAddSubordinateCheck(n.id),
        canAddWorkItem: canAddWorkItemCheck(n.id),
        canSubmitEvidence: canSubmitEvidenceCheck(n.id),
        evidenceItemPermissions: Object.fromEntries(
          (n.workItems || []).map(item => [item.id, canSubmitEvidenceCheck(item.id)]),
        ),
        canReadEvidence: Boolean(serverPerms?.can_read_evidence),
        orientation,
        mobile,
        canRelink: canMoveNodes,
        onCardClick: id => {
          if (linkingSourceNodeId) {
            if (id !== linkingSourceNodeId) handleConnectToTarget(id)
          } else {
            onSelectNode?.(id)
            onCardClick?.(id)
          }
        },
        onToggleExpand: toggleExpandNode,
        onAddWorkItem: id => {
          if (!canAddWorkItemCheck(id)) {
            onShowToast?.(lang === 'zh' ? '只能给自己负责的节点挂载事项' : 'You can only attach items under nodes you own')
            return
          }
        },
        onAddChild: id => {
          if (!isBackendProject) {
            onShowToast?.(lang === 'zh' ? '聚合视图只读' : 'Readonly')
            return
          }
          if (!canAddSubordinateCheck(id)) {
            onShowToast?.(lang === 'zh' ? '只能在自己负责的节点下挂载下属' : 'You can only mount under nodes you own')
            return
          }
          onAddChild?.(id)
        },
        onEditPerson: id => {
          if (!isBackendProject || (!canEditAny && !editableNodeIds.has(id))) return
          onEditPerson?.(id)
        },
        onToggleLinking: id => {
          if (!canMoveNodes) {
            onShowToast?.(lang === 'zh' ? '连线（改挂上级）仅项目 PM 可用' : 'Re-linking requires the project PM')
            return
          }
          if (linkingSourceNodeId === id) {
            setLinkingSourceNodeId(null)
            setLinkingHoveredTargetId(null)
            onShowToast?.(lang === 'zh' ? '已取消连线操作' : 'Cancelled linking')
          } else {
            setLinkingSourceNodeId(id)
            onShowToast?.(
              lang === 'zh'
                ? `🔗 连线模式已激活：点击目标卡片将【${n.person.name}】挂载过去`
                : 'Linking active: click a target card',
            )
          }
        },
        onHoverTarget: setLinkingHoveredTargetId,
      }

      list.push({
        id: n.id,
        type: 'person',
        hidden,
        position: { x: base.x + off.x, y: base.y + off.y },
        data,
        draggable: !linkingSourceNodeId && (canEditAny || editableNodeIds.has(n.id)),
      })
    })
    return list
  }, [
    nodes,
    hiddenNodeIds,
    layout,
    dragOffsets,
    currentUserId,
    selectedNodeId,
    expandedNodes,
    linkingSourceNodeId,
    linkingHoveredTargetId,
    canEditAny,
    editableNodeIds,
    canAddSubordinateCheck,
    canAddWorkItemCheck,
    canSubmitEvidenceCheck,
    serverPerms,
    orientation,
    mobile,
    canMoveNodes,
    lang,
    isBackendProject,
    onSelectNode,
    onCardClick,
    handleConnectToTarget,
    toggleExpandNode,
    onShowToast,
    onAddChild,
    onEditPerson,
  ])

  // 构建 rfEdges
  const rfEdges = useMemo<Edge[]>(() => {
    const edges: Edge[] = []
    nodes.forEach(n => {
      if (!n.parentId) return
      if (hiddenNodeIds.has(n.id) || hiddenNodeIds.has(n.parentId)) return
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
  }, [nodes, hiddenNodeIds, orientation, edgeStyle])

  return {
    rfNodes,
    rfEdges,
    layout,
    dragOffsets,
    expandedNodes,
    toggleExpandNode,
    handleNodeDragStop,
    resetAllDragOffsets,
    saveNodeOffset,
    reparentConfirm,
    handleRequestReparent,
    handleConfirmReparent,
    handleCancelReparent,
    linkingSourceNodeId,
    setLinkingSourceNodeId,
    canEditAny,
    canMoveNodes,
    editableNodeIds,
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
