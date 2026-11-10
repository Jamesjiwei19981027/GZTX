import React, { useEffect, useState } from 'react';
import {
  acceptProjectInvitation,
  createProject,
  getProject,
  listMyCompanies,
  listProjectMembers,
  listProjectTasks,
  type BackendTask,
  listProjects,
  type BackendCompany,
  type BackendMember,
  type BackendProject,
} from '../../../api/backend';
import {
  getMyPermissions,
  inviteProjectMember,
  inviteDeliveryNotice,
  type MyProjectPermissions,
} from '../../../api/shell';
import { ApiError } from '../../../api/client';
import { canManageProject, canInviteToProject } from './projectPermissions';
import { mapTask } from '../../../api/mappers';
import { parseInviteInput } from '../../../utils/invite';
import { Project, Language, Task } from '../../../types';
import { AppIcon } from '../../ui/AppIcon';
import { MobileField, MobileInput } from '../../ui/MobileField';
import { MobileListGroup, MobileListItem } from '../../ui/MobileList';
import { MobileConfirm } from '../../ui/MobileConfirm';
import { archiveProjectRequest, unarchiveProjectRequest, updateProjectInfo, notifyProjectsChanged } from '../../../api/manage';
import { MobileEmptyState, MobileLoadingState } from '../../ui/MobileState';
import { MobileReportPolicySettings } from './MobileReportPolicySettings';
import { CardTemplateEntry } from '../../../features/personCards/CardTemplateEntry';

export interface MobileProjectScreensProps {
  currentProject: Project;
  projects: Project[];
  companyId: number | null;
  onSelectProject: (p: Project) => void;
  lang?: Language;
  onNavigateToAxis?: () => void;
  onNavigateToTasks?: () => void;
  onNavigateToKanban?: () => void;
  onOpenPhoneVerify?: () => void;
  onClose?: () => void;
}

// -------------------------------------------------------------
// 07 切换项目 (含“全部项目”个人总览)
// -------------------------------------------------------------
export const MobileProjectSwitchScreen: React.FC<{
  currentProject: Project;
  projects: Project[];
  companyId: number | null;
  onSelectProject: (p: Project) => void;
  onCreateProjectClick?: () => void;
  onJoinProjectClick?: () => void;
  onClose?: () => void;
  lang?: Language;
}> = ({
  currentProject,
  projects,
  companyId,
  onSelectProject,
  onCreateProjectClick,
  onJoinProjectClick,
  onClose,
  lang = 'zh',
}) => {
  const [companies, setCompanies] = useState<BackendCompany[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const res = await listMyCompanies();
        if (active) setCompanies(res.items || []);
      } catch {
        /* ignore */
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const handleSelect = (proj: Project) => {
    onSelectProject(proj);
    onClose?.();
  };

  return (
    <div className="flex flex-col h-full bg-surface dark:bg-surface text-on-surface dark:text-on-surface">
      <header className="h-14 px-4 bg-surface-container-lowest dark:bg-surface-container-lowest border-b border-outline-variant dark:border-outline-variant flex items-center justify-between shrink-0">
        <h1 className="text-base font-medium tabular-nums">切换工作区与项目</h1>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center -mr-2 text-on-surface-variant"
            aria-label="关闭"
          >
            <AppIcon name="close" size={18} />
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 全部项目 (个人总览模式) */}
        <MobileListGroup
          title="全局视图"
          footer="“全部项目”仅作为个人待办与日程汇总，不合并各项目的原始 AI 与人轴上下文。"
        >
          <MobileListItem
            leading={<AppIcon name="work" size={18} className="text-inherit" />}
            title="全部项目"
            subtitle="个人跨项目待办与日历总览"
            selected={currentProject.id === 'all'}
            showChevron={false}
            trailing={
              currentProject.id === 'all' ? (
                <AppIcon name="check" size={18} className="text-inherit" />
              ) : undefined
            }
            onClick={() =>
              handleSelect({
                id: 'all',
                name: '全部项目',
                description: '个人跨项目任务总览',
                color: '#0058BE',
                active: true,
              })
            }
          />
        </MobileListGroup>

        {/* 具体项目列表 */}
        <MobileListGroup title="具体协同项目">
          {projects.length === 0 ? (
            <div className="p-4 text-center text-xs text-outline">
              当前工作区暂无项目
            </div>
          ) : (
            projects.map((proj) => {
              const isSelected = String(proj.id) === String(currentProject.id);
              return (
                <MobileListItem
                  key={proj.id}
                  leading={
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: proj.color || '#0058BE' }}
                    />
                  }
                  title={proj.name}
                  subtitle={proj.description || '项目协同工作区'}
                  selected={isSelected}
                  showChevron={false}
                  trailing={
                    isSelected ? (
                      <AppIcon name="check" size={18} className="text-inherit" />
                    ) : undefined
                  }
                  onClick={() => handleSelect(proj)}
                />
              );
            })
          )}
        </MobileListGroup>

        {/* 快捷操作区 */}
        <div className="pt-2 flex flex-col gap-2">
          {onJoinProjectClick && (
            <button
              type="button"
              onClick={onJoinProjectClick}
              className="min-h-[48px] w-full rounded-lg bg-surface-container-lowest dark:bg-surface-container-lowest border border-outline-variant dark:border-outline-variant text-primary font-medium text-sm flex items-center justify-center gap-2 shadow-sm dark:shadow-none active:bg-surface dark:active:bg-surface-container-lowest tabular-nums"
            >
              <AppIcon name="share" size={18} />
              <span>使用邀请加入项目</span>
            </button>
          )}
          {onCreateProjectClick && (
            <button
              type="button"
              onClick={onCreateProjectClick}
              className="min-h-[48px] w-full rounded-lg bg-surface-container-lowest dark:bg-surface-container-lowest border border-outline-variant dark:border-outline-variant text-primary font-medium text-sm flex items-center justify-center gap-2 shadow-sm dark:shadow-none active:bg-surface dark:active:bg-surface-container-lowest tabular-nums"
            >
              <AppIcon name="plus" size={18} />
              <span>新建项目</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 08 创建工作区 (项目)
// -------------------------------------------------------------
export const MobileWorkspaceCreateScreen: React.FC<{
  companyId: number | null;
  onCreated: (created: { kind: 'project'; id: number; name: string }) => void;
  onCancel?: () => void;
  lang?: Language;
}> = ({
  companyId,
  onCreated,
  onCancel,
  lang = 'zh',
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');

  const handleCreateProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) {
      setError('请输入项目名称');
      return;
    }
    if (!companyId) {
      setError('未检测到有效企业所属，请联系管理员获取项目邀请');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await createProject({
        name: projectName.trim(),
        company_id: companyId,
      });
      onCreated({ kind: 'project', id: res.id, name: res.name });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '创建项目失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface-container-lowest dark:bg-surface text-on-surface dark:text-on-surface">
      <header className="h-14 px-4 border-b border-outline-variant dark:border-outline-variant flex items-center justify-between shrink-0">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center -ml-2 text-on-surface-variant"
            aria-label="取消"
          >
            <AppIcon name="back" size={18} />
          </button>
        )}
        <h1 className="text-base font-medium tabular-nums">新建项目</h1>
        <div className="w-10" />
      </header>

      <div className="flex-1 overflow-y-auto p-5 max-w-md mx-auto w-full">
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-error-container dark:bg-error text-error dark:text-error text-xs flex items-center gap-2">
            <AppIcon name="alert" size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleCreateProjectSubmit} className="space-y-4">
          <MobileField label="项目名称" required helperText="清晰易识别的项目名称，如「智能客服 2.0」">
            <MobileInput
              type="text"
              placeholder="输入项目全名"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              autoFocus
              leading={<AppIcon name="folder" size={18} />}
            />
          </MobileField>

          <button
            type="submit"
            disabled={busy || !projectName.trim()}
            className="min-h-[48px] w-full rounded-lg bg-primary text-on-primary font-medium text-base shadow-sm dark:shadow-none active:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2 mt-6 tabular-nums"
          >
            {busy ? '正在创建…' : '立即创建项目'}
          </button>
        </form>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 09 项目概览
// -------------------------------------------------------------
export const MobileProjectOverviewScreen: React.FC<{
  projectId: number;
  onNavigateToTasks?: () => void;
  onSelectTask?: (task: Task) => void;
  onNavigateToKanban?: () => void;
  onNavigateToAxis?: () => void;
  onNavigateToKnowledge?: () => void;
  onNavigateToSettings?: () => void;
  onNavigateToInvite?: () => void;
  onBack?: () => void;
  lang?: Language;
}> = ({
  projectId,
  onNavigateToTasks,
  onSelectTask,
  onNavigateToKanban,
  onNavigateToAxis,
  onNavigateToKnowledge,
  onNavigateToSettings,
  onNavigateToInvite,
  onBack,
  lang = 'zh',
}) => {
  const [project, setProject] = useState<BackendProject | null>(null);
  const [members, setMembers] = useState<BackendMember[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [taskAttempt, setTaskAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [canInvite, setCanInvite] = useState(false);

  // 项目设置齿轮和邀请按钮只给 PM / 超管；权限没拿到前默认不显示
  useEffect(() => {
    let active = true;
    setCanManage(false);
    setCanInvite(false);
    getMyPermissions(projectId)
      .then((perms) => { if (active) { setCanManage(canManageProject(perms)); setCanInvite(canInviteToProject(perms)); } })
      .catch(() => { if (active) setCanManage(false); });
    return () => { active = false; };
  }, [projectId]);

  useEffect(() => {
    let active = true;
    const fetchInfo = async () => {
      setLoading(true);
      setError(null);
      try {
        const [p, m] = await Promise.all([
          getProject(projectId),
          listProjectMembers(projectId),
        ]);
        if (active) {
          setProject(p);
          setMembers(m.items || []);
        }
      } catch (err) {
        if (active) setError(err instanceof ApiError ? err.message : '加载项目信息失败');
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchInfo();
    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    let active = true;
    setTasks([]); setTasksLoading(true); setTasksError(null);
    const loadTasks = async () => {
      const all: BackendTask[] = [];
      for (let page=1; ; page++) {
        const response=await listProjectTasks(projectId,{page,page_size:200});
        all.push(...response.items);
        if (!response.items.length || all.length>=response.total) break;
      }
      if (active) setTasks(all.map(task=>mapTask(task,String(projectId))));
    };
    loadTasks().catch(err=>{if(active)setTasksError(err instanceof ApiError ? err.message : '项目任务加载失败');})
      .finally(()=>{if(active)setTasksLoading(false);});
    return () => { active=false; };
  },[projectId,taskAttempt]);

  if (loading) return <MobileLoadingState message="正在载入项目详情…" />;
  if (error || !project) {
    return (
      <MobileEmptyState
        title="无法载入项目"
        description={error || '项目不存在或无权限访问'}
        actionLabel="返回"
        onAction={onBack}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface dark:bg-surface text-on-surface dark:text-on-surface">
      <header className="h-14 px-4 bg-surface-container-lowest dark:bg-surface-container-lowest border-b border-outline-variant dark:border-outline-variant flex items-center justify-between shrink-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center -ml-2 text-on-surface-variant"
            aria-label="返回"
          >
            <AppIcon name="back" size={18} />
          </button>
        )}
        <h1 className="text-base font-medium truncate flex-1 text-center tabular-nums">
          {project.name}
        </h1>
        {canManage && onNavigateToSettings && (
          <button
            type="button"
            onClick={onNavigateToSettings}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center -mr-2 text-on-surface-variant dark:text-outline"
            aria-label="项目设置"
          >
            <AppIcon name="settings" size={18} />
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {canInvite && onNavigateToInvite && <button type="button" onClick={onNavigateToInvite}
          className="w-full min-h-[56px] px-4 rounded-lg bg-primary text-on-primary shadow-sm dark:shadow-none flex items-center gap-3 text-left">
          <AppIcon name="team" size={18} /><span className="flex-1"><span className="block text-sm font-medium tabular-nums">邀请新成员加入</span><span className="block text-xs text-primary mt-1">添加项目成员，共同推进任务</span></span><AppIcon name="chevron-right" size={18} />
        </button>}
        {/* 项目基本卡片 */}
        <div className="p-4 bg-surface-container-lowest dark:bg-surface-container rounded-xl border border-outline-variant dark:border-outline-variant shadow-sm dark:shadow-none">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-surface-container-lowest dark:bg-surface-container text-on-surface-variant flex items-center justify-center font-medium text-lg tabular-nums">
              {project.name.slice(0, 1)}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-medium truncate tabular-nums">{project.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs px-2 py-1 rounded-md bg-surface-container text-[#2f7d4f] dark:bg-surface-container dark:text-[#6bbf8a]">
                  {project.status === 'archived' ? '已归档' : '进行中'}
                </span>
                <span className="text-xs text-outline">
                  成员 {members.length} 人
                </span>
              </div>
            </div>
          </div>

          {project.final_owner && (
            <div className="mt-4 pt-3 border-t border-outline-variant dark:border-outline-variant flex items-center justify-between text-xs">
              <span className="text-on-surface-variant">项目终责负责人</span>
              <span className="font-medium text-on-surface dark:text-on-surface tabular-nums">
                {project.final_owner.nickname || project.final_owner.username}
              </span>
            </div>
          )}
        </div>

        <section aria-label="项目任务待办" className="p-4 bg-surface-container-lowest dark:bg-surface-container rounded-xl border border-outline-variant dark:border-outline-variant">
          <div className="flex items-center justify-between gap-2 mb-3"><h2 className="text-base font-medium tabular-nums">项目任务待办 · {tasks.length}</h2>{onNavigateToTasks && <button type="button" onClick={onNavigateToTasks} className="text-xs text-primary dark:text-primary min-h-[44px]">管理任务</button>}</div>
          {tasksLoading && <p role="status" className="text-sm text-on-surface-variant">正在加载全部项目任务…</p>}
          {tasksError && <button type="button" onClick={()=>setTaskAttempt(value=>value+1)} className="min-h-[44px] text-sm text-error">{tasksError}，点击重试</button>}
          {!tasksLoading && !tasksError && !tasks.length && <p className="text-sm text-on-surface-variant py-3">当前项目暂无任务</p>}
          <div className="divide-y divide-outline-variant dark:divide-outline-variant">
            {tasks.map(task=><button key={task.id} type="button" onClick={()=>onSelectTask?.(task)} className="w-full min-h-[56px] py-3 flex items-start gap-3 text-left">
              <AppIcon name={task.status==='Done' ? 'check-circle' : 'work'} size={18} className="mt-1 shrink-0 text-inherit text-inherit" />
              <span className="min-w-0 flex-1"><span className={`block break-words text-sm font-medium ${task.status==='Done' ? 'ink-done' : ''}`}>{task.title}</span><span className="block text-xs text-on-surface-variant mt-1">{task.assignees?.map(member=>member.name).join('、') || '未分配'}{task.dueDate ? ` · ${task.dueDate}` : ''}</span></span>
              <span className="text-xs text-on-surface-variant shrink-0">{task.status==='Done' ? '已完成' : task.status==='In Progress' ? '进行中' : '待办'}</span>
            </button>)}
          </div>
        </section>
        <section aria-label="项目任务看板" className="p-4 bg-surface-container-lowest dark:bg-surface-container rounded-xl border border-outline-variant dark:border-outline-variant">
          <div className="flex items-center justify-between gap-2 mb-3"><h2 className="text-base font-medium tabular-nums">任务看板</h2>{onNavigateToKanban && <button type="button" onClick={onNavigateToKanban} className="text-xs text-primary dark:text-primary min-h-[44px]">管理看板</button>}</div>
          {tasksLoading ? <p className="text-sm text-on-surface-variant">正在加载看板…</p> : tasksError ? <p className="text-sm text-error">{tasksError}</p> : <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(['To Do','In Progress','Done'] as const).map(status=><div key={status} className="min-w-0 rounded-xl bg-surface-container-lowest dark:bg-surface-container p-3">
              <h3 className="text-xs font-medium text-on-surface-variant dark:text-outline mb-2 tabular-nums">{status==='Done' ? '已完成' : status==='In Progress' ? '进行中' : '待办'} · {tasks.filter(task=>task.status===status).length}</h3>
              <div className="space-y-2">{tasks.filter(task=>task.status===status).map(task=><button key={task.id} type="button" onClick={()=>onSelectTask?.(task)} className="w-full min-h-[48px] py-3 border-b border-outline-variant text-left break-words text-sm"><span className={task.status === 'Done' ? 'ink-done' : ''}>{task.title}</span></button>)}</div>
              {!tasks.some(task=>task.status===status) && <p className="text-xs text-outline py-2">暂无任务</p>}
            </div>)}
          </div>}
        </section>
        {/* 核心业务快速入口 */}
        <MobileListGroup title="协同导航">
          {onNavigateToTasks && (
            <MobileListItem
              leading={<AppIcon name="work" size={18} className="text-inherit" />}
              title="任务待办"
              subtitle="查看与分配当前项目的全部事项"
              onClick={onNavigateToTasks}
            />
          )}
          {onNavigateToKanban && (
            <MobileListItem
              leading={<AppIcon name="kanban" size={18} className="text-inherit" />}
              title="任务看板"
              subtitle="按状态轻触流转事项进度"
              onClick={onNavigateToKanban}
            />
          )}
          {onNavigateToAxis && (
            <MobileListItem
              leading={<AppIcon name="axis" size={18} className="text-inherit" />}
              title="人轴责任链"
              subtitle="直属领导、下属人员责任拓扑与汇报关系"
              onClick={onNavigateToAxis}
            />
          )}
          {onNavigateToKnowledge && (
            <MobileListItem
              leading={<AppIcon name="file" size={18} className="text-inherit" />}
              title="项目知识空间"
              subtitle="共享知识、授权总结与个人知识沉淀"
              onClick={onNavigateToKnowledge}
            />
          )}
        </MobileListGroup>


      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 10 项目设置
// -------------------------------------------------------------
export const MobileProjectSettingsScreen: React.FC<{
  projectId: number;
  onBack?: () => void;
  lang?: Language;
}> = ({ projectId, onBack, lang = 'zh' }) => {
  const [permissions, setPermissions] = useState<MyProjectPermissions | null>(null);
  const [project, setProject] = useState<BackendProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const [perm, proj] = await Promise.all([
          getMyPermissions(projectId),
          getProject(projectId),
        ]);
        if (active) {
          setPermissions(perm);
          setProject(proj);
        }
      } catch {
        /* ignore */
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchSettings();
    return () => {
      active = false;
    };
  }, [projectId]);

  const [nameDraft, setNameDraft] = useState('');
  useEffect(() => { if (project) setNameDraft(project.name); }, [project?.name]);
  if (loading) return <MobileLoadingState message="检查权限与加载设置…" />;
  const archived = project?.status === 'archived';
  const saveName = async () => {
    if (!nameDraft.trim() || nameDraft.trim() === project?.name) return;
    setBusy(true);
    try {
      await updateProjectInfo(projectId, { name: nameDraft.trim() });
      setProject(await getProject(projectId));
      notifyProjectsChanged();
      setMessage('项目名称已保存');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '保存失败');
    } finally { setBusy(false); }
  };
  const handleUnarchive = async () => {
    setBusy(true);
    try {
      await unarchiveProjectRequest(projectId);
      setProject(await getProject(projectId));
      notifyProjectsChanged();
      setMessage('已取消归档，项目恢复可编辑');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '取消归档失败');
    } finally { setBusy(false); }
  };

  const canEdit = permissions?.is_pm || permissions?.is_superadmin || permissions?.can_edit_all;

  const handleArchive = async () => {
    setBusy(true);
    setConfirmArchiveOpen(false);
    try {
      await archiveProjectRequest(projectId);
      setProject(await getProject(projectId));
      notifyProjectsChanged();
      setMessage('项目已归档，现在是只读状态');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '归档操作失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface dark:bg-surface text-on-surface dark:text-on-surface">
      <header className="h-14 px-4 bg-surface-container-lowest dark:bg-surface-container-lowest border-b border-outline-variant dark:border-outline-variant flex items-center justify-between shrink-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center -ml-2 text-on-surface-variant"
            aria-label="返回"
          >
            <AppIcon name="back" size={18} />
          </button>
        )}
        <h1 className="text-base font-medium tabular-nums">项目设置</h1>
        <div className="w-10" />
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {message && (
          <div className="p-3 rounded-xl bg-surface-container-lowest dark:bg-surface-container text-primary text-xs">
            {message}
          </div>
        )}

        {!canEdit && (
          <div className="p-4 rounded-xl bg-surface-container-lowest dark:bg-surface-container border border-outline-variant dark:border-[#d9a35b]/40 text-[#a86412] dark:text-[#d9a35b] text-xs flex items-center gap-2">
            <AppIcon name="warning" size={18} />
            <span>你当前是普通成员，仅项目管理员 (PM) 可修改项目关键设置或归档。</span>
          </div>
        )}

        <MobileListGroup title="项目信息">
          <MobileListItem
            title="项目名称"
            trailing={<span className="text-xs text-on-surface-variant">{project?.name}</span>}
            showChevron={false}
          />
          <MobileListItem
            title="当前角色"
            trailing={
              <span className="text-xs font-medium text-primary tabular-nums">
                {permissions?.is_pm ? '项目负责人 (PM)' : permissions?.is_superadmin ? '企业管理员' : '项目成员'}
              </span>
            }
            showChevron={false}
          />
          <MobileListItem
            title="数据隔离状态"
            trailing={<span className="text-xs text-[#2f7d4f]">独立沙箱安全隔离</span>}
            showChevron={false}
          />
        </MobileListGroup>

        {canEdit && !archived && (
          <div className="p-3 bg-surface-container-lowest dark:bg-surface-container rounded-xl border border-outline-variant dark:border-outline-variant flex gap-2">
            <input aria-label="项目名称" value={nameDraft} maxLength={200} onChange={(e) => setNameDraft(e.target.value)}
              className="flex-1 min-h-[44px] px-3 rounded-lg bg-surface-container dark:bg-surface-container-lowest text-sm" />
            <button type="button" disabled={busy} onClick={() => void saveName()} className="min-h-[44px] px-4 rounded-lg bg-primary text-on-primary text-sm font-medium disabled:opacity-40 tabular-nums">保存名称</button>
          </div>
        )}

        <CardTemplateEntry projectId={projectId} disabled={archived || busy} />
        {canManageProject(permissions) && <MobileReportPolicySettings key={projectId} projectId={projectId} canManage={canManageProject(permissions)} archived={archived} />}

        {canEdit && archived && (
          <MobileListGroup title="项目已归档（只读）">
            <MobileListItem title="取消归档" subtitle="恢复后项目可继续编辑" showChevron={false} showDivider={false} onClick={busy ? undefined : () => void handleUnarchive()} />
          </MobileListGroup>
        )}

        {canEdit && !archived && (
          <MobileListGroup title="危险操作区">
            <MobileListItem
              destructive
              leading={<AppIcon name="archive" size={18} className="text-inherit" />}
              title="归档此项目"
              subtitle="归档后项目变为只读，不再接收新的 AI 汇报与修改"
              onClick={() => setConfirmArchiveOpen(true)}
            />
          </MobileListGroup>
        )}
      </div>

      <MobileConfirm
        isOpen={confirmArchiveOpen}
        title="确认归档项目？"
        message="归档后项目所有任务、人轴与资料将转为只读历史存档，普通成员不可再提交新汇报。"
        confirmText="确认归档"
        destructive
        onConfirm={handleArchive}
        onCancel={() => setConfirmArchiveOpen(false)}
      />
    </div>
  );
};

// -------------------------------------------------------------
// 11 成员邀请
// -------------------------------------------------------------
export const MobileProjectInviteScreen: React.FC<{
  projectId: number;
  onBack?: () => void;
  lang?: Language;
}> = ({ projectId, onBack, lang = 'zh' }) => {
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteResult, setInviteResult] = useState<{
    token: string;
    expires_at?: string | null;
    notice: string;
    invite_url?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
      setError('请输入有效的受邀人员工作邮箱');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await inviteProjectMember(projectId, { email: inviteEmail.trim() });
      setInviteResult({
        token: res.token,
        expires_at: res.expires_at,
        invite_url: res.invite_url,
        notice: inviteDeliveryNotice(res, inviteEmail.trim()),
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '生成邀请失败');
    } finally {
      setBusy(false);
    }
  };

  const inviteLink = inviteResult
    ? inviteResult.invite_url || `${window.location.origin}?invite=${encodeURIComponent(inviteResult.token)}`
    : '';

  const handleCopy = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface dark:bg-surface text-on-surface dark:text-on-surface">
      <header className="h-14 px-4 bg-surface-container-lowest dark:bg-surface-container-lowest border-b border-outline-variant dark:border-outline-variant flex items-center justify-between shrink-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center -ml-2 text-on-surface-variant"
            aria-label="返回"
          >
            <AppIcon name="back" size={18} />
          </button>
        )}
        <h1 className="text-base font-medium tabular-nums">成员邀请</h1>
        <div className="w-10" />
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-md mx-auto w-full">
        {error && (
          <div className="p-3 rounded-xl bg-error-container dark:bg-error text-error dark:text-error text-xs flex items-center gap-2">
            <AppIcon name="alert" size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="p-4 bg-surface-container-lowest dark:bg-surface-container rounded-xl border border-outline-variant dark:border-outline-variant shadow-sm dark:shadow-none">
          <h2 className="text-sm font-medium mb-1 tabular-nums">发送项目邀请</h2>
          <p className="text-xs text-on-surface-variant mb-4">
            输入受邀同事的工作邮箱。公司已配置发信时会自动发送邀请邮件，同时生成可转发的链接。
          </p>

          <form onSubmit={handleSendInvite} className="space-y-3">
            <MobileField label="受邀人邮箱" required>
              <MobileInput
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                autoCapitalize="none"
                leading={<AppIcon name="mail" size={18} />}
              />
            </MobileField>

            <button
              type="submit"
              disabled={busy || !inviteEmail.trim()}
              className="min-h-[48px] w-full rounded-lg bg-primary text-on-primary font-medium text-sm shadow-sm dark:shadow-none active:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2 tabular-nums"
            >
              {busy ? '处理中…' : '生成并发送邀请'}
            </button>
          </form>
        </div>

        {inviteResult && (
          <div className="p-4 bg-surface-container-lowest dark:bg-surface-container rounded-xl border border-outline-variant dark:border-outline-variant shadow-sm dark:shadow-none space-y-3">
            <div className="flex items-center gap-2 text-[#2f7d4f] text-sm font-medium tabular-nums">
              <AppIcon name="check-circle" size={18} />
              <span>邀请凭证已生成</span>
            </div>

            <div className="p-3 bg-surface-container-lowest dark:bg-surface-container rounded-xl font-mono text-xs break-all text-on-surface dark:text-outline">
              {inviteLink}
            </div>

            {/* 重要设计审查提示：不把复制链接当成自动发送 */}
            <p className="text-xs text-[#a86412] dark:text-[#d9a35b] bg-surface-container dark:bg-surface-container p-2 rounded-lg leading-relaxed">
              {inviteResult?.notice}
            </p>

            <button
              type="button"
              onClick={handleCopy}
              className="min-h-[48px] w-full rounded-lg border border-primary text-primary dark:border-primary dark:text-primary font-medium text-sm flex items-center justify-center gap-2 active:bg-surface-container dark:active:bg-primary/90 tabular-nums"
            >
              <AppIcon name={copied ? 'check' : 'copy'} size={18} />
              <span>{copied ? '已复制邀请链接到剪贴板' : '复制专属邀请链接'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 81 接受项目邀请
// -------------------------------------------------------------
export const MobileInviteAcceptScreen: React.FC<{
  initialToken?: string;
  onAccepted: (result: { project_id: number; role: string }) => Promise<void> | void;
  onRequirePhoneVerify?: () => void;
  onCancel?: () => void;
  lang?: Language;
}> = ({
  initialToken = '',
  onAccepted,
  onRequirePhoneVerify,
  onCancel,
  lang = 'zh',
}) => {
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needPhone, setNeedPhone] = useState(false);

  const handleAccept = async (e?: React.FormEvent) => {
    e?.preventDefault();
    let cleanToken: string;
    try {
      cleanToken = parseInviteInput(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : '请粘贴有效的邀请码或邀请链接');
      return;
    }
    setBusy(true);
    setError(null);
    setNeedPhone(false);
    try {
      const res = await acceptProjectInvitation(cleanToken);
      await onAccepted(res);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 403 && err.message.includes('phone')) {
          setNeedPhone(true);
          setError('当前项目要求完成手机号实名验证后方可加入');
        } else if (err.code === 404 || err.code === 410) {
          setError('该邀请链接已失效或已被使用');
        } else {
          setError(err.message || '接受邀请失败');
        }
      } else {
        setError('接受邀请遇到未知错误');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface-container-lowest dark:bg-surface text-on-surface dark:text-on-surface">
      <header className="h-14 px-4 border-b border-outline-variant dark:border-outline-variant flex items-center justify-between shrink-0">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center -ml-2 text-on-surface-variant"
            aria-label="取消"
          >
            <AppIcon name="back" size={18} />
          </button>
        )}
        <h1 className="text-base font-medium tabular-nums">接受项目协同邀请</h1>
        <div className="w-10" />
      </header>

      <div className="flex-1 overflow-y-auto p-6 max-w-md mx-auto w-full flex flex-col justify-center">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-xl bg-surface-container-lowest dark:bg-surface-container text-primary flex items-center justify-center mx-auto mb-3 shadow-sm dark:shadow-none">
            <AppIcon name="share" size={18} />
          </div>
          <h2 className="text-xl font-medium tabular-nums">加入项目团队</h2>
          <p className="text-xs text-on-surface-variant mt-1">
            接受邀请后，您将获得该项目的任务协同与人轴汇报权限
          </p>
        </div>

        {error && (
          <div className="mb-4 p-4 rounded-xl bg-error-container dark:bg-error text-error dark:text-error text-xs flex items-center gap-2">
            <AppIcon name="alert" size={18} />
            <span>{error}</span>
          </div>
        )}

        {needPhone && onRequirePhoneVerify && (
          <button
            type="button"
            onClick={onRequirePhoneVerify}
            className="mb-4 min-h-[48px] w-full rounded-lg bg-[#a86412] text-on-surface font-medium text-xs flex items-center justify-center gap-2 tabular-nums"
          >
            <AppIcon name="phone" size={18} />
            <span>前往验证手机号后继续加入</span>
          </button>
        )}

        <form onSubmit={handleAccept} className="space-y-4">
          <MobileField label="邀请码" helperText="支持网页邀请链接和手机邀请链接" required>
            <MobileInput
              type="text"
              placeholder="粘贴邀请码或完整邀请链接"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="font-mono text-xs"
              leading={<AppIcon name="lock" size={18} />}
            />
          </MobileField>

          <button
            type="submit"
            disabled={busy || !token.trim()}
            className="min-h-[48px] w-full rounded-lg bg-primary text-on-primary font-medium text-base shadow-sm dark:shadow-none active:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2 tabular-nums"
          >
            {busy ? '正在加入…' : '接受并进入项目'}
          </button>
        </form>
      </div>
    </div>
  );
};
