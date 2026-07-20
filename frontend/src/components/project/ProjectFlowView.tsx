import { useCallback, useEffect, useMemo } from 'react'
import {
  Background,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Node,
  type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { TreeNodeDTO } from '@/types/collab'
import { layoutTree, type FlowNodeData } from '@/utils/treeLayout'

export type ProjectFlowViewProps = {
  nodes: TreeNodeDTO[]
  selectedId?: number
  onSelect: (node: TreeNodeDTO) => void
  /** When true, show loading placeholder instead of empty graph */
  loading?: boolean
  /** Error message to surface without white screen */
  error?: string | null
}

export default function ProjectFlowView({
  nodes: treeNodes,
  selectedId,
  onSelect,
  loading = false,
  error = null,
}: ProjectFlowViewProps) {
  const laidOut = useMemo(() => layoutTree(treeNodes), [treeNodes])

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>(laidOut.nodes)
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(laidOut.edges)

  useEffect(() => {
    setRfNodes(
      laidOut.nodes.map((n) => ({
        ...n,
        selected: selectedId != null && n.id === String(selectedId),
        style: {
          ...n.style,
          border:
            selectedId != null && n.id === String(selectedId)
              ? '2px solid rgb(0 88 190)'
              : undefined,
          borderRadius: 8,
          fontSize: 12,
          background: '#fff',
        },
        data: {
          ...n.data,
          label: n.data.status ? `${n.data.title} · ${n.data.status}` : n.data.title,
        },
      })),
    )
    setRfEdges(laidOut.edges)
  }, [laidOut, selectedId, setRfNodes, setRfEdges])

  const onNodeClick: NodeMouseHandler<Node<FlowNodeData>> = useCallback(
    (_event, node) => {
      const raw = node.data?.raw
      if (raw) onSelect(raw)
    },
    [onSelect],
  )

  if (error) {
    return (
      <div
        className="rounded-xl border border-error/30 bg-error/5 p-4 text-sm text-error"
        role="alert"
      >
        <p className="font-medium mb-1">关系图加载失败</p>
        <p className="opacity-90">{error}</p>
      </div>
    )
  }

  if (loading) {
    return <div className="text-sm text-on-surface-variant p-2">关系图加载中…</div>
  }

  if (!treeNodes.length) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center text-on-surface-variant">
        <span className="material-symbols-outlined text-4xl opacity-30 mb-2">account_tree</span>
        <p className="text-sm">暂无节点，无法绘制关系图</p>
      </div>
    )
  }

  return (
    <div className="h-[min(420px,50vh)] min-h-[240px] w-full rounded-xl border border-surface-variant bg-surface overflow-hidden">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
      >
        <Background gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
