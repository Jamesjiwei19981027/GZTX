import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { PersonMembershipActions } from '../PersonMembershipActions';
import { MaterialTextInput } from '../MaterialTextInput';
import { inferEvidenceKind } from '../../utils/evidenceFiles';
import { PeopleAxisNode, AxisWorkItem, AxisEvidence, Language, TeamMember, Project } from '../../types';
import {
  createNode,
  getProject,
  getProjectTree,
  listNodeEvidence,
  listProjectMembers,
  submitEvidence,
} from '../../api/backend';
import { mapMember, mapTreeToPeopleAxis, extraRootIds } from '../../api/mappers';
import { withAxisPersonMetadata } from '../../api/axisPerson';
import { getMyPermissions, getPeopleAxisAggregate, runAxisAudit, MyProjectPermissions } from '../../api/shell';
import { fetchMe } from '../../api/auth';
import { averagePeopleAxisProgress } from './peopleAxisUtils';
import { responsibilityScope } from './peopleAxisFlowLayout';
import {
  usePeopleAxisCanvas, ReparentConfirmDialog, computeEditableNodeIds, makeNodeCapabilityCheckers,
} from './usePeopleAxisCanvas';
import { DelegationModal } from '../modals/DelegationModal';
import { ResponsibilityWorkspace, AxisDialog, type AxisProjectSummary } from './ResponsibilityWorkspace';
import { EditResponsibilityPerson } from './EditResponsibilityPerson';
import { ResponsibilityPermissionFields, defaultResponsibilityPermissions } from './ResponsibilityPermissionFields';
import { ProjectWikiPanel } from './ProjectWikiPanel';
import { uploadEvidenceFile } from '../../api/projectWiki';

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
  const activeProjectRef = useRef(projectId);
  activeProjectRef.current = projectId;
  const [projectName, setProjectName] = useState('');
  const [projectCreator, setProjectCreator] = useState<number | null>(null);
  const [finalOwner, setFinalOwner] = useState({ name: lang === 'zh' ? '待指定' : 'Unassigned', avatar: '' });
  const [nodes, setNodes] = useState<PeopleAxisNode[]>([]);
  const [projectSummaries, setProjectSummaries] = useState<AxisProjectSummary[]>([]);
  const [scopeChoice, setScopeChoice] = useState<'auto' | 'mine' | 'project'>('auto');
  const [loadVersion, setLoadVersion] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [backendLoadError, setBackendLoadError] = useState<string | null>(null);
  const [projectMembers, setProjectMembers] = useState<TeamMember[]>([]);
  const [isAddingNode, setIsAddingNode] = useState(false);
  const [newNodeOrigin, setNewNodeOrigin] = useState<'project' | 'subordinate'>('project');
  const [newNodePermissions, setNewNodePermissions] = useState(defaultResponsibilityPermissions);
  const [editingPerson, setEditingPerson] = useState<{ nodeId: number; projectId: string } | null>(null);
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
  const [edgeStyle, setEdgeStyle] = useState<'curve' | 'straight'>(() => {
    try {
      const stored = localStorage.getItem('people_axis_edge_style');
      return stored === 'straight' ? 'straight' : 'curve';
    } catch {
      return 'curve';
    }
  });
  const handleEdgeStyleChange = useCallback((style: 'curve' | 'straight') => {
    setEdgeStyle(style);
    try {
      localStorage.setItem('people_axis_edge_style', style);
    } catch {
      // ignore
    }
  }, []);
  const [auditLoading, setAuditLoading] = useState(false);

  // Flagship Visual Controls
  const [treeOrientation, setTreeOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const treeOrientationRef = useRef(treeOrientation);
  treeOrientationRef.current = treeOrientation;
  // 数据每次整体载入（切项目 / 手动刷新）时递增，画布据此重新读取节点里的位置偏移
  const [axisLoadSeq, setAxisLoadSeq] = useState(0);

  // Mobile bottom sheet with the description / progress / controls that the
  // desktop layout shows above the canvas.
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
  
  const [newEvDescription, setNewEvDescription] = useState('');
  const [newEvFiles, setNewEvFiles] = useState<File[]>([]);
  const [evidenceVoiceBusy, setEvidenceVoiceBusy] = useState(false);
  const [wikiProject, setWikiProject] = useState<{ id: number; name: string } | null>(null);
  useEffect(() => { setWikiProject(null); setNewEvDescription(''); setNewEvFiles([]); }, [projectId]);
  useEffect(() => { setNewEvDescription(''); setNewEvFiles([]); }, [isAddingEvidence]);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Custom Member Form Fields
  const [isCustomPerson, setIsCustomPerson] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [customDept, setCustomDept] = useState('');
  const [customWorkScope, setCustomWorkScope] = useState('');
  const [customRiskLevel, setCustomRiskLevel] = useState<'low' | 'medium' | 'high'>('low');

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => (prev === msg ? null : prev));
    }, 3500);
  }, []);

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
  }, [isBackendProject, backendProjectId, loadVersion]);

  useEffect(() => {
    let cancelled = false;
    setNodes([]);
    setProjectSummaries([]);
    setScopeChoice('auto');
    setSelectedNodeId(null);
    setLinkingSourceNodeId(null);
    setLinkingHoveredTargetId(null);
    setIsAddingNode(false);
    setEditingPerson(null);
    setIsAddingWorkItem(null);
    setIsAddingEvidence(null);
    setIsDelegationOpen(false);
    setProjectName('');
    setProjectCreator(null);
    setProjectCompanyId(null);
    setProjectMembers([]);
    setPmUserId(null);
    setFinalOwner({ name: lang === 'zh' ? '待指定' : 'Unassigned', avatar: '' });
    const apply = (loaded: PeopleAxisNode[]) => {
      if (cancelled) return;
      setNodes(loaded);
      setExpandedNodes({});
      setAxisLoadSeq(n => n + 1);
      setSelectedNodeId(null);
    };

    const pid = projectId && projectId !== 'all' ? Number(projectId) : NaN;
    if (projectId === 'all') {
      setPmUserId(null);
      setSyncStatus('syncing');
      setBackendLoadError(null);
      void getPeopleAxisAggregate().then(async (result) => {
        if (cancelled) return;
        const summaries: AxisProjectSummary[] = [];
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
          summaries.push({
            id: String(project.project_id), name: project.project_name,
            nodes: mapTreeToPeopleAxis(roots as never[], project.final_owner_user_id ?? project.pm_user_id, treeOrientationRef.current),
            myRole: project.my_role || 'member',
            ownedNodeIds: (project.my_owned_node_ids || []).map(String),
          });
        }
        if (cancelled) return;
        apply([]);
        setProjectSummaries(summaries);
        setBackendLoadError(null);
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
          treeOrientationRef.current,
        );
        const withEvidence = await enrichMattersWithEvidence(mapped);
        if (cancelled) return;
        setProjectName(proj.name);
        setProjectCreator(proj.created_by ?? null);
        const ownerId = proj.final_owner_user_id ?? proj.pm_user_id;
        const ownerMember = mappedMembers.find(m => Number(m.id) === ownerId);
        setFinalOwner({
          name: proj.final_owner?.nickname || proj.final_owner?.username || ownerMember?.name || (lang === 'zh' ? '待指定' : 'Unassigned'),
          avatar: proj.final_owner?.avatar_url || ownerMember?.avatar || '',
        });
        setPmUserId(proj.pm_user_id ?? null);
        setProjectCompanyId(proj.company_id ?? null);
        apply(withEvidence);
        // 空项目不再挂 amber 提示条，改由画布内的首触引导空状态承接
      } catch (e) {
        if (cancelled) return;
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
  }, [projectId, lang, loadVersion]);

  const reloadAxisFromBackend = useCallback(async () => {
    const isCurrent = () => activeProjectRef.current === String(backendProjectId);
    if (!isBackendProject || !isCurrent()) return;
    setSyncStatus('syncing');
    try {
      const [proj, tree, permissions] = await Promise.all([
        getProject(backendProjectId),
        getProjectTree(backendProjectId),
        getMyPermissions(backendProjectId),
      ]);
      const mapped = mapTreeToPeopleAxis(
        tree.nodes || [],
        proj.final_owner_user_id ?? proj.pm_user_id,
        treeOrientationRef.current,
      );
      const withEvidence = await enrichMattersWithEvidence(mapped);
      if (!isCurrent()) return;
      setPmUserId(proj.pm_user_id ?? null);
      setProjectCompanyId(proj.company_id ?? null);
      setNodes(withEvidence);
      setServerPerms(permissions);
      setBackendLoadError(null);
    } catch (e) {
      if (isCurrent()) showToast(e instanceof Error ? e.message : '刷新失败');
    } finally {
      if (isCurrent()) setSyncStatus('synced');
    }
  }, [isBackendProject, backendProjectId, showToast]);

  const [seedingSample, setSeedingSample] = useState(false);

  /**
   * 首登一键示例人轴：3 人（含 1 名下级）+ 2 事项 + 终责。
   *
   * 写的是真实节点（走 TreeService 的形态校验），不是本地假数据——用户看完可以直接改，
   * 也可以逐个删掉，不会留下无法编辑的演示残留。
   */
  const seedSampleAxis = useCallback(async () => {
    if (!isBackendProject || seedingSample) return;
    setSeedingSample(true);
    setSyncStatus('syncing');
    try {
      const zh = lang === 'zh';
      const primaryMember = memberOptions[0];
      const dueIn = (days: number) =>
        new Date(Date.now() + days * 86400000).toISOString();

      // 终责人为单根
      const terminalMember =
        memberOptions.find((m) => Number(m.id) === pmUserId) || memberOptions[0];
      const root = await createNode(backendProjectId, {
        parent_id: null,
        node_type_key: 'person',
        title: terminalMember?.name || (zh ? '项目终责' : 'Final Owner'),
        description: zh ? '示例：项目终责' : 'Sample: final owner',
        sort_order: 0,
        assignees: terminalMember
          ? [{ user_id: Number(terminalMember.id), role_key: 'primary' }]
          : [],
      });

      // 事项落在终责人下
      await createNode(backendProjectId, {
        parent_id: root.id,
        node_type_key: 'work_item',
        title: zh ? '示例：项目总体规划' : 'Sample: project roadmap',
        due_at: dueIn(7),
        sort_order: 0,
      });

      // 人挂人 = 下级人员，挂在终责根下
      const subMember =
        memberOptions.find((m) => Number(m.id) !== Number(terminalMember?.id)) || memberOptions[1];
      const sub = await createNode(backendProjectId, {
        parent_id: root.id,
        node_type_key: 'person',
        title: subMember?.name || (zh ? '模块负责人' : 'Module Lead'),
        description: zh ? '示例：模块负责人' : 'Sample: module lead',
        sort_order: 1,
        assignees: subMember
          ? [{ user_id: Number(subMember.id), role_key: 'primary' }]
          : [],
      });

      await createNode(backendProjectId, {
        parent_id: sub.id,
        node_type_key: 'work_item',
        title: zh ? '示例：完成需求评审' : 'Sample: finish requirement review',
        due_at: dueIn(14),
        sort_order: 0,
      });

      await reloadAxisFromBackend();
      showToast(
        zh
          ? '已生成示例人轴：单根终责 + 下属分工，可直接改或删'
          : 'Sample axis created: single accountable root with team owners.',
      );
    } catch (e) {
      showToast(
        e instanceof Error
          ? e.message
          : lang === 'zh'
            ? '生成示例失败'
            : 'Failed to create the sample axis',
      );
      setSyncStatus('synced');
    } finally {
      setSeedingSample(false);
    }
  }, [
    isBackendProject,
    seedingSample,
    lang,
    memberOptions,
    backendProjectId,
    pmUserId,
    reloadAxisFromBackend,
    showToast,
  ]);

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
  const editableNodeIds = useMemo(
    () => computeEditableNodeIds(nodes, isBackendProject, serverPerms, meId),
    [isBackendProject, serverPerms, meId, nodes],
  );

  /** 至少拥有一个可挂载位置（PM 任意；成员需名下有节点） */
  const { canAddSubordinate, canAddWorkItem, canSubmitEvidence } = useMemo(
    () => makeNodeCapabilityCheckers(serverPerms, canEditAny, editableNodeIds),
    [serverPerms, canEditAny, editableNodeIds],
  );
  const canMountSomething = canMoveNodes || nodes.some(node => canAddSubordinate(node.id));

  const myScope = useMemo(() => responsibilityScope(nodes,
    serverPerms ? new Set(serverPerms.owned_node_ids.map(String)) : null, meId), [nodes, serverPerms, meId]);
  const isProjectPM = serverPerms?.is_pm || meId != null && pmUserId === meId;
  const scope = scopeChoice === 'auto' ? (!canEditAny && myScope.direct.size > 0 ? 'mine' : 'project') : scopeChoice;
  const scopedNodes = useMemo(() => scope === 'mine' && !isProjectPM
    ? nodes.filter(n => myScope.visible.has(n.id)) : nodes, [scope, nodes, isProjectPM, myScope]);
  const myRoleTitles = nodes.filter(n => myScope.direct.has(n.id)).map(n => n.roleTitle);
  const roleLabel = isProjectPM ? (lang === 'zh' ? '项目 PM · 统筹项目' : 'Project PM')
    : myRoleTitles.length ? [...new Set(myRoleTitles)].join(' / ')
    : serverPerms?.via_delegation ? (lang === 'zh' ? '项目委托管理' : 'Delegated manager')
    : serverPerms?.is_superadmin ? (lang === 'zh' ? '公司管理员' : 'Company admin')
    : (lang === 'zh' ? '项目成员 · 尚未分配职责' : 'Member · no assigned responsibility');

  /* ---------------- React Flow 画布数据装配（与手机网页共用同一份实现） ---------------- */

  const scopeContextNodeIds = useMemo(
    () => scope === 'mine' && !isProjectPM
      ? new Set(nodes.filter(n => !myScope.mine.has(n.id)).map(n => n.id))
      : new Set<string>(),
    [nodes, scope, isProjectPM, myScope],
  );

  const {
    rfNodes, rfEdges, expandedNodes, setExpandedNodes, toggleExpandNode,
    handleNodeDragStop, resetAllDragOffsets,
    reparentConfirm, handleRequestReparent, handleConfirmReparent, handleCancelReparent,
    linkingSourceNodeId, setLinkingSourceNodeId, setLinkingHoveredTargetId,
  } = usePeopleAxisCanvas({
    nodes,
    scopedNodes,
    orientation: treeOrientation,
    edgeStyle,
    lang,
    isBackendProject,
    backendProjectId,
    serverPerms,
    currentUserId: meId,
    seedKey: axisLoadSeq,
    selectedNodeId,
    mineNodeIds: myScope.direct,
    scopeContextNodeIds,
    canEditAny,
    canMoveNodes,
    editableNodeIds,
    onSelectNode: setSelectedNodeId,
    onShowToast: showToast,
    onSyncStatus: setSyncStatus,
    onReloadAxis: reloadAxisFromBackend,
    onAddWorkItem: setIsAddingWorkItem,
    onAddChild: (id) => {
      setNewParentId(id);
      setNewNodeOrigin('subordinate');
      setNewNodePermissions(defaultResponsibilityPermissions);
      setIsAddingNode(true);
    },
    onEditPerson: (id) => {
      const nodeId = asBackendId(id);
      if (nodeId != null) setEditingPerson({ nodeId, projectId: String(backendProjectId) });
    },
  });

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

  const handlePaneClick = () => {
    // 连线模式下点空白不动作（防误触）；提升主干走 banner 上的显式按钮
    if (!linkingSourceNodeId) setSelectedNodeId(null);
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
    if (newParentId && !canAddSubordinate(newParentId)) {
      showToast(lang === 'zh' ? '上级节点未开放新增下级权限' : 'Adding subordinates is not allowed here');
      return;
    }
    if (newNodeOrigin === 'subordinate' && !newParentId) {
      showToast(lang === 'zh' ? '请选择下级自建人员的直属上级' : 'Choose the direct manager for self-added person');
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
            node_origin: newNodeOrigin,
            responsibility_permissions: newNodePermissions,
            description: withAxisPersonMetadata([
              newRoleTitle || personToAssign.role,
              personToAssign.department,
              `risk=${customRiskLevel}`,
            ]
              .filter(Boolean)
              .join(' / '), {
                name: personToAssign.name,
                roleTitle: newRoleTitle || personToAssign.role,
                department: personToAssign.department || '',
              }),
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
    if (!canAddWorkItem(nodeId)) {
      showToast(lang === 'zh' ? '此节点未开放新增事项权限' : 'Adding work items is not allowed here');
      return;
    }

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
    if (evidenceVoiceBusy) return;
    if (!newEvDescription.trim() && !newEvFiles.length) return;
    if (!canSubmitEvidence(workItemId)) {
      showToast(lang === 'zh' ? '此节点未开放材料提交权限' : 'Evidence submissions are not allowed here');
      return;
    }

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
      const summary = newEvDescription.trim() || newEvFiles.map(file => file.name).join('、');
      void (async () => {
        try {
          setSyncStatus('syncing');
          const fileIds: number[] = [];
          if (newEvFiles.length && !projectCompanyId) throw new Error('项目公司信息未加载，请重试');
          for (const file of newEvFiles) {
            const result = await uploadEvidenceFile(file, projectCompanyId!, backendProjectId);
            fileIds.push(result.file_id);
          }
          await submitEvidence(matterId, {
            summary,
            evidence_kind: inferEvidenceKind(newEvFiles),
            file_ids: fileIds,
          });
          if (activeProjectRef.current !== String(backendProjectId)) return;
          setIsAddingEvidence(null);
          setNewEvDescription('');
          setNewEvFiles([]);
          await reloadAxisFromBackend();
          showToast(lang === 'zh' ? '证据已提交' : 'Evidence submitted');
        } catch (err) {
          if (activeProjectRef.current !== String(backendProjectId)) return;
          showToast(err instanceof Error ? err.message : '提交证据失败');
          setSyncStatus('synced');
        }
      })();
      return;
    }

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

  const extraRoots = useMemo(() => extraRootIds(nodes), [nodes]);

  return (
    <div className="axis-view-root">
      <ResponsibilityWorkspace
        lang={lang} projectId={projectId} projects={projects} projectName={projectName}
        onSelectProject={onSelectProject} nodes={scopedNodes} selectedId={selectedNodeId}
        projectSummaries={projectSummaries} currentUserId={meId}
        scope={scope} onScopeChange={value => { setScopeChoice(value); setSelectedNodeId(null); setExpandedNodes({}); setLinkingSourceNodeId(null); setLinkingHoveredTargetId(null); }} roleLabel={roleLabel}
        isProjectPM={!!isProjectPM} hasResponsibilities={myScope.direct.size > 0}
        onSelect={setSelectedNodeId} expanded={expandedNodes} onToggleExpand={toggleExpandNode}
        progress={averagePeopleAxisProgress(scopedNodes)} syncing={syncStatus === 'syncing'} error={backendLoadError}
        finalOwner={finalOwner} canAdd={isBackendProject && canMountSomething}
        onAdd={() => {
          if (nodes.length === 0 && pmUserId != null) {
            setNewPersonId(String(pmUserId));
            const pmMember = memberOptions.find(m => Number(m.id) === pmUserId);
            if (pmMember) {
              setNewRoleTitle(lang === 'zh' ? '项目终责' : 'Final Owner');
            }
          } else {
            setNewPersonId('');
            setNewRoleTitle('');
          }
          setNewParentId(canMoveNodes ? '' : (nodes.find(n => canAddSubordinate(n.id))?.id || ''));
          setNewNodeOrigin(canMoveNodes ? 'project' : 'subordinate');
          setNewNodePermissions(defaultResponsibilityPermissions);
          setIsAddingNode(true);
        }}
        onOrientation={setTreeOrientation}
        edgeStyle={edgeStyle}
        onEdgeStyle={handleEdgeStyleChange}
        extraRoots={extraRoots}
        canvas={{
          lang, nodes: rfNodes, edges: rfEdges, orientation: treeOrientation,
          edgeStyle,
          linkingSourceNodeId, onNodeDragStop: handleNodeDragStop, onPaneClick: handlePaneClick,
          onResetLayout: () => { resetAllDragOffsets(); setCanvasResetToken(n => n + 1); },
          onRequestReparent: handleRequestReparent,
          onShowToast: showToast,
          resetToken: canvasResetToken,
          onCancelLinking: () => { setLinkingSourceNodeId(null); setLinkingHoveredTargetId(null); },
        }}
        onAddEvidence={id => { if (!canSubmitEvidence(id)) return; setIsAddingEvidence(id); setNewEvDescription(''); setNewEvFiles([]); }}
        onAudit={handleRunAxisAudit} auditing={auditLoading} onReload={() => setLoadVersion(version => version + 1)}
        onOpenWiki={() => setWikiProject({ id: backendProjectId,
          name: projects?.find(project => project.id === String(backendProjectId))?.name || projectName || `${lang === 'zh' ? '项目' : 'Project'} #${backendProjectId}` })}
        onDelegate={isBackendProject && projectCompanyId != null
          ? () => setIsDelegationOpen(true) : undefined}
        onSeed={() => void seedSampleAxis()} seeding={seedingSample} isProject={isBackendProject}
      />
      {isBackendProject && selectedNodeId && nodes.find(node => node.id === selectedNodeId) && <PersonMembershipActions
        node={nodes.find(node => node.id === selectedNodeId)!}
        capabilities={serverPerms?.node_permissions?.[selectedNodeId]}
        onChanged={async()=>{setSelectedNodeId(null);await reloadAxisFromBackend();}} />}
      {isBackendProject && projectCompanyId != null && (
        <DelegationModal isOpen={isDelegationOpen} onClose={() => setIsDelegationOpen(false)}
          canManage={serverPerms ? serverPerms.is_pm || serverPerms.is_superadmin : meId != null && pmUserId === meId}
          currentUserId={meId}
          lang={lang} companyId={projectCompanyId} projectId={backendProjectId} members={memberOptions} />
      )}
      {editingPerson && editingPerson.projectId === projectId && <AxisDialog title={lang === 'zh' ? '编辑人员' : 'Edit person'} onClose={() => setEditingPerson(null)}>
        <EditResponsibilityPerson nodeId={editingPerson.nodeId} members={memberOptions} lang={lang} canManageAssignees={serverPerms?.node_permissions?.[String(editingPerson.nodeId)]?.can_manage_assignees !== false} canManagePermissions={serverPerms?.node_permissions ? !!serverPerms.node_permissions[String(editingPerson.nodeId)]?.can_manage_permissions : canEditAny} onSaved={async () => {
          if (activeProjectRef.current !== editingPerson.projectId) return;
          setEditingPerson(null);
          const permissions = await getMyPermissions(backendProjectId).catch(() => null);
          if (activeProjectRef.current !== editingPerson.projectId) return;
          setServerPerms(permissions);
          await reloadAxisFromBackend();
          showToast(lang === 'zh' ? '人员与项目岗位已更新' : 'Person and project role updated');
        }} />
      </AxisDialog>}
      {wikiProject && <ProjectWikiPanel projectId={wikiProject.id} projectName={wikiProject.name} lang={lang} onClose={() => setWikiProject(null)} />}
      {isAddingEvidence && (() => {
        const owner = nodes.find(n => n.workItems.some(w => w.id === isAddingEvidence));
        if (!owner) return null;
        return <AxisDialog title={lang === 'zh' ? '提交材料' : 'Submit evidence'} onClose={() => setIsAddingEvidence(null)}>
          <form className="axis-evidence-form" onSubmit={e => handleAddEvidence(owner.id, isAddingEvidence, e)}>
            <h2>{lang === 'zh' ? '提交材料' : 'Submit evidence'}</h2>
            <label>{lang === 'zh' ? '归属事项' : 'Work item'}<select value={isAddingEvidence} onChange={event => setIsAddingEvidence(event.target.value)}>
              {owner.workItems.filter(item => canSubmitEvidence(item.id)).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select></label>
            <MaterialTextInput value={newEvDescription} onChange={setNewEvDescription} companyId={projectCompanyId || 0} projectId={backendProjectId}
              scopeKey={`${projectCompanyId}:${backendProjectId}:${isAddingEvidence}`} disabled={syncStatus === 'syncing'} onBusyChange={setEvidenceVoiceBusy} />
            <label>{lang === 'zh' ? '上传材料' : 'Upload files'}<input type="file" multiple onChange={e => setNewEvFiles(Array.from(e.target.files || []))} /></label>
            {newEvFiles.length > 0 && <small>{newEvFiles.map(file => file.name).join('、')}</small>}
            <button className="axis-primary-button" type="submit" disabled={evidenceVoiceBusy || syncStatus === 'syncing' || (!newEvDescription.trim() && !newEvFiles.length)}>{lang === 'zh' ? '提交材料' : 'Submit evidence'}</button>
          </form>
        </AxisDialog>;
      })()}

      {/* MODAL: ADD PERSON / NODE */}
      {isAddingNode && (
        <AxisDialog title={lang === 'zh' ? '添加责任人' : 'Add owner'} onClose={() => setIsAddingNode(false)}>
          <div className="axis-create-form p-6 space-y-6">
            <h2>{lang === 'zh' ? '添加责任人' : 'Add owner'}</h2>

            <form onSubmit={handleAddNode} className="space-y-4">
              {canMoveNodes ? <label className="axis-origin-field">{lang === 'zh' ? '节点归属' : 'Node origin'}<select value={newNodeOrigin} onChange={event => {
                const origin = event.target.value as 'project' | 'subordinate'; setNewNodeOrigin(origin);
                if (origin === 'subordinate' && !newParentId) setNewParentId(nodes.find(n => canAddSubordinate(n.id))?.id || '');
                if (origin === 'project' && nodes.find(n => n.id === newParentId)?.nodeOrigin === 'subordinate') setNewParentId('');
              }}><option value="project">{lang === 'zh' ? '项目成员' : 'Project member'}</option><option value="subordinate">{lang === 'zh' ? '下级自建' : 'Self-added'}</option></select></label>
                : <p className="axis-muted">{lang === 'zh' ? '新增人员作为下级自建人员，连接直属上级。' : 'Add as self-added personnel under the direct manager.'}</p>}
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
                  {lang === 'zh' ? '手动填写' : 'Custom person'}
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
                    {lang === 'zh' ? '直属上级' : 'Direct manager'}
                </label>
                <select
                  value={newParentId}
                  aria-label={lang === 'zh' ? '直属上级' : 'Direct manager'}
                  onChange={e => setNewParentId(e.target.value)}
                  className="w-full p-3 rounded-xl bg-surface-container dark:bg-[#282b2d] border border-outline-variant/50 text-sm font-bold text-on-surface focus:outline-none focus:border-primary"
                >
                  {/* 非 PM 不能建主干节点，也只能挂到自己负责的子树下（与服务端 ACL 一致） */}
                  {canMoveNodes && newNodeOrigin === 'project' && (
                    <option value="">{lang === 'zh' ? '项目终责下的一级负责人' : 'First-level owner under project lead'}</option>
                  )}
                  {nodes.filter(n => canAddSubordinate(n.id) && (newNodeOrigin === 'subordinate' || n.nodeOrigin !== 'subordinate')).map(n => (
                    <option key={n.id} value={n.id}>
                      {n.person.name} ({n.roleTitle}) · {n.nodeOrigin === 'subordinate' ? (lang === 'zh' ? '下级自建' : 'Self-added') : (lang === 'zh' ? '项目成员' : 'Project member')}
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

              <ResponsibilityPermissionFields value={newNodePermissions} onChange={setNewNodePermissions} lang={lang} />
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
        </AxisDialog>
      )}

      {/* MODAL: ADD WORK ITEM */}
      {isAddingWorkItem && (
        <AxisDialog title={lang === 'zh' ? '添加事项' : 'Add work item'} onClose={() => setIsAddingWorkItem(null)}>
          <div className="axis-create-form p-6 space-y-6">
            <h2>{lang === 'zh' ? '添加事项' : 'Add work item'}</h2>

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
                  <option value="milestone">{lang === 'zh' ? '关键里程碑' : 'Key milestone'}</option>
                  <option value="scope">{lang === 'zh' ? '交付范围' : 'Delivery scope'}</option>
                  <option value="task">{lang === 'zh' ? '工作任务' : 'Task'}</option>
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
        </AxisDialog>
      )}

      <ReparentConfirmDialog
        confirm={reparentConfirm}
        lang={lang}
        onConfirm={() => void handleConfirmReparent()}
        onCancel={handleCancelReparent}
      />

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
