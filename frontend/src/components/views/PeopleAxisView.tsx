import React, { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from 'react';
import { PeopleAxisNode, AxisWorkItem, AxisEvidence, Language, TeamMember } from '../../types';
import { getT } from '../../i18n';
import {
  createNode,
  getProject,
  getProjectTree,
  listNodeEvidence,
  listProjectMembers,
  moveNode,
  setFinalOwnerPosition,
  submitEvidence,
} from '../../api/backend';
import { mapMember, mapTreeToPeopleAxis } from '../../api/mappers';
import { putNodeLayout, runAxisAudit } from '../../api/shell';
import { averagePeopleAxisProgress } from './peopleAxisUtils';

function asBackendId(id?: string | null): number | null {
  if (!id) return null;
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function matterTypeKey(type: 'task' | 'milestone' | 'scope'): string {
  if (type === 'milestone') return 'milestone';
  if (type === 'scope') return 'scope';
  return 'work_item';
}

async function enrichMattersWithEvidence(
  axisNodes: PeopleAxisNode[],
): Promise<PeopleAxisNode[]> {
  const matterIds = Array.from(
    new Set(
      axisNodes
        .flatMap((n) => n.workItems.map((w) => asBackendId(w.id)))
        .filter((id): id is number => id != null),
    ),
  );
  if (!matterIds.length) return axisNodes;

  type EvItem = {
    id: number
    summary_text?: string
    status?: string
    submitted_at?: string
    evidence_kind?: string
    external_url?: string
    structured?: { evidence_kind?: string; external_url?: string }
  }
  const pairs: [number, EvItem[]][] = await Promise.all(
    matterIds.map(async (id) => {
      try {
        const res = await listNodeEvidence(id);
        return [id, res.items || []];
      } catch {
        return [id, [] as EvItem[]];
      }
    }),
  );
  const byId = new Map<number, EvItem[]>(pairs);

  return axisNodes.map((n) => ({
    ...n,
    workItems: n.workItems.map((wi) => {
      const mid = asBackendId(wi.id);
      const items = mid != null ? byId.get(mid) || [] : [];
      if (!items.length) return wi;
      const kinds: AxisEvidence['type'][] = [
        'commit',
        'document',
        'figma',
        'log',
        'delivery',
      ];
      const evidences: AxisEvidence[] = items.map((ev) => {
        const raw = (ev.summary_text || '').trim();
        const firstLine = raw.split('\n')[0] || '证据';
        const kindMatch = firstLine.match(/^\[([^\]]+)\]\s*(.*)$/);
        const urlLine = raw.split('\n').find((l) => l.startsWith('url:'));
        const kindRaw =
          ev.evidence_kind ||
          ev.structured?.evidence_kind ||
          kindMatch?.[1] ||
          'document';
        const kind = kinds.includes(kindRaw as AxisEvidence['type'])
          ? (kindRaw as AxisEvidence['type'])
          : 'document';
        return {
          id: String(ev.id),
          type: kind,
          title: kindMatch?.[2] || firstLine,
          url:
            ev.external_url ||
            ev.structured?.external_url ||
            (urlLine ? urlLine.replace(/^url:\s*/, '') : '#'),
          timestamp: (ev.submitted_at || '').slice(5, 16).replace('T', ' ') || '—',
          status: (ev.status === 'rejected' ? 'rejected' : ev.status === 'submitted' ? 'pending' : 'verified') as AxisEvidence['status'],
        };
      });
      return { ...wi, evidences };
    }),
  }));
}

interface PeopleAxisViewProps {
  lang: Language;
  /** 人轴只对具体后端项目开放；不再注入本地演示树。 */
  projectId?: string;
}

interface PathData {
  id: string;
  d: string;
  isMainAxis: boolean;
  parentId: string;
  childId: string;
}

export const PeopleAxisView: React.FC<PeopleAxisViewProps> = ({ lang, projectId }) => {
  const t = getT(lang);
  const [nodes, setNodes] = useState<PeopleAxisNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [backendLoadError, setBackendLoadError] = useState<string | null>(null);
  const [projectMembers, setProjectMembers] = useState<TeamMember[]>([]);
  const [isAddingNode, setIsAddingNode] = useState(false);
  const isBackendProject = Boolean(projectId && projectId !== 'all' && Number(projectId) > 0);
  const backendProjectId = isBackendProject ? Number(projectId) : 0;
  const memberOptions = projectMembers;
  const [isAddingWorkItem, setIsAddingWorkItem] = useState<string | null>(null); // nodeId
  const [isAddingEvidence, setIsAddingEvidence] = useState<string | null>(null); // workItemId
  const [activeTab, setActiveTab] = useState<'chain' | 'philosophy' | 'ai-audit'>('chain');
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing'>('synced');
  const [alongDelta, setAlongDelta] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);

  // Flagship Visual Controls
  const [viewMode, setViewMode] = useState<'visual-tree' | 'linear-timeline'>('visual-tree');
  const [treeOrientation, setTreeOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [paths, setPaths] = useState<PathData[]>([]);
  const [mainSpineData, setMainSpineData] = useState<{
    d: string;
    endX: number;
    endY: number;
    stationDots: { id: string; x: number; y: number; name: string }[];
  } | null>(null);
  const [hoveredPathId, setHoveredPathId] = useState<string | null>(null);

  // Dragging states for cards
  const [dragOffsets, setDragOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const dragOffsetsRef = useRef<Record<string, { x: number; y: number }>>({});
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Canvas Panning (Drag whole canvas)
  const [canvasPan, setCanvasPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanningCanvas, setIsPanningCanvas] = useState<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const contentRef = useRef<HTMLDivElement>(null);

  // Form states
  const [newPersonId, setNewPersonId] = useState<string>('');
  const [newRoleTitle, setNewRoleTitle] = useState('');
  const [newParentId, setNewParentId] = useState<string>('');
  
  const [newWorkTitle, setNewWorkTitle] = useState('');
  const [newWorkType, setNewWorkType] = useState<'task' | 'milestone' | 'scope'>('task');
  
  const [newEvTitle, setNewEvTitle] = useState('');
  const [newEvType, setNewEvType] = useState<'commit' | 'document' | 'figma' | 'log' | 'delivery'>('commit');
  const [newEvUrl, setNewEvUrl] = useState('#url-proof');

  // Draw.io Interactive Re-linking & Mounting States
  const [linkingSourceNodeId, setLinkingSourceNodeId] = useState<string | null>(null);
  const [linkingMousePos, setLinkingMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [linkingHoveredTargetId, setLinkingHoveredTargetId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Custom Member Form Fields
  const [isCustomPerson, setIsCustomPerson] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [customDept, setCustomDept] = useState('');
  const [customWorkScope, setCustomWorkScope] = useState('');
  const [customRiskLevel, setCustomRiskLevel] = useState<'low' | 'medium' | 'high'>('low');

  // Palette Drag & Drop States
  interface PaletteTemplate {
    id: string;
    type: 'trunk-leader' | 'subordinate' | 'vendor-lead';
    title: string;
    icon: string;
    defaultRole: string;
    defaultDept: string;
  }

  const PALETTE_TEMPLATES: PaletteTemplate[] = [
    {
      id: 'tmpl-trunk',
      type: 'trunk-leader',
      title: lang === 'zh' ? '🏢 主干部门主管' : '🏢 Trunk Dept Director',
      icon: 'domain',
      defaultRole: lang === 'zh' ? '主轴部门负责人' : 'Trunk Dept Director',
      defaultDept: lang === 'zh' ? '系统工程与总体部' : 'Systems Engineering'
    },
    {
      id: 'tmpl-expert',
      type: 'subordinate',
      title: lang === 'zh' ? '👤 归口责任专家' : '👤 Task Expert',
      icon: 'engineering',
      defaultRole: lang === 'zh' ? '专项责任专家' : 'Specialist Leader',
      defaultDept: lang === 'zh' ? '核心技术组' : 'Core Technology'
    },
    {
      id: 'tmpl-vendor',
      type: 'vendor-lead',
      title: lang === 'zh' ? '🛠️ 厂商交付接口' : '🛠️ Vendor Lead',
      icon: 'handshake',
      defaultRole: lang === 'zh' ? '第三方厂家交付责任人' : 'Vendor Delivery Lead',
      defaultDept: lang === 'zh' ? '外部协作与配套厂' : 'External Vendors'
    }
  ];

  const [paletteDraggingItem, setPaletteDraggingItem] = useState<PaletteTemplate | null>(null);
  const [paletteDragPos, setPaletteDragPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dropHoverTarget, setDropHoverTarget] = useState<{
    type: 'trunk' | 'node';
    nodeId?: string;
    x: number;
    y: number;
  } | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  // Global Mouse Move and Key Listener for Draw.io Linking Mode
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (linkingSourceNodeId && contentRef.current) {
        const rect = contentRef.current.getBoundingClientRect();
        setLinkingMousePos({
          x: (e.clientX - rect.left) / zoomLevel,
          y: (e.clientY - rect.top) / zoomLevel
        });
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && linkingSourceNodeId) {
        setLinkingSourceNodeId(null);
        setLinkingHoveredTargetId(null);
        showToast(lang === 'zh' ? '已取消 Draw.io 连线重新挂载操作' : 'Cancelled re-linking');
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [linkingSourceNodeId, zoomLevel, lang, showToast]);

  useEffect(() => {
    let cancelled = false;
    const apply = (loaded: PeopleAxisNode[]) => {
      if (cancelled) return;
      setNodes(loaded);
      const initialExpanded: Record<string, boolean> = {};
      const offsets: Record<string, { x: number; y: number }> = {};
      loaded.forEach((n) => {
        initialExpanded[n.id] = true;
        const lo = (n as PeopleAxisNode & { layoutOffset?: { x: number; y: number } }).layoutOffset;
        if (lo) offsets[n.id] = { x: lo.x, y: lo.y };
      });
      setExpandedNodes(initialExpanded);
      setDragOffsets(offsets);
      setSelectedNodeId(loaded[0]?.id ?? null);
    };

    const pid = projectId && projectId !== 'all' ? Number(projectId) : NaN;
    if (!Number.isFinite(pid) || pid <= 0) {
      setProjectMembers([]);
      apply([]);
      setBackendLoadError(lang === 'zh' ? '请先在顶部选择具体项目后查看人轴。' : 'Select a concrete project to view the people axis.');
      return () => {
        cancelled = true;
      };
    }

    setSyncStatus('syncing');
    setBackendLoadError(null);
    void (async () => {
      try {
        const [proj, tree, members] = await Promise.all([
          getProject(pid),
          getProjectTree(pid),
          listProjectMembers(pid).catch(() => ({ items: [] })),
        ]);
        if (cancelled) return;
        const mappedMembers = (members.items || []).map(mapMember);
        setProjectMembers(mappedMembers);
        if (mappedMembers.length) {
          setNewPersonId((prev) => prev || mappedMembers[0].id);
        }
        const mapped = mapTreeToPeopleAxis(
          tree.nodes || [],
          proj.final_owner_user_id ?? proj.pm_user_id,
        );
        const withEvidence = await enrichMattersWithEvidence(mapped);
        if (cancelled) return;
        setAlongDelta(proj.final_owner_along_delta || 0);
        apply(withEvidence);
        if (!withEvidence.length) {
          setBackendLoadError(
            lang === 'zh'
              ? '该项目暂无人轴节点。请用左侧调色板或「加人」创建人员。'
              : 'No person nodes yet. Add people from the palette.',
          );
        }
      } catch (e) {
        apply([]);
        setBackendLoadError(
          e instanceof Error
            ? e.message
            : lang === 'zh'
              ? '加载人轴失败'
              : 'Failed to load axis',
        );
      } finally {
        if (!cancelled) setSyncStatus('synced');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, lang]);

  const reloadAxisFromBackend = useCallback(async () => {
    if (!isBackendProject) return;
    setSyncStatus('syncing');
    try {
      const [proj, tree] = await Promise.all([
        getProject(backendProjectId),
        getProjectTree(backendProjectId),
      ]);
      const mapped = mapTreeToPeopleAxis(
        tree.nodes || [],
        proj.final_owner_user_id ?? proj.pm_user_id,
      );
      const withEvidence = await enrichMattersWithEvidence(mapped);
      setNodes(withEvidence);
      setExpandedNodes((prev) => {
        const next = { ...prev };
        withEvidence.forEach((n) => {
          if (next[n.id] === undefined) next[n.id] = true;
        });
        return next;
      });
      setBackendLoadError(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : '刷新失败');
    } finally {
      setSyncStatus('synced');
    }
  }, [isBackendProject, backendProjectId, showToast]);

  const handleSaveNodes = (updated: PeopleAxisNode[]) => {
    setNodes(updated);
    setSyncStatus('syncing');
    setTimeout(() => setSyncStatus('synced'), 600);
  };

  // Main Trunk Nodes: Nodes without parentId, sorted by orderOnAxis
  const mainTrunkNodes = useMemo(() => {
    return nodes.filter(n => !n.parentId).sort((a, b) => a.orderOnAxis - b.orderOnAxis);
  }, [nodes]);

  // Execute Palette Drop Creation
  const executePaletteDrop = useCallback((
    template: PaletteTemplate,
    target: { type: 'trunk' | 'node'; nodeId?: string; x: number; y: number }
  ) => {
    if (!isBackendProject) {
      showToast(lang === 'zh' ? '请先选择具体项目' : 'Select a concrete project first');
      return;
    }
    const isTrunk = target.type === 'trunk';
    const parentId = isTrunk ? undefined : target.nodeId;
    const pool = memberOptions;
    if (!pool.length) {
      showToast(lang === 'zh' ? '项目暂无可分配成员' : 'No project members available');
      return;
    }
    const randomMember = pool[Math.floor(Math.random() * pool.length)];
    const namePrefix = template.type === 'vendor-lead'
      ? (lang === 'zh' ? '华为/外部责任人' : 'Vendor Lead')
      : template.type === 'trunk-leader'
      ? (lang === 'zh' ? '主轴部门主管' : 'Trunk Dept Leader')
      : randomMember.name;
    const displayName = `${namePrefix} (${Math.floor(Math.random() * 89 + 10)}号)`;
    const scopeTitle = lang === 'zh' ? '初始化归口职责与交付范围' : 'Initial Scope & Responsibilities';

    if (isBackendProject) {
      const parentBackendId = asBackendId(parentId);
      if (!isTrunk && parentId && parentBackendId == null) {
        showToast(lang === 'zh' ? '目标节点尚未同步到后端' : 'Target node is not on backend');
        return;
      }
      void (async () => {
        try {
          setSyncStatus('syncing');
          const created = await createNode(backendProjectId, {
            parent_id: parentBackendId,
            node_type_key: 'person',
            title: displayName,
            description: `${template.defaultRole} / ${template.defaultDept}`,
            sort_order: isTrunk ? mainTrunkNodes.length : 0,
            assignees: asBackendId(randomMember.id)
              ? [{ user_id: asBackendId(randomMember.id)!, role_key: 'primary' }]
              : [],
          });
          await createNode(backendProjectId, {
            parent_id: created.id,
            node_type_key: 'scope',
            title: scopeTitle,
          });
          if (parentId) setExpandedNodes((prev) => ({ ...prev, [parentId]: true }));
          await reloadAxisFromBackend();
          setSelectedNodeId(String(created.id));
          showToast(
            lang === 'zh'
              ? `已创建人员【${displayName}】并写回后端`
              : `Created person ${displayName}`,
          );
        } catch (err) {
          showToast(err instanceof Error ? err.message : '创建失败');
          setSyncStatus('synced');
        }
      })();
      return;
    }

    const newPerson: TeamMember = {
      id: `person-${Date.now()}`,
      name: displayName,
      role: template.defaultRole,
      department: template.defaultDept,
      avatar: `https://images.unsplash.com/photo-${1534528741775 + Math.floor(Math.random() * 1000)}?w=150&auto=format&fit=crop&q=80`
    };

    const newNode: PeopleAxisNode = {
      id: `node-${Date.now()}`,
      parentId,
      person: newPerson,
      orderOnAxis: isTrunk ? mainTrunkNodes.length + 1 : 0,
      roleTitle: template.defaultRole,
      workItems: [
        {
          id: `wi-drop-${Date.now()}-1`,
          title: scopeTitle,
          type: 'scope',
          status: 'In Progress',
          progress: 30,
          dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
          evidences: []
        }
      ],
      aiContext: {
        riskLevel: 'low',
        summary: `${newPerson.name} 从左侧面板拖入并已在网络中完成定位与自动拉伸。`,
        lastAnalysis: '主轴线路长度根据卡片布局自适应延伸。',
        suggestedActions: ['配置详细责任指标', '关联第一批跟进证据']
      }
    };

    setNodes(prev => {
      const updated = [...prev, newNode];
      return updated;
    });

    if (parentId) {
      setExpandedNodes(prev => ({ ...prev, [parentId]: true }));
    }
    setSelectedNodeId(newNode.id);

    const parentNode = nodes.find(n => n.id === parentId);
    showToast(
      isTrunk
        ? (lang === 'zh'
            ? `🎉 [拖拽定位成功] 已在主轴新增【${newPerson.name}】地铁站点！主轴已自动延伸拉伸！`
            : `Added station for ${newPerson.name} on trunk!`)
        : (lang === 'zh'
            ? `🎉 [拖拽挂载成功] 已将【${newPerson.name}】挂载为【${parentNode?.person.name || ''}】直属下属！`
            : `Attached ${newPerson.name} under parent!`)
    );
  }, [
    lang,
    nodes,
    mainTrunkNodes.length,
    showToast,
    isBackendProject,
    backendProjectId,
    memberOptions,
    reloadAxisFromBackend,
  ]);

  // Global Mouse Move and Mouse Up Listener for Palette Drag-and-Drop
  useEffect(() => {
    if (!paletteDraggingItem) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPaletteDragPos({ x: e.clientX, y: e.clientY });

      if (!contentRef.current) return;
      const contentEl = contentRef.current;
      const contentRect = contentEl.getBoundingClientRect();

      // Hit test over node cards
      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      let targetNodeEl: HTMLElement | null = null;

      for (const el of elements) {
        const anchorEl = (el as HTMLElement).closest('[data-node-anchor]') as HTMLElement;
        if (anchorEl) {
          targetNodeEl = anchorEl;
          break;
        }
      }

      if (targetNodeEl) {
        const nodeId = targetNodeEl.getAttribute('data-node-anchor');
        if (nodeId) {
          const rect = targetNodeEl.getBoundingClientRect();
          setDropHoverTarget({
            type: 'node',
            nodeId,
            x: (rect.left + rect.width / 2 - contentRect.left) / zoomLevel,
            y: (rect.top + rect.height / 2 - contentRect.top) / zoomLevel
          });
          return;
        }
      }

      // Otherwise drop target is on Trunk Line
      const mouseCanvasX = (e.clientX - contentRect.left) / zoomLevel;
      const mouseCanvasY = (e.clientY - contentRect.top) / zoomLevel;
      setDropHoverTarget({
        type: 'trunk',
        x: mouseCanvasX,
        y: mouseCanvasY
      });
    };

    const handleMouseUp = () => {
      if (paletteDraggingItem && dropHoverTarget) {
        executePaletteDrop(paletteDraggingItem, dropHoverTarget);
      }
      setPaletteDraggingItem(null);
      setDropHoverTarget(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [paletteDraggingItem, dropHoverTarget, zoomLevel, executePaletteDrop]);

  const handlePaletteDragStart = (template: PaletteTemplate, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPaletteDraggingItem(template);
    setPaletteDragPos({ x: e.clientX, y: e.clientY });
  };

  // Overall Project Director (Station 0, Head of the Subway Trunk Line)
  const headLeaderNode = useMemo(() => {
    return mainTrunkNodes[0] || null;
  }, [mainTrunkNodes]);

  // Other Department / Vendor Leaders sitting along the main subway line
  const sideLeaderNodes = useMemo(() => {
    return mainTrunkNodes.slice(1);
  }, [mainTrunkNodes]);

  const getChildNodes = useCallback((parentId: string) => {
    return nodes.filter(n => n.parentId === parentId);
  }, [nodes]);

  // Overall project progress percentage
  const totalProjectProgress = useMemo(() => averagePeopleAxisProgress(nodes), [nodes]);

  const toggleExpandNode = (nodeId: string) => {
    setExpandedNodes(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  const toggleExpandAll = (expand: boolean) => {
    const next: Record<string, boolean> = {};
    nodes.forEach(n => {
      next[n.id] = expand;
    });
    setExpandedNodes(next);
  };

  // Card Mouse Drag Handlers
  const handleCardMouseDown = (nodeId: string, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select, a, textarea')) return;
    e.preventDefault();
    e.stopPropagation();
    setDraggingNodeId(nodeId);
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
  };

  // Canvas Mouse Drag (Pan Canvas) Handler
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select, a, textarea, [data-node-anchor]')) return;
    e.preventDefault();
    setIsPanningCanvas(true);
    panStartRef.current = { x: e.clientX - canvasPan.x, y: e.clientY - canvasPan.y };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (draggingNodeId) {
      const dx = (e.clientX - dragStartPosRef.current.x) / zoomLevel;
      const dy = (e.clientY - dragStartPosRef.current.y) / zoomLevel;
      setDragOffsets(prev => {
        const current = prev[draggingNodeId] || { x: 0, y: 0 };
        const next = {
          ...prev,
          [draggingNodeId]: { x: current.x + dx, y: current.y + dy }
        };
        dragOffsetsRef.current = next;
        return next;
      });
      dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    } else if (isPanningCanvas) {
      setCanvasPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y
      });
    }
  }, [draggingNodeId, isPanningCanvas, zoomLevel, canvasPan]);

  const handleMouseUp = useCallback(() => {
    const nid = draggingNodeId;
    const offset = nid ? dragOffsetsRef.current[nid] : null;
    setDraggingNodeId(null);
    setIsPanningCanvas(false);
    if (isBackendProject && nid && offset) {
      const backendId = asBackendId(nid);
      if (backendId != null) {
        void putNodeLayout(backendId, offset).catch(() => undefined);
      }
    }
  }, [draggingNodeId, isBackendProject]);

  useEffect(() => {
    if (draggingNodeId || isPanningCanvas) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingNodeId, isPanningCanvas, handleMouseMove, handleMouseUp]);

  const resetAllDragOffsets = () => {
    setDragOffsets({});
    setCanvasPan({ x: 0, y: 0 });
    setZoomLevel(1);
  };

  // Calculate SVG connection paths (Dynamic Metro Spine + Adaptive Edge Connectors)
  const calculatePaths = useCallback(() => {
    if (!contentRef.current || viewMode !== 'visual-tree' || activeTab !== 'chain') return;

    const contentEl = contentRef.current;
    const contentRect = contentEl.getBoundingClientRect();
    const newPaths: PathData[] = [];

    const getNodeCoords = (nodeId: string) => {
      const el = contentEl.querySelector(`[data-node-anchor="${nodeId}"]`);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        left: (rect.left - contentRect.left) / zoomLevel,
        right: (rect.right - contentRect.left) / zoomLevel,
        top: (rect.top - contentRect.top) / zoomLevel,
        bottom: (rect.bottom - contentRect.top) / zoomLevel,
        width: rect.width / zoomLevel,
        height: rect.height / zoomLevel,
        centerX: (rect.left + rect.width / 2 - contentRect.left) / zoomLevel,
        centerY: (rect.top + rect.height / 2 - contentRect.top) / zoomLevel,
      };
    };

    if (!headLeaderNode) return;
    const headCoords = getNodeCoords(headLeaderNode.id);

    if (headCoords) {
      let spineD = '';
      let spineEndX = 0;
      let spineEndY = 0;
      const stationDots: { id: string; x: number; y: number; name: string }[] = [];

      if (treeOrientation === 'horizontal') {
        // Horizontal mode (左右视图)
        // Project Director (headLeaderNode) is on the far left.
        // Spine starts EXACTLY at headLeaderNode's right edge center
        const startX = headCoords.right;
        const startY = headCoords.centerY;

        // Find maxRight coordinate across ALL rendered nodes (side leaders & subordinates)
        let maxRight = startX + 240;
        nodes.forEach(node => {
          const coords = getNodeCoords(node.id);
          if (coords && coords.right > maxRight) {
            maxRight = coords.right;
          }
        });

        // Terminal buffer extending seamlessly past the last card
        spineEndX = maxRight + 80;
        spineEndY = startY;
        spineD = `M ${startX} ${startY} L ${spineEndX} ${spineEndY}`;

        // Stems from main spine (Y = startY) to each sideLeaderNode card
        sideLeaderNodes.forEach(leader => {
          const leaderCoords = getNodeCoords(leader.id);
          if (leaderCoords) {
            const isAbove = leaderCoords.centerY < startY;
            const targetY = isAbove ? leaderCoords.bottom : leaderCoords.top;
            const sx = leaderCoords.centerX;

            // Record exact junction dot on the Metro Spine line
            stationDots.push({
              id: leader.id,
              x: sx,
              y: startY,
              name: leader.person.name
            });

            newPaths.push({
              id: `spine-stem-${leader.id}`,
              d: `M ${sx} ${startY} L ${sx} ${targetY}`,
              isMainAxis: true,
              parentId: 'subway-line',
              childId: leader.id,
            });
          }
        });
      } else {
        // Vertical mode (纵轴/上下视图)
        // Project Director (headLeaderNode) is at the very top.
        // Spine starts EXACTLY at headLeaderNode's bottom edge center
        const startX = headCoords.centerX;
        const startY = headCoords.bottom;

        // Find maxBottom coordinate across ALL rendered nodes
        let maxBottom = startY + 240;
        nodes.forEach(node => {
          const coords = getNodeCoords(node.id);
          if (coords && coords.bottom > maxBottom) {
            maxBottom = coords.bottom;
          }
        });

        // Terminal buffer
        spineEndX = startX;
        spineEndY = maxBottom + 80;
        spineD = `M ${startX} ${startY} L ${spineEndX} ${spineEndY}`;

        // Stems from main spine (X = startX) to each sideLeaderNode card
        sideLeaderNodes.forEach(leader => {
          const leaderCoords = getNodeCoords(leader.id);
          if (leaderCoords) {
            const isLeft = leaderCoords.centerX < startX;
            const targetX = isLeft ? leaderCoords.right : leaderCoords.left;
            const sy = leaderCoords.centerY;

            // Record exact junction dot on the Metro Spine line
            stationDots.push({
              id: leader.id,
              x: startX,
              y: sy,
              name: leader.person.name
            });

            newPaths.push({
              id: `spine-stem-${leader.id}`,
              d: `M ${startX} ${sy} L ${targetX} ${sy}`,
              isMainAxis: true,
              parentId: 'subway-line',
              childId: leader.id,
            });
          }
        });
      }

      const delta = Math.max(0, alongDelta || 0);
      if (treeOrientation === 'horizontal') spineEndX += delta;
      else spineEndY += delta;
      // 重写终点线段（避免重复 L）
      spineD = spineD.replace(/L [\d.-]+ [\d.-]+$/, `L ${spineEndX} ${spineEndY}`);
      setMainSpineData({ d: spineD, endX: spineEndX, endY: spineEndY, stationDots });
    }

    // Subordinate branch connections (Adaptive non-penetrating edge connections)
    nodes.forEach(child => {
      if (!child.parentId || !expandedNodes[child.parentId]) return;
      const parentCoords = getNodeCoords(child.parentId);
      const childCoords = getNodeCoords(child.id);

      if (parentCoords && childCoords) {
        const dx = childCoords.centerX - parentCoords.centerX;
        const dy = childCoords.centerY - parentCoords.centerY;

        let px = 0;
        let py = 0;
        let cx = 0;
        let cy = 0;
        let c1x = 0;
        let c1y = 0;
        let c2x = 0;
        let c2y = 0;

        if (Math.abs(dx) >= Math.abs(dy)) {
          // Horizontal dominant relationship (Child is to Left or Right of Parent)
          if (dx > 0) {
            // Child is to the RIGHT of Parent
            px = parentCoords.right;
            py = parentCoords.centerY;
            cx = childCoords.left;
            cy = childCoords.centerY;
          } else {
            // Child is to the LEFT of Parent
            px = parentCoords.left;
            py = parentCoords.centerY;
            cx = childCoords.right;
            cy = childCoords.centerY;
          }
          const dist = Math.max(20, Math.abs(cx - px) * 0.4);
          const dir = dx > 0 ? 1 : -1;
          c1x = px + dir * dist;
          c1y = py;
          c2x = cx - dir * dist;
          c2y = cy;
        } else {
          // Vertical dominant relationship (Child is Above or Below Parent)
          if (dy > 0) {
            // Child is BELOW Parent
            px = parentCoords.centerX;
            py = parentCoords.bottom;
            cx = childCoords.centerX;
            cy = childCoords.top;
          } else {
            // Child is ABOVE Parent
            px = parentCoords.centerX;
            py = parentCoords.top;
            cx = childCoords.centerX;
            cy = childCoords.bottom;
          }
          const dist = Math.max(20, Math.abs(cy - py) * 0.4);
          const dir = dy > 0 ? 1 : -1;
          c1x = px;
          c1y = py + dir * dist;
          c2x = cx;
          c2y = cy - dir * dist;
        }

        const d = `M ${px} ${py} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${cx} ${cy}`;

        newPaths.push({
          id: `branch-${child.parentId}-${child.id}`,
          d,
          isMainAxis: false,
          parentId: child.parentId,
          childId: child.id,
        });
      }
    });

    setPaths(newPaths);
  }, [nodes, headLeaderNode, sideLeaderNodes, expandedNodes, treeOrientation, zoomLevel, viewMode, activeTab, dragOffsets, alongDelta]);

  useLayoutEffect(() => {
    calculatePaths();
    const timer1 = setTimeout(calculatePaths, 60);
    const timer2 = setTimeout(calculatePaths, 200);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [calculatePaths, dragOffsets]);

  useEffect(() => {
    window.addEventListener('resize', calculatePaths);
    let observer: ResizeObserver | null = null;
    if (contentRef.current && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        calculatePaths();
      });
      observer.observe(contentRef.current);
    }
    return () => {
      window.removeEventListener('resize', calculatePaths);
      if (observer) observer.disconnect();
    };
  }, [calculatePaths]);

  // Render Head Leader Subordinates in Vertical Mode (Flanking Left & Right of the Center Trunk Line)
  const renderHeadSubordinatesVertical = (headNode: PeopleAxisNode) => {
    const children = getChildNodes(headNode.id);
    const isExpanded = expandedNodes[headNode.id] ?? true;

    if (children.length === 0 || !isExpanded) return null;

    const half = Math.ceil(children.length / 2);
    const leftChildren = children.slice(0, half);
    const rightChildren = children.slice(half);

    return (
      <div className="flex flex-row items-center justify-center shrink-0 mt-8 relative w-full">
        {/* Left Subordinates Slot */}
        <div className="flex-1 flex flex-row items-center justify-end pr-6 gap-6">
          {leftChildren.map(child => (
            <div key={child.id} className="flex flex-col items-center">
              {renderPersonCard(child, false, false)}
              {renderSubordinates(child)}
            </div>
          ))}
        </div>

        {/* Center Pass-through Gap for Vertical Metro Spine Line */}
        <div className="w-16 h-12 shrink-0 flex items-center justify-center relative pointer-events-none" />

        {/* Right Subordinates Slot */}
        <div className="flex-1 flex flex-row items-center justify-start pl-6 gap-6">
          {rightChildren.map(child => (
            <div key={child.id} className="flex flex-col items-center">
              {renderPersonCard(child, false, false)}
              {renderSubordinates(child)}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Helper to check circular parent-child dependency
  const isDescendantNode = (allNodes: PeopleAxisNode[], ancestorId: string, targetId: string): boolean => {
    if (ancestorId === targetId) return true;
    const directChildren = allNodes.filter(n => n.parentId === ancestorId);
    return directChildren.some(child => isDescendantNode(allNodes, child.id, targetId));
  };

  // Re-linking target handlers
  const handleConnectToTarget = (targetNodeId: string) => {
    if (!linkingSourceNodeId) return;
    if (linkingSourceNodeId === targetNodeId) return;

    if (isDescendantNode(nodes, linkingSourceNodeId, targetNodeId)) {
      showToast(lang === 'zh' ? '⚠️ 不能挂载到自己的下属节点上（防止死循环）！' : 'Cannot attach to descendant node!');
      return;
    }

    const sourceNode = nodes.find(n => n.id === linkingSourceNodeId);
    const targetNode = nodes.find(n => n.id === targetNodeId);
    const sourceId = asBackendId(linkingSourceNodeId);
    const targetId = asBackendId(targetNodeId);

    if (isBackendProject) {
      if (sourceId == null || targetId == null) {
        showToast(lang === 'zh' ? '节点尚未同步到后端，无法挂载' : 'Node not on backend');
        return;
      }
      void (async () => {
        try {
          setSyncStatus('syncing');
          await moveNode(sourceId, { new_parent_id: targetId, sort_order: 0 });
          setExpandedNodes((prev) => ({ ...prev, [targetNodeId]: true }));
          setLinkingSourceNodeId(null);
          setLinkingHoveredTargetId(null);
          await reloadAxisFromBackend();
          showToast(
            lang === 'zh'
              ? `已将【${sourceNode?.person.name || ''}】挂载到【${targetNode?.person.name || ''}】`
              : `Attached ${sourceNode?.person.name} under ${targetNode?.person.name}`,
          );
        } catch (err) {
          showToast(err instanceof Error ? err.message : '挂载失败');
          setSyncStatus('synced');
        }
      })();
      return;
    }

    const updated = nodes.map(n => {
      if (n.id === linkingSourceNodeId) {
        return {
          ...n,
          parentId: targetNodeId
        };
      }
      return n;
    });

    handleSaveNodes(updated);
    setExpandedNodes(prev => ({ ...prev, [targetNodeId]: true }));
    setLinkingSourceNodeId(null);
    setLinkingHoveredTargetId(null);
    showToast(
      lang === 'zh'
        ? `⚡ [Draw.io 连线更新] 已成功将【${sourceNode?.person.name || ''}】移动挂载为【${targetNode?.person.name || ''}】的直属下属！`
        : `Attached ${sourceNode?.person.name} under ${targetNode?.person.name}`
    );
  };

  const handleConnectToSpine = () => {
    if (!linkingSourceNodeId) return;
    const sourceNode = nodes.find(n => n.id === linkingSourceNodeId);
    const sourceId = asBackendId(linkingSourceNodeId);

    if (isBackendProject) {
      if (sourceId == null) {
        showToast(lang === 'zh' ? '节点尚未同步到后端' : 'Node not on backend');
        return;
      }
      void (async () => {
        try {
          setSyncStatus('syncing');
          await moveNode(sourceId, {
            new_parent_id: null,
            sort_order: mainTrunkNodes.length,
          });
          setLinkingSourceNodeId(null);
          setLinkingHoveredTargetId(null);
          await reloadAxisFromBackend();
          showToast(
            lang === 'zh'
              ? `已将【${sourceNode?.person.name || ''}】提升为主干`
              : `Promoted ${sourceNode?.person.name} to trunk`,
          );
        } catch (err) {
          showToast(err instanceof Error ? err.message : '提升失败');
          setSyncStatus('synced');
        }
      })();
      return;
    }

    const updated = nodes.map(n => {
      if (n.id === linkingSourceNodeId) {
        return {
          ...n,
          parentId: undefined
        };
      }
      return n;
    });

    handleSaveNodes(updated);
    setLinkingSourceNodeId(null);
    setLinkingHoveredTargetId(null);
    showToast(
      lang === 'zh'
        ? `🚩 [主轴升级] 已将【${sourceNode?.person.name || ''}】提升为主干部门主管！`
        : `Promoted ${sourceNode?.person.name} to main trunk leader!`
    );
  };

  // Handlers for adding Node, WorkItem, Evidence
  const handleAddNode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBackendProject) {
      showToast(lang === 'zh' ? '请先选择具体项目后再挂载责任人' : 'Select a concrete project before adding a person');
      return;
    }
    let personToAssign: TeamMember;

    if (isCustomPerson && customName.trim()) {
      personToAssign = {
        id: `person-${Date.now()}`,
        name: customName.trim(),
        role: customRole.trim() || '责任项目专家',
        department: customDept.trim() || '外部协作单位',
        avatar: `https://images.unsplash.com/photo-${1534528741775 + Math.floor(Math.random() * 1000)}?w=150&auto=format&fit=crop&q=80`
      };
    } else {
      personToAssign =
        memberOptions.find((m) => m.id === newPersonId) || memberOptions[0];
      if (!personToAssign) {
        showToast(lang === 'zh' ? '项目暂无可分配成员' : 'No project members available');
        return;
      }
    }

    const scopeLines = customWorkScope
      .split('\n')
      .map((l) => l.replace(/^[-*•\d.]+\s*/, '').trim())
      .filter(Boolean);
    const parentBackendId = asBackendId(newParentId || null);
    const assigneeUserId = asBackendId(personToAssign.id);

    if (isBackendProject) {
      if (newParentId && parentBackendId == null) {
        showToast(lang === 'zh' ? '上级节点尚未同步到后端' : 'Parent not on backend');
        return;
      }
      void (async () => {
        try {
          setSyncStatus('syncing');
          const created = await createNode(backendProjectId, {
            parent_id: parentBackendId,
            node_type_key: 'person',
            title: personToAssign.name,
            description: [
              newRoleTitle || personToAssign.role,
              personToAssign.department,
              `risk=${customRiskLevel}`,
            ]
              .filter(Boolean)
              .join(' / '),
            sort_order: newParentId ? 0 : mainTrunkNodes.length,
            assignees:
              !isCustomPerson && assigneeUserId
                ? [{ user_id: assigneeUserId, role_key: 'primary' }]
                : [],
          });
          for (const line of scopeLines) {
            await createNode(backendProjectId, {
              parent_id: created.id,
              node_type_key: 'scope',
              title: line,
            });
          }
          if (newParentId) {
            setExpandedNodes((prev) => ({ ...prev, [newParentId]: true }));
          }
          setIsAddingNode(false);
          setNewRoleTitle('');
          setCustomName('');
          setCustomRole('');
          setCustomDept('');
          setCustomWorkScope('');
          await reloadAxisFromBackend();
          setSelectedNodeId(String(created.id));
          showToast(
            lang === 'zh'
              ? `已将【${personToAssign.name}】写回责任体系`
              : `Mounted ${personToAssign.name}`,
          );
        } catch (err) {
          showToast(err instanceof Error ? err.message : '创建人员失败');
          setSyncStatus('synced');
        }
      })();
      return;
    }

    const initialWorkItems: AxisWorkItem[] = scopeLines.map((line, idx) => ({
      id: `wi-init-${Date.now()}-${idx}`,
      title: line,
      type: 'scope' as const,
      status: 'In Progress' as const,
      progress: 20,
      dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      evidences: [],
    }));

    const newNode: PeopleAxisNode = {
      id: `node-${Date.now()}`,
      parentId: newParentId || undefined,
      person: personToAssign,
      orderOnAxis: newParentId ? 0 : mainTrunkNodes.length + 1,
      roleTitle: newRoleTitle || personToAssign.role,
      workItems: initialWorkItems,
      aiContext: {
        riskLevel: customRiskLevel,
        summary: `${personToAssign.name} 已成功挂载入责任体系。`,
        lastAnalysis: '新节点配置与关联初始化完成。',
        suggestedActions: ['完善交付节点归口', '定期跟进进展证据']
      }
    };

    handleSaveNodes([...nodes, newNode]);
    if (newParentId) {
      setExpandedNodes(prev => ({ ...prev, [newParentId]: true }));
    }
    setIsAddingNode(false);
    setNewRoleTitle('');
    setCustomName('');
    setCustomRole('');
    setCustomDept('');
    setCustomWorkScope('');
    showToast(
      lang === 'zh'
        ? `🎉 已成功将【${personToAssign.name}】挂载至责任体系中！`
        : `Successfully mounted ${personToAssign.name}!`
    );
  };

  const handleAddWorkItem = (nodeId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkTitle.trim()) return;

    if (!isBackendProject) {
      showToast(lang === 'zh' ? '请先选择具体项目后再挂载事项' : 'Select a concrete project before adding work');
      return;
    }

    if (isBackendProject) {
      const parentId = asBackendId(nodeId);
      if (parentId == null) {
        showToast(lang === 'zh' ? '人员节点尚未同步到后端' : 'Person node not on backend');
        return;
      }
      void (async () => {
        try {
          setSyncStatus('syncing');
          await createNode(backendProjectId, {
            parent_id: parentId,
            node_type_key: matterTypeKey(newWorkType),
            title: newWorkTitle.trim(),
          });
          setIsAddingWorkItem(null);
          setNewWorkTitle('');
          await reloadAxisFromBackend();
          showToast(lang === 'zh' ? '事项已创建' : 'Work item created');
        } catch (err) {
          showToast(err instanceof Error ? err.message : '创建事项失败');
          setSyncStatus('synced');
        }
      })();
      return;
    }

    const newWi: AxisWorkItem = {
      id: `wi-${Date.now()}`,
      title: newWorkTitle,
      type: newWorkType,
      status: 'In Progress',
      progress: 30,
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      evidences: []
    };

    const updated = nodes.map(n => {
      if (n.id === nodeId) {
        return {
          ...n,
          workItems: [...n.workItems, newWi]
        };
      }
      return n;
    });

    handleSaveNodes(updated);
    setIsAddingWorkItem(null);
    setNewWorkTitle('');
  };

  const handleAddEvidence = (nodeId: string, workItemId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvTitle.trim()) return;

    if (!isBackendProject) {
      showToast(lang === 'zh' ? '请先选择具体项目后再提交证据' : 'Select a concrete project before submitting evidence');
      return;
    }

    if (isBackendProject) {
      const matterId = asBackendId(workItemId) ?? asBackendId(nodeId);
      if (matterId == null) {
        showToast(lang === 'zh' ? '事项尚未同步到后端' : 'Matter not on backend');
        return;
      }
      const summary = [
        `[${newEvType}] ${newEvTitle.trim()}`,
        newEvUrl ? `url: ${newEvUrl}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      void (async () => {
        try {
          setSyncStatus('syncing');
          await submitEvidence(matterId, {
            summary,
            evidence_kind: newEvType,
            external_url: newEvUrl || undefined,
          });
          setIsAddingEvidence(null);
          setNewEvTitle('');
          setNewEvUrl('');
          await reloadAxisFromBackend();
          showToast(lang === 'zh' ? '证据已提交' : 'Evidence submitted');
        } catch (err) {
          showToast(err instanceof Error ? err.message : '提交证据失败');
          setSyncStatus('synced');
        }
      })();
      return;
    }

    const newEv: AxisEvidence = {
      id: `ev-${Date.now()}`,
      type: newEvType,
      title: newEvTitle,
      url: newEvUrl || '#proof',
      timestamp: new Date().toISOString().slice(5, 16).replace('T', ' '),
      status: 'verified'
    };

    const updated = nodes.map(n => {
      if (n.id === nodeId) {
        return {
          ...n,
          workItems: n.workItems.map(wi => {
            if (wi.id === workItemId) {
              return {
                ...wi,
                evidences: [...wi.evidences, newEv],
                status: 'Done',
                progress: 100
              };
            }
            return wi;
          })
        };
      }
      return n;
    });

    handleSaveNodes(updated);
    setIsAddingEvidence(null);
    setNewEvTitle('');
  };

  // Render Person Card Component
  const renderPersonCard = (node: PeopleAxisNode, isOverallLeader: boolean, isMainAxisLeader: boolean) => {
    const childNodes = getChildNodes(node.id);
    const isExpanded = expandedNodes[node.id] ?? true;
    const isSelected = selectedNodeId === node.id;
    const offset = dragOffsets[node.id] || { x: 0, y: 0 };
    const isBeingDragged = draggingNodeId === node.id;
    const isLinkingSource = linkingSourceNodeId === node.id;
    const isLinkingTarget = linkingSourceNodeId !== null && linkingHoveredTargetId === node.id && !isLinkingSource;

    return (
      <div
        key={node.id}
        data-node-anchor={node.id}
        onMouseDown={e => {
          if (!linkingSourceNodeId) {
            handleCardMouseDown(node.id, e);
          }
        }}
        onMouseEnter={() => {
          if (linkingSourceNodeId && !isLinkingSource) {
            setLinkingHoveredTargetId(node.id);
          }
        }}
        onMouseLeave={() => {
          if (linkingSourceNodeId && linkingHoveredTargetId === node.id) {
            setLinkingHoveredTargetId(null);
          }
        }}
        onClick={e => {
          e.stopPropagation();
          if (linkingSourceNodeId) {
            if (!isLinkingSource) {
              handleConnectToTarget(node.id);
            }
          } else {
            setSelectedNodeId(node.id);
          }
        }}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          transition: isBeingDragged ? 'none' : 'transform 0.15s cubic-bezier(0.2, 0, 0, 1)'
        }}
        className={`rounded-3xl p-5 border relative transition-all cursor-grab active:cursor-grabbing select-none shrink-0 w-[320px] sm:w-[350px] ${
          isLinkingSource
            ? 'bg-cyan-500/20 border-cyan-500 shadow-2xl ring-4 ring-cyan-500/80 scale-[1.02] z-30'
            : isLinkingTarget
            ? 'bg-emerald-500/25 border-emerald-500 shadow-2xl ring-4 ring-emerald-500 scale-[1.04] z-30 cursor-pointer animate-pulse'
            : linkingSourceNodeId
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
        {/* Draw.io connection anchor badge */}
        {linkingSourceNodeId && !isLinkingSource && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-emerald-500 text-black text-[10px] font-black shadow-md flex items-center gap-1 z-20">
            <span className="material-symbols-outlined text-xs">south</span>
            <span>{lang === 'zh' ? '点击设为直属上级' : 'Set Parent'}</span>
          </div>
        )}

        {/* Drag handle indicator */}
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

          {childNodes.length > 0 && (
            <button
              onClick={e => {
                e.stopPropagation();
                toggleExpandNode(node.id);
              }}
              className="px-2 py-0.5 rounded-lg bg-surface-container-highest hover:bg-surface-variant text-on-surface text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer"
              title={lang === 'zh' ? '展开/折叠下属成员' : 'Toggle subordinates'}
            >
              <span className="material-symbols-outlined text-sm">
                {isExpanded ? 'folder_open' : 'folder'}
              </span>
              <span>{childNodes.length}</span>
            </button>
          )}
        </div>

        {/* User Profile */}
        <div className="flex items-center gap-3.5 mb-3">
          <img
            src={node.person.avatar}
            alt={node.person.name}
            className={`w-12 h-12 rounded-2xl object-cover shrink-0 ring-2 ${
              isOverallLeader ? 'ring-amber-500' : isMainAxisLeader ? 'ring-primary' : 'ring-outline-variant/30'
            }`}
          />
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

          {node.workItems.slice(0, 2).map(wi => (
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

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-outline-variant/30 text-xs">
          <button
            onClick={e => {
              e.stopPropagation();
              setIsAddingWorkItem(node.id);
            }}
            className="px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-bold transition-all flex items-center gap-1 cursor-pointer text-[11px]"
          >
            <span className="material-symbols-outlined text-sm">add_task</span>
            <span>{lang === 'zh' ? '挂载事项' : 'Task'}</span>
          </button>

          {/* Draw.io Re-linking button */}
          <button
            onClick={e => {
              e.stopPropagation();
              if (isLinkingSource) {
                setLinkingSourceNodeId(null);
                setLinkingHoveredTargetId(null);
                showToast(lang === 'zh' ? '已取消连线操作' : 'Cancelled linking');
              } else {
                setLinkingSourceNodeId(node.id);
                showToast(lang === 'zh' ? `🔗 已激活 Draw.io 连线模式！请移动鼠标点击目标卡片以将【${node.person.name}】挂载过去` : 'Draw.io re-linking active');
              }
            }}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer ${
              isLinkingSource
                ? 'bg-cyan-500 text-black shadow-lg animate-pulse ring-2 ring-cyan-300'
                : 'bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30'
            }`}
            title={lang === 'zh' ? 'Draw.io 连线模式：点击后可移动鼠标至另一个卡片上自动成为后者卡片的子节点' : 'Draw.io Re-link: Change parent'}
          >
            <span className="material-symbols-outlined text-sm">hub</span>
            <span>{isLinkingSource ? (lang === 'zh' ? '取消连线' : 'Cancel') : (lang === 'zh' ? 'Draw.io 连线' : 'Re-link')}</span>
          </button>

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
    );
  };

  // Render Subordinates Block for a Leader
  const renderSubordinates = (leaderNode: PeopleAxisNode) => {
    const children = getChildNodes(leaderNode.id);
    const isExpanded = expandedNodes[leaderNode.id] ?? true;

    if (children.length === 0 || !isExpanded) return null;

    return (
      <div className={`flex ${treeOrientation === 'horizontal' ? 'flex-col gap-8' : 'flex-row gap-8'} items-center justify-center`}>
        {children.map(child => (
          <div key={child.id} className="flex flex-col items-center">
            {renderPersonCard(child, false, false)}
            {/* Recursive children if any */}
            {renderSubordinates(child)}
          </div>
        ))}
      </div>
    );
  };

  // Calculate active Draw.io source node SVG coordinates
  const sourceCoords = useMemo(() => {
    if (!linkingSourceNodeId || !contentRef.current) return null;
    const contentEl = contentRef.current;
    const contentRect = contentEl.getBoundingClientRect();
    const el = contentEl.querySelector(`[data-node-anchor="${linkingSourceNodeId}"]`);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: (rect.left + rect.width / 2 - contentRect.left) / zoomLevel,
      y: (rect.top + rect.height / 2 - contentRect.top) / zoomLevel
    };
  }, [linkingSourceNodeId, zoomLevel, dragOffsets, canvasPan]);

  return (
    <div className="min-h-screen bg-background text-on-surface p-4 sm:p-6 lg:p-8 space-y-8 max-w-[1700px] mx-auto relative">
      {backendLoadError && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-sm px-4 py-3">
          {backendLoadError}
        </div>
      )}
      {projectId && projectId !== 'all' && !backendLoadError && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 text-primary text-sm px-4 py-2">
          {lang === 'zh'
            ? `已从后端加载项目 #${projectId} 的人轴树（只读同步；写回见 BACKEND_GAP.md）`
            : `Loaded people-axis tree for project #${projectId} from backend`}
        </div>
      )}
      {/* HEADER BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-outline-variant/30 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
              {lang === 'zh' ? '人轴地铁站点责任网络 V3.0' : 'People-Axis Metro Network'}
            </span>
            <span className="text-xs font-bold text-on-surface-variant flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${syncStatus === 'synced' ? 'bg-emerald-500' : 'bg-amber-500 animate-ping'}`} />
              {syncStatus === 'synced' ? (lang === 'zh' ? '双端已实时推流同步' : 'Synced') : (lang === 'zh' ? '正在落盘...' : 'Saving...')}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-on-surface tracking-tight mt-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-3xl">route</span>
            <span>{lang === 'zh' ? '人为主干，地铁站点图结构責任链' : 'Subway Route Spine Responsibility Chain'}</span>
          </h1>
          <p className="text-sm text-on-surface-variant mt-1 font-medium max-w-3xl">
            {lang === 'zh'
              ? '主干即地铁线路：总负责人挂在主干线一头，各部门/厂家领导分列主干两侧。下属卡片连接至主负责人边界中间，支持拖拽自适应拉长！'
              : 'Metro subway trunk structure: Overall director at one end, vendor/department leaders on alternating sides, subordinates connected at boundary midpoints with draggable cards.'}
          </p>
        </div>

        {/* View Controls & Action Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-surface-container dark:bg-[#1e2022] border border-outline-variant/40 rounded-2xl p-1.5 flex items-center gap-1 shadow-sm">
            <button
              onClick={() => setTreeOrientation('horizontal')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                treeOrientation === 'horizontal'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-sm">swap_horiz</span>
              <span>{lang === 'zh' ? '左右纵树 (横向主轴)' : 'Horizontal Trunk'}</span>
            </button>
            <button
              onClick={() => setTreeOrientation('vertical')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                treeOrientation === 'vertical'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-sm">swap_vert</span>
              <span>{lang === 'zh' ? '上下纵树 (纵向主轴)' : 'Vertical Trunk'}</span>
            </button>
          </div>

          <button
            onClick={resetAllDragOffsets}
            className="px-3.5 py-2 rounded-2xl bg-surface-container border border-outline-variant/40 hover:border-primary/40 text-on-surface text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            title={lang === 'zh' ? '重置卡片拖拽位置' : 'Reset Card Drag Positions'}
          >
            <span className="material-symbols-outlined text-sm">restart_alt</span>
            <span>{lang === 'zh' ? '重置拖拽布局' : 'Reset Drag Layout'}</span>
          </button>

          <button
            disabled={!isBackendProject}
            onClick={() => {
              if (isBackendProject) setIsAddingNode(true);
              else showToast(lang === 'zh' ? '请先在顶部选择具体项目' : 'Select a concrete project first');
            }}
            className="px-4 py-2 rounded-2xl bg-primary hover:bg-primary/90 text-on-primary text-xs font-black shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-base">person_add</span>
            <span>{lang === 'zh' ? '挂载新责任人' : 'Add Person'}</span>
          </button>
        </div>
      </div>

      {/* METRO SUBWAY TRUNK PROGRESS BANNER */}
      <div className="bg-gradient-to-r from-surface-container via-surface to-surface-container border border-outline-variant/40 rounded-3xl p-5 shadow-lg flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
        <div className="flex items-center gap-4 z-10">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-primary text-3xl animate-pulse">subway</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black text-on-surface">
                {lang === 'zh' ? '主干项目进度轨 (Metro Spine Progress)' : 'Trunk Line Progress Rail'}
              </h3>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-black">
                {totalProjectProgress}% {lang === 'zh' ? '总进度' : 'Completed'}
              </span>
            </div>
            <p className="text-xs text-on-surface-variant font-medium mt-1">
              {lang === 'zh'
                ? '主干上全是各厂家/部门领导！起点为项目总负责人，终点为终责交付，进度实时流动。'
                : 'Main subway line features vendor and department leaders with real-time project progress flow.'}
            </p>
          </div>
        </div>

        {/* Progress Track Line Bar */}
        <div className="w-full md:w-96 flex flex-col gap-2 z-10">
          <div className="flex justify-between items-center text-xs font-extrabold text-on-surface-variant">
            <span>{lang === 'zh' ? '起点: 项目总指挥' : 'Start: Overall Director'}</span>
            <span className="text-primary font-black">{totalProjectProgress}%</span>
            <span>{lang === 'zh' ? '终点: 终责交付' : 'End: Delivery'}</span>
          </div>
          <div className="w-full h-3.5 bg-surface-container-highest dark:bg-[#282b2d] rounded-full overflow-hidden border border-outline-variant/30 p-0.5 relative">
            <div
              className="h-full bg-gradient-to-r from-amber-500 via-primary to-emerald-500 rounded-full transition-all duration-700 shadow-sm"
              style={{ width: `${totalProjectProgress}%` }}
            />
          </div>
          {isBackendProject && (
            <div className="flex flex-col gap-1.5 mt-1">
              <label className="text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider">
                {lang === 'zh' ? `终责轴向偏移 ${alongDelta}px` : `Terminus offset ${alongDelta}px`}
              </label>
              <input
                type="range"
                min={0}
                max={800}
                step={10}
                value={alongDelta}
                onChange={(e) => setAlongDelta(Number(e.target.value))}
                onMouseUp={() => {
                  void setFinalOwnerPosition(backendProjectId, alongDelta)
                    .then(() => showToast(lang === 'zh' ? '终责偏移已保存' : 'Terminus offset saved'))
                    .catch((err) => showToast(err instanceof Error ? err.message : '保存失败'));
                }}
                className="w-full accent-primary cursor-pointer"
              />
              <button
                type="button"
                disabled={auditLoading}
                onClick={() => {
                  setAuditLoading(true);
                  void runAxisAudit(backendProjectId)
                    .then((res) => {
                      const byId = new Map(res.nodes.map((n) => [String(n.node_id), n]));
                      setNodes((prev) =>
                        prev.map((n) => {
                          const a = byId.get(n.id);
                          if (!a) return n;
                          return {
                            ...n,
                            aiContext: {
                              riskLevel: (a.risk_level as 'low' | 'medium' | 'high') || 'low',
                              summary: a.summary,
                              lastAnalysis: res.generated_at,
                              suggestedActions: a.suggested_actions || [],
                            },
                          };
                        }),
                      );
                      showToast(
                        lang === 'zh'
                          ? `人轴审计完成：整体风险 ${res.overall_risk}`
                          : `Axis audit done: ${res.overall_risk}`,
                      );
                    })
                    .catch((err) =>
                      showToast(err instanceof Error ? err.message : '审计失败'),
                    )
                    .finally(() => setAuditLoading(false));
                }}
                className="self-start px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-extrabold cursor-pointer disabled:opacity-50"
              >
                {auditLoading
                  ? lang === 'zh'
                    ? '审计中…'
                    : 'Auditing…'
                  : lang === 'zh'
                    ? '运行人轴 AI 审计'
                    : 'Run axis audit'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* CANVAS BOARD: SUBWAY ROUTE MAP & DRAGGABLE CARDS */}
      <div
        onMouseDown={handleCanvasMouseDown}
        className={`relative border border-outline-variant/30 rounded-3xl bg-surface/50 dark:bg-[#121415]/60 p-6 sm:p-10 min-h-[750px] overflow-hidden shadow-inner select-none ${
          isPanningCanvas ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        {/* Floating Canvas Controls Toolbar */}
        <div className="absolute top-4 right-4 z-40 bg-surface/90 dark:bg-[#1a1c1e]/90 backdrop-blur-md border border-outline-variant/40 rounded-2xl p-2 shadow-xl flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-black text-on-surface-variant px-2.5 border-r border-outline-variant/30">
            <span className="material-symbols-outlined text-base text-primary animate-pulse">drag_pan</span>
            <span>{lang === 'zh' ? '拖动画布空白处可移动' : 'Drag canvas to pan'}</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoomLevel(z => Math.max(0.4, Number((z - 0.15).toFixed(2))))}
              className="w-8 h-8 rounded-xl bg-surface-container hover:bg-primary/20 hover:text-primary text-on-surface font-black text-sm flex items-center justify-center transition-all cursor-pointer"
              title={lang === 'zh' ? '缩小' : 'Zoom Out'}
            >
              <span className="material-symbols-outlined text-base">zoom_out</span>
            </button>
            <span className="text-xs font-black text-primary px-1 min-w-[42px] text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={() => setZoomLevel(z => Math.min(2.0, Number((z + 0.15).toFixed(2))))}
              className="w-8 h-8 rounded-xl bg-surface-container hover:bg-primary/20 hover:text-primary text-on-surface font-black text-sm flex items-center justify-center transition-all cursor-pointer"
              title={lang === 'zh' ? '放大' : 'Zoom In'}
            >
              <span className="material-symbols-outlined text-base">zoom_in</span>
            </button>
          </div>

          <div className="h-4 w-px bg-outline-variant/30 mx-1" />

          <button
            onClick={resetAllDragOffsets}
            className="px-3 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-extrabold transition-all flex items-center gap-1 cursor-pointer"
            title={lang === 'zh' ? '重置视角与卡片位置' : 'Reset View & Positions'}
          >
            <span className="material-symbols-outlined text-sm">fit_screen</span>
            <span>{lang === 'zh' ? '视角复位' : 'Reset View'}</span>
          </button>
        </div>

        {/* DRAW.IO LINKING ACTIVE TOP BANNER */}
        {linkingSourceNodeId && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-gradient-to-r from-cyan-600 via-teal-600 to-cyan-600 text-white px-6 py-2.5 rounded-full shadow-2xl flex items-center gap-4 animate-bounce border-2 border-white/30">
            <div className="flex items-center gap-2 font-black text-sm">
              <span className="material-symbols-outlined animate-spin text-lg">hub</span>
              <span>
                {lang === 'zh'
                  ? `Draw.io 连线模式已激活：移动鼠标并点击目标卡片建立父子归属（按 ESC 取消）`
                  : `Draw.io Linking Active: Click target card to connect (ESC to cancel)`}
              </span>
            </div>
            <button
              onClick={() => {
                setLinkingSourceNodeId(null);
                setLinkingHoveredTargetId(null);
                showToast(lang === 'zh' ? '已退出连线模式' : 'Exited linking mode');
              }}
              className="px-2.5 py-0.5 rounded-full bg-white/20 hover:bg-white/40 text-xs font-black cursor-pointer transition-colors"
            >
              ✕ {lang === 'zh' ? '退出' : 'Exit'}
            </button>
          </div>
        )}

        {/* LEFT PALETTE: MOUNT NEW RESPONSIBILITY NODE */}
        <div className="absolute top-6 left-6 z-30 hidden sm:flex flex-col gap-3 bg-surface/90 dark:bg-[#1e2022]/90 backdrop-blur-md border border-primary/40 rounded-3xl p-4 shadow-2xl max-w-[280px] transition-all hover:border-primary">
          <div className="flex items-center justify-between gap-2 border-b border-outline-variant/30 pb-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-black text-on-surface uppercase tracking-wider">
                {lang === 'zh' ? '责任人挂载面板' : 'Mount Palette'}
              </span>
            </div>
            <span className="text-[10px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
              Draw.io Drag
            </span>
          </div>

          <p className="text-[11px] font-medium text-on-surface-variant leading-snug">
            {lang === 'zh'
              ? '按住左键直接拖拽卡片至画布主轴定位，或拖至任意卡片挂载为直属下属！'
              : 'Drag card directly onto the canvas trunk or cards to mount'}
          </p>

          {/* PALETTE TEMPLATE DRAGGABLE CARDS */}
          <div className="flex flex-col gap-2.5 mt-1">
            {PALETTE_TEMPLATES.map(template => (
              <div
                key={template.id}
                onMouseDown={e => handlePaletteDragStart(template, e)}
                onClick={() => {
                  if (!isBackendProject) {
                    showToast(lang === 'zh' ? '请先在顶部选择具体项目' : 'Select a concrete project first');
                    return;
                  }
                  setIsAddingNode(true);
                  setNewParentId(selectedNodeId || '');
                  setNewRoleTitle(template.defaultRole);
                }}
                className="p-3 rounded-2xl bg-gradient-to-r from-primary/10 via-surface-container to-surface border border-outline-variant/50 hover:border-primary text-left cursor-grab active:cursor-grabbing transition-all hover:scale-[1.02] shadow-sm hover:shadow-md group flex items-center justify-between gap-2 select-none"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-primary/20 text-primary flex items-center justify-center font-black group-hover:scale-110 transition-transform shrink-0">
                    <span className="material-symbols-outlined text-lg">{template.icon}</span>
                  </div>
                  <div>
                    <div className="text-xs font-black text-on-surface group-hover:text-primary transition-colors">
                      {template.title}
                    </div>
                    <div className="text-[10px] text-on-surface-variant font-medium">
                      {template.defaultRole}
                    </div>
                  </div>
                </div>

                <div className="w-6 h-6 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant group-hover:text-primary shrink-0">
                  <span className="material-symbols-outlined text-sm">drag_indicator</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SVG Bezier overlay & draggable content */}
        <div
          ref={contentRef}
          className="relative min-w-full min-h-full py-8 px-4 flex justify-center items-center transition-transform duration-75 ease-out"
          style={{
            transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${zoomLevel})`,
            transformOrigin: 'center center'
          }}
        >
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
            {/* Draw.io Active Re-linking Dynamic Spline Curve */}
            {linkingSourceNodeId && sourceCoords && (
              <g className="z-30">
                <path
                  d={`M ${sourceCoords.x} ${sourceCoords.y} C ${sourceCoords.x + (linkingMousePos.x - sourceCoords.x) * 0.5} ${sourceCoords.y}, ${linkingMousePos.x - (linkingMousePos.x - sourceCoords.x) * 0.5} ${linkingMousePos.y}, ${linkingMousePos.x} ${linkingMousePos.y}`}
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth="5"
                  strokeDasharray="8 6"
                  className="animate-pulse"
                  style={{ filter: 'drop-shadow(0px 0px 10px rgba(6, 182, 212, 0.9))' }}
                />
                <circle
                  cx={linkingMousePos.x}
                  cy={linkingMousePos.y}
                  r="8"
                  fill="#06b6d4"
                  stroke="#ffffff"
                  strokeWidth="3"
                  className="animate-ping"
                />
                <circle
                  cx={linkingMousePos.x}
                  cy={linkingMousePos.y}
                  r="5"
                  fill="#ffffff"
                />
              </g>
            )}

            {/* Palette Drop Target Indicator on SVG Overlay */}
            {dropHoverTarget && (
              <g className="z-40">
                {dropHoverTarget.type === 'trunk' ? (
                  <g>
                    <circle
                      cx={dropHoverTarget.x}
                      cy={dropHoverTarget.y}
                      r="16"
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="3"
                      strokeDasharray="4 4"
                      className="animate-spin"
                    />
                    <circle
                      cx={dropHoverTarget.x}
                      cy={dropHoverTarget.y}
                      r="8"
                      fill="#ef4444"
                      className="animate-ping"
                    />
                    <circle
                      cx={dropHoverTarget.x}
                      cy={dropHoverTarget.y}
                      r="5"
                      fill="#ffffff"
                    />
                    <text
                      x={dropHoverTarget.x}
                      y={dropHoverTarget.y - 24}
                      textAnchor="middle"
                      fill="#ef4444"
                      fontSize="12"
                      fontWeight="900"
                      className="select-none font-black"
                      style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.8))' }}
                    >
                      {lang === 'zh' ? '➕ 释放于主轴定位新增站点' : '➕ Drop to Mount on Trunk'}
                    </text>
                  </g>
                ) : (
                  <g>
                    <circle
                      cx={dropHoverTarget.x}
                      cy={dropHoverTarget.y}
                      r="32"
                      fill="rgba(16, 185, 129, 0.2)"
                      stroke="#10b981"
                      strokeWidth="3"
                      className="animate-pulse"
                    />
                    <text
                      x={dropHoverTarget.x}
                      y={dropHoverTarget.y - 40}
                      textAnchor="middle"
                      fill="#10b981"
                      fontSize="12"
                      fontWeight="900"
                      className="select-none font-black"
                      style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.8))' }}
                    >
                      {lang === 'zh' ? '🔗 释放挂载为直属下属' : '🔗 Drop as Subordinate'}
                    </text>
                  </g>
                )}
              </g>
            )}

            {/* Main Metro Spine Line */}
            {mainSpineData?.d && (
              <g>
                {/* Metro Line Casing (Rose/Red) */}
                <path
                  d={mainSpineData.d}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="8"
                  strokeLinecap="round"
                  className="transition-all duration-300"
                  style={{ filter: 'drop-shadow(0px 3px 8px rgba(239, 68, 68, 0.4))' }}
                />
                {/* Inner Subway Track Dashed Line */}
                <path
                  d={mainSpineData.d}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="3"
                  strokeDasharray="8 6"
                  strokeLinecap="round"
                  className="transition-all duration-300"
                />

                {/* Station Junction Nodes calculated dynamically on SVG */}
                {mainSpineData.stationDots.map(dot => (
                  <g key={`station-dot-${dot.id}`}>
                    <circle
                      cx={dot.x}
                      cy={dot.y}
                      r="8"
                      fill="#ef4444"
                      stroke="#ffffff"
                      strokeWidth="3"
                      className="transition-all duration-300"
                      style={{ filter: 'drop-shadow(0px 2px 5px rgba(239, 68, 68, 0.5))' }}
                    />
                    <circle
                      cx={dot.x}
                      cy={dot.y}
                      r="3"
                      fill="#ffffff"
                      className="animate-pulse"
                    />
                  </g>
                ))}

                {/* Terminal Metro Station Stop Indicator */}
                <g>
                  <circle
                    cx={mainSpineData.endX}
                    cy={mainSpineData.endY}
                    r="9"
                    fill="#ef4444"
                    stroke="#ffffff"
                    strokeWidth="3"
                    className="animate-pulse"
                    style={{ filter: 'drop-shadow(0px 0px 8px rgba(239, 68, 68, 0.8))' }}
                  />
                  <circle
                    cx={mainSpineData.endX}
                    cy={mainSpineData.endY}
                    r="4"
                    fill="#ffffff"
                  />
                  <text
                    x={treeOrientation === 'horizontal' ? mainSpineData.endX + 16 : mainSpineData.endX}
                    y={treeOrientation === 'horizontal' ? mainSpineData.endY + 4 : mainSpineData.endY + 24}
                    textAnchor={treeOrientation === 'horizontal' ? 'start' : 'middle'}
                    fill="#ef4444"
                    fontSize="11"
                    fontWeight="900"
                    className="select-none font-black"
                  >
                    {lang === 'zh' ? '🏁 终责交付 (Terminus)' : '🏁 Terminus'}
                  </text>
                </g>
              </g>
            )}

            {/* Perpendicular Stems & Subordinate Branches */}
            {paths.map(p => (
              <path
                key={p.id}
                d={p.d}
                fill="none"
                stroke={
                  p.isMainAxis
                    ? '#ef4444'
                    : '#10b981'
                }
                strokeWidth={p.isMainAxis ? '3.5' : '2.5'}
                strokeDasharray={p.isMainAxis ? 'none' : '6 4'}
                className="transition-all duration-300"
                style={{ opacity: 0.9 }}
              />
            ))}
          </svg>

          {/* MAIN SUBWAY TRACK & NODES CONTAINER */}
          {treeOrientation === 'horizontal' ? (
            /* HORIZONTAL SPINE MODE (左右视图 / 横向主轴) */
            <div className="flex flex-row items-center gap-16 sm:gap-24 py-16 px-12 relative z-10 min-w-max">
              {/* COLUMN 0: Project Director Card at FAR LEFT (Main Spine Origin) */}
              {headLeaderNode && (
                <div className="flex flex-col items-center justify-center shrink-0 relative z-20">
                  <div className="mb-3 px-3.5 py-1 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/40 text-xs font-black flex items-center gap-1.5 shadow-sm">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                    <span>{lang === 'zh' ? '🚩 项目总指挥 (主轴起点)' : '🚩 Overall Director (Origin)'}</span>
                  </div>

                  {renderPersonCard(headLeaderNode, true, true)}
                  {renderSubordinates(headLeaderNode)}
                </div>
              )}

              {/* COLUMNS 1..N: Department / Vendor Stations */}
              {sideLeaderNodes.map((leader, idx) => {
                const isAbove = idx % 2 === 0;
                return (
                  <div key={leader.id} className="flex flex-col items-center shrink-0 min-w-[340px] relative">
                    {/* Upper Slot */}
                    <div className="flex flex-col items-center justify-end min-h-[300px] pb-6">
                      {isAbove && (
                        <>
                          {renderSubordinates(leader)}
                          {renderPersonCard(leader, false, true)}
                        </>
                      )}
                    </div>

                    {/* Center Pass-through Gap for SVG Metro Spine Line */}
                    <div className="h-12 w-full flex items-center justify-center relative pointer-events-none" />

                    {/* Lower Slot */}
                    <div className="flex flex-col items-center justify-start min-h-[300px] pt-6">
                      {!isAbove && (
                        <>
                          {renderPersonCard(leader, false, true)}
                          {renderSubordinates(leader)}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* VERTICAL SPINE MODE (上下视图 / 纵向主轴) */
            <div className="flex flex-col items-center gap-16 py-16 px-12 relative z-10 min-h-max">
              {/* ROW 0: Project Director Card at VERY TOP */}
              {headLeaderNode && (
                <div className="flex flex-col items-center justify-center shrink-0 relative z-20">
                  <div className="mb-3 px-3.5 py-1 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/40 text-xs font-black flex items-center gap-1.5 shadow-sm">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                    <span>{lang === 'zh' ? '🚩 项目总指挥 (主轴顶端)' : '🚩 Overall Director (Top Origin)'}</span>
                  </div>

                  {renderPersonCard(headLeaderNode, true, true)}
                  {treeOrientation === 'vertical' ? (
                    renderHeadSubordinatesVertical(headLeaderNode)
                  ) : (
                    renderSubordinates(headLeaderNode)
                  )}
                </div>
              )}

              {/* ROWS 1..N: Department / Vendor Stations */}
              {sideLeaderNodes.map((leader, idx) => {
                const isLeft = idx % 2 === 0;
                return (
                  <div key={leader.id} className="flex flex-row items-center justify-center shrink-0 min-h-[300px] relative">
                    {/* Left Slot */}
                    <div className="flex flex-row items-center justify-end w-[400px] pr-6">
                      {isLeft && (
                        <>
                          {renderSubordinates(leader)}
                          {renderPersonCard(leader, false, true)}
                        </>
                      )}
                    </div>

                    {/* Center Pass-through Gap for SVG Metro Spine Line */}
                    <div className="w-12 h-full flex items-center justify-center relative pointer-events-none" />

                    {/* Right Slot */}
                    <div className="flex flex-row items-center justify-start w-[400px] pl-6">
                      {!isLeft && (
                        <>
                          {renderPersonCard(leader, false, true)}
                          {renderSubordinates(leader)}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* PALETTE FLOATING DRAG GHOST PREVIEW */}
      {paletteDraggingItem && (
        <div
          className="fixed z-50 pointer-events-none transform -translate-x-1/2 -translate-y-1/2 scale-105 shadow-2xl rounded-2xl border-2 border-primary bg-surface/95 dark:bg-[#1e2022]/95 p-3.5 flex items-center gap-3 backdrop-blur-md animate-pulse"
          style={{
            left: `${paletteDragPos.x}px`,
            top: `${paletteDragPos.y}px`
          }}
        >
          <div className="w-9 h-9 rounded-xl bg-primary text-on-primary flex items-center justify-center font-black shadow-md">
            <span className="material-symbols-outlined text-xl">{paletteDraggingItem.icon}</span>
          </div>
          <div>
            <div className="text-xs font-black text-on-surface">
              {paletteDraggingItem.title}
            </div>
            <div className="text-[10px] text-primary font-bold">
              {dropHoverTarget?.type === 'node'
                ? (lang === 'zh' ? '🔗 挂载为下属' : 'Attach as Subordinate')
                : (lang === 'zh' ? '🎯 在主轴定位' : 'Position on Trunk')}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD PERSON / NODE */}
      {isAddingNode && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-surface dark:bg-[#1e2022] rounded-3xl p-6 md:p-8 max-w-lg w-full border border-outline-variant/40 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-outline-variant/30 pb-4">
              <h3 className="text-lg font-black text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">person_add</span>
                <span>{lang === 'zh' ? '挂载新人员责任节点' : 'Add Person Node'}</span>
              </h3>
              <button onClick={() => setIsAddingNode(false)} className="text-on-surface-variant hover:text-on-surface text-xl font-bold cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleAddNode} className="space-y-4">
              {/* Member Selection Mode Toggle */}
              <div className="p-1 bg-surface-container dark:bg-[#282b2d] rounded-2xl flex items-center gap-1 border border-outline-variant/40">
                <button
                  type="button"
                  onClick={() => setIsCustomPerson(false)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                    !isCustomPerson ? 'bg-primary text-on-primary shadow-xs' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {lang === 'zh' ? '从预设团队选择' : 'Select Existing'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsCustomPerson(true)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                    isCustomPerson ? 'bg-primary text-on-primary shadow-xs' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {lang === 'zh' ? '✍️ 手动填写负责人信息' : '✍️ Custom Person'}
                </button>
              </div>

              {!isCustomPerson ? (
                <div>
                  <label className="block text-xs font-extrabold text-on-surface-variant uppercase tracking-wider mb-2">
                    {lang === 'zh' ? '选择团队成员' : 'Select Team Member'}
                  </label>
                  <select
                    value={newPersonId}
                    onChange={e => setNewPersonId(e.target.value)}
                    className="w-full p-3 rounded-xl bg-surface-container dark:bg-[#282b2d] border border-outline-variant/50 text-sm font-bold text-on-surface focus:outline-none focus:border-primary"
                  >
                    {memberOptions.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.role}{m.department ? ` - ${m.department}` : ''})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-3 p-4 rounded-2xl bg-surface-container/50 border border-outline-variant/40">
                  <div>
                    <label className="block text-xs font-extrabold text-on-surface-variant uppercase tracking-wider mb-1">
                      {lang === 'zh' ? '负责人姓名 *' : 'Name *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={customName}
                      onChange={e => setCustomName(e.target.value)}
                      placeholder={lang === 'zh' ? '如: 史蒂夫·乔布斯' : 'e.g. Steve Jobs'}
                      className="w-full p-2.5 rounded-xl bg-surface dark:bg-[#1a1c1d] border border-outline-variant/50 text-sm text-on-surface focus:outline-none focus:border-primary font-bold"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-extrabold text-on-surface-variant uppercase tracking-wider mb-1">
                        {lang === 'zh' ? '岗位/职称' : 'Role'}
                      </label>
                      <input
                        type="text"
                        value={customRole}
                        onChange={e => setCustomRole(e.target.value)}
                        placeholder={lang === 'zh' ? '如: 现场技术负责人' : 'Role title...'}
                        className="w-full p-2.5 rounded-xl bg-surface dark:bg-[#1a1c1d] border border-outline-variant/50 text-sm text-on-surface focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-extrabold text-on-surface-variant uppercase tracking-wider mb-1">
                        {lang === 'zh' ? '所属部门/厂家' : 'Department/Vendor'}
                      </label>
                      <input
                        type="text"
                        value={customDept}
                        onChange={e => setCustomDept(e.target.value)}
                        placeholder={lang === 'zh' ? '如: 华为技术支持组' : 'Vendor name...'}
                        className="w-full p-2.5 rounded-xl bg-surface dark:bg-[#1a1c1d] border border-outline-variant/50 text-sm text-on-surface focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-extrabold text-on-surface-variant uppercase tracking-wider mb-2">
                  {lang === 'zh' ? '直属 Superior 领导 (为空则挂载为主干部门/厂家主管)' : 'Superior Leader'}
                </label>
                <select
                  value={newParentId}
                  onChange={e => setNewParentId(e.target.value)}
                  className="w-full p-3 rounded-xl bg-surface-container dark:bg-[#282b2d] border border-outline-variant/50 text-sm font-bold text-on-surface focus:outline-none focus:border-primary"
                >
                  <option value="">{lang === 'zh' ? '🏢 作为主干部门/厂家主管 (Direct Main Axis Leader)' : '🏢 Trunk Leader'}</option>
                  {nodes.map(n => (
                    <option key={n.id} value={n.id}>
                      {n.person.name} ({n.roleTitle})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-on-surface-variant uppercase tracking-wider mb-2">
                  {lang === 'zh' ? '岗位责任称号' : 'Role Title'}
                </label>
                <input
                  type="text"
                  value={newRoleTitle}
                  onChange={e => setNewRoleTitle(e.target.value)}
                  placeholder={lang === 'zh' ? '例如: 实时协同网关责任专家...' : 'Enter role title...'}
                  className="w-full p-3 rounded-xl bg-surface-container dark:bg-[#282b2d] border border-outline-variant/50 text-sm text-on-surface focus:outline-none focus:border-primary"
                />
              </div>

              {/* Work Scope and Responsibilities Multiline Textarea */}
              <div>
                <label className="block text-xs font-extrabold text-on-surface-variant uppercase tracking-wider mb-2">
                  {lang === 'zh' ? '工作范围与归口职责 (每行生成一项归口任务)' : 'Work Scope & Responsibilities'}
                </label>
                <textarea
                  value={customWorkScope}
                  onChange={e => setCustomWorkScope(e.target.value)}
                  rows={3}
                  placeholder={lang === 'zh' ? '1. 负责主干网关通信协议联调\n2. 负责故障容错与自动化日志排查\n3. 按期交付每周验收证据' : '1. Deliver network protocol module\n2. Ensure zero downtime'}
                  className="w-full p-3 rounded-xl bg-surface-container dark:bg-[#282b2d] border border-outline-variant/50 text-sm text-on-surface focus:outline-none focus:border-primary resize-none"
                />
              </div>

              {/* Risk Level */}
              <div>
                <label className="block text-xs font-extrabold text-on-surface-variant uppercase tracking-wider mb-2">
                  {lang === 'zh' ? 'AI 风险等级预判' : 'AI Risk Level'}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['low', 'medium', 'high'] as const).map(lvl => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setCustomRiskLevel(lvl)}
                      className={`py-2 rounded-xl text-xs font-black uppercase transition-all ${
                        customRiskLevel === lvl
                          ? lvl === 'high' ? 'bg-error text-on-error shadow-sm' : lvl === 'medium' ? 'bg-amber-500 text-black shadow-sm' : 'bg-emerald-500 text-black shadow-sm'
                          : 'bg-surface-container hover:bg-surface-variant text-on-surface-variant'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-3 border-t border-outline-variant/30">
                <button
                  type="button"
                  onClick={() => setIsAddingNode(false)}
                  className="px-4 py-2 rounded-xl bg-surface-container-highest text-on-surface text-sm font-bold hover:bg-surface-variant transition-all cursor-pointer"
                >
                  {lang === 'zh' ? '取消' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-primary text-on-primary text-sm font-bold shadow-md hover:bg-primary/90 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-base">check_circle</span>
                  <span>{lang === 'zh' ? '确认挂载节点' : 'Confirm Mount'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD WORK ITEM */}
      {isAddingWorkItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-surface dark:bg-[#1e2022] rounded-3xl p-6 md:p-8 max-w-md w-full border border-outline-variant/40 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-outline-variant/30 pb-4">
              <h3 className="text-lg font-black text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">add_task</span>
                <span>{lang === 'zh' ? '挂载责任事项/交付目标' : 'Attach Deliverable Task'}</span>
              </h3>
              <button onClick={() => setIsAddingWorkItem(null)} className="text-on-surface-variant hover:text-on-surface text-xl font-bold cursor-pointer">✕</button>
            </div>

            <form onSubmit={e => handleAddWorkItem(isAddingWorkItem, e)} className="space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-on-surface-variant uppercase tracking-wider mb-2">
                  {lang === 'zh' ? '事项名称 / 交付成果' : 'Deliverable Title'}
                </label>
                <input
                  type="text"
                  value={newWorkTitle}
                  onChange={e => setNewWorkTitle(e.target.value)}
                  placeholder={lang === 'zh' ? '说明要落下的具体目标任务...' : 'Enter target deliverable...'}
                  className="w-full p-3 rounded-xl bg-surface-container dark:bg-[#282b2d] border border-outline-variant/50 text-sm text-on-surface focus:outline-none focus:border-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-on-surface-variant uppercase tracking-wider mb-2">
                  {lang === 'zh' ? '事项类型' : 'Item Type'}
                </label>
                <select
                  value={newWorkType}
                  onChange={e => setNewWorkType(e.target.value as any)}
                  className="w-full p-3 rounded-xl bg-surface-container dark:bg-[#282b2d] border border-outline-variant/50 text-sm font-bold text-on-surface focus:outline-none focus:border-primary"
                >
                  <option value="milestone">{lang === 'zh' ? '🏆 关键里程碑 (Milestone)' : '🏆 Key Milestone'}</option>
                  <option value="scope">{lang === 'zh' ? '📦 核心交付范围 (Scope)' : '📦 Core Scope'}</option>
                  <option value="task">{lang === 'zh' ? '📝 日常攻坚任务 (Task)' : '📝 Standard Task'}</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddingWorkItem(null)}
                  className="px-4 py-2 rounded-xl bg-surface-container-highest text-on-surface text-sm font-bold hover:bg-surface-variant transition-all cursor-pointer"
                >
                  {lang === 'zh' ? '取消' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-primary text-on-primary text-sm font-bold shadow-md hover:bg-primary/90 transition-all cursor-pointer"
                >
                  {lang === 'zh' ? '确认挂载' : 'Confirm Attach'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FLOATING TOAST FEEDBACK BANNER */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 dark:bg-black/95 text-white px-6 py-3 rounded-2xl shadow-2xl border border-cyan-500/50 backdrop-blur-md flex items-center gap-3 text-xs font-black animate-bounce">
          <span className="material-symbols-outlined text-cyan-400 text-xl">hub</span>
          <span>{toastMessage}</span>
        </div>
      )}

    </div>
  );
};
