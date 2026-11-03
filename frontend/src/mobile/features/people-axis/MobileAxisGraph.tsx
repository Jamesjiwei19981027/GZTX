import React, { useMemo, useState } from 'react';
import { ReactFlow, applyNodeChanges, Background, Handle, Position, type Node, type NodeProps, type ReactFlowInstance } from '@xyflow/react';
import type { PeopleAxisNode } from '../../../types';
import { computeAxisLayout } from '../../../components/views/peopleAxisFlowLayout';
import { highlightEdgeIds } from '../../../components/views/peopleAxisUtils';

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
}> = ({ nodes: people, orientation, renderCard, onSelect, onReady, onZoomChange }) => {
  const horizontal = orientation === 'horizontal';
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  const layout = useMemo(() => {
    return computeAxisLayout(people, orientation, {});
  }, [people, orientation]);

  const [flowNodes, setFlowNodes] = useState<CardNode[]>(() => people.map(person => ({
    id: person.id,
    type: 'person',
    position: layout.positions.get(person.id) || { x: 0, y: 0 },
    data: { card: renderCard(person), horizontal },
    sourcePosition: horizontal ? Position.Right : Position.Bottom,
    targetPosition: horizontal ? Position.Left : Position.Top,
  })));

  // Sync positions when layout changes
  React.useEffect(() => {
    setFlowNodes(people.map(person => ({
      id: person.id,
      type: 'person',
      position: layout.positions.get(person.id) || { x: 0, y: 0 },
      data: { card: renderCard(person), horizontal },
      sourcePosition: horizontal ? Position.Right : Position.Bottom,
      targetPosition: horizontal ? Position.Left : Position.Top,
    })));
  }, [people, layout.positions, renderCard, horizontal]);

  const nodes = flowNodes.map(node => ({
    ...node,
    data: {
      ...node.data,
      card: renderCard(people.find(p => p.id === node.id) || people[0]),
    },
  }));

  const highlightedEdges = useMemo(() => {
    return highlightEdgeIds(people.map(p => ({ id: p.id, parentId: p.parentId })), selectedPersonId);
  }, [people, selectedPersonId]);

  const edges = useMemo(() => {
    return people
      .filter(p => p.parentId && layout.positions.has(p.parentId))
      .map(person => {
        const edgeId = `branch-${person.id}`;
        const isHighlighted = selectedPersonId ? highlightedEdges.has(edgeId) : false;
        const isDim = selectedPersonId ? !isHighlighted : false;
        return {
          id: edgeId,
          source: person.parentId!,
          target: person.id,
          type: 'default',
          className: 'axis-edge-flow',
          style: {
            stroke: isHighlighted ? '#0058be' : '#6d93be',
            strokeWidth: isHighlighted ? 2.4 : 1.6,
            opacity: isDim ? 0.25 : 1,
          },
        };
      });
  }, [people, layout.positions, selectedPersonId, highlightedEdges]);

  return <div data-testid="mobile-axis-graph" className="w-full h-full min-h-[260px] pb-24">
    <ReactFlow<CardNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes}
      onInit={instance => onReady(instance as unknown as ReactFlowInstance)}
      onMove={(_, viewport) => onZoomChange(viewport.zoom)}
      onNodesChange={changes => {
        setFlowNodes(previous => applyNodeChanges(changes, previous));
      }}
      onNodeClick={(_, node) => {
        const person = people.find(p => p.id === node.id);
        if (person) {
          setSelectedPersonId(prev => prev === person.id ? null : person.id);
          onSelect(person);
        }
      }}
      onPaneClick={() => {
        setSelectedPersonId(null);
      }}
      nodesDraggable nodesConnectable={false} elementsSelectable={false} fitView fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
      minZoom={0.25} maxZoom={2} nodeDragThreshold={5} zoomOnDoubleClick={false}
      proOptions={{ hideAttribution: true }}>
      <Background color="#b9c9da" gap={24} size={1} />
    </ReactFlow>
  </div>;
};
