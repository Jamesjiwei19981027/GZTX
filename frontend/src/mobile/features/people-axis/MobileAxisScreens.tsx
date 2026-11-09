import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  PeopleAxisNode,
  Project,
  UserProfile,
  AxisWorkItem,
  ResponsibilityPermissions,
} from '../../../types';
import {
  getProjectTree,
  listProjectMembers,
  createNode,
  moveNode,
  updateTreeNode,
  BackendTreeNode,
  BackendMember,
} from '../../../api/backend';
import {
  mapTreeToPeopleAxis,
  summarizeCardTasks,
  enrichMattersWithEvidence,
  isWorkItemOverdue,
  getWorkItemOverdueDays,
} from '../../../api/mappers';
import {
  listAgentReports,
  latestReportByUser,
  reportStatusLabel,
  reportStatusTone,
  supervisorReportStatus,
  type AgentReport,
} from '../../../api/reports';
import { averagePeopleAxisProgress, applyTimeOrder, type AxisOrderMode } from '../../../components/views/peopleAxisUtils';
import { MatterEditForm, MatterDeleteConfirm } from '../../../components/views/MatterEditDialog';
import { restoreMatterNode } from '../../../api/manage';
import { getMyPermissions, MyProjectPermissions } from '../../../api/shell';
import { AppIcon } from '../../ui/AppIcon';
import { Maximize } from 'lucide-react';
import { MobileTopBar } from '../../ui/MobileTopBar';
import { MobileSheet } from '../../ui/MobileSheet';
import { MobileField, MobileInput, MobileSwitch } from '../../ui/MobileField';
import { MobileEmptyState, MobileLoadingState } from '../../ui/MobileState';
import { MobileConfirm } from '../../ui/MobileConfirm';
import { PeopleAxisFlowCanvas } from '../../../components/views/PeopleAxisFlowCanvas';
import { usePeopleAxisCanvas, ReparentConfirmDialog } from '../../../components/views/usePeopleAxisCanvas';
import { getDescendantNodeIds } from '../../../components/views/peopleAxisUtils';
import { PersonMembershipActions } from '../../../components/PersonMembershipActions';

// ==========================================
// 工具函数：防止树状循环（Cycle Prevention）
// ==========================================

/**
 * 递归计算指定节点的所有后代节点 ID 集合。
 * 用于调整上级和新增下级时排除自身及后代，从根本上防止闭环产生。
 */

// ==========================================
// 组件 Props 契约
// ==========================================

export interface MobileAxisScreensProps {
  projectId: string | number;
  projects?: Project[];
  currentProject: Project;
  currentUser: UserProfile;
  companyId: number | string | null;
  onSelectProject?: (p: Project) => void;
  onNavigateToReport?: (reportId?: string, nodeId?: string, projectId?: string | number) => void;
  onOpenWiki?: () => void;
  onOpenEvidence?: (nodeId?: string) => void;
  onOpenAudit?: (projectId?: number) => void;
  onOpenDelegation?: (projectId?: number) => void;
}

export type AxisViewTab = 'mine' | 'overview';
export type AxisOrientation = 'vertical' | 'horizontal';
export type AxisSpacing = 'compact' | 'standard' | 'loose';

// ==========================================
// 主容器组件：MobileAxisScreens
// ==========================================

export const MobileAxisScreens: React.FC<MobileAxisScreensProps> = ({
  projectId,
  projects = [],
  currentProject,
  currentUser,
  companyId,
  onSelectProject,
  onNavigateToReport,
  onOpenWiki,
  onOpenEvidence,
  onOpenAudit,
  onOpenDelegation,
}) => {
  const pid =
    Number(projectId) ||
    Number(projects.find((project) => String(project.id) !== 'all')?.id) ||
    Number(currentProject.id);
  // 每次进入项目都有独立身份；A→B→A 也不能接纳第一次 A 的异步结果。
  const projectScope = useMemo(() => ({ pid }), [pid, companyId, currentUser.id]);
  const activeScopeRef = useRef<typeof projectScope | null>(projectScope);
  activeScopeRef.current = projectScope;
  const loadRequestRef = useRef(0);
  useEffect(() => {
    activeScopeRef.current = projectScope;
    return () => { if (activeScopeRef.current === projectScope) activeScopeRef.current = null; };
  }, [projectScope]);

  // 核心业务数据状态
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [axisNodes, setAxisNodes] = useState<PeopleAxisNode[]>([]);
  const [projectMembers, setProjectMembers] = useState<BackendMember[]>([]);
  const [permissions, setPermissions] = useState<MyProjectPermissions | null>(null);
  const [agentReports, setAgentReports] = useState<AgentReport[]>([]);
  const [reportsLoadFailed, setReportsLoadFailed] = useState(false);

  // 视图控制
  const [activeTab, setActiveTab] = useState<AxisViewTab>('mine');
  const [orientation, setOrientation] = useState<AxisOrientation>('vertical');
  const [orderMode, setOrderMode] = useState<AxisOrderMode>(() => {
    try { return localStorage.getItem('people_axis_order_mode') === 'time' ? 'time' : 'tree'; } catch { return 'tree'; }
  });
  const [showAiStatus, setShowAiStatus] = useState(true);
  const [expandSubordinates, setExpandSubordinates] = useState(true);
  const [spacing, setSpacing] = useState<AxisSpacing>('standard');
  const [edgeStyle, setEdgeStyle] = useState<'curve' | 'straight'>('curve');
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  // 画布缩放与定位触发 token
  const [fitToken, setFitToken] = useState(0);
  const [centerMeToken, setCenterMeToken] = useState(0);

  // 选中与模态弹层状态
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [previewNode, setPreviewNode] = useState<PeopleAxisNode | null>(null);
  const [detailNode, setDetailNode] = useState<PeopleAxisNode | null>(null);
  const [editPersonTarget, setEditPersonTarget] = useState<{
    mode: 'add' | 'edit';
    node?: PeopleAxisNode | null;
    parentSuggestedId?: string;
  } | null>(null);
  const [permissionTargetNode, setPermissionTargetNode] = useState<PeopleAxisNode | null>(null);
  const [moveSupervisorTargetNode, setMoveSupervisorTargetNode] = useState<PeopleAxisNode | null>(null);
  const [showSettingsSheet, setShowSettingsSheet] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [matterAction, setMatterAction] = useState<{ mode: 'edit' | 'delete'; item: AxisWorkItem } | null>(null);
  const [undoDelete, setUndoDelete] = useState<AxisWorkItem | null>(null);
  const [restoring, setRestoring] = useState(false);
  useEffect(() => {
    if (!undoDelete) return;
    const timer = setTimeout(() => setUndoDelete(null), 15000);
    return () => clearTimeout(timer);
  }, [undoDelete]);
  useEffect(() => {
    setMatterAction(null); setUndoDelete(null); setDetailNode(null); setPreviewNode(null);
    setEditPersonTarget(null); setPermissionTargetNode(null); setMoveSupervisorTargetNode(null);
    setRestoring(false); setToastMessage(null); setSelectedNodeId(null);
    setAxisNodes([]); setProjectMembers([]); setPermissions(null); setAgentReports([]); setReportsLoadFailed(false);
  }, [projectScope]);
  const changeOrderMode = (mode: AxisOrderMode) => {
    setOrderMode(mode);
    try { localStorage.setItem('people_axis_order_mode', mode); } catch { /* 本地存储不可用 */ }
    setFitToken(token => token + 1);
  };

  const showToast = useCallback((msg: string) => {
    if (activeScopeRef.current !== projectScope) return;
    setToastMessage(msg);
    setTimeout(() => { if (activeScopeRef.current === projectScope) setToastMessage(null); }, 3000);
  }, [projectScope]);

  useEffect(() => {
    if (!moreMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as unknown as globalThis.Node)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [moreMenuOpen]);

  // 刷新人轴核心数据
  const loadData = useCallback(async () => {
    if (activeScopeRef.current !== projectScope) return;
    const request = ++loadRequestRef.current;
    const isCurrent = () => activeScopeRef.current === projectScope && loadRequestRef.current === request;
    if (!pid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [treeRes, membersRes, permRes, reportsRes] = await Promise.all([
        getProjectTree(pid),
        listProjectMembers(pid).catch(() => ({ items: [] })),
        getMyPermissions(pid).catch(() => null),
        listAgentReports(pid).catch(() => null),
      ]);
      if (!isCurrent()) return;
      const mapped = mapTreeToPeopleAxis(treeRes.nodes || [], undefined, orientation);
      setAxisNodes(mapped);
      setProjectMembers(membersRes.items || []);
      setPermissions(permRes);
      if (reportsRes) {
        setAgentReports(reportsRes.items || []);
        setReportsLoadFailed(false);
      } else {
        setReportsLoadFailed(true);
      }
      try {
        const enriched = await enrichMattersWithEvidence(mapped);
        if (isCurrent()) setAxisNodes(enriched);
      } catch {
        // 材料获取失败时保留已映射节点
      }
    } catch (err: unknown) {
      if (!isCurrent()) return;
      const message = err instanceof Error ? err.message : '加载人轴责任链失败';
      setError(message);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [pid, projectScope]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 计算“我”的节点、直属上级与直属下级
  const currentUserIdNum = Number(currentUser.id);
  const selfNode = useMemo(() => {
    return (
      axisNodes.find(
        (n) =>
          n.ownerUserIds?.includes(currentUserIdNum),
      ) ||
      null
    );
  }, [axisNodes, currentUserIdNum, currentUser.id, currentUser.name]);

  const supervisorNode = useMemo(() => {
    if (!selfNode || !selfNode.parentId) return null;
    return axisNodes.find((n) => n.id === selfNode.parentId) || null;
  }, [axisNodes, selfNode]);

  const subordinateNodes = useMemo(() => {
    if (!selfNode) return [];
    return axisNodes.filter((n) => n.parentId === selfNode.id);
  }, [axisNodes, selfNode]);

  const handleFitScreen = useCallback(() => {
    setFitToken(t => t + 1);
  }, []);

  const canvasNodes = useMemo(
    () => {
      const visible = expandSubordinates ? axisNodes : axisNodes.filter(node => !node.parentId);
      return orderMode === 'time' ? applyTimeOrder(visible) : visible;
    },
    [expandSubordinates, axisNodes, orderMode],
  );
  const flowCanvas = usePeopleAxisCanvas({
    nodes: canvasNodes,
    orientation,
    edgeStyle,
    lang: 'zh',
    mobile: true,
    foldSubordinates: orderMode === 'tree',
    isBackendProject: true,
    backendProjectId: pid,
    serverPerms: permissions,
    currentUserId: currentUserIdNum,
    selectedNodeId,
    // 点卡片：选中（出现＋、⋯）并打开详情面板；点空白处取消选中。已选中的卡片再点会重新打开详情
    onSelectNode: (id) => {
      setSelectedNodeId(id);
      setPreviewNode(id ? axisNodes.find(n => n.id === id) || null : null);
    },
    onAddChild: (parentId) => {
      setEditPersonTarget({ mode: 'add', parentSuggestedId: parentId });
    },
    onEditPerson: (nodeId) => {
      const node = axisNodes.find(n => n.id === nodeId) || null;
      setEditPersonTarget({ mode: 'edit', node });
    },
    onReloadAxis: loadData,
    onShowToast: showToast,
    canEditAny: Boolean(permissions?.is_pm || permissions?.is_superadmin || permissions?.can_edit_all),
    canMoveNodes: Boolean(permissions?.can_move || permissions?.is_pm || permissions?.is_superadmin),
  });

  // 定位（含折叠成员）：先把目标拉出/展开，再由画布在节点出现后居中
  const [locate, setLocate] = useState<{ id: string; seq: number } | null>(null);
  const locateSeq = useRef(0);
  const { revealPerson } = flowCanvas;
  const locateNode = useCallback((id: string) => {
    revealPerson(id);
    locateSeq.current += 1;
    setLocate({ id, seq: locateSeq.current });
  }, [revealPerson]);
  const handleLocateDone = useCallback(() => setLocate(null), []);

  const handleLocateMe = useCallback(() => {
    if (selfNode) {
      setSelectedNodeId(selfNode.id);
      locateNode(selfNode.id);
    }
  }, [selfNode, locateNode]);

  const canChangeSupervisor = Boolean(permissions?.is_pm || permissions?.is_superadmin);
  const nodeCan = (node: PeopleAxisNode | null | undefined, capability: 'can_edit_person' | 'can_add_subordinate' | 'can_manage_permissions' | 'can_move_person') => {
    if (!node) return false;
    const explicit = permissions?.node_permissions?.[node.id]?.[capability];
    if (explicit !== undefined) return explicit;
    return Boolean(permissions?.is_pm || permissions?.is_superadmin || permissions?.can_edit_all);
  };

  if (loading) {
    return <MobileLoadingState message="正在加载责任链数据…" fullScreen />;
  }

  if (!pid) {
    return (
      <div className="axis-theme tabular-nums flex flex-col flex-1 h-full w-full bg-surface dark:bg-surface">
        <MobileTopBar title={activeTab === 'mine' ? '我的职责' : '项目全貌'} />
        <MobileEmptyState
          iconName="folder"
          title="请先选择具体项目"
          description="你还没有加入任何项目，或当前是“全部项目”。加入或选择一个项目后再查看人轴。"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <MobileEmptyState
          iconName="alert"
          title="无法加载人轴"
          description={error}
          action={{
            label: '重试',
            onClick: loadData,
            iconName: 'refresh',
          }}
        />
      </div>
    );
  }

  return (
    <div className="axis-theme tabular-nums flex flex-col flex-1 h-full w-full bg-surface dark:bg-surface select-none overflow-hidden relative">
      {/* 顶部导航条 */}
      <MobileTopBar
        title={activeTab === 'mine' ? '我的职责' : '项目全貌'}
        rightAction={
          <div className="flex items-center gap-1">
            {canChangeSupervisor && <button type="button" aria-label="新增主轴人员" onClick={()=>setEditPersonTarget({mode:'add'})} className="mobile-touch-target p-2 text-on-surface-variant dark:text-on-surface-variant"><AppIcon name="plus" size={18}/></button>}
            <button
              type="button"
              aria-label="画布设置"
              onClick={() => setShowSettingsSheet(true)}
              className="mobile-touch-target p-2 text-on-surface-variant dark:text-on-surface-variant active:opacity-60 cursor-pointer"
            >
              <AppIcon name="more-horizontal" size={18} />
            </button>
          </div>
        }
      />

      <div className="px-4 py-2 bg-surface-container-lowest dark:bg-surface-container shrink-0">
            {projects.length > 0 && onSelectProject && (
              <label className="mobile-axis-project-picker flex items-center w-full">
                <span className="shrink-0 text-xs text-outline mr-3">当前项目</span>
                <select
                  aria-label="选择项目"
                  value={String(pid)}
                  onChange={(event) => {
                    const next = projects.find((project) => String(project.id) === event.target.value);
                    if (next) onSelectProject(next);
                  }}
                  className="w-full min-h-[40px] rounded-lg border border-outline-variant bg-surface-container-lowest px-2 text-xs font-medium text-on-surface-variant outline-none dark:border-outline-variant dark:bg-surface-container dark:text-on-surface"
                >
                  {projects.filter(project => String(project.id) !== 'all').map((project) => (
                    <option key={String(project.id)} value={String(project.id)}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
      </div>

      <nav aria-label="人轴协作与检查" className="grid grid-cols-2 gap-2 px-4 pb-2 bg-surface-container-lowest dark:bg-surface-container shrink-0">
        {onOpenDelegation && <button type="button" onClick={() => onOpenDelegation(pid)} className="min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-surface dark:bg-surface-container text-on-surface-variant dark:text-on-surface-variant text-xs font-medium">
          <AppIcon name="lock" size={18} />委托授权
        </button>}
        {onOpenAudit && <button type="button" onClick={() => onOpenAudit(pid)} className="min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-surface dark:bg-surface-container text-on-surface-variant dark:text-on-surface-variant text-xs font-medium">
          <AppIcon name="file" size={18} />AI 责任链审计
        </button>}
      </nav>

      {/* 视图切换 Tabs */}
      <div className="flex bg-surface-container-lowest dark:bg-surface-container border-b border-outline-variant dark:border-outline-variant px-4 shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('mine')}
          className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-ink-colors cursor-pointer ${
            activeTab === 'mine'
              ? 'border-primary text-on-surface-variant dark:text-on-surface-variant font-medium'
              : 'border-transparent text-outline dark:text-outline'
          }`}
        >
          我的职责
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-ink-colors cursor-pointer ${
            activeTab === 'overview'
              ? 'border-primary text-on-surface-variant dark:text-on-surface-variant font-medium'
              : 'border-transparent text-outline dark:text-outline'
          }`}
        >
          项目全貌
        </button>
      </div>

      {/* 主工作区 */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'mine' ? (
          /* ========================================================= */
          /* 设计 ID 20：我的责任链 (直属上级 — 我 — 直属下级)        */
          /* ========================================================= */
          <div className="h-full overflow-y-auto px-4 py-4 space-y-4 mobile-scroll-container">
            {/* 说明提示 */}
            <div className="flex items-center gap-2 p-3 bg-surface dark:bg-surface-container text-on-surface-variant dark:text-on-surface-variant rounded-xl text-xs leading-relaxed border border-outline-variant dark:border-outline-variant">
              <AppIcon name="info" size={18} className="shrink-0" />
              <span>汇报路径由人轴决定，AI 辅助整理与递交。</span>
            </div>

            {/* 1. 直属领导节点 */}
            {supervisorNode ? (
              <div
                onClick={() => {
                  setSelectedNodeId(supervisorNode.id);
                  setPreviewNode(supervisorNode);
                }}
                className="bg-surface-container-lowest dark:bg-surface-container border border-outline-variant dark:border-outline-variant rounded-xl p-3  cursor-pointer  transition-transform"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-surface dark:bg-surface-container text-on-surface-variant dark:text-on-surface-variant font-medium flex items-center justify-center text-sm shrink-0">
                    {supervisorNode.person.name.slice(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <strong className="text-sm font-medium text-on-surface dark:text-on-surface truncate">
                        {supervisorNode.person.name}
                      </strong>
                      <span className="text-xs text-on-surface-variant dark:text-on-surface-variant flex items-center gap-0">
                        <AppIcon name="file" size={18} />
                      </span>
                    </div>
                    <p className="text-xs text-outline dark:text-outline truncate mt-0">
                      直属领导 · {supervisorNode.roleTitle || '管理者'}
                    </p>
                  </div>
                </div>

                {showAiStatus && !reportsLoadFailed && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigateToReport?.(undefined, supervisorNode.id, pid);
                    }}
                    className="mt-3 pt-2 border-t border-outline-variant dark:border-outline-variant flex items-center justify-between text-xs font-medium"
                  >
                    {(() => {
                      const supervisorReport = supervisorReportStatus(
                        agentReports,
                        currentUserIdNum,
                        supervisorNode.ownerUserIds || [],
                      );
                      const tone = supervisorReport.tone;
                      return (
                        <span className={`flex items-center gap-1 truncate ${tone.textClass}`}>
                          {tone.iconName && <AppIcon name={tone.iconName} size={18} />}
                          {supervisorReport.label}
                        </span>
                      );
                    })()}
                    <AppIcon name="chevron-right" size={18} className="shrink-0 text-inherit" />
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 bg-surface-container dark:bg-surface-container rounded-xl text-center text-xs text-outline">
                {selfNode ? '当前为项目顶层负责人，无直属上级' : '你尚未关联本项目的人员节点，可切换项目全貌查看。'}
              </div>
            )}

            {/* 连接竖线 */}
            <div className="w-px h-5 bg-outline mx-auto" />

            {/* 2. 我的节点 (Self Node - 明显高亮) */}
            {selfNode ? (
              <div
                onClick={() => {
                  setSelectedNodeId(selfNode.id);
                  setDetailNode(selfNode);
                }}
                className="bg-surface dark:bg-surface-container border-2 border-outline-variant dark:border-outline-variant rounded-xl p-4  cursor-pointer  transition-transform"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-surface-container text-on-surface-variant font-medium flex items-center justify-center text-base shrink-0 ">
                    {selfNode.person.name.slice(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <strong className="text-base font-medium text-on-surface dark:text-on-surface truncate">
                        {selfNode.person.name} · 我
                      </strong>
                      <span className="inline-flex items-center gap-1 px-2 py-0 rounded-lg text-xs font-medium bg-surface-container dark:bg-surface-container text-on-surface-variant dark:text-on-surface-variant">
                        <AppIcon name="file" size={18} />
                        当前责任人
                      </span>
                    </div>
                    <p className="text-xs text-on-surface-variant dark:text-outline truncate mt-0">
                      {selfNode.roleTitle || '岗位未指定'} · {selfNode.person.department || '项目团队'}
                    </p>
                  </div>
                </div>

                {showAiStatus && !reportsLoadFailed && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigateToReport?.(undefined, undefined, pid);
                    }}
                    className="mt-3 pt-2 border-t border-outline-variant dark:border-outline-variant flex items-center justify-between text-xs text-on-surface-variant dark:text-on-surface-variant font-medium"
                  >
                    {(() => {
                      const selfReport = latestReportByUser(agentReports, currentUserIdNum)
                      const tone = reportStatusTone(selfReport)
                      return (
                        <span className={`flex items-center gap-1 truncate ${tone.textClass}`}>
                          {tone.iconName && <AppIcon name={tone.iconName} size={18} />}
                          {reportStatusLabel(selfReport)}
                        </span>
                      )
                    })()}
                    <AppIcon name="chevron-right" size={18} className="shrink-0 text-inherit" />
                  </div>
                )}
              </div>
            ) : null}

            {/* 连接竖线 */}
            <div className="w-px h-5 bg-outline mx-auto" />

            {/* 3. 直属下级分支 */}
            {subordinateNodes.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-medium text-outline dark:text-outline  ">
                    直属下属 ({subordinateNodes.length})
                  </span>
                  {nodeCan(selfNode, 'can_add_subordinate') && (
                    <button
                      type="button"
                      onClick={() =>
                        setEditPersonTarget({
                          mode: 'add',
                          parentSuggestedId: selfNode?.id,
                        })
                      }
                      className="text-xs font-medium text-on-surface-variant dark:text-on-surface-variant flex items-center gap-0 cursor-pointer"
                    >
                      <AppIcon name="plus" size={18} />
                      新增下属
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {subordinateNodes.map((sub) => (
                    <div
                      key={sub.id}
                      onClick={() => {
                        setSelectedNodeId(sub.id);
                        setPreviewNode(sub);
                      }}
                      className="bg-surface-container-lowest dark:bg-surface-container border border-outline-variant dark:border-outline-variant rounded-xl p-3  cursor-pointer  transition-transform"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-surface-container dark:bg-surface-container text-on-surface-variant dark:text-on-surface-variant font-medium flex items-center justify-center text-xs shrink-0">
                          {sub.person.name.slice(0, 1)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <strong className="text-sm font-medium text-on-surface dark:text-on-surface truncate block">
                            {sub.person.name}
                          </strong>
                          <p className="text-xs text-outline dark:text-outline truncate mt-0">
                            {sub.roleTitle || '团队成员'} · 我的直属下属
                          </p>
                        </div>
                        <AppIcon name="chevron-right" size={18} className="text-inherit shrink-0" />
                      </div>

                      {showAiStatus && !reportsLoadFailed && (
                        <div className="mt-2 pt-2 border-t border-outline-variant dark:border-outline-variant text-xs text-outline dark:text-outline flex items-center justify-between">
                          {(() => {
                            const subReport = latestReportByUser(agentReports, sub.ownerUserIds?.[0])
                            const tone = reportStatusTone(subReport)
                            return (
                              <span className={`flex items-center gap-1 truncate ${tone.textClass}`}>
                                {tone.iconName && <AppIcon name={tone.iconName} size={18} />}
                                {reportStatusLabel(subReport)}
                              </span>
                            )
                          })()}
                          <span className="text-xs text-outline">点击查看</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-3 bg-surface-container-lowest dark:bg-surface-container border border-dashed border-outline-variant dark:border-outline-variant rounded-xl text-center">
                <p className="text-xs text-outline dark:text-outline mb-2">暂无直属下属</p>
                {nodeCan(selfNode, 'can_add_subordinate') && (
                  <button
                    type="button"
                    onClick={() =>
                      setEditPersonTarget({
                        mode: 'add',
                        parentSuggestedId: selfNode?.id,
                      })
                    }
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-surface dark:bg-surface-container text-on-surface-variant dark:text-on-surface-variant text-xs font-medium cursor-pointer"
                  >
                    <AppIcon name="plus" size={18} />
                    添加下级人员
                  </button>
                )}
              </div>
            )}

            {/* 4. 我的责任事项列表 */}
            <div className="mt-4 pt-2">
              <div className="flex items-center justify-between mb-2 px-1">
                <h2 className="text-sm font-medium text-on-surface dark:text-on-surface">我的责任事项</h2>
                <button
                  type="button"
                  onClick={() => {
                    if (selfNode) setDetailNode(selfNode);
                  }}
                  className="text-xs font-medium text-on-surface-variant dark:text-on-surface-variant cursor-pointer"
                >
                  查看全部
                </button>
              </div>

              <div className="bg-surface-container-lowest dark:bg-surface-container rounded-xl border border-outline-variant dark:border-outline-variant  divide-y divide-outline-variant dark:divide-outline-variant overflow-hidden">
                {selfNode && selfNode.workItems.length > 0 ? (
                  selfNode.workItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => onOpenEvidence?.(item.id)}
                      className="p-3 flex items-center gap-3 cursor-pointer active:bg-surface dark:active:opacity-80"
                    >
                      <div className="w-2 h-2 rounded-full bg-outline flex items-center justify-center shrink-0">
                        {item.status === 'Done' && (
                          <div className="w-2 h-2 rounded-full bg-[var(--axis-green)]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <strong className={`text-sm font-medium truncate block${item.status === 'Done' ? ' ink-done' : ' text-on-surface'}`}>
                          {item.title}
                        </strong>
                        {(() => {
                          const isDone = item.status === 'Done';
                          const isOverdue = isWorkItemOverdue(item);
                          const overdueDays = isOverdue ? getWorkItemOverdueDays(item) : 0;
                          return (
                            <p className="text-xs text-outline dark:text-outline truncate mt-0">
                              <span className={isOverdue ? 'text-error dark:text-error font-medium' : ''}>
                                {isDone ? '已完成' : isOverdue ? `逾期 ${overdueDays} 天` : '进行中'}
                              </span>
                              {' · '}
                              {item.evidences?.length ?? 0} 份材料
                            </p>
                          );
                        })()}
                      </div>
                      <AppIcon name="chevron-right" size={18} className="text-inherit shrink-0" />
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-xs text-outline">暂无待办责任事项</div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ========================================================= */
          /* 设计 ID 21 & ID 86：项目全貌画布容器                     */
          /* ========================================================= */
          <div className="h-full flex flex-col relative select-none">
            {/* 顶部工具栏（只占一行） */}
            <div className="axis-mobile-toolbar flex items-center justify-between px-3 py-2 bg-surface-container-lowest dark:bg-surface-container border-b border-outline-variant dark:border-outline-variant z-10 shrink-0 gap-2">
              <div className="flex items-center gap-1 min-w-0">
                {/* 方向切换（两段式） */}
                <div className="flex items-center bg-surface-container dark:bg-surface-container rounded-lg p-0 shrink-0">
                  <button
                    type="button"
                    onClick={() => setOrientation('vertical')}
                    className={`px-2 py-1 rounded-lg text-xs font-medium cursor-pointer transition-ink-colors ${
                      orientation === 'vertical'
                        ? 'bg-surface-container-lowest dark:bg-surface-container text-on-surface-variant dark:text-on-surface-variant font-medium '
                        : 'text-on-surface-variant dark:text-outline'
                    }`}
                  >
                    纵向
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrientation('horizontal')}
                    className={`px-2 py-1 rounded-lg text-xs font-medium cursor-pointer transition-ink-colors ${
                      orientation === 'horizontal'
                        ? 'bg-surface-container-lowest dark:bg-surface-container text-on-surface-variant dark:text-on-surface-variant font-medium '
                        : 'text-on-surface-variant dark:text-outline'
                    }`}
                  >
                    横向
                  </button>
                </div>

                <select aria-label="人轴排序" value={orderMode} onChange={event => changeOrderMode(event.target.value as AxisOrderMode)} className="min-h-[44px] rounded-lg bg-surface-container dark:bg-surface-container px-2 text-xs text-on-surface-variant dark:text-on-surface">
                  <option value="tree">树序</option>
                  <option value="time">时间序</option>
                </select>
                {/* 定位我 */}
                <button
                  type="button"
                  onClick={handleLocateMe}
                  aria-label="定位我"
                  className="px-2 py-1 rounded-lg text-xs font-medium bg-surface-container dark:bg-surface-container text-on-surface-variant dark:text-on-surface-variant flex items-center gap-1 active:opacity-60 cursor-pointer shrink-0"
                >
                  <AppIcon name="user" size={18} />
                  <span className="hidden min-[420px]:inline">定位我</span>
                </button>

                {/* 适应屏幕 */}
                <button
                  type="button"
                  data-testid="toolbar-fit-screen"
                  onClick={handleFitScreen}
                  className="px-2 py-1 rounded-lg text-xs font-medium bg-surface-container dark:bg-surface-container text-on-surface-variant dark:text-on-surface flex items-center gap-1 active:opacity-60 cursor-pointer shrink-0"
                  aria-label="适应屏幕"
                >
                  <Maximize size={18} aria-hidden="true" />
                  <span className="hidden min-[420px]:inline">适应屏幕</span>
                </button>
              </div>

              {/* 右侧「⋯」菜单 */}
              <div className="relative shrink-0" ref={moreMenuRef}>
                <button
                  type="button"
                  aria-label="更多画布设置"
                  onClick={() => setMoreMenuOpen(prev => !prev)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant dark:text-on-surface-variant hover:bg-surface-container dark:hover:bg-surface-container-high active:opacity-60 cursor-pointer"
                >
                  <AppIcon name="more-horizontal" size={18} />
                </button>

                {moreMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-surface-container-lowest dark:bg-surface-container rounded-xl  border border-outline-variant dark:border-outline-variant p-2 z-50 text-xs space-y-2">
                    <div>
                      <span className="text-xs text-outline px-2 font-medium">连线样式</span>
                      <div className="grid grid-cols-2 gap-1 mt-1">
                        <button
                          type="button"
                          onClick={() => { setEdgeStyle('curve'); setMoreMenuOpen(false); }}
                          className={`py-1 rounded-lg text-center font-medium cursor-pointer ${
                            edgeStyle === 'curve'
                              ? 'bg-surface dark:bg-surface-container text-on-surface-variant font-medium'
                              : 'text-on-surface-variant dark:text-outline hover:bg-surface'
                          }`}
                        >
                          曲线
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEdgeStyle('straight'); setMoreMenuOpen(false); }}
                          className={`py-1 rounded-lg text-center font-medium cursor-pointer ${
                            edgeStyle === 'straight'
                              ? 'bg-surface dark:bg-surface-container text-on-surface-variant font-medium'
                              : 'text-on-surface-variant dark:text-outline hover:bg-surface'
                          }`}
                        >
                          直线
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-outline-variant dark:border-outline-variant pt-1 space-y-1">
                      <button
                        type="button"
                        data-testid="axis-pull-all"
                        onClick={() => { flowCanvas.pullAllToAxis(); setMoreMenuOpen(false); }}
                        className="w-full min-h-[40px] px-2 rounded-lg text-left font-medium text-on-surface-variant dark:text-on-surface hover:bg-surface dark:hover:bg-surface-container-high cursor-pointer"
                      >
                        全部拉到人轴
                      </button>
                      <button
                        type="button"
                        data-testid="axis-reset-fold"
                        onClick={() => { flowCanvas.resetFold(); setMoreMenuOpen(false); }}
                        className="w-full min-h-[40px] px-2 rounded-lg text-left font-medium text-on-surface-variant dark:text-on-surface hover:bg-surface dark:hover:bg-surface-container-high cursor-pointer"
                      >
                        恢复默认折叠
                      </button>
                    </div>

                    <div className="border-t border-outline-variant dark:border-outline-variant pt-1">
                      <span className="text-xs text-outline px-2 font-medium">节点间距</span>
                      <div className="grid grid-cols-3 gap-1 mt-1">
                        {(['compact', 'standard', 'loose'] as AxisSpacing[]).map((sp) => (
                          <button
                            key={sp}
                            type="button"
                            onClick={() => { setSpacing(sp); setMoreMenuOpen(false); }}
                            className={`py-1 rounded-lg text-center font-medium cursor-pointer ${
                              spacing === sp
                                ? 'bg-surface dark:bg-surface-container text-on-surface-variant font-medium'
                                : 'text-on-surface-variant dark:text-outline hover:bg-surface'
                            }`}
                          >
                            {sp === 'compact' ? '紧凑' : sp === 'standard' ? '标准' : '宽松'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 w-full min-h-0 bg-surface relative">
              <PeopleAxisFlowCanvas
                lang="zh"
                orderMode={orderMode}
                nodes={flowCanvas.rfNodes}
                edges={flowCanvas.rfEdges}
                orientation={orientation}
                edgeStyle={edgeStyle}
                linkingSourceNodeId={flowCanvas.linkingSourceNodeId}
                onNodeDragStop={flowCanvas.handleNodeDragStop}
                onPaneClick={() => {
                  setSelectedNodeId(null);
                  setPreviewNode(null);
                }}
                onResetLayout={flowCanvas.resetAllDragOffsets}
                onRequestReparent={flowCanvas.handleRequestReparent}
                onShowToast={showToast}
                mobile={true}
                fitToken={fitToken}
                refitToken={flowCanvas.foldFitSeq}
                centerMeToken={centerMeToken}
                locate={locate}
                onLocateDone={handleLocateDone}
              />
            </div>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* 底部 Sheet 1: 节点预览与定位 (设计 ID 87)                */}
      {/* ========================================================= */}
      <MobileSheet
        className="axis-theme axis-mobile-sheet"
        isOpen={Boolean(previewNode)}
        onClose={() => setPreviewNode(null)}
        title="责任节点预览"
      >
        {previewNode && (
          <div className="axis-theme tabular-nums p-4 space-y-4">
            <div className="flex items-center gap-3 p-3 bg-surface dark:bg-surface-container rounded-xl border border-outline-variant dark:border-outline-variant">
              <div className="w-12 h-12 rounded-full bg-surface-container text-on-surface-variant font-medium flex items-center justify-center text-base shrink-0">
                {previewNode.person.name.slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <strong className="text-base font-medium text-on-surface dark:text-on-surface truncate">
                    {previewNode.person.name}
                  </strong>
                  {previewNode.id === selfNode?.id && (
                    <span className="px-1 py-0 rounded text-xs bg-surface-container dark:bg-surface-container text-on-surface-variant dark:text-on-surface-variant font-medium">
                      我
                    </span>
                  )}
                </div>
                <p className="text-xs text-outline dark:text-outline truncate mt-0">
                  {previewNode.roleTitle || '岗位未指定'} · {previewNode.person.department || '团队'}
                </p>
              </div>
            </div>

            {/* 关键信息栅格 */}
            <div className="divide-y divide-outline-variant text-xs">
              <div className="py-3">
                <span className="text-outline block mb-1">责任事项</span>
                <strong className="text-sm text-on-surface dark:text-on-surface">
                  {previewNode.workItems.length} 项
                </strong>
              </div>
              <div className="py-3">
                <span className="text-outline block mb-1">直属下属</span>
                <strong className="text-sm text-on-surface dark:text-on-surface">
                  {axisNodes.filter((n) => n.parentId === previewNode.id).length} 人
                </strong>
              </div>
            </div>

            <PersonMembershipActions node={previewNode} capabilities={permissions?.node_permissions?.[previewNode.id]}
              onChanged={async()=>{if (activeScopeRef.current !== projectScope) return; setPreviewNode(null);await loadData();}} />
            {/* 操作按钮区 */}
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  const target = previewNode;
                  setPreviewNode(null);
                  setDetailNode(target);
                }}
                className="w-full min-h-[48px] rounded-lg bg-primary text-on-primary font-medium text-sm flex items-center justify-center gap-2 active:opacity-80 cursor-pointer"
              >
                <AppIcon name="file" size={18} />
                查看完整责任详情
              </button>

              {flowCanvas.returnableIds.has(previewNode.id) && (
                <button
                  type="button"
                  data-testid={`axis-return-panel-${previewNode.id}`}
                  onClick={() => {
                    const target = previewNode;
                    setPreviewNode(null);
                    setSelectedNodeId(null);
                    // 收回后画布会自动适应，目标回到折叠行并留在视口内
                    flowCanvas.returnFromAxis(target.id);
                  }}
                  className="w-full min-h-[44px] rounded-lg border border-outline-variant dark:border-outline-variant bg-surface-container-lowest dark:bg-surface-container text-on-surface-variant dark:text-on-surface font-medium text-sm flex items-center justify-center gap-2 active:bg-surface cursor-pointer"
                >
                  收回到折叠
                </button>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPreviewNode(null);
                    // 定位并居中
                    locateNode(previewNode.id);
                    setActiveTab('overview');
                  }}
                  className="min-h-[44px] rounded-lg border border-outline-variant dark:border-outline-variant bg-surface-container-lowest dark:bg-surface-container text-on-surface-variant dark:text-on-surface font-medium text-xs flex items-center justify-center gap-1 active:bg-surface cursor-pointer"
                >
                  <AppIcon name="axis" size={18} />
                  定位到画布
                </button>

                {nodeCan(previewNode, 'can_add_subordinate') && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = previewNode;
                      setPreviewNode(null);
                      setEditPersonTarget({ mode: 'add', parentSuggestedId: target.id });
                    }}
                    className="min-h-[44px] rounded-lg border border-outline-variant dark:border-outline-variant bg-surface-container-lowest dark:bg-surface-container text-on-surface-variant dark:text-on-surface font-medium text-xs flex items-center justify-center gap-1 active:bg-surface cursor-pointer"
                  >
                    <AppIcon name="plus" size={18} />
                    新增下级
                  </button>
                )}
              </div>

              {nodeCan(previewNode, 'can_edit_person') && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const target = previewNode;
                      setPreviewNode(null);
                      setEditPersonTarget({ mode: 'edit', node: target });
                    }}
                    className="min-h-[44px] rounded-lg border border-outline-variant dark:border-outline-variant bg-surface-container-lowest dark:bg-surface-container text-on-surface-variant dark:text-on-surface font-medium text-xs flex items-center justify-center gap-1 active:bg-surface cursor-pointer"
                  >
                    <AppIcon name="edit" size={18} />
                    编辑人员
                  </button>

                  {nodeCan(previewNode, 'can_move_person') && canChangeSupervisor && <button
                    type="button"
                    onClick={() => {
                      const target = previewNode;
                      setPreviewNode(null);
                      setMoveSupervisorTargetNode(target);
                    }}
                    className="min-h-[44px] rounded-lg border border-outline-variant dark:border-outline-variant bg-surface-container-lowest dark:bg-surface-container text-on-surface-variant dark:text-on-surface font-medium text-xs flex items-center justify-center gap-1 active:bg-surface cursor-pointer"
                  >
                    <AppIcon name="arrow-right" size={18} />
                    调整上级
                  </button>}
                </div>
              )}
            </div>
          </div>
        )}
      </MobileSheet>

      {/* ========================================================= */}
      {/* 底部 Sheet 2: 人员 / 责任节点详情 (设计 ID 22)           */}
      {/* ========================================================= */}
      <MobileSheet
        className="axis-theme axis-mobile-sheet"
        isOpen={Boolean(detailNode)}
        onClose={() => setDetailNode(null)}
        title={detailNode ? `${detailNode.person.name} · 责任详情` : ''}
        height="full"
      >
        {detailNode && (
          <NodeDetailContent
            node={axisNodes.find(node => node.id === detailNode.id) || detailNode}
            allNodes={axisNodes}
            agentReports={agentReports}
            reportsLoadFailed={reportsLoadFailed}
            canEdit={nodeCan(detailNode, 'can_edit_person')}
            canManagePermissions={nodeCan(detailNode, 'can_manage_permissions')}
            canChangeSupervisor={canChangeSupervisor && nodeCan(detailNode,'can_move_person')}
            canEditMatter={(item) => permissions?.node_permissions?.[item.id]?.can_edit_person ?? Boolean(permissions?.can_edit_all || permissions?.owned_node_ids?.includes(Number(item.id)) || nodeCan(detailNode, 'can_edit_person'))}
            canDeleteMatter={() => Boolean(permissions?.can_delete)}
            onEditMatter={(item) => { setDetailNode(null); setMatterAction({ mode: 'edit', item }); }}
            onDeleteMatter={(item) => { setDetailNode(null); setMatterAction({ mode: 'delete', item }); }}
            onOpenEvidence={onOpenEvidence}
            onNavigateToReport={onNavigateToReport}
            onEditPerson={() => {
              const target = detailNode;
              setDetailNode(null);
              setEditPersonTarget({ mode: 'edit', node: target });
            }}
            onEditPermissions={() => {
              const target = detailNode;
              setDetailNode(null);
              setPermissionTargetNode(target);
            }}
            onMoveSupervisor={() => {
              const target = detailNode;
              setDetailNode(null);
              setMoveSupervisorTargetNode(target);
            }}
          />
        )}
      </MobileSheet>

      {/* ========================================================= */}
      {/* 底部 Sheet 3: 新增 / 编辑人员 (设计 ID 23)               */}
      {/* ========================================================= */}
      <MobileSheet
        className="axis-theme axis-mobile-sheet"
        isOpen={Boolean(editPersonTarget)}
        onClose={() => setEditPersonTarget(null)}
        title={editPersonTarget?.mode === 'add' ? '新增人员' : '编辑人员'}
      >
        {editPersonTarget && (
          <EditPersonForm
            mode={editPersonTarget.mode}
            node={editPersonTarget.node}
            parentSuggestedId={editPersonTarget.parentSuggestedId}
            projectId={pid}
            canChangeSupervisor={canChangeSupervisor && (editPersonTarget.mode==='add' || nodeCan(editPersonTarget.node,'can_move_person'))}
            canManageAssignees={editPersonTarget.mode==='add' || permissions?.node_permissions?.[editPersonTarget.node?.id || '']?.can_manage_assignees !== false}
            allNodes={axisNodes}
            members={projectMembers}
            onSuccess={async () => {
              if (activeScopeRef.current !== projectScope) return;
              setEditPersonTarget(null);
              showToast('人员信息保存成功');
              await loadData();
            }}
            onCancel={() => setEditPersonTarget(null)}
            onOpenPermissions={() => {
              if (editPersonTarget.node) {
                const target = editPersonTarget.node;
                setEditPersonTarget(null);
                setPermissionTargetNode(target);
              }
            }}
          />
        )}
      </MobileSheet>

      {/* ========================================================= */}
      {/* 底部 Sheet 4: 节点权限配置 (设计 ID 24)                  */}
      {/* ========================================================= */}
      <MobileSheet
        className="axis-theme axis-mobile-sheet"
        isOpen={Boolean(permissionTargetNode)}
        onClose={() => setPermissionTargetNode(null)}
        title="节点权限"
      >
        {permissionTargetNode && (
          <NodePermissionsForm
            node={permissionTargetNode}
            onSuccess={async () => {
              if (activeScopeRef.current !== projectScope) return;
              setPermissionTargetNode(null);
              showToast('节点权限已更新');
              await loadData();
            }}
            onCancel={() => setPermissionTargetNode(null)}
          />
        )}
      </MobileSheet>

      {/* ========================================================= */}
      {/* 底部 Sheet 5: 调整直属上级 (设计 ID 25 - 防循环)         */}
      {/* ========================================================= */}
      <MobileSheet
        className="axis-theme axis-mobile-sheet"
        isOpen={Boolean(moveSupervisorTargetNode)}
        onClose={() => setMoveSupervisorTargetNode(null)}
        title="调整直属上级"
      >
        {moveSupervisorTargetNode && (
          <MoveSupervisorForm
            targetNode={moveSupervisorTargetNode}
            allNodes={axisNodes}
            onSuccess={async () => {
              if (activeScopeRef.current !== projectScope) return;
              setMoveSupervisorTargetNode(null);
              showToast('直属上级调整成功');
              await loadData();
            }}
            onCancel={() => setMoveSupervisorTargetNode(null)}
          />
        )}
      </MobileSheet>

      {/* ========================================================= */}
      {/* 底部 Sheet 6: 画布设置 (设计 ID 30)                      */}
      {/* ========================================================= */}
      <MobileSheet
        className="axis-theme axis-mobile-sheet"
        isOpen={showSettingsSheet}
        onClose={() => setShowSettingsSheet(false)}
        title="画布设置"
      >
        <div className="axis-theme tabular-nums p-4 space-y-4">
          <div className="bg-surface-container-lowest dark:bg-surface-container border border-outline-variant dark:border-outline-variant rounded-xl divide-y divide-outline-variant dark:divide-outline-variant overflow-hidden">
            <div className="p-3 flex items-center justify-between">
              <div>
                <strong className="text-sm text-on-surface dark:text-on-surface block">
                  显示 AI 汇报状态
                </strong>
                <p className="text-xs text-outline mt-0">节点上展示草稿、已提交与未读</p>
              </div>
              <MobileSwitch
                checked={showAiStatus}
                onChange={setShowAiStatus}
                aria-label="显示 AI 汇报状态"
              />
            </div>

            <div className="p-3 flex items-center justify-between">
              <div>
                <strong className="text-sm text-on-surface dark:text-on-surface block">
                  展开直属下属
                </strong>
                <p className="text-xs text-outline mt-0">默认聚焦当前责任范围</p>
              </div>
              <MobileSwitch
                checked={expandSubordinates}
                onChange={setExpandSubordinates}
                aria-label="展开直属下属"
              />
            </div>
          </div>

          {/* 默认方向与间距 */}
          <div className="space-y-3">
            <MobileField label="默认方向">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOrientation('vertical')}
                  className={`py-2 rounded-lg text-xs font-medium border cursor-pointer ${
                    orientation === 'vertical'
                      ? 'border-primary bg-surface dark:bg-surface-container text-on-surface-variant dark:text-on-surface-variant'
                      : 'border-outline-variant dark:border-outline-variant bg-surface-container-lowest dark:bg-surface-container text-on-surface-variant'
                  }`}
                >
                  纵向树状
                </button>
                <button
                  type="button"
                  onClick={() => setOrientation('horizontal')}
                  className={`py-2 rounded-lg text-xs font-medium border cursor-pointer ${
                    orientation === 'horizontal'
                      ? 'border-primary bg-surface dark:bg-surface-container text-on-surface-variant dark:text-on-surface-variant'
                      : 'border-outline-variant dark:border-outline-variant bg-surface-container-lowest dark:bg-surface-container text-on-surface-variant'
                  }`}
                >
                  横向总览
                </button>
              </div>
            </MobileField>

            <MobileField label="节点间距">
              <div className="grid grid-cols-3 gap-2">
                {(['compact', 'standard', 'loose'] as AxisSpacing[]).map((sp) => (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => setSpacing(sp)}
                    className={`py-2 rounded-lg text-xs font-medium border cursor-pointer ${
                      spacing === sp
                        ? 'border-primary bg-surface dark:bg-surface-container text-on-surface-variant dark:text-on-surface-variant font-medium'
                        : 'border-outline-variant dark:border-outline-variant bg-surface-container-lowest dark:bg-surface-container text-on-surface-variant'
                    }`}
                  >
                    {sp === 'compact' ? '紧凑' : sp === 'standard' ? '标准' : '宽松'}
                  </button>
                ))}
              </div>
            </MobileField>
          </div>

          {/* 管理操作入口 */}
          <div className="pt-2">
            <span className="text-xs font-medium text-outline   block mb-2 px-1">
              管理操作
            </span>
            <div className="bg-surface-container-lowest dark:bg-surface-container border border-outline-variant dark:border-outline-variant rounded-xl divide-y divide-outline-variant dark:divide-outline-variant overflow-hidden">
              <div
                onClick={() => {
                  setShowSettingsSheet(false);
                  setShowResetConfirm(true);
                }}
                className="p-3 flex items-center justify-between cursor-pointer active:bg-surface dark:active:opacity-80"
              >
                <div className="flex items-center gap-2">
                  <AppIcon name="refresh" size={18} className="text-inherit" />
                  <div>
                    <strong className="text-sm font-medium text-on-surface dark:text-on-surface block">
                      重置卡片布局
                    </strong>
                    <p className="text-xs text-outline">清除当前保存的位置</p>
                  </div>
                </div>
                <AppIcon name="chevron-right" size={18} className="text-inherit" />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowSettingsSheet(false);
              showToast('偏好设置已保存');
            }}
            className="w-full min-h-[48px] rounded-lg bg-primary text-on-primary font-medium text-sm flex items-center justify-center active:opacity-80 cursor-pointer"
          >
            保存布局偏好
          </button>
        </div>
      </MobileSheet>

      {/* 重置布局确认弹窗 */}
      <MobileConfirm
        isOpen={showResetConfirm}
        title="重置卡片布局"
        message="重置布局仅将所有卡片恢复到自动对齐位置，不会删除任何人员和责任事项。确认重置？"
        confirmLabel="确认重置"
        cancelLabel="取消"
        onConfirm={() => {
          setShowResetConfirm(false);
          flowCanvas.resetAllDragOffsets();
          setLayoutRevision(revision => revision + 1);
          showToast('卡片布局已重置');
        }}
        onCancel={() => setShowResetConfirm(false)}
      />

      <MobileSheet isOpen={Boolean(matterAction)} onClose={() => setMatterAction(null)} title={matterAction?.mode === 'delete' ? '删除事项' : '编辑事项'}>
        {matterAction && <div className="axis-theme p-4 pb-8">
          {matterAction.mode === 'edit' ? <MatterEditForm key={matterAction.item.id} item={matterAction.item}
            members={projectMembers.map(member => ({ id: String(member.user_id), name: member.display_name || member.nickname || member.username || '项目成员', avatar: '', role: member.role || '' }))}
            canChangeAssignee={permissions?.node_permissions?.[matterAction.item.id]?.can_manage_assignees ?? Boolean(permissions?.is_pm || permissions?.is_superadmin)}
            onClose={() => { if (activeScopeRef.current === projectScope) setMatterAction(null); }} onSaved={async () => { if (activeScopeRef.current !== projectScope) return; setMatterAction(null); await loadData(); showToast('事项已更新'); }} />
            : <MatterDeleteConfirm item={matterAction.item} onClose={() => setMatterAction(null)}
              onDeleted={async item => { if (activeScopeRef.current !== projectScope) return; setMatterAction(null); setUndoDelete(item); await loadData(); }} />}
        </div>}
      </MobileSheet>
      {undoDelete && <div role="status" data-testid="mobile-matter-undo" className="fixed bottom-20 left-4 right-4 z-50 flex items-center justify-between gap-3 rounded-xl bg-surface-container-high p-4 text-on-surface text-sm ">
        <span className="truncate">已删除「{undoDelete.title}」</span>
        <button type="button" disabled={restoring} className="min-h-[44px] px-3 font-medium text-on-surface-variant shrink-0" onClick={async () => {
          setRestoring(true);
          try { await restoreMatterNode(Number(undoDelete.id)); if (activeScopeRef.current !== projectScope) return; setUndoDelete(null); await loadData(); showToast('已撤销删除'); }
          catch (err) { showToast(err instanceof Error ? err.message : '撤销失败，请重试'); }
          finally { if (activeScopeRef.current === projectScope) setRestoring(false); }
        }}>{restoring ? '恢复中…' : '撤销'}</button>
      </div>}

      {/* 底部轻提示 Toast */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-surface-container-high text-on-surface text-xs px-4 py-2 rounded-lg  animate-fade-in pointer-events-none">
          {toastMessage}
        </div>
      )}

      {/* 换上级置顶确认框 */}
      <ReparentConfirmDialog
        confirm={flowCanvas.reparentConfirm}
        lang="zh"
        onConfirm={flowCanvas.handleConfirmReparent}
        onCancel={flowCanvas.handleCancelReparent}
      />
    </div>
  );
};

// ==========================================

interface NodeDetailContentProps {
  node: PeopleAxisNode;
  allNodes: PeopleAxisNode[];
  agentReports?: AgentReport[];
  reportsLoadFailed?: boolean;
  canEdit: boolean;
  canManagePermissions: boolean;
  canChangeSupervisor: boolean;
  onOpenEvidence?: (nodeId?: string) => void;
  onNavigateToReport?: (reportId?: string, nodeId?: string, projectId?: string | number) => void;
  onEditPerson: () => void;
  onEditPermissions: () => void;
  onMoveSupervisor: () => void;
  canEditMatter: (item: AxisWorkItem) => boolean;
  canDeleteMatter: (item: AxisWorkItem) => boolean;
  onEditMatter: (item: AxisWorkItem) => void;
  onDeleteMatter: (item: AxisWorkItem) => void;
}

const NodeDetailContent: React.FC<NodeDetailContentProps> = ({
  node,
  allNodes,
  agentReports,
  reportsLoadFailed,
  canEdit,
  canManagePermissions,
  canChangeSupervisor,
  onOpenEvidence,
  onNavigateToReport,
  onEditPerson,
  onEditPermissions,
  onMoveSupervisor,
  canEditMatter,
  canDeleteMatter,
  onEditMatter,
  onDeleteMatter,
}) => {
  const [tab, setTab] = useState<'matters' | 'evidence' | 'progress'>('matters');

  const supervisor = allNodes.find((n) => n.id === node.parentId);
  const subordinates = allNodes.filter((n) => n.parentId === node.id);

  return (
    <div className="axis-theme tabular-nums p-4 space-y-4 pb-12 overflow-y-auto">
      {/* 头部个人名片 */}
      <div className="pb-4 border-b border-outline-variant">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-surface-container text-on-surface-variant font-medium flex items-center justify-center text-lg shrink-0">
            {node.person.name.slice(0, 1)}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-medium text-on-surface dark:text-on-surface truncate">
              {node.person.name}
            </h3>
            <p className="text-xs text-outline dark:text-outline truncate mt-0">
              {node.roleTitle || '岗位未指定'} · {node.person.department || '项目部门'}
            </p>
          </div>
        </div>

        {/* 上下级关系行 */}
        <div className="mt-4 pt-3 border-t border-outline-variant dark:border-outline-variant space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-outline">直属领导</span>
            <span className="font-medium text-on-surface dark:text-on-surface">
              {supervisor ? supervisor.person.name : '无 (顶层负责人)'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-outline">直属下属</span>
            <span className="font-medium text-on-surface dark:text-on-surface">
              {subordinates.length > 0
                ? subordinates.map((s) => s.person.name).join('、')
                : '无'}
            </span>
          </div>
        </div>
      </div>

      {/* 子选项卡 */}
      <div className="flex bg-surface-container dark:bg-surface-container p-1 rounded-xl">
        {(['matters', 'evidence', 'progress'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-1 text-xs font-medium rounded-lg transition-ink-colors cursor-pointer ${
              tab === t
                ? 'bg-surface-container-lowest dark:bg-surface-container text-on-surface-variant dark:text-on-surface-variant '
                : 'text-outline dark:text-outline'
            }`}
          >
            {t === 'matters' ? '责任事项' : t === 'evidence' ? '材料' : '进度'}
          </button>
        ))}
      </div>

      {/* 选项卡内容 */}
      {tab === 'matters' && (
        <div className="space-y-2">
          {node.workItems.length > 0 ? (
            node.workItems.map((item) => (
              <div
                key={item.id}
                onClick={() => onOpenEvidence?.(item.id)}
                className="py-3 border-b border-outline-variant flex items-center justify-between gap-2 cursor-pointer active:bg-surface-container"
              >
                <div>
                  <strong className={`text-sm font-medium${item.status === 'Done' ? ' ink-done' : ' text-on-surface'}`}>
                    {item.title}
                  </strong>
                  {(() => {
                    const isDone = item.status === 'Done';
                    const isOverdue = isWorkItemOverdue(item);
                    const overdueDays = isOverdue ? getWorkItemOverdueDays(item) : 0;
                    return (
                      <span className="text-xs text-outline mt-0 block">
                        <span className={isOverdue ? 'text-error dark:text-error font-medium' : ''}>
                          {isDone ? '已完成' : isOverdue ? `逾期 ${overdueDays} 天` : '进行中'}
                        </span>
                        {' · '}{item.progress || 0}%
                      </span>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {canEditMatter(item) && <button type="button" data-testid={`axis-matter-edit-${item.id}`} className="min-h-[44px] px-2 text-xs font-medium text-on-surface-variant" onClick={event => { event.stopPropagation(); onEditMatter(item); }}>编辑</button>}
                  {canDeleteMatter(item) && <button type="button" data-testid={`axis-matter-delete-${item.id}`} className="min-h-[44px] px-2 text-xs font-medium text-on-surface-variant" onClick={event => { event.stopPropagation(); onDeleteMatter(item); }}>删除</button>}
                  <AppIcon name="chevron-right" size={18} className="text-inherit" />
                </div>
              </div>
            ))
          ) : (
            <div className="p-4 bg-surface-container-lowest dark:bg-surface-container rounded-xl text-center text-xs text-outline">
              暂无挂载的责任事项
            </div>
          )}
        </div>
      )}

      {tab === 'evidence' && (
        <div className="space-y-2">
          <div className="p-4 bg-surface-container-lowest dark:bg-surface-container border border-outline-variant dark:border-outline-variant rounded-xl text-center">
            <AppIcon name="file" size={18} className="mx-auto text-inherit mb-1" />
            <p className="text-xs text-on-surface-variant dark:text-on-surface-variant">
              已收录 {node.workItems.reduce((acc, w) => acc + (w.evidences?.length || 0), 0)} 份证据材料
            </p>
            <button
              type="button"
              onClick={() => onOpenEvidence?.(node.id)}
              className="mt-3 inline-flex items-center gap-1 px-4 py-2 bg-primary text-on-primary rounded-lg text-xs font-medium cursor-pointer active:opacity-80"
            >
              <AppIcon name="plus" size={18} />
              提交新证据材料
            </button>
          </div>
        </div>
      )}

      {tab === 'progress' && (() => {
        const progressVal = typeof (node as Record<string, unknown>).progress === 'number'
          ? ((node as Record<string, unknown>).progress as number)
          : node.workItems && node.workItems.length > 0
          ? averagePeopleAxisProgress([node])
          : null;
        const nodeReport = !reportsLoadFailed ? latestReportByUser(agentReports || [], node.ownerUserIds?.[0]) : null;
        return (
          <div className="p-4 bg-surface-container-lowest dark:bg-surface-container border border-outline-variant dark:border-outline-variant rounded-xl space-y-3">
            {progressVal != null && (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-on-surface dark:text-on-surface">综合进展</span>
                  <span className="font-medium text-on-surface-variant">{progressVal}%</span>
                </div>
                <div className="w-full h-2 rounded-lg bg-surface-container dark:bg-surface-container overflow-hidden">
                  <div className="h-full bg-primary rounded-lg" style={{ width: `${progressVal}%` }} />
                </div>
              </>
            )}
            {!reportsLoadFailed && (
              <p className="text-xs text-outline leading-relaxed">
                {nodeReport ? `最近汇报：${reportStatusLabel(nodeReport)} · 汇报材料已进入审计追溯` : '暂无汇报 · 汇报材料已进入审计追溯'}
              </p>
            )}
          </div>
        );
      })()}

      {/* 底部操作区 */}
      <div className="pt-2 space-y-2">
        <button
          type="button"
          onClick={() => onNavigateToReport?.(undefined, node.id)}
          className="w-full min-h-[48px] rounded-lg bg-primary text-on-primary font-medium text-xs flex items-center justify-center gap-1 active:opacity-80 cursor-pointer"
        >
          <AppIcon name="file" size={18} />
          查看 AI 汇报与材料对照
        </button>

        {canEdit && (
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={onEditPerson}
              className="min-h-[44px] rounded-lg border border-outline-variant dark:border-outline-variant bg-surface-container-lowest dark:bg-surface-container text-on-surface-variant dark:text-on-surface text-xs font-medium flex items-center justify-center gap-1 cursor-pointer active:bg-surface"
            >
              <AppIcon name="edit" size={18} />
              编辑人员
            </button>
            {canManagePermissions && <button
              type="button"
              onClick={onEditPermissions}
              className="min-h-[44px] rounded-lg border border-outline-variant dark:border-outline-variant bg-surface-container-lowest dark:bg-surface-container text-on-surface-variant dark:text-on-surface text-xs font-medium flex items-center justify-center gap-1 cursor-pointer active:bg-surface"
            >
              <AppIcon name="lock" size={18} />
              节点权限
            </button>}
            {canChangeSupervisor && <button
              type="button"
              onClick={onMoveSupervisor}
              className="min-h-[44px] rounded-lg border border-outline-variant dark:border-outline-variant bg-surface-container-lowest dark:bg-surface-container text-on-surface-variant dark:text-on-surface text-xs font-medium flex items-center justify-center gap-1 cursor-pointer active:bg-surface"
            >
              <AppIcon name="arrow-right" size={18} />
              调整上级
            </button>}
          </div>
        )}
      </div>
    </div>
  );
};

// ==========================================
// 子组件：新增 / 编辑人员表单 (设计 ID 23)
// ==========================================

interface EditPersonFormProps {
  mode: 'add' | 'edit';
  node?: PeopleAxisNode | null;
  parentSuggestedId?: string;
  projectId: number;
  canChangeSupervisor: boolean;
  canManageAssignees?: boolean;
  allNodes: PeopleAxisNode[];
  members: BackendMember[];
  onSuccess: () => void;
  onCancel: () => void;
  onOpenPermissions?: () => void;
}

const EditPersonForm: React.FC<EditPersonFormProps> = ({
  mode,
  node,
  parentSuggestedId,
  projectId,
  canChangeSupervisor,
  canManageAssignees = true,
  allNodes,
  members,
  onSuccess,
  onCancel,
  onOpenPermissions,
}) => {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(() => {
    if (node?.ownerUserIds?.[0]) return node.ownerUserIds[0];
    return null;
  });
  const [name, setName] = useState(node?.person.name || '');
  const [roleTitle, setRoleTitle] = useState(node?.roleTitle || '');
  const [department, setDepartment] = useState(node?.person.department || '');
  const [parentId, setParentId] = useState<string>(
    mode === 'edit' ? node?.parentId || '' : parentSuggestedId || '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 严格防止循环上级：排除自身及其全部后代！
  const descendantIds = useMemo(() => {
    if (!node) return new Set<string>();
    return getDescendantNodeIds(node.id, allNodes);
  }, [node, allNodes]);

  const candidateSupervisors = useMemo(() => {
    return allNodes.filter((n) => {
      if (selectedUserId && n.ownerUserIds?.includes(selectedUserId)) return false;
      if (node && n.id === node.id) return false;
      if (node && descendantIds.has(n.id)) return false;
      return true;
    });
  }, [allNodes, node, descendantIds, selectedUserId]);

  const handleMemberChange = (uid: number) => {
    setSelectedUserId(uid);
    const m = members.find((x) => x.user_id === uid);
    if (m) {
      setName(m.display_name || m.nickname || m.username || '');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('请输入人员姓名');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'add') {
        await createNode(projectId, {
          node_type_key: 'person',
          title: name.trim(),
          description: `${roleTitle.trim()} / ${department.trim()}`,
          parent_id: parentId ? Number(parentId) : null,
          node_origin: parentId ? 'subordinate' : 'project',
          assignees: selectedUserId ? [{ user_id: selectedUserId, role_key: 'primary' }] : [],
        });
      } else if (node) {
        await updateTreeNode(Number(node.id), {
          title: name.trim(),
          description: `${roleTitle.trim()} / ${department.trim()}`,
          ...(canManageAssignees ? {assignees: selectedUserId
            ? [{ user_id: selectedUserId, role_key: 'primary' }]
            : node.ownerUserIds?.[0]
            ? [{ user_id: node.ownerUserIds[0], role_key: 'primary' }]
            : []} : {}),
        });
        if (canChangeSupervisor && parentId !== (node.parentId || '')) {
          await moveNode(Number(node.id), {
            new_parent_id: parentId ? Number(parentId) : null,
          });
        }
      }
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存人员信息失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-3 pb-8">
      {error && (
        <div className="p-3 bg-surface-container text-error rounded-xl text-xs flex items-center gap-1">
          <AppIcon name="alert" size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 关联成员下拉 */}
      <MobileField label="关联项目成员">
        <select
          value={selectedUserId || ''}
          disabled={!canManageAssignees}
          onChange={(e) => handleMemberChange(Number(e.target.value))}
          className="w-full min-h-[48px] px-3 text-sm bg-surface-container-lowest dark:bg-surface-container border border-outline-variant dark:border-outline-variant rounded-lg text-on-surface dark:text-on-surface"
        >
          <option value="">-- 选择项目成员 (可选) --</option>
          {members.filter(member => !allNodes.find(n => n.id === parentId)?.ownerUserIds?.includes(member.user_id)).map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.display_name || m.nickname || m.username} ({m.username || m.user_id})
            </option>
          ))}
        </select>
      </MobileField>

      <MobileField label="姓名" required>
        <MobileInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：林悦"
        />
      </MobileField>

      <MobileField label="岗位">
        <MobileInput
          value={roleTitle}
          onChange={(e) => setRoleTitle(e.target.value)}
          placeholder="例如：产品设计"
        />
      </MobileField>

      <MobileField label="部门">
        <MobileInput
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          placeholder="例如：产品部"
        />
      </MobileField>

      <MobileField label="直属上级">
        {!canChangeSupervisor && <p className="text-xs text-outline mb-2">直属上级由主管项目的项目经理设置。</p>}
        <select
          disabled={!canChangeSupervisor}
          aria-label="直属上级"
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className="w-full min-h-[48px] px-3 text-sm bg-surface-container-lowest dark:bg-surface-container border border-outline-variant dark:border-outline-variant rounded-lg text-on-surface dark:text-on-surface"
        >
          <option value="">无 (设为顶层负责人)</option>
          {candidateSupervisors.map((cand) => (
            <option key={cand.id} value={cand.id}>
              {cand.person.name} ({cand.roleTitle || '无岗位'})
            </option>
          ))}
        </select>
      </MobileField>

      <div className="p-2 bg-surface dark:bg-surface-container rounded-xl text-xs text-on-surface-variant dark:text-on-surface-variant flex items-center gap-1">
        <AppIcon name="info" size={18} className="shrink-0" />
        <span>新增人员会建立人轴关系，并同步其项目内汇报智能体绑定。</span>
      </div>

      <div className="pt-2 space-y-2">
        <button
          type="submit"
          disabled={submitting}
          className="w-full min-h-[48px] rounded-lg bg-primary text-on-primary font-medium text-sm flex items-center justify-center active:opacity-80 disabled:opacity-50 cursor-pointer"
        >
          {submitting ? '正在保存…' : '保存人员'}
        </button>

        {mode === 'edit' && onOpenPermissions && (
          <button
            type="button"
            onClick={onOpenPermissions}
            className="w-full min-h-[44px] rounded-lg border border-outline-variant dark:border-outline-variant bg-surface-container-lowest dark:bg-surface-container text-on-surface-variant dark:text-on-surface text-xs font-medium flex items-center justify-center gap-1 active:bg-surface cursor-pointer"
          >
            <AppIcon name="lock" size={18} />
            查看 / 配置节点权限
          </button>
        )}
      </div>
    </form>
  );
};

// ==========================================
// 子组件：节点权限表单 (设计 ID 24)
// ==========================================

interface NodePermissionsFormProps {
  node: PeopleAxisNode;
  onSuccess: () => void;
  onCancel: () => void;
}

const NodePermissionsForm: React.FC<NodePermissionsFormProps> = ({
  node,
  onSuccess,
  onCancel,
}) => {
  const [allowAddSubordinates, setAllowAddSubordinates] = useState(
    node.responsibilityPermissions?.allow_add_subordinates ?? true,
  );
  const [allowAddWorkItems, setAllowAddWorkItems] = useState(
    node.responsibilityPermissions?.allow_add_work_items ?? true,
  );
  const [evidenceSubmit, setEvidenceSubmit] = useState<
    'inherit' | 'members' | 'responsible' | 'disabled'
  >(node.responsibilityPermissions?.evidence_submit ?? 'inherit');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const perms: ResponsibilityPermissions = {
        ...node.responsibilityPermissions,
        allow_add_subordinates: allowAddSubordinates,
        allow_add_work_items: allowAddWorkItems,
        evidence_submit: evidenceSubmit,
      };
      await updateTreeNode(Number(node.id), {
        responsibility_permissions: perms,
      });
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '权限保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 space-y-4 pb-8">
      {error && (
        <div className="p-3 bg-surface-container text-error rounded-xl text-xs flex items-center gap-1">
          <AppIcon name="alert" size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="p-3 bg-surface dark:bg-surface-container rounded-xl border border-outline-variant dark:border-outline-variant">
        <h3 className="text-sm font-medium text-on-surface dark:text-on-surface">
          {node.person.name} · {node.roleTitle || '岗位'}
        </h3>
        <p className="text-xs text-outline mt-0">权限作用于当前项目的人轴节点</p>
      </div>

      <div className="bg-surface-container-lowest dark:bg-surface-container border border-outline-variant dark:border-outline-variant rounded-xl divide-y divide-outline-variant dark:divide-outline-variant overflow-hidden">
        <div className="p-3 flex items-center justify-between">
          <div>
            <strong className="text-sm text-on-surface dark:text-on-surface block">
              可新增直属下属
            </strong>
            <p className="text-xs text-outline mt-0">允许在本节点下新增人员</p>
          </div>
          <MobileSwitch
            checked={allowAddSubordinates}
            onChange={setAllowAddSubordinates}
            aria-label="可新增直属下属"
          />
        </div>

        <div className="p-3 flex items-center justify-between">
          <div>
            <strong className="text-sm text-on-surface dark:text-on-surface block">
              可新增责任事项
            </strong>
            <p className="text-xs text-outline mt-0">允许创建绑定本节点的事项</p>
          </div>
          <MobileSwitch
            checked={allowAddWorkItems}
            onChange={setAllowAddWorkItems}
            aria-label="可新增责任事项"
          />
        </div>

        <div className="p-3 flex items-center justify-between">
          <div>
            <strong className="text-sm text-on-surface dark:text-on-surface block">
              可提交证据材料
            </strong>
            <p className="text-xs text-outline mt-0">仅限授权范围内的材料</p>
          </div>
          <select
            value={evidenceSubmit}
            onChange={(e) =>
              setEvidenceSubmit(
                e.target.value as 'inherit' | 'members' | 'responsible' | 'disabled',
              )
            }
            className="text-xs font-medium bg-surface-container dark:bg-surface-container border-0 rounded-lg px-2 py-1 text-on-surface-variant dark:text-on-surface-variant"
          >
            <option value="inherit">继承上级</option>
            <option value="members">项目成员</option>
            <option value="responsible">责任人</option>
            <option value="disabled">已禁用</option>
          </select>
        </div>
      </div>

      <div className="p-2 bg-surface dark:bg-surface-container rounded-xl text-xs text-on-surface-variant dark:text-on-surface-variant flex items-center gap-1">
        <AppIcon name="info" size={18} className="shrink-0" />
        <span>保存后按最新权限生效，其他设备同步更新。</span>
      </div>

      <div className="pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting}
          className="w-full min-h-[48px] rounded-lg bg-primary text-on-primary font-medium text-sm flex items-center justify-center active:opacity-80 disabled:opacity-50 cursor-pointer"
        >
          {submitting ? '正在保存…' : '保存权限'}
        </button>
      </div>
    </div>
  );
};

// ==========================================
// 子组件：调整直属上级表单 (设计 ID 25 - 防循环)
// ==========================================

interface MoveSupervisorFormProps {
  targetNode: PeopleAxisNode;
  allNodes: PeopleAxisNode[];
  onSuccess: () => void;
  onCancel: () => void;
}

const MoveSupervisorForm: React.FC<MoveSupervisorFormProps> = ({
  targetNode,
  allNodes,
  onSuccess,
  onCancel,
}) => {
  const currentSupervisor = allNodes.find((n) => n.id === targetNode.parentId);
  const [selectedParentId, setSelectedParentId] = useState<string>(targetNode.parentId || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 严格防止循环上级：排除自身及其全部后代！
  const descendantIds = useMemo(() => {
    return getDescendantNodeIds(targetNode.id, allNodes);
  }, [targetNode.id, allNodes]);

  const candidateSupervisors = useMemo(() => {
    return allNodes.filter((n) => {
      if (n.ownerUserIds?.some(id => targetNode.ownerUserIds?.includes(id))) return false;
      if (n.id === targetNode.id) return false;
      if (descendantIds.has(n.id)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          n.person.name.toLowerCase().includes(q) ||
          (n.roleTitle && n.roleTitle.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [allNodes, targetNode.id, descendantIds, searchQuery]);

  const handleConfirmMove = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await moveNode(Number(targetNode.id), {
        new_parent_id: selectedParentId ? Number(selectedParentId) : null,
      });
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '调整直属上级失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 space-y-3 pb-8">
      {/* 警示说明 */}
      <div className="p-3 bg-surface-container dark:bg-surface-container text-on-surface-variant rounded-xl text-xs leading-relaxed flex items-center gap-2 border border-outline-variant dark:border-outline-variant">
        <AppIcon name="warning" size={18} className="shrink-0" />
        <span>调整后，新提交汇报走新链路；历史报告保留原接收关系。</span>
      </div>

      {error && (
        <div className="p-3 bg-surface-container text-error rounded-xl text-xs flex items-center gap-1">
          <AppIcon name="alert" size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 当前关系对比卡片 */}
      <div className="bg-surface-container-lowest dark:bg-surface-container border border-outline-variant dark:border-outline-variant rounded-xl divide-y divide-outline-variant dark:divide-outline-variant overflow-hidden text-xs">
        <div className="p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-surface-container dark:bg-surface-container text-on-surface-variant dark:text-on-surface-variant font-medium flex items-center justify-center text-xs">
            {targetNode.person.name.slice(0, 1)}
          </div>
          <div>
            <strong className="text-on-surface dark:text-on-surface block">
              当前人员：{targetNode.person.name}
            </strong>
            <span className="text-outline">{targetNode.roleTitle || '岗位'}</span>
          </div>
        </div>

        <div className="p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-surface-container dark:bg-surface-container text-on-surface-variant font-medium flex items-center justify-center text-xs">
            {currentSupervisor ? currentSupervisor.person.name.slice(0, 1) : '-'}
          </div>
          <div>
            <strong className="text-on-surface dark:text-on-surface block">
              当前上级：{currentSupervisor ? currentSupervisor.person.name : '顶层无上级'}
            </strong>
            <span className="text-outline">{currentSupervisor?.roleTitle || '-'}</span>
          </div>
        </div>
      </div>

      {/* 搜索过滤框 */}
      <MobileInput
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="搜索可选上级…"
        clearable
        onClear={() => setSearchQuery('')}
        leading={<AppIcon name="search" size={18} />}
      />

      {/* 可选上级列表 */}
      <div className="space-y-1 max-h-[200px] overflow-y-auto border border-outline-variant dark:border-outline-variant rounded-xl p-1 bg-surface-container-lowest dark:bg-surface-container">
        <div
          onClick={() => setSelectedParentId('')}
          className={`p-2 rounded-xl flex items-center justify-between text-xs cursor-pointer ${
            selectedParentId === ''
              ? 'bg-surface dark:bg-surface-container text-on-surface-variant font-medium'
              : 'hover:bg-surface dark:hover:bg-surface-container-high text-on-surface-variant dark:text-on-surface-variant'
          }`}
        >
          <span>设为顶层负责人 (无上级)</span>
          {selectedParentId === '' && <AppIcon name="check" size={18} className="text-inherit" />}
        </div>

        {candidateSupervisors.map((cand) => (
          <div
            key={cand.id}
            onClick={() => setSelectedParentId(cand.id)}
            className={`p-2 rounded-xl flex items-center justify-between text-xs cursor-pointer ${
              selectedParentId === cand.id
                ? 'bg-surface dark:bg-surface-container text-on-surface-variant font-medium'
                : 'hover:bg-surface dark:hover:bg-surface-container-high text-on-surface-variant dark:text-on-surface-variant'
            }`}
          >
            <div>
              <span className="block font-medium">
                {cand.person.name}{' '}
                {cand.id === targetNode.parentId && (
                  <span className="text-xs text-outline">(当前上级)</span>
                )}
              </span>
              <span className="text-xs text-outline">{cand.roleTitle || '岗位未指定'}</span>
            </div>
            {selectedParentId === cand.id && (
              <AppIcon name="check" size={18} className="text-inherit" />
            )}
          </div>
        ))}
      </div>

      {/* 确认操作 */}
      <div className="pt-2 space-y-2">
        <button
          type="button"
          onClick={handleConfirmMove}
          disabled={submitting}
          className="w-full min-h-[48px] rounded-lg bg-primary text-on-primary font-medium text-sm flex items-center justify-center active:opacity-80 disabled:opacity-50 cursor-pointer"
        >
          {submitting ? '正在调整…' : '确认调整上级'}
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="w-full min-h-[44px] rounded-lg text-outline font-medium text-xs flex items-center justify-center active:opacity-60 cursor-pointer"
        >
          取消
        </button>
      </div>
    </div>
  );
};
