import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Edge } from '@xyflow/react';
import { PeopleAxisNode, AxisWorkItem, AxisEvidence, Language, TeamMember, Project } from '../../types';
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
import { getMyPermissions, getPeopleAxisAggregate, putNodeLayout, runAxisAudit, MyProjectPermissions } from '../../api/shell';
import { fetchMe } from '../../api/auth';
import { averagePeopleAxisProgress } from './peopleAxisUtils';
import { PeopleAxisFlowCanvas, AxisFlowNode, PersonNodeData, SpineEdgeData } from './PeopleAxisFlowCanvas';
import { computeAxisLayout, collectHiddenNodeIds } from './peopleAxisFlowLayout';
import { DelegationModal } from '../modals/DelegationModal';

const TERMINUS_NODE_ID = '__terminus__';

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
  /** 可编辑的项目列表；聚合/未选项目时用于页内快速切换（移动端顶栏无项目选择器）。 */
  projects?: Project[];
  onSelectProject?: (project: Project) => void;
}

export const PeopleAxisView: React.FC<PeopleAxisViewProps> = ({ lang, projectId, projects, onSelectProject }) => {
  const t = getT(lang);
  const [nodes, setNodes] = useState<PeopleAxisNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [backendLoadError, setBackendLoadError] = useState<string | null>(null);
  const [projectMembers, setProjectMembers] = useState<TeamMember[]>([]);
  const [isAddingNode, setIsAddingNode] = useState(false);
  const isBackendProject = Boolean(projectId && projectId !== 'all' && Number(projectId) > 0);
  const backendProjectId = isBackendProject ? Number(projectId) : 0;
  const memberOptions = projectMembers;
  // 权限口径与服务端 acl 一致：PM（pm_user_id 或成员角色 pm）可编辑全树；
  // 普通成员仅能编辑自己作为 primary/collaborator 责任人的节点及其子树。
  const [meId, setMeId] = useState<number | null>(null);
  const [pmUserId, setPmUserId] = useState<number | null>(null);
  const [projectCompanyId, setProjectCompanyId] = useState<number | null>(null);
  const [isDelegationOpen, setIsDelegationOpen] = useState(false);
  // 服务端权限快照：覆盖客户端推断不出的委托授权 / 非成员超管；
  // 请求失败或未返回时保持 null，下方 memo 回退客户端推断（不阻塞渲染）
  const [serverPerms, setServerPerms] = useState<MyProjectPermissions | null>(null);
  const [isAddingWorkItem, setIsAddingWorkItem] = useState<string | null>(null); // nodeId
  const [isAddingEvidence, setIsAddingEvidence] = useState<string | null>(null); // workItemId
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing'>('synced');
  const [alongDelta, setAlongDelta] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);

  // Flagship Visual Controls
  const [treeOrientation, setTreeOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  // 用户拖拽产生的偏移（叠加在布局基准位置上，落盘到后端 layout）
  const [dragOffsets, setDragOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const dragOffsetsRef = useRef<Record<string, { x: number; y: number }>>({});

  // Mobile bottom sheet with the description / progress / controls that the
  // desktop layout shows above the canvas.
  const [showMobileInfo, setShowMobileInfo] = useState(false);
  // 移动端底部面板重置布局后通知画布重新取景（桌面工具条自带 fitView，不走此通道）
  const [canvasResetToken, setCanvasResetToken] = useState(0);

  // Form states
  const [newPersonId, setNewPersonId] = useState<string>('');
  const [newRoleTitle, setNewRoleTitle] = useState('');
  const [newParentId, setNewParentId] = useState<string>('');
  
  const [newWorkTitle, setNewWorkTitle] = useState('');
  const [newWorkType, setNewWorkType] = useState<'task' | 'milestone' | 'scope'>('task');
  const [newWorkDueDate, setNewWorkDueDate] = useState('');
  const [newWorkDesc, setNewWorkDesc] = useState('');
  
  const [newEvTitle, setNewEvTitle] = useState('');
  const [newEvType, setNewEvType] = useState<'commit' | 'document' | 'figma' | 'log' | 'delivery'>('commit');
  const [newEvUrl, setNewEvUrl] = useState('#url-proof');

  // Draw.io Interactive Re-linking & Mounting States
  const [linkingSourceNodeId, setLinkingSourceNodeId] = useState<string | null>(null);
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

  // ESC 取消连线模式（连线预览曲线由画布内部的 LinkingPreview 处理）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && linkingSourceNodeId) {
        setLinkingSourceNodeId(null);
        setLinkingHoveredTargetId(null);
        showToast(lang === 'zh' ? '已取消 Draw.io 连线重新挂载操作' : 'Cancelled re-linking');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [linkingSourceNodeId, lang, showToast]);

  useEffect(() => {
    let cancelled = false;
    void fetchMe()
      .then((me) => {
        if (!cancelled) setMeId(me.id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // 项目切换时拉一次服务端权限；独立于树加载，失败静默回退客户端推断
  useEffect(() => {
    setServerPerms(null);
    if (!isBackendProject) return;
    let cancelled = false;
    void getMyPermissions(backendProjectId)
      .then((perms) => {
        if (!cancelled) setServerPerms(perms);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isBackendProject, backendProjectId]);

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
      // ref 需与加载的偏移同步，否则「重置布局」会漏掉本会话未拖动过的后端旧偏移
      dragOffsetsRef.current = offsets;
      setDragOffsets(offsets);
      setSelectedNodeId(loaded[0]?.id ?? null);
    };

    const pid = projectId && projectId !== 'all' ? Number(projectId) : NaN;
    if (projectId === 'all') {
      setPmUserId(null);
      setSyncStatus('syncing');
      setBackendLoadError(null);
      void getPeopleAxisAggregate().then(async (result) => {
        if (cancelled) return;
        const aggregate: PeopleAxisNode[] = [];
        for (const project of result.projects || []) {
          const raw = (project.nodes || []) as Array<Record<string, unknown> & { id: number; parent_id?: number | null; children?: unknown[] }>;
          const byId = new Map<number, Record<string, unknown> & { id: number; parent_id?: number | null; children?: unknown[] }>();
          raw.forEach((node) => byId.set(node.id, { ...node, children: [] }));
          const roots: Record<string, unknown>[] = [];
          byId.forEach((node) => {
            const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
            if (parent) parent.children = [...(parent.children || []), node];
            else roots.push(node);
          });
          aggregate.push(...mapTreeToPeopleAxis(roots as never[]));
        }
        const withEvidence = await enrichMattersWithEvidence(aggregate);
        if (cancelled) return;
        apply(withEvidence);
        setBackendLoadError(withEvidence.length ? (lang === 'zh' ? '全盘人轴为只读聚合视图；用旁边的选择器切到具体项目即可编辑。' : 'Cross-project axis is read-only; choose a project to edit.') : (lang === 'zh' ? '暂无可见项目人轴节点。' : 'No visible people-axis nodes.'));
        setSyncStatus('synced');
      }).catch((error) => {
        if (!cancelled) { apply([]); setBackendLoadError(error instanceof Error ? error.message : '加载人轴失败'); setSyncStatus('synced'); }
      });
      return () => { cancelled = true; };
    }
    if (!Number.isFinite(pid) || pid <= 0) {
      setProjectMembers([]);
      setPmUserId(null);
      apply([]);
      setBackendLoadError(lang === 'zh' ? '当前未选定项目：请在上方横幅选择要查看的项目。' : 'Select a concrete project to view the people axis.');
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
        setPmUserId(proj.pm_user_id ?? null);
        setProjectCompanyId(proj.company_id ?? null);
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
      setPmUserId(proj.pm_user_id ?? null);
      setProjectCompanyId(proj.company_id ?? null);
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

  // ===== 权限计算（服务端判定优先，回退客户端推断；前端只做显隐，最终以后端校验为准） =====
  // 全树编辑：服务端 can_edit_all 覆盖 PM/超管/委托授权三条路；
  // 回退口径 = 项目 PM（pm_user_id 或 project_members.role='pm'）
  const canEditAny = useMemo(() => {
    if (!isBackendProject) return false;
    if (serverPerms) return serverPerms.can_edit_all;
    if (meId == null) return false;
    if (pmUserId != null && pmUserId === meId) return true;
    return memberOptions.some((m) => Number(m.id) === meId && m.role === 'pm');
  }, [isBackendProject, serverPerms, meId, pmUserId, memberOptions]);

  // 连线（move）/删除只认 tree.edit_any，委托授权拿不到；无服务端结果时回退 canEditAny
  const canMoveNodes = serverPerms ? serverPerms.can_move : canEditAny;

  // tree.edit_subtree：自己是 primary/collaborator 责任人的节点及其全部后代。
  // 锚点优先取服务端 owned_node_ids，向下传递仍由前端沿树展开（与 _owns_path 同口径）
  const editableNodeIds = useMemo(() => {
    const set = new Set<string>();
    if (!isBackendProject) return set;
    const ownedFromServer = serverPerms
      ? new Set(serverPerms.owned_node_ids.map(String))
      : null;
    if (!ownedFromServer && meId == null) return set;
    const childrenMap = new Map<string, string[]>();
    nodes.forEach((n) => {
      if (!n.parentId) return;
      childrenMap.set(n.parentId, [...(childrenMap.get(n.parentId) || []), n.id]);
    });
    const queue = nodes
      .filter((n) =>
        ownedFromServer
          ? ownedFromServer.has(n.id)
          : (n.ownerUserIds || []).includes(meId!),
      )
      .map((n) => n.id);
    while (queue.length) {
      const id = queue.pop()!;
      if (set.has(id)) continue;
      set.add(id);
      (childrenMap.get(id) || []).forEach((c) => queue.push(c));
    }
    return set;
  }, [isBackendProject, serverPerms, meId, nodes]);

  /** 至少拥有一个可挂载位置（PM 任意；成员需名下有节点） */
  const canMountSomething = canEditAny || editableNodeIds.size > 0;

  // 调色板落子：不再自动生成随机人员，而是打开预填好的挂载弹窗，由用户自定义后确认
  const openPaletteMountModal = useCallback((
    template: PaletteTemplate,
    target: { type: 'trunk' | 'node'; nodeId?: string }
  ) => {
    if (!isBackendProject) {
      showToast(lang === 'zh' ? '聚合视图只读：请先在上方横幅选择要编辑的项目' : 'Read-only aggregate: pick a project in the banner above first');
      return;
    }
    if (target.type === 'trunk' && !canEditAny) {
      showToast(lang === 'zh' ? '仅项目 PM 可在主干挂载责任人' : 'Only the project PM can add trunk leaders');
      return;
    }
    if (target.type === 'node' && !canEditAny && !editableNodeIds.has(target.nodeId || '')) {
      showToast(lang === 'zh' ? '只能在自己负责的节点下挂载下属' : 'You can only mount under nodes you own');
      return;
    }
    setNewParentId(target.type === 'node' && target.nodeId ? target.nodeId : '');
    setIsCustomPerson(template.type === 'vendor-lead' || memberOptions.length === 0);
    setCustomName('');
    setCustomRole(template.defaultRole);
    setCustomDept(template.defaultDept);
    setNewRoleTitle(template.defaultRole);
    setIsAddingNode(true);
  }, [isBackendProject, lang, showToast, memberOptions.length, canEditAny, editableNodeIds]);

  // Global Pointer Move and Up Listener for Palette Drag-and-Drop
  useEffect(() => {
    if (!paletteDraggingItem) return;

    const handleMouseMove = (e: PointerEvent) => {
      setPaletteDragPos({ x: e.clientX, y: e.clientY });

      // Hit test over node cards (React Flow 节点上保留了 data-node-anchor)
      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      for (const el of elements) {
        const anchorEl = (el as HTMLElement).closest('[data-node-anchor]') as HTMLElement | null;
        if (anchorEl) {
          const nodeId = anchorEl.getAttribute('data-node-anchor');
          if (nodeId) {
            setDropHoverTarget({ type: 'node', nodeId, x: 0, y: 0 });
            return;
          }
        }
      }

      // 只有落在画布区域内才算主轴落点；仍停留在调色板上视作未拖出（走 click 逻辑）
      const overCanvas = elements.some((el) => (el as HTMLElement).closest?.('.react-flow'));
      setDropHoverTarget(overCanvas ? { type: 'trunk', x: 0, y: 0 } : null);
    };

    const handleMouseUp = () => {
      if (paletteDraggingItem && dropHoverTarget) {
        openPaletteMountModal(paletteDraggingItem, dropHoverTarget);
      }
      setPaletteDraggingItem(null);
      setDropHoverTarget(null);
    };

    // 触屏上浏览器接管手势（如滚动）会发 pointercancel：只清理状态，绝不执行 drop
    const handlePointerCancel = () => {
      setPaletteDraggingItem(null);
      setDropHoverTarget(null);
    };

    window.addEventListener('pointermove', handleMouseMove);
    window.addEventListener('pointerup', handleMouseUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    return () => {
      window.removeEventListener('pointermove', handleMouseMove);
      window.removeEventListener('pointerup', handleMouseUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [paletteDraggingItem, dropHoverTarget, openPaletteMountModal]);

  const handlePaletteDragStart = (template: PaletteTemplate, e: React.PointerEvent) => {
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

  /* ---------------- React Flow 画布数据装配 ---------------- */

  // 布局基准位置（地铁主轴 + 分层下属）；拖拽偏移叠加其上
  const layout = useMemo(
    () => computeAxisLayout(nodes, treeOrientation, expandedNodes, alongDelta),
    [nodes, treeOrientation, expandedNodes, alongDelta],
  );
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const hiddenNodeIds = useMemo(
    () => collectHiddenNodeIds(nodes, expandedNodes),
    [nodes, expandedNodes],
  );

  const rfNodes = useMemo<AxisFlowNode[]>(() => {
    const list: AxisFlowNode[] = [];
    nodes.forEach((n) => {
      if (hiddenNodeIds.has(n.id)) return;
      const base = layout.positions.get(n.id);
      if (!base) return;
      const off = dragOffsets[n.id] || { x: 0, y: 0 };
      const data: PersonNodeData = {
        node: n,
        lang,
        isOverallLeader: headLeaderNode?.id === n.id,
        isMainAxisLeader: !n.parentId,
        isSelected: selectedNodeId === n.id,
        isExpanded: expandedNodes[n.id] ?? true,
        childCount: getChildNodes(n.id).length,
        linkingActive: linkingSourceNodeId !== null,
        isLinkingSource: linkingSourceNodeId === n.id,
        isLinkingTarget:
          linkingSourceNodeId !== null &&
          linkingHoveredTargetId === n.id &&
          linkingSourceNodeId !== n.id,
        canEdit: canEditAny || editableNodeIds.has(n.id),
        canRelink: canMoveNodes,
        onCardClick: (id) => {
          if (linkingSourceNodeId) {
            if (id !== linkingSourceNodeId) handleConnectToTarget(id);
          } else {
            setSelectedNodeId(id);
          }
        },
        onToggleExpand: toggleExpandNode,
        onAddWorkItem: (id) => {
          if (isBackendProject && !canEditAny && !editableNodeIds.has(id)) {
            showToast(lang === 'zh' ? '只能给自己负责的节点挂载事项' : 'You can only attach items under nodes you own');
            return;
          }
          setIsAddingWorkItem(id);
        },
        onAddChild: (id) => {
          if (!isBackendProject) {
            showToast(lang === 'zh' ? '聚合视图只读：请先在上方横幅选择要编辑的项目' : 'Select a concrete project first');
            return;
          }
          if (!canEditAny && !editableNodeIds.has(id)) {
            showToast(lang === 'zh' ? '只能在自己负责的节点下挂载下属' : 'You can only mount under nodes you own');
            return;
          }
          setNewParentId(id);
          setIsAddingNode(true);
        },
        onToggleLinking: (id) => {
          if (!canMoveNodes) {
            showToast(lang === 'zh' ? '连线（改挂上级）仅项目 PM 可用' : 'Re-linking requires the project PM');
            return;
          }
          if (linkingSourceNodeId === id) {
            setLinkingSourceNodeId(null);
            setLinkingHoveredTargetId(null);
            showToast(lang === 'zh' ? '已取消连线操作' : 'Cancelled linking');
          } else {
            setLinkingSourceNodeId(id);
            showToast(
              lang === 'zh'
                ? `🔗 连线模式已激活：点击目标卡片将【${n.person.name}】挂载过去`
                : 'Linking active: click a target card',
            );
          }
        },
        onHoverTarget: setLinkingHoveredTargetId,
      };
      list.push({
        id: n.id,
        type: 'person',
        position: { x: base.x + off.x, y: base.y + off.y },
        data,
        // 布局偏移的持久化接口同样要求编辑权限，无权节点不可拖，避免 403
        draggable: !linkingSourceNodeId && (canEditAny || editableNodeIds.has(n.id)),
      });
    });
    if (layout.trunkOrder.length > 0) {
      list.push({
        id: TERMINUS_NODE_ID,
        type: 'terminus',
        position: layout.terminusPosition,
        data: { lang, progress: totalProjectProgress },
        draggable: false,
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    nodes, hiddenNodeIds, layout, dragOffsets, headLeaderNode, lang,
    selectedNodeId, expandedNodes, linkingSourceNodeId, linkingHoveredTargetId,
    getChildNodes, totalProjectProgress, showToast, isBackendProject,
    canEditAny, canMoveNodes, editableNodeIds,
  ]);

  const rfEdges = useMemo<Edge[]>(() => {
    const edges: Edge[] = [];
    const spineData: SpineEdgeData = { orientation: treeOrientation, spineCoord: layout.spineCoord };
    layout.trunkOrder.forEach((id, i) => {
      if (i === 0) return;
      edges.push({ id: `spine-${i}`, source: layout.trunkOrder[i - 1], target: id, type: 'spine', data: spineData });
    });
    if (layout.trunkOrder.length > 0) {
      edges.push({
        id: 'spine-terminus',
        source: layout.trunkOrder[layout.trunkOrder.length - 1],
        target: TERMINUS_NODE_ID,
        type: 'spine',
        data: spineData,
      });
    }
    nodes.forEach((n) => {
      if (!n.parentId) return;
      if (hiddenNodeIds.has(n.id) || hiddenNodeIds.has(n.parentId)) return;
      edges.push({ id: `branch-${n.id}`, source: n.parentId, target: n.id, type: 'branch' });
    });
    return edges;
  }, [nodes, layout, hiddenNodeIds, treeOrientation]);

  // 拖拽期间位置由画布内部状态驱动（避免每帧重渲染引起闪烁）；
  // 拖拽结束才换算成相对布局基准的偏移量，更新本地状态并落盘后端
  const handleNodeDragStop = useCallback((id: string, position: { x: number; y: number }) => {
    if (id === TERMINUS_NODE_ID) return;
    const base = layoutRef.current.positions.get(id);
    if (!base) return;
    const off = { x: position.x - base.x, y: position.y - base.y };
    setDragOffsets((prev) => {
      const next = { ...prev, [id]: off };
      dragOffsetsRef.current = next;
      return next;
    });
    if (isBackendProject) {
      const backendId = asBackendId(id);
      if (backendId != null) void putNodeLayout(backendId, off).catch(() => undefined);
    }
  }, [isBackendProject]);

  const handlePaneClick = () => {
    // 连线模式下点空白不动作（防误触）；提升主干走 banner 上的显式按钮
    if (!linkingSourceNodeId) setSelectedNodeId(null);
  };

  const resetAllDragOffsets = () => {
    // 只清本地的话，刷新后旧偏移又会从后端 layoutOffset 加载回来；
    // 具体项目下把偏移清零落盘，聚合只读视图保持只清本地
    if (isBackendProject) {
      Object.keys(dragOffsetsRef.current).forEach((id) => {
        const off = dragOffsetsRef.current[id];
        if (!off || (off.x === 0 && off.y === 0)) return;
        const backendId = asBackendId(id);
        if (backendId != null) void putNodeLayout(backendId, { x: 0, y: 0 }).catch(() => undefined);
      });
    }
    dragOffsetsRef.current = {};
    setDragOffsets({});
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
    // 入口按钮已按 canRelink 显隐，这里兜底（快捷键/竞态路径），口径与服务端 move 校验一致
    if (isBackendProject && !canMoveNodes) {
      showToast(lang === 'zh' ? '连线（改挂上级）仅项目 PM 可用' : 'Re-linking requires the project PM');
      return;
    }

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
    if (isBackendProject && !canMoveNodes) {
      showToast(lang === 'zh' ? '提升为主干仅项目 PM 可用' : 'Promoting to trunk requires the project PM');
      return;
    }
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
      showToast(lang === 'zh' ? '聚合视图只读：请先在上方横幅选择项目，再挂载责任人' : 'Select a concrete project before adding a person');
      return;
    }
    if (!canEditAny && (!newParentId || !editableNodeIds.has(newParentId))) {
      showToast(lang === 'zh' ? '只能挂载到自己负责的节点之下（主干需项目 PM）' : 'You can only mount under nodes you own');
      return;
    }
    let personToAssign: TeamMember;

    if (isCustomPerson && customName.trim()) {
      personToAssign = {
        id: `person-${Date.now()}`,
        name: customName.trim(),
        role: customRole.trim() || '责任项目专家',
        department: customDept.trim() || '外部协作单位',
        // 自定义人员没有真实头像，留空由卡片渲染首字母兜底
        avatar: ''
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
      showToast(lang === 'zh' ? '聚合视图只读：请先在上方横幅选择项目，再挂载事项' : 'Select a concrete project before adding work');
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
            description: newWorkDesc.trim() || undefined,
            due_at: newWorkDueDate ? `${newWorkDueDate}T23:59:59` : undefined,
          });
          setIsAddingWorkItem(null);
          setNewWorkTitle('');
          setNewWorkDueDate('');
          setNewWorkDesc('');
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
      showToast(lang === 'zh' ? '聚合视图只读：请先在上方横幅选择项目，再提交证据' : 'Select a concrete project before submitting evidence');
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

  // Shared by the desktop progress banner and the mobile info sheet.
  const handleRunAxisAudit = useCallback(() => {
    if (!isBackendProject) return;
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
      .catch((err) => showToast(err instanceof Error ? err.message : '审计失败'))
      .finally(() => setAuditLoading(false));
  }, [isBackendProject, backendProjectId, lang, showToast]);

  const saveAlongDelta = useCallback(() => {
    if (!isBackendProject) return;
    void setFinalOwnerPosition(backendProjectId, alongDelta)
      .then(() => showToast(lang === 'zh' ? '终责偏移已保存' : 'Terminus offset saved'))
      .catch((err) => showToast(err instanceof Error ? err.message : '保存失败'));
  }, [isBackendProject, backendProjectId, alongDelta, lang, showToast]);

  return (
    // 移动端固定为可视区剩余高度（导航栏 4rem + 底部导航 5rem = 9rem），页面不滚动，
    // 保证画布顶部的状态胶囊/缩放工具条永远在屏内；桌面维持原文档流布局。
    <div className="h-[calc(100dvh-9rem)] md:h-auto md:min-h-screen flex flex-col md:block overflow-hidden md:overflow-visible bg-background text-on-surface p-0 md:p-6 lg:p-8 space-y-0 md:space-y-8 max-w-[1700px] mx-auto relative">
      {backendLoadError && (
        <div className="shrink-0 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-sm px-4 py-3 mx-3 mt-3 md:mx-0 md:mt-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span>{backendLoadError}</span>
          {!isBackendProject && onSelectProject && (projects?.length ?? 0) > 0 && (
            <select
              value=""
              onChange={(e) => {
                const proj = projects!.find((p) => String(p.id) === e.target.value);
                if (proj) onSelectProject(proj);
              }}
              className="shrink-0 px-3 py-2 rounded-xl border border-amber-400 bg-white text-amber-900 text-sm font-bold focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="" disabled>
                {lang === 'zh' ? '📂 选择项目开始编辑…' : '📂 Pick a project to edit…'}
              </option>
              {projects!.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {projectId && projectId !== 'all' && !backendLoadError && (
        <div className="hidden md:block rounded-xl border border-primary/20 bg-primary/5 text-primary text-sm px-4 py-2">
          {lang === 'zh'
            ? `已从后端加载项目 #${projectId} 的人轴树（只读同步；写回见 BACKEND_GAP.md）`
            : `Loaded people-axis tree for project #${projectId} from backend`}
        </div>
      )}
      {/* HEADER BAR (desktop only; mobile is immersive canvas-first) */}
      <div className="hidden md:flex md:flex-row md:items-center justify-between gap-4 border-b border-outline-variant/30 pb-6">
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
              if (!isBackendProject) {
                showToast(lang === 'zh' ? '聚合视图只读：请先在上方横幅选择要编辑的项目' : 'Select a concrete project first');
                return;
              }
              if (!canMountSomething) {
                showToast(lang === 'zh' ? '只读成员：无挂载权限，请联系项目 PM 指派节点' : 'Read-only member: ask the PM for an assignment');
                return;
              }
              setNewParentId(canEditAny ? '' : (nodes.find((n) => editableNodeIds.has(n.id))?.id || ''));
              setIsAddingNode(true);
            }}
            className="px-4 py-2 rounded-2xl bg-primary hover:bg-primary/90 text-on-primary text-xs font-black shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-base">person_add</span>
            <span>{lang === 'zh' ? '挂载新责任人' : 'Add Person'}</span>
          </button>

          {/* 委托授权：仅 PM / 超管可创建（与后端 _can_grant 口径一致，委托授权用户不可再转授） */}
          {isBackendProject &&
            projectCompanyId != null &&
            (serverPerms ? serverPerms.is_pm || serverPerms.is_superadmin : meId != null && pmUserId === meId) && (
              <button
                onClick={() => setIsDelegationOpen(true)}
                className="px-3.5 py-2 rounded-2xl bg-surface-container border border-outline-variant/40 hover:border-primary/40 text-on-surface text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                title={lang === 'zh' ? '创建/管理委托授权' : 'Manage delegations'}
              >
                <span className="material-symbols-outlined text-sm">key</span>
                <span>{lang === 'zh' ? '委托授权' : 'Delegate'}</span>
              </button>
            )}
        </div>
      </div>

      {isBackendProject && projectCompanyId != null && (
        <DelegationModal
          isOpen={isDelegationOpen}
          onClose={() => setIsDelegationOpen(false)}
          lang={lang}
          companyId={projectCompanyId}
          projectId={backendProjectId}
          members={memberOptions}
        />
      )}

      {/* METRO SUBWAY TRUNK PROGRESS BANNER (desktop only) */}
      <div className="hidden md:flex bg-gradient-to-r from-surface-container via-surface to-surface-container border border-outline-variant/40 rounded-3xl p-5 shadow-lg flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
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
                onPointerUp={saveAlongDelta}
                className="w-full accent-primary cursor-pointer"
              />
              <button
                type="button"
                disabled={auditLoading}
                onClick={handleRunAxisAudit}
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

      {/* CANVAS BOARD: React Flow 人轴画布
          Mobile: fullscreen immersive canvas (Apple Freeform style) filling the
          viewport between navbar and bottom nav; desktop keeps the framed card. */}
      <div className="relative border-0 md:border border-outline-variant/30 rounded-none md:rounded-3xl bg-surface/50 dark:bg-[#121415]/60 flex-1 min-h-0 md:flex-none md:h-[760px] overflow-hidden shadow-inner">
        <PeopleAxisFlowCanvas
          lang={lang}
          nodes={rfNodes}
          edges={rfEdges}
          orientation={treeOrientation}
          linkingSourceNodeId={linkingSourceNodeId}
          onNodeDragStop={handleNodeDragStop}
          onPaneClick={handlePaneClick}
          onResetLayout={resetAllDragOffsets}
          resetToken={canvasResetToken}
        />

        {/* MOBILE STATUS PILL (top-left, replaces the hidden desktop header) */}
        <div className="md:hidden absolute top-3 left-3 z-40 flex items-center gap-1.5 bg-surface/90 dark:bg-[#1a1c1e]/90 backdrop-blur-md border border-outline-variant/40 rounded-full px-3 py-1.5 shadow-xl">
          <span className={`w-2 h-2 rounded-full ${syncStatus === 'synced' ? 'bg-emerald-500' : 'bg-amber-500 animate-ping'}`} />
          <span className="text-[11px] font-black text-on-surface">
            {isBackendProject
              ? (lang === 'zh' ? `项目 #${projectId}` : `Project #${projectId}`)
              : (lang === 'zh' ? '只读聚合视图' : 'Read-only')}
          </span>
          <span className="text-[11px] font-black text-primary">{totalProjectProgress}%</span>
        </div>

        {/* MOBILE FLOATING ACTION CLUSTER (bottom-right, Apple-canvas style) */}
        <div className="md:hidden absolute bottom-4 right-3 z-40 flex flex-col items-center gap-2.5">
          <button
            onClick={() => setShowMobileInfo(true)}
            className="w-11 h-11 rounded-full bg-surface/90 dark:bg-[#1a1c1e]/90 backdrop-blur-md border border-outline-variant/40 shadow-xl flex items-center justify-center text-on-surface-variant active:scale-95 transition-transform"
            title={lang === 'zh' ? '画布信息与设置' : 'Canvas info & settings'}
          >
            <span className="material-symbols-outlined text-xl">tune</span>
          </button>
          <button
            onClick={() => setTreeOrientation(o => (o === 'horizontal' ? 'vertical' : 'horizontal'))}
            className="w-11 h-11 rounded-full bg-surface/90 dark:bg-[#1a1c1e]/90 backdrop-blur-md border border-outline-variant/40 shadow-xl flex items-center justify-center text-on-surface-variant active:scale-95 transition-transform"
            title={lang === 'zh' ? '切换主轴方向' : 'Toggle trunk orientation'}
          >
            <span className="material-symbols-outlined text-xl">
              {treeOrientation === 'horizontal' ? 'swap_vert' : 'swap_horiz'}
            </span>
          </button>
          <button
            onClick={() => {
              if (!isBackendProject) {
                showToast(lang === 'zh' ? '聚合视图只读：请先在上方横幅选择要编辑的项目' : 'Select a concrete project first');
                return;
              }
              if (!canMountSomething) {
                showToast(lang === 'zh' ? '只读成员：无挂载权限，请联系项目 PM 指派节点' : 'Read-only member: ask the PM for an assignment');
                return;
              }
              setNewParentId(canEditAny ? '' : (nodes.find((n) => editableNodeIds.has(n.id))?.id || ''));
              setIsAddingNode(true);
            }}
            className="w-[52px] h-[52px] rounded-full bg-primary text-on-primary shadow-2xl flex items-center justify-center active:scale-95 transition-transform"
            title={lang === 'zh' ? '挂载新责任人' : 'Add Person'}
          >
            <span className="material-symbols-outlined text-2xl">person_add</span>
          </button>
        </div>

        {/* DRAW.IO LINKING ACTIVE TOP BANNER */}
        {linkingSourceNodeId && (
          <div className="absolute top-14 md:top-4 left-1/2 -translate-x-1/2 z-40 max-w-[94%] bg-gradient-to-r from-cyan-600 via-teal-600 to-cyan-600 text-white px-4 md:px-6 py-2.5 rounded-full shadow-2xl flex items-center gap-3 md:gap-4 animate-bounce border-2 border-white/30">
            <div className="flex items-center gap-2 font-black text-xs md:text-sm">
              <span className="material-symbols-outlined animate-spin text-lg shrink-0">hub</span>
              <span className="truncate">
                {lang === 'zh'
                  ? `连线模式：点击目标卡片建立父子归属`
                  : `Linking: tap target card to connect`}
                <span className="hidden md:inline">
                  {lang === 'zh' ? '（按 ESC 取消）' : ' (ESC to cancel)'}
                </span>
              </span>
            </div>
            <button
              onClick={handleConnectToSpine}
              className="px-2.5 py-0.5 rounded-full bg-white/25 hover:bg-white/45 text-xs font-black cursor-pointer transition-colors whitespace-nowrap"
              title={lang === 'zh' ? '把该责任人直接挂到主轴上' : 'Attach directly to the trunk'}
            >
              🚩 {lang === 'zh' ? '提升为主干' : 'To Trunk'}
            </button>
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

        {/* LEFT PALETTE: MOUNT NEW RESPONSIBILITY NODE（只读成员整体隐藏；聚合视图保留原有只读提示行为） */}
        {(!isBackendProject || canMountSomething) && (
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
                onPointerDown={e => handlePaletteDragStart(template, e)}
                onClick={() => {
                  openPaletteMountModal(
                    template,
                    selectedNodeId ? { type: 'node', nodeId: selectedNodeId } : { type: 'trunk' },
                  );
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
        )}

      </div>

      {/* MOBILE INFO BOTTOM SHEET: description / progress / controls */}
      {showMobileInfo && (
        <div className="md:hidden fixed inset-0 z-50" onClick={() => setShowMobileInfo(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" />
          <div
            onClick={e => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 bg-surface dark:bg-[#1a1c1e] rounded-t-3xl border-t border-outline-variant/40 shadow-2xl p-5 pb-8 space-y-5 max-h-[75dvh] overflow-y-auto"
          >
            <div className="w-10 h-1 rounded-full bg-outline-variant/60 mx-auto" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary text-xl">route</span>
                  <span>{lang === 'zh' ? '人轴责任画布' : 'People-Axis Canvas'}</span>
                </h2>
                <p className="text-xs text-on-surface-variant font-medium mt-1.5 leading-relaxed">
                  {lang === 'zh'
                    ? '主干即地铁线路：总负责人挂在主干一头，各部门/厂家领导分列两侧，下属卡片挂在领导之下。单指拖动卡片或画布，双指捏合缩放。'
                    : 'The trunk is the metro line: director at one end, leaders on both sides. Drag with one finger, pinch to zoom.'}
                </p>
              </div>
              <button
                onClick={() => setShowMobileInfo(false)}
                className="shrink-0 w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Progress rail */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-extrabold text-on-surface-variant">
                <span>{lang === 'zh' ? '主干项目进度' : 'Trunk progress'}</span>
                <span className="text-primary font-black">{totalProjectProgress}%</span>
              </div>
              <div className="w-full h-3 bg-surface-container-highest dark:bg-[#282b2d] rounded-full overflow-hidden border border-outline-variant/30 p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 via-primary to-emerald-500 rounded-full transition-all duration-700"
                  style={{ width: `${totalProjectProgress}%` }}
                />
              </div>
            </div>

            {/* Orientation & reset */}
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-surface-container dark:bg-[#1e2022] border border-outline-variant/40 rounded-2xl p-1 flex items-center gap-1">
                <button
                  onClick={() => setTreeOrientation('horizontal')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                    treeOrientation === 'horizontal' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'
                  }`}
                >
                  {lang === 'zh' ? '横向主轴' : 'Horizontal'}
                </button>
                <button
                  onClick={() => setTreeOrientation('vertical')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                    treeOrientation === 'vertical' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'
                  }`}
                >
                  {lang === 'zh' ? '纵向主轴' : 'Vertical'}
                </button>
              </div>
              <button
                onClick={() => {
                  resetAllDragOffsets();
                  setCanvasResetToken((n) => n + 1);
                  setShowMobileInfo(false);
                }}
                className="px-3.5 py-2.5 rounded-2xl bg-surface-container border border-outline-variant/40 text-on-surface text-xs font-bold flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">restart_alt</span>
                <span>{lang === 'zh' ? '重置布局' : 'Reset'}</span>
              </button>
            </div>

            {isBackendProject ? (
              <div className="space-y-3 pt-1 border-t border-outline-variant/30">
                <div className="space-y-1.5 pt-3">
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
                    onPointerUp={saveAlongDelta}
                    className="w-full accent-primary"
                  />
                </div>
                <button
                  type="button"
                  disabled={auditLoading}
                  onClick={handleRunAxisAudit}
                  className="w-full py-2.5 rounded-2xl bg-primary/10 text-primary text-xs font-extrabold disabled:opacity-50"
                >
                  {auditLoading
                    ? (lang === 'zh' ? '审计中…' : 'Auditing…')
                    : (lang === 'zh' ? '运行人轴 AI 审计' : 'Run axis audit')}
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-on-surface-variant font-medium pt-3 border-t border-outline-variant/30">
                {lang === 'zh'
                  ? '当前为聚合只读视图，在顶部选择具体项目后可编辑、挂载人员并运行 AI 审计。'
                  : 'Aggregated read-only view. Select a concrete project to edit.'}
              </p>
            )}
          </div>
        </div>
      )}

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
                ? (lang === 'zh' ? '🔗 松手挂载为该卡片下属' : 'Attach as Subordinate')
                : dropHoverTarget
                ? (lang === 'zh' ? '🎯 松手在主轴挂载（可再自定义）' : 'Position on Trunk')
                : (lang === 'zh' ? '👉 拖到画布或目标卡片上' : 'Drag onto canvas or a card')}
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
                  {/* 非 PM 不能建主干节点，也只能挂到自己负责的子树下（与服务端 ACL 一致） */}
                  {canEditAny && (
                    <option value="">{lang === 'zh' ? '🏢 作为主干部门/厂家主管 (Direct Main Axis Leader)' : '🏢 Trunk Leader'}</option>
                  )}
                  {(canEditAny ? nodes : nodes.filter((n) => editableNodeIds.has(n.id))).map(n => (
                    <option key={n.id} value={n.id}>
                      {n.person.name} ({n.roleTitle})
                    </option>
                  ))}
                </select>
                {!canEditAny && (
                  <p className="mt-1.5 text-[11px] text-on-surface-variant">
                    {lang === 'zh' ? '你只能在自己负责的节点下挂载下属；主干挂载需项目 PM。' : 'You can only mount under nodes you own; trunk mounting requires the PM.'}
                  </p>
                )}
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
              <button onClick={() => { setIsAddingWorkItem(null); setNewWorkTitle(''); setNewWorkDueDate(''); setNewWorkDesc(''); }} className="text-on-surface-variant hover:text-on-surface text-xl font-bold cursor-pointer">✕</button>
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

              <div>
                <label className="block text-xs font-extrabold text-on-surface-variant uppercase tracking-wider mb-2">
                  {lang === 'zh' ? '截止日期 (可选)' : 'Due Date (Optional)'}
                </label>
                <input
                  type="date"
                  value={newWorkDueDate}
                  onChange={e => setNewWorkDueDate(e.target.value)}
                  className="w-full p-3 rounded-xl bg-surface-container dark:bg-[#282b2d] border border-outline-variant/50 text-sm text-on-surface focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-on-surface-variant uppercase tracking-wider mb-2">
                  {lang === 'zh' ? '描述 / 验收口径 (可选)' : 'Description (Optional)'}
                </label>
                <textarea
                  value={newWorkDesc}
                  onChange={e => setNewWorkDesc(e.target.value)}
                  rows={2}
                  placeholder={lang === 'zh' ? '补充交付标准、验收证据要求等...' : 'Acceptance criteria, evidence requirements...'}
                  className="w-full p-3 rounded-xl bg-surface-container dark:bg-[#282b2d] border border-outline-variant/50 text-sm text-on-surface focus:outline-none focus:border-primary resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setIsAddingWorkItem(null); setNewWorkTitle(''); setNewWorkDueDate(''); setNewWorkDesc(''); }}
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
