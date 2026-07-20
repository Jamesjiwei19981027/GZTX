import type { TreeNodeDTO } from '@/types/collab'

export type OutlineTreeProps = {
  nodes: TreeNodeDTO[]
  selectedId?: number
  onSelect: (node: TreeNodeDTO) => void
}

function TreeItem({
  node,
  selectedId,
  onSelect,
}: {
  node: TreeNodeDTO
  selectedId?: number
  onSelect: (node: TreeNodeDTO) => void
}) {
  const active = node.id === selectedId
  return (
    <li>
      <button
        type="button"
        className={`w-full text-left px-2 py-1.5 rounded-lg hover:bg-primary/10 ${
          active ? 'bg-primary/15 text-primary font-medium' : ''
        }`}
        onClick={() => onSelect(node)}
      >
        <span className="opacity-60 mr-1">{'·'.repeat(Math.min(node.depth, 4))}</span>
        {node.title}
        <span className="text-xs opacity-60 ml-1">{node.progress_json?.status || ''}</span>
      </button>
      {node.children && node.children.length > 0 ? (
        <ul className="ml-3 border-l border-surface-variant pl-1">
          {node.children.map((c) => (
            <TreeItem key={c.id} node={c} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export default function OutlineTree({ nodes, selectedId, onSelect }: OutlineTreeProps) {
  if (!nodes.length) {
    return <p className="text-sm text-on-surface-variant">暂无大纲节点</p>
  }
  return (
    <ul className="space-y-1 text-sm">
      {nodes.map((n) => (
        <TreeItem key={n.id} node={n} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </ul>
  )
}
