import dagre from '@dagrejs/dagre'
import type { Edge, Node } from '@xyflow/react'
import type { TreeNodeDTO } from '@/types/collab'

export type FlowNodeData = { title: string; status?: string; raw: TreeNodeDTO }

type FlatNode = {
  id: string
  parentId: string | null
  label: string
  status?: string
  raw: TreeNodeDTO
}

function walk(
  nodes: TreeNodeDTO[],
  parentId: string | null,
  acc: FlatNode[],
) {
  for (const n of nodes) {
    const id = String(n.id)
    acc.push({
      id,
      parentId,
      label: n.title,
      status: n.progress_json?.status,
      raw: n,
    })
    if (n.children?.length) walk(n.children, id, acc)
  }
  return acc
}

export function layoutTree(nested: TreeNodeDTO[]): {
  nodes: Node<FlowNodeData>[]
  edges: Edge[]
} {
  const flat = walk(nested, null, [])
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 60 })
  flat.forEach((n) => g.setNode(n.id, { width: 180, height: 48 }))
  flat.forEach((n) => {
    if (n.parentId) g.setEdge(n.parentId, n.id)
  })
  dagre.layout(g)
  const nodes: Node<FlowNodeData>[] = flat.map((n) => {
    const p = g.node(n.id) as { x: number; y: number }
    return {
      id: n.id,
      position: { x: p.x - 90, y: p.y - 24 },
      data: { title: n.label, status: n.status, raw: n.raw } satisfies FlowNodeData,
      style: { width: 180 },
      type: 'default',
    }
  })
  const edges: Edge[] = flat
    .filter((n) => n.parentId)
    .map((n) => ({ id: `${n.parentId}-${n.id}`, source: n.parentId!, target: n.id }))
  return { nodes, edges }
}

/** Alias per task interface: treeToFlow(nodes) → { nodes, edges } */
export function treeToFlow(nodes: TreeNodeDTO[]) {
  return layoutTree(nodes)
}
