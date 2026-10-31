import React, { useMemo, useState } from 'react';
import { ReactFlow, applyNodeChanges, Background, Handle, Position, type Node, type NodeProps, type ReactFlowInstance } from '@xyflow/react';
import type { PeopleAxisNode } from '../../../types';

type CardNode = Node<{ card: React.ReactNode; horizontal: boolean }, 'person'>;
function PersonNode({ data, id }: NodeProps<CardNode>) {
  return <div data-testid={`mobile-axis-node-${id}`}>
    <Handle type="target" position={data.horizontal ? Position.Left : Position.Top} className="!opacity-0" />
    {data.card}
    <Handle type="source" position={data.horizontal ? Position.Right : Position.Bottom} className="!opacity-0" />
  </div>;
}
const nodeTypes = { person: PersonNode };

export const MobileAxisGraph: React.FC<{
  nodes: PeopleAxisNode[]; orientation: 'vertical' | 'horizontal'; spacing: string;
  renderCard: (node: PeopleAxisNode) => React.ReactNode; onSelect: (node: PeopleAxisNode) => void;
  onReady: (instance: ReactFlowInstance) => void; onZoomChange: (zoom: number) => void;
}> = ({ nodes: people, orientation, spacing, renderCard, onSelect, onReady, onZoomChange }) => {
  const horizontal = orientation === 'horizontal';
  const gap = spacing === 'compact' ? 150 : spacing === 'loose' ? 220 : 180;
  const layout = useMemo(() => {
    const ids = new Set(people.map(p => p.id));
    const roots = people.filter(p => !p.parentId || !ids.has(p.parentId));
    const positions = new Map<string, { x: number; y: number }>();
    let leaf = 0;
    let deepest = 0;
    const place = (person: PeopleAxisNode, depth: number, seen = new Set<string>()): number => {
      if (seen.has(person.id)) return leaf;
      deepest = Math.max(deepest, depth);
      seen.add(person.id);
      const children = people.filter(p => p.parentId === person.id && !seen.has(p.id));
      const childLanes = children.map(c => place(c, depth + 1, seen));
      const lane = childLanes.length ? (childLanes[0] + childLanes[childLanes.length - 1]) / 2 : leaf++;
      positions.set(person.id, horizontal ? { x: depth * (gap + 130), y: lane * 150 } : { x: lane * 260, y: depth * gap });
      return lane;
    };
    let nextDepth = 0;
    for (const root of roots) {
      leaf = 0;
      const subtree = new Set<string>();
      const lane = place(root, nextDepth, subtree);
      // Project-spine roots align on the main axis; children occupy their own branches.
      for (const id of subtree) {
        const position = positions.get(id)!;
        if (horizontal) position.y -= lane * 150;
        else position.x -= lane * 260;
      }
      nextDepth = deepest + 1;
    }
    return positions;
  }, [people, horizontal, gap]);
  const [flowNodes, setFlowNodes] = useState<CardNode[]>(() => people.map(person => ({ id: person.id, type: 'person',
    position: layout.get(person.id) || { x: 0, y: 0 },
    data: { card: renderCard(person), horizontal },
    sourcePosition: horizontal ? Position.Right : Position.Bottom,
    targetPosition: horizontal ? Position.Left : Position.Top,
  })));
  const nodes = flowNodes.map(node => ({ ...node, data: { ...node.data,
    card: renderCard(people.find(p => p.id === node.id)!),
  } }));
  const edges = people.filter(p => p.parentId && layout.has(p.parentId)).map(person => ({
    id: `${person.parentId}-${person.id}`, source: person.parentId!, target: person.id,
    type: 'default', style: { stroke: '#6d93be', strokeWidth: 2.5 },
  }));
  // Independent project responsibilities are connected on the project spine.
  const roots = people.filter(p => !p.parentId || !layout.has(p.parentId));
  roots.slice(1).forEach((person, i) => edges.push({ id: `spine-${person.id}`, source: roots[i].id, target: person.id,
    type: 'default', style: { stroke: '#6d93be', strokeWidth: 2.5 } }));
  return <div data-testid="mobile-axis-graph" className="w-full h-full min-h-[260px] pb-24">
    <ReactFlow<CardNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes}
      onInit={instance => onReady(instance as unknown as ReactFlowInstance)}
      onMove={(_, viewport) => onZoomChange(viewport.zoom)}
      onNodesChange={changes => {
        setFlowNodes(previous => applyNodeChanges(changes, previous));
      }}
      onNodeClick={(_, node) => { const person = people.find(p => p.id === node.id); if (person) onSelect(person); }}
      nodesDraggable nodesConnectable={false} elementsSelectable={false} fitView fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
      minZoom={0.25} maxZoom={2} nodeDragThreshold={5} zoomOnDoubleClick={false}
      proOptions={{ hideAttribution: true }}>
      <Background color="#b9c9da" gap={24} size={1} />
    </ReactFlow>
  </div>;
}
