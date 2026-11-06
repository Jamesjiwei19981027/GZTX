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
import { mapTreeToPeopleAxis, summarizeCardTasks } from '../../../api/mappers';
import { listAgentReports, latestReportByUser, reportStatusLabel, reportStatusTone, type AgentReport } from '../../../api/reports';
import { averagePeopleAxisProgress } from '../../../components/views/peopleAxisUtils';
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
  onNavigateToReport?: (reportId?: string, nodeId?: string) => void;
  onOpenWiki?: () => void;
  onOpenEvidence?: (nodeId?: string) => void;
  onOpenAudit?: () => void;
  onOpenDelegation?: () => void;
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

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '加载人轴责任链失败';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [pid]);

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
    () => (expandSubordinates ? axisNodes : axisNodes.filter(node => !node.parentId)),
    [expandSubordinates, axisNodes],
  );
  const flowCanvas = usePeopleAxisCanvas({
    nodes: canvasNodes,
    orientation,
    edgeStyle,
    lang: 'zh',
    mobile: true,
    foldSubordinates: true,
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
      <div className="flex flex-col flex-1 h-full w-full bg-[#f7f8fa] dark:bg-[#10161e]">
        <MobileTopBar title={activeTab === 'mine' ? '我的责任链' : '项目全貌'} />
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
    <div className="flex flex-col flex-1 h-full w-full bg-[#f7f8fa] dark:bg-[#10161e] select-none overflow-hidden relative">
      {/* 顶部导航条 */}
      <MobileTopBar
        title={activeTab === 'mine' ? '我的责任链' : '项目全貌'}
        rightAction={
          <div className="flex items-center gap-1">
            {canChangeSupervisor && <button type="button" aria-label="新增主轴人员" onClick={()=>setEditPersonTarget({mode:'add'})} className="mobile-touch-target p-2 text-[#0058BE] dark:text-blue-400"><AppIcon name="plus" size={22}/></button>}
            <button
              type="button"
              aria-label="画布设置"
              onClick={() => setShowSettingsSheet(true)}
              className="mobile-touch-target p-2 text-slate-600 dark:text-slate-300 active:opacity-60 cursor-pointer"
            >
              <AppIcon name="more-horizontal" size={22} />
            </button>
          </div>
        }
      />

      <div className="px-4 py-2 bg-white dark:bg-slate-900 shrink-0">
            {projects.length > 0 && onSelectProject && (
              <label className="mobile-axis-project-picker flex items-center w-full">
                <span className="shrink-0 text-xs text-slate-500 mr-3">当前项目</span>
                <select
                  aria-label="选择项目"
                  value={String(pid)}
                  onChange={(event) => {
                    const next = projects.find((project) => String(project.id) === event.target.value);
                    if (next) onSelectProject(next);
                  }}
                  className="w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
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

      <nav aria-label="人轴协作与检查" className="grid grid-cols-2 gap-2 px-4 pb-2 bg-white dark:bg-slate-900 shrink-0">
        {onOpenDelegation && <button type="button" onClick={onOpenDelegation} className="min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-[#0058BE] dark:text-blue-300 text-xs font-semibold">
          <AppIcon name="lock" size={17} />委托授权
        </button>}
        {onOpenAudit && <button type="button" onClick={onOpenAudit} className="min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-[#0058BE] dark:text-blue-300 text-xs font-semibold">
          <AppIcon name="ai" size={17} />AI 责任链审计
        </button>}
      </nav>

      {/* 视图切换 Tabs */}
      <div className="flex bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('mine')}
          className={`flex-1 py-3 text-sm font-semibold text-center border-b-2 transition-colors cursor-pointer ${
            activeTab === 'mine'
              ? 'border-[#0058BE] text-[#0058BE] dark:text-blue-400 font-bold'
              : 'border-transparent text-slate-500 dark:text-slate-400'
          }`}
        >
          我的职责
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-3 text-sm font-semibold text-center border-b-2 transition-colors cursor-pointer ${
            activeTab === 'overview'
              ? 'border-[#0058BE] text-[#0058BE] dark:text-blue-400 font-bold'
              : 'border-transparent text-slate-500 dark:text-slate-400'
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
            <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/40 text-[#0058BE] dark:text-blue-300 rounded-xl text-xs leading-relaxed border border-blue-100 dark:border-blue-900/50">
              <AppIcon name="info" size={16} className="shrink-0" />
              <span>汇报路径由人轴决定，AI 辅助整理与递交。</span>
            </div>

            {/* 1. 直属领导节点 */}
            {supervisorNode ? (
              <div
                onClick={() => {
                  setSelectedNodeId(supervisorNode.id);
                  setPreviewNode(supervisorNode);
                }}
                className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs cursor-pointer active:scale-[0.99] transition-transform"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/50 text-[#0058BE] dark:text-blue-300 font-bold flex items-center justify-center text-sm shrink-0">
                    {supervisorNode.person.name.slice(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <strong className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {supervisorNode.person.name}
                      </strong>
                      <span className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-0.5">
                        <AppIcon name="ai" size={14} />
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      直属领导 · {supervisorNode.roleTitle || '管理者'}
                    </p>
                  </div>
                </div>

                {showAiStatus && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigateToReport?.(undefined, supervisorNode.id);
                    }}
                    className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-[#0058BE] dark:text-blue-400 font-medium"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <AppIcon name="file" size={14} />
                      已收到你的汇报 · 未读
                    </span>
                    <AppIcon name="chevron-right" size={14} className="shrink-0 text-slate-400" />
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 bg-slate-100/70 dark:bg-slate-800/40 rounded-xl text-center text-xs text-slate-400">
                {selfNode ? '当前为项目顶层负责人，无直属上级' : '你尚未关联本项目的人员节点，可切换项目全貌查看。'}
              </div>
            )}

            {/* 连接竖线 */}
            <div className="w-0.5 h-5 bg-blue-200 dark:bg-blue-800 mx-auto" />

            {/* 2. 我的节点 (Self Node - 明显高亮) */}
            {selfNode ? (
              <div
                onClick={() => {
                  setSelectedNodeId(selfNode.id);
                  setDetailNode(selfNode);
                }}
                className="bg-blue-50/70 dark:bg-blue-950/40 border-2 border-blue-400 dark:border-blue-600 rounded-2xl p-4 shadow-sm cursor-pointer active:scale-[0.99] transition-transform"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#0058BE] text-white font-bold flex items-center justify-center text-base shrink-0 shadow-xs">
                    {selfNode.person.name.slice(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <strong className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                        {selfNode.person.name} · 我
                      </strong>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 dark:bg-blue-900 text-[#0058BE] dark:text-blue-300">
                        <AppIcon name="ai" size={12} />
                        当前责任人
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 truncate mt-0.5">
                      {selfNode.roleTitle || '岗位未指定'} · {selfNode.person.department || '项目团队'}
                    </p>
                  </div>
                </div>

                {showAiStatus && !reportsLoadFailed && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigateToReport?.();
                    }}
                    className="mt-3.5 pt-2.5 border-t border-blue-200/80 dark:border-blue-900/60 flex items-center justify-between text-xs text-[#0058BE] dark:text-blue-400 font-semibold"
                  >
                    {(() => {
                      const selfReport = latestReportByUser(agentReports, currentUserIdNum)
                      const tone = reportStatusTone(selfReport)
                      return (
                        <span className={`flex items-center gap-1.5 truncate ${tone.textClass}`}>
                          {tone.iconName && <AppIcon name={tone.iconName} size={14} />}
                          {reportStatusLabel(selfReport)}
                        </span>
                      )
                    })()}
                    <AppIcon name="chevron-right" size={14} className="shrink-0 text-[#0058BE]" />
                  </div>
                )}
              </div>
            ) : null}

            {/* 连接竖线 */}
            <div className="w-0.5 h-5 bg-blue-200 dark:bg-blue-800 mx-auto" />

            {/* 3. 直属下级分支 */}
            {subordinateNodes.length > 0 ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
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
                      className="text-xs font-semibold text-[#0058BE] dark:text-blue-400 flex items-center gap-0.5 cursor-pointer"
                    >
                      <AppIcon name="plus" size={14} />
                      新增下属
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  {subordinateNodes.map((sub) => (
                    <div
                      key={sub.id}
                      onClick={() => {
                        setSelectedNodeId(sub.id);
                        setPreviewNode(sub);
                      }}
                      className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3 shadow-xs cursor-pointer active:scale-[0.99] transition-transform"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold flex items-center justify-center text-xs shrink-0">
                          {sub.person.name.slice(0, 1)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <strong className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate block">
                            {sub.person.name}
                          </strong>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {sub.roleTitle || '团队成员'} · 我的直属下属
                          </p>
                        </div>
                        <AppIcon name="chevron-right" size={16} className="text-slate-400 shrink-0" />
                      </div>

                      {showAiStatus && !reportsLoadFailed && (
                        <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                          {(() => {
                            const subReport = latestReportByUser(agentReports, sub.ownerUserIds?.[0])
                            const tone = reportStatusTone(subReport)
                            return (
                              <span className={`flex items-center gap-1 truncate ${tone.textClass}`}>
                                {tone.iconName && <AppIcon name={tone.iconName} size={12} />}
                                {reportStatusLabel(subReport)}
                              </span>
                            )
                          })()}
                          <span className="text-[10px] text-slate-400">点击查看</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-3 bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl text-center">
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">暂无直属下属</p>
                {nodeCan(selfNode, 'can_add_subordinate') && (
                  <button
                    type="button"
                    onClick={() =>
                      setEditPersonTarget({
                        mode: 'add',
                        parentSuggestedId: selfNode?.id,
                      })
                    }
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950 text-[#0058BE] dark:text-blue-400 text-xs font-semibold cursor-pointer"
                  >
                    <AppIcon name="plus" size={14} />
                    添加下级人员
                  </button>
                )}
              </div>
            )}

            {/* 4. 我的责任事项列表 */}
            <div className="mt-4 pt-2">
              <div className="flex items-center justify-between mb-2.5 px-1">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">我的责任事项</h2>
                <button
                  type="button"
                  onClick={() => {
                    if (selfNode) setDetailNode(selfNode);
                  }}
                  className="text-xs font-semibold text-[#0058BE] dark:text-blue-400 cursor-pointer"
                >
                  查看全部
                </button>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs divide-y divide-slate-100 dark:divide-slate-800/80 overflow-hidden">
                {selfNode && selfNode.workItems.length > 0 ? (
                  selfNode.workItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => onOpenEvidence?.(item.id)}
                      className="p-3.5 flex items-center gap-3 cursor-pointer active:bg-slate-50 dark:active:bg-slate-800/50"
                    >
                      <div className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-600 flex items-center justify-center shrink-0">
                        {item.status === 'Done' && (
                          <div className="w-2.5 h-2.5 rounded-full bg-[#0058BE]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <strong className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate block">
                          {item.title}
                        </strong>
                        <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
                          {item.status === 'Done' ? '已完成' : '进行中'} ·{' '}
                          {item.evidences?.length || 2} 份材料
                        </p>
                      </div>
                      <AppIcon name="chevron-right" size={16} className="text-slate-400 shrink-0" />
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-xs text-slate-400">暂无待办责任事项</div>
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
            <div className="flex items-center justify-between px-3 py-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200/80 dark:border-slate-800 z-10 shrink-0 gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {/* 方向切换（两段式） */}
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-full p-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setOrientation('vertical')}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                      orientation === 'vertical'
                        ? 'bg-white dark:bg-slate-900 text-[#0058BE] dark:text-blue-300 font-bold shadow-sm'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    纵向
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrientation('horizontal')}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                      orientation === 'horizontal'
                        ? 'bg-white dark:bg-slate-900 text-[#0058BE] dark:text-blue-300 font-bold shadow-sm'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    横向
                  </button>
                </div>

                {/* 定位我 */}
                <button
                  type="button"
                  onClick={handleLocateMe}
                  aria-label="定位我"
                  className="px-2.5 py-1.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-[#0058BE] dark:text-blue-400 flex items-center gap-1 active:opacity-60 cursor-pointer shrink-0"
                >
                  <AppIcon name="user" size={13} />
                  <span className="hidden min-[360px]:inline">定位我</span>
                </button>

                {/* 适应屏幕 */}
                <button
                  type="button"
                  data-testid="toolbar-fit-screen"
                  onClick={handleFitScreen}
                  className="px-2.5 py-1.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center gap-1 active:opacity-60 cursor-pointer shrink-0"
                  aria-label="适应屏幕"
                >
                  <Maximize size={13} aria-hidden="true" />
                  <span className="hidden min-[360px]:inline">适应屏幕</span>
                </button>
              </div>

              {/* 右侧「⋯」菜单 */}
              <div className="relative shrink-0" ref={moreMenuRef}>
                <button
                  type="button"
                  aria-label="更多画布设置"
                  onClick={() => setMoreMenuOpen(prev => !prev)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 active:opacity-60 cursor-pointer"
                >
                  <AppIcon name="more-horizontal" size={18} />
                </button>

                {moreMenuOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-48 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-2 z-50 text-xs space-y-2">
                    <div>
                      <span className="text-[11px] text-slate-400 px-2 font-medium">连线样式</span>
                      <div className="grid grid-cols-2 gap-1 mt-1">
                        <button
                          type="button"
                          onClick={() => { setEdgeStyle('curve'); setMoreMenuOpen(false); }}
                          className={`py-1.5 rounded-lg text-center font-medium cursor-pointer ${
                            edgeStyle === 'curve'
                              ? 'bg-blue-50 dark:bg-blue-950 text-[#0058BE] font-bold'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                          }`}
                        >
                          曲线
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEdgeStyle('straight'); setMoreMenuOpen(false); }}
                          className={`py-1.5 rounded-lg text-center font-medium cursor-pointer ${
                            edgeStyle === 'straight'
                              ? 'bg-blue-50 dark:bg-blue-950 text-[#0058BE] font-bold'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                          }`}
                        >
                          直线
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 dark:border-slate-800 pt-1.5 space-y-1">
                      <button
                        type="button"
                        data-testid="axis-pull-all"
                        onClick={() => { flowCanvas.pullAllToAxis(); setMoreMenuOpen(false); }}
                        className="w-full min-h-[40px] px-2 rounded-lg text-left font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        全部拉到人轴
                      </button>
                      <button
                        type="button"
                        data-testid="axis-reset-fold"
                        onClick={() => { flowCanvas.resetFold(); setMoreMenuOpen(false); }}
                        className="w-full min-h-[40px] px-2 rounded-lg text-left font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        恢复默认折叠
                      </button>
                    </div>

                    <div className="border-t border-slate-100 dark:border-slate-800 pt-1.5">
                      <span className="text-[11px] text-slate-400 px-2 font-medium">节点间距</span>
                      <div className="grid grid-cols-3 gap-1 mt-1">
                        {(['compact', 'standard', 'loose'] as AxisSpacing[]).map((sp) => (
                          <button
                            key={sp}
                            type="button"
                            onClick={() => { setSpacing(sp); setMoreMenuOpen(false); }}
                            className={`py-1 rounded-lg text-center font-medium cursor-pointer ${
                              spacing === sp
                                ? 'bg-blue-50 dark:bg-blue-950 text-[#0058BE] font-bold'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50'
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

            <div className="flex-1 w-full min-h-0 bg-[#eef2f7] dark:bg-[#151c24] relative">
              <PeopleAxisFlowCanvas
                lang="zh"
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
        isOpen={Boolean(previewNode)}
        onClose={() => setPreviewNode(null)}
        title="责任节点预览"
      >
        {previewNode && (
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/80 dark:border-slate-800">
              <div className="w-12 h-12 rounded-full bg-[#0058BE] text-white font-bold flex items-center justify-center text-base shrink-0">
                {previewNode.person.name.slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <strong className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                    {previewNode.person.name}
                  </strong>
                  {previewNode.id === selfNode?.id && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 dark:bg-blue-900 text-[#0058BE] dark:text-blue-300 font-bold">
                      我
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {previewNode.roleTitle || '岗位未指定'} · {previewNode.person.department || '团队'}
                </p>
              </div>
            </div>

            {/* 关键信息栅格 */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl">
                <span className="text-slate-400 block mb-1">责任事项</span>
                <strong className="text-sm text-slate-900 dark:text-slate-100">
                  {previewNode.workItems.length} 项
                </strong>
              </div>
              <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl">
                <span className="text-slate-400 block mb-1">直属下属</span>
                <strong className="text-sm text-slate-900 dark:text-slate-100">
                  {axisNodes.filter((n) => n.parentId === previewNode.id).length} 人
                </strong>
              </div>
            </div>

            <PersonMembershipActions node={previewNode} capabilities={permissions?.node_permissions?.[previewNode.id]}
              onChanged={async()=>{setPreviewNode(null);await loadData();}} />
            {/* 操作按钮区 */}
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  const target = previewNode;
                  setPreviewNode(null);
                  setDetailNode(target);
                }}
                className="w-full min-h-[46px] rounded-xl bg-[#0058BE] text-white font-semibold text-sm flex items-center justify-center gap-2 active:bg-blue-700 cursor-pointer"
              >
                <AppIcon name="file" size={16} />
                查看完整责任详情
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPreviewNode(null);
                    // 定位并居中
                    locateNode(previewNode.id);
                    setActiveTab('overview');
                  }}
                  className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium text-xs flex items-center justify-center gap-1.5 active:bg-slate-50 cursor-pointer"
                >
                  <AppIcon name="axis" size={14} />
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
                    className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium text-xs flex items-center justify-center gap-1.5 active:bg-slate-50 cursor-pointer"
                  >
                    <AppIcon name="plus" size={14} />
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
                    className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium text-xs flex items-center justify-center gap-1.5 active:bg-slate-50 cursor-pointer"
                  >
                    <AppIcon name="edit" size={14} />
                    编辑人员
                  </button>

                  {nodeCan(previewNode, 'can_move_person') && canChangeSupervisor && <button
                    type="button"
                    onClick={() => {
                      const target = previewNode;
                      setPreviewNode(null);
                      setMoveSupervisorTargetNode(target);
                    }}
                    className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium text-xs flex items-center justify-center gap-1.5 active:bg-slate-50 cursor-pointer"
                  >
                    <AppIcon name="arrow-right" size={14} />
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
        isOpen={Boolean(detailNode)}
        onClose={() => setDetailNode(null)}
        title={detailNode ? `${detailNode.person.name} · 责任详情` : ''}
        height="full"
      >
        {detailNode && (
          <NodeDetailContent
            node={detailNode}
            allNodes={axisNodes}
            agentReports={agentReports}
            reportsLoadFailed={reportsLoadFailed}
            canEdit={nodeCan(detailNode, 'can_edit_person')}
            canManagePermissions={nodeCan(detailNode, 'can_manage_permissions')}
            canChangeSupervisor={canChangeSupervisor && nodeCan(detailNode,'can_move_person')}
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
        isOpen={Boolean(permissionTargetNode)}
        onClose={() => setPermissionTargetNode(null)}
        title="节点权限"
      >
        {permissionTargetNode && (
          <NodePermissionsForm
            node={permissionTargetNode}
            onSuccess={async () => {
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
        isOpen={Boolean(moveSupervisorTargetNode)}
        onClose={() => setMoveSupervisorTargetNode(null)}
        title="调整直属上级"
      >
        {moveSupervisorTargetNode && (
          <MoveSupervisorForm
            targetNode={moveSupervisorTargetNode}
            allNodes={axisNodes}
            onSuccess={async () => {
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
        isOpen={showSettingsSheet}
        onClose={() => setShowSettingsSheet(false)}
        title="画布设置"
      >
        <div className="p-4 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            <div className="p-3.5 flex items-center justify-between">
              <div>
                <strong className="text-sm text-slate-900 dark:text-slate-100 block">
                  显示 AI 汇报状态
                </strong>
                <p className="text-xs text-slate-400 mt-0.5">节点上展示草稿、已提交与未读</p>
              </div>
              <MobileSwitch
                checked={showAiStatus}
                onChange={setShowAiStatus}
                aria-label="显示 AI 汇报状态"
              />
            </div>

            <div className="p-3.5 flex items-center justify-between">
              <div>
                <strong className="text-sm text-slate-900 dark:text-slate-100 block">
                  展开直属下属
                </strong>
                <p className="text-xs text-slate-400 mt-0.5">默认聚焦当前责任范围</p>
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
                  className={`py-2.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                    orientation === 'vertical'
                      ? 'border-[#0058BE] bg-blue-50 dark:bg-blue-950 text-[#0058BE] dark:text-blue-400'
                      : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600'
                  }`}
                >
                  纵向树状
                </button>
                <button
                  type="button"
                  onClick={() => setOrientation('horizontal')}
                  className={`py-2.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                    orientation === 'horizontal'
                      ? 'border-[#0058BE] bg-blue-50 dark:bg-blue-950 text-[#0058BE] dark:text-blue-400'
                      : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600'
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
                    className={`py-2 rounded-xl text-xs font-medium border cursor-pointer ${
                      spacing === sp
                        ? 'border-[#0058BE] bg-blue-50 dark:bg-blue-950 text-[#0058BE] dark:text-blue-400 font-bold'
                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600'
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
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2 px-1">
              管理操作
            </span>
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              <div
                onClick={() => {
                  setShowSettingsSheet(false);
                  setShowResetConfirm(true);
                }}
                className="p-3.5 flex items-center justify-between cursor-pointer active:bg-slate-50 dark:active:bg-slate-800"
              >
                <div className="flex items-center gap-2.5">
                  <AppIcon name="refresh" size={16} className="text-amber-600" />
                  <div>
                    <strong className="text-sm font-semibold text-slate-900 dark:text-slate-100 block">
                      重置卡片布局
                    </strong>
                    <p className="text-xs text-slate-400">清除当前保存的位置</p>
                  </div>
                </div>
                <AppIcon name="chevron-right" size={16} className="text-slate-400" />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowSettingsSheet(false);
              showToast('偏好设置已保存');
            }}
            className="w-full min-h-[46px] rounded-xl bg-[#0058BE] text-white font-semibold text-sm flex items-center justify-center active:bg-blue-700 cursor-pointer"
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

      {/* 底部轻提示 Toast */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 text-white text-xs px-4 py-2 rounded-full shadow-lg backdrop-blur-md animate-fade-in pointer-events-none">
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
  onNavigateToReport?: (reportId?: string, nodeId?: string) => void;
  onEditPerson: () => void;
  onEditPermissions: () => void;
  onMoveSupervisor: () => void;
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
}) => {
  const [tab, setTab] = useState<'matters' | 'evidence' | 'progress'>('matters');

  const supervisor = allNodes.find((n) => n.id === node.parentId);
  const subordinates = allNodes.filter((n) => n.parentId === node.id);

  return (
    <div className="p-4 space-y-4 pb-12 overflow-y-auto">
      {/* 头部个人名片 */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full bg-[#0058BE] text-white font-bold flex items-center justify-center text-lg shrink-0">
            {node.person.name.slice(0, 1)}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
              {node.person.name}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {node.roleTitle || '岗位未指定'} · {node.person.department || '项目部门'}
            </p>
          </div>
        </div>

        {/* 上下级关系行 */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">直属领导</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {supervisor ? supervisor.person.name : '无 (顶层负责人)'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">直属下属</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {subordinates.length > 0
                ? subordinates.map((s) => s.person.name).join('、')
                : '无'}
            </span>
          </div>
        </div>
      </div>

      {/* 子选项卡 */}
      <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
        {(['matters', 'evidence', 'progress'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              tab === t
                ? 'bg-white dark:bg-slate-900 text-[#0058BE] dark:text-blue-400 shadow-xs'
                : 'text-slate-500 dark:text-slate-400'
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
                className="p-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl flex items-center justify-between cursor-pointer active:bg-slate-50"
              >
                <div>
                  <strong className="text-xs font-semibold text-slate-900 dark:text-slate-100 block">
                    {item.title}
                  </strong>
                  <span className="text-[11px] text-slate-400 mt-0.5 block">
                    {item.status === 'Done' ? '已完成' : '进行中'} · {item.progress || 0}%
                  </span>
                </div>
                <AppIcon name="chevron-right" size={16} className="text-slate-400" />
              </div>
            ))
          ) : (
            <div className="p-4 bg-white dark:bg-slate-900 rounded-xl text-center text-xs text-slate-400">
              暂无挂载的责任事项
            </div>
          )}
        </div>
      )}

      {tab === 'evidence' && (
        <div className="space-y-2">
          <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl text-center">
            <AppIcon name="file" size={24} className="mx-auto text-blue-500 mb-1.5" />
            <p className="text-xs text-slate-600 dark:text-slate-300">
              已收录 {node.workItems.reduce((acc, w) => acc + (w.evidences?.length || 0), 0)} 份证据材料
            </p>
            <button
              type="button"
              onClick={() => onOpenEvidence?.(node.id)}
              className="mt-3 inline-flex items-center gap-1 px-4 py-2 bg-[#0058BE] text-white rounded-xl text-xs font-semibold cursor-pointer active:bg-blue-700"
            >
              <AppIcon name="plus" size={14} />
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
          <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl space-y-3">
            {progressVal != null && (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">综合进展</span>
                  <span className="font-bold text-[#0058BE]">{progressVal}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full bg-[#0058BE] rounded-full" style={{ width: `${progressVal}%` }} />
                </div>
              </>
            )}
            {!reportsLoadFailed && (
              <p className="text-[11px] text-slate-400 leading-relaxed">
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
          className="w-full min-h-[46px] rounded-xl bg-[#0058BE] text-white font-semibold text-xs flex items-center justify-center gap-1.5 active:bg-blue-700 cursor-pointer"
        >
          <AppIcon name="ai" size={16} />
          查看 AI 汇报与材料对照
        </button>

        {canEdit && (
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={onEditPerson}
              className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center justify-center gap-1 cursor-pointer active:bg-slate-50"
            >
              <AppIcon name="edit" size={14} />
              编辑人员
            </button>
            {canManagePermissions && <button
              type="button"
              onClick={onEditPermissions}
              className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center justify-center gap-1 cursor-pointer active:bg-slate-50"
            >
              <AppIcon name="lock" size={14} />
              节点权限
            </button>}
            {canChangeSupervisor && <button
              type="button"
              onClick={onMoveSupervisor}
              className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center justify-center gap-1 cursor-pointer active:bg-slate-50"
            >
              <AppIcon name="arrow-right" size={14} />
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
    <form onSubmit={handleSubmit} className="p-4 space-y-3.5 pb-8">
      {error && (
        <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs flex items-center gap-1.5">
          <AppIcon name="alert" size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 关联成员下拉 */}
      <MobileField label="关联项目成员">
        <select
          value={selectedUserId || ''}
          disabled={!canManageAssignees}
          onChange={(e) => handleMemberChange(Number(e.target.value))}
          className="w-full min-h-[46px] px-3.5 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
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
        {!canChangeSupervisor && <p className="text-xs text-slate-500 mb-2">直属上级由主管项目的项目经理设置。</p>}
        <select
          disabled={!canChangeSupervisor}
          aria-label="直属上级"
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className="w-full min-h-[46px] px-3.5 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
        >
          <option value="">无 (设为顶层负责人)</option>
          {candidateSupervisors.map((cand) => (
            <option key={cand.id} value={cand.id}>
              {cand.person.name} ({cand.roleTitle || '无岗位'})
            </option>
          ))}
        </select>
      </MobileField>

      <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 rounded-xl text-[11px] text-[#0058BE] dark:text-blue-300 flex items-center gap-1.5">
        <AppIcon name="info" size={14} className="shrink-0" />
        <span>新增人员会建立人轴关系，并同步其项目内汇报智能体绑定。</span>
      </div>

      <div className="pt-2 space-y-2">
        <button
          type="submit"
          disabled={submitting}
          className="w-full min-h-[46px] rounded-xl bg-[#0058BE] text-white font-semibold text-sm flex items-center justify-center active:bg-blue-700 disabled:opacity-50 cursor-pointer"
        >
          {submitting ? '正在保存…' : '保存人员'}
        </button>

        {mode === 'edit' && onOpenPermissions && (
          <button
            type="button"
            onClick={onOpenPermissions}
            className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 active:bg-slate-50 cursor-pointer"
          >
            <AppIcon name="lock" size={14} />
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
        <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs flex items-center gap-1.5">
          <AppIcon name="alert" size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-800">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
          {node.person.name} · {node.roleTitle || '岗位'}
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">权限作用于当前项目的人轴节点</p>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
        <div className="p-3.5 flex items-center justify-between">
          <div>
            <strong className="text-sm text-slate-900 dark:text-slate-100 block">
              可新增直属下属
            </strong>
            <p className="text-xs text-slate-400 mt-0.5">允许在本节点下新增人员</p>
          </div>
          <MobileSwitch
            checked={allowAddSubordinates}
            onChange={setAllowAddSubordinates}
            aria-label="可新增直属下属"
          />
        </div>

        <div className="p-3.5 flex items-center justify-between">
          <div>
            <strong className="text-sm text-slate-900 dark:text-slate-100 block">
              可新增责任事项
            </strong>
            <p className="text-xs text-slate-400 mt-0.5">允许创建绑定本节点的事项</p>
          </div>
          <MobileSwitch
            checked={allowAddWorkItems}
            onChange={setAllowAddWorkItems}
            aria-label="可新增责任事项"
          />
        </div>

        <div className="p-3.5 flex items-center justify-between">
          <div>
            <strong className="text-sm text-slate-900 dark:text-slate-100 block">
              可提交证据材料
            </strong>
            <p className="text-xs text-slate-400 mt-0.5">仅限授权范围内的材料</p>
          </div>
          <select
            value={evidenceSubmit}
            onChange={(e) =>
              setEvidenceSubmit(
                e.target.value as 'inherit' | 'members' | 'responsible' | 'disabled',
              )
            }
            className="text-xs font-semibold bg-slate-100 dark:bg-slate-800 border-0 rounded-lg px-2.5 py-1 text-[#0058BE] dark:text-blue-400"
          >
            <option value="inherit">继承上级</option>
            <option value="members">项目成员</option>
            <option value="responsible">责任人</option>
            <option value="disabled">已禁用</option>
          </select>
        </div>
      </div>

      <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 rounded-xl text-[11px] text-[#0058BE] dark:text-blue-300 flex items-center gap-1.5">
        <AppIcon name="info" size={14} className="shrink-0" />
        <span>保存后按最新权限生效，其他设备同步更新。</span>
      </div>

      <div className="pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting}
          className="w-full min-h-[46px] rounded-xl bg-[#0058BE] text-white font-semibold text-sm flex items-center justify-center active:bg-blue-700 disabled:opacity-50 cursor-pointer"
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
    <div className="p-4 space-y-3.5 pb-8">
      {/* 警示说明 */}
      <div className="p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 rounded-xl text-xs leading-relaxed flex items-center gap-2 border border-amber-200 dark:border-amber-900/50">
        <AppIcon name="warning" size={16} className="shrink-0" />
        <span>调整后，新提交汇报走新链路；历史报告保留原接收关系。</span>
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs flex items-center gap-1.5">
          <AppIcon name="alert" size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 当前关系对比卡片 */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden text-xs">
        <div className="p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 text-[#0058BE] dark:text-blue-300 font-bold flex items-center justify-center text-xs">
            {targetNode.person.name.slice(0, 1)}
          </div>
          <div>
            <strong className="text-slate-900 dark:text-slate-100 block">
              当前人员：{targetNode.person.name}
            </strong>
            <span className="text-slate-400">{targetNode.roleTitle || '岗位'}</span>
          </div>
        </div>

        <div className="p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 font-bold flex items-center justify-center text-xs">
            {currentSupervisor ? currentSupervisor.person.name.slice(0, 1) : '-'}
          </div>
          <div>
            <strong className="text-slate-900 dark:text-slate-100 block">
              当前上级：{currentSupervisor ? currentSupervisor.person.name : '顶层无上级'}
            </strong>
            <span className="text-slate-400">{currentSupervisor?.roleTitle || '-'}</span>
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
        leading={<AppIcon name="search" size={16} />}
      />

      {/* 可选上级列表 */}
      <div className="space-y-1.5 max-h-[200px] overflow-y-auto border border-slate-200/80 dark:border-slate-800 rounded-2xl p-1 bg-white dark:bg-slate-900">
        <div
          onClick={() => setSelectedParentId('')}
          className={`p-2.5 rounded-xl flex items-center justify-between text-xs cursor-pointer ${
            selectedParentId === ''
              ? 'bg-blue-50 dark:bg-blue-950 text-[#0058BE] font-bold'
              : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
          }`}
        >
          <span>设为顶层负责人 (无上级)</span>
          {selectedParentId === '' && <AppIcon name="check" size={16} className="text-[#0058BE]" />}
        </div>

        {candidateSupervisors.map((cand) => (
          <div
            key={cand.id}
            onClick={() => setSelectedParentId(cand.id)}
            className={`p-2.5 rounded-xl flex items-center justify-between text-xs cursor-pointer ${
              selectedParentId === cand.id
                ? 'bg-blue-50 dark:bg-blue-950 text-[#0058BE] font-bold'
                : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <div>
              <span className="block font-medium">
                {cand.person.name}{' '}
                {cand.id === targetNode.parentId && (
                  <span className="text-[10px] text-slate-400">(当前上级)</span>
                )}
              </span>
              <span className="text-[10px] text-slate-400">{cand.roleTitle || '岗位未指定'}</span>
            </div>
            {selectedParentId === cand.id && (
              <AppIcon name="check" size={16} className="text-[#0058BE]" />
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
          className="w-full min-h-[46px] rounded-xl bg-[#0058BE] text-white font-semibold text-sm flex items-center justify-center active:bg-blue-700 disabled:opacity-50 cursor-pointer"
        >
          {submitting ? '正在调整…' : '确认调整上级'}
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="w-full min-h-[44px] rounded-xl text-slate-500 font-medium text-xs flex items-center justify-center active:opacity-60 cursor-pointer"
        >
          取消
        </button>
      </div>
    </div>
  );
};
