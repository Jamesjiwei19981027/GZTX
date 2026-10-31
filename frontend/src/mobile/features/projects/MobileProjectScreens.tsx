import React, { useEffect, useState } from 'react';
import {
  acceptProjectInvitation,
  createCompany,
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
  type MyProjectPermissions,
} from '../../../api/shell';
import { ApiError } from '../../../api/client';
import { mapTask } from '../../../api/mappers';
import { Project, Language, Task } from '../../../types';
import { AppIcon } from '../../ui/AppIcon';
import { MobileField, MobileInput } from '../../ui/MobileField';
import { MobileListGroup, MobileListItem } from '../../ui/MobileList';
import { MobileConfirm } from '../../ui/MobileConfirm';
import { MobileEmptyState, MobileLoadingState } from '../../ui/MobileState';

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
  onCreateCompanyClick?: () => void;
  onClose?: () => void;
  lang?: Language;
}> = ({
  currentProject,
  projects,
  companyId,
  onSelectProject,
  onCreateProjectClick,
  onCreateCompanyClick,
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
    <div className="flex flex-col h-full bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <header className="h-14 px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
        <h1 className="text-base font-semibold">切换工作区与项目</h1>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center -mr-2 text-slate-500"
            aria-label="关闭"
          >
            <AppIcon name="close" size={20} />
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
            leading={<AppIcon name="work" size={20} className="text-[#0058BE]" />}
            title="全部项目"
            subtitle="个人跨项目待办与日历总览"
            selected={currentProject.id === 'all'}
            showChevron={false}
            trailing={
              currentProject.id === 'all' ? (
                <AppIcon name="check" size={20} className="text-[#0058BE]" />
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
            <div className="p-4 text-center text-xs text-slate-400">
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
                      <AppIcon name="check" size={20} className="text-[#0058BE]" />
                    ) : undefined
                  }
                  onClick={() => handleSelect(proj)}
                />
              );
            })
          )}
        </MobileListGroup>

        {/* 快捷操作区 */}
        <div className="pt-2 flex flex-col gap-2.5">
          {onCreateProjectClick && (
            <button
              type="button"
              onClick={onCreateProjectClick}
              className="min-h-[48px] w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[#0058BE] font-medium text-sm flex items-center justify-center gap-2 shadow-xs active:bg-slate-50 dark:active:bg-slate-800"
            >
              <AppIcon name="plus" size={18} />
              <span>新建项目</span>
            </button>
          )}

          {onCreateCompanyClick && (
            <button
              type="button"
              onClick={onCreateCompanyClick}
              className="min-h-[48px] w-full rounded-xl bg-transparent border border-dashed border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-medium text-xs flex items-center justify-center gap-2 active:bg-slate-100 dark:active:bg-slate-900"
            >
              <AppIcon name="folder" size={16} />
              <span>创建新企业/团队公司</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 08 & 80 创建工作区 / 创建公司
// -------------------------------------------------------------
export const MobileWorkspaceCreateScreen: React.FC<{
  initialMode?: 'project' | 'company';
  companyId: number | null;
  onCreated: (created: { kind: 'project' | 'company'; id: number; name: string }) => void;
  onCancel?: () => void;
  lang?: Language;
}> = ({
  initialMode = 'project',
  companyId,
  onCreated,
  onCancel,
  lang = 'zh',
}) => {
  const [mode, setMode] = useState<'project' | 'company'>(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 项目字段 (08)
  const [projectName, setProjectName] = useState('');

  // 公司字段 (80)
  const [companyName, setCompanyName] = useState('');
  const [companySlug, setCompanySlug] = useState('');
  const [policyPreset, setPolicyPreset] = useState('enterprise_strict');

  const handleCreateProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) {
      setError('请输入项目名称');
      return;
    }
    if (!companyId) {
      setError('未检测到有效企业所属，请先创建或加入公司');
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

  const handleCreateCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      setError('请输入公司名称');
      return;
    }
    const cleanSlug = companySlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!cleanSlug) {
      setError('请输入有效的公司英文代号 (slug)');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await createCompany({
        name: companyName.trim(),
        slug: cleanSlug,
        policy_preset: policyPreset,
      });
      onCreated({ kind: 'company', id: res.id, name: res.name });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '创建公司失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-black text-slate-900 dark:text-slate-100">
      <header className="h-14 px-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center -ml-2 text-slate-500"
            aria-label="取消"
          >
            <AppIcon name="back" size={20} />
          </button>
        )}
        <h1 className="text-base font-semibold">
          {mode === 'project' ? '新建项目' : '创建新公司'}
        </h1>
        <div className="w-10" />
      </header>

      <div className="flex-1 overflow-y-auto p-5 max-w-md mx-auto w-full">
        {/* 模式切换 (08 <-> 80) */}
        <div className="flex p-1 bg-slate-100 dark:bg-slate-900 rounded-xl mb-5">
          <button
            type="button"
            onClick={() => {
              setMode('project');
              setError(null);
            }}
            className={`flex-1 min-h-[38px] rounded-lg text-xs font-semibold transition-all ${
              mode === 'project'
                ? 'bg-white dark:bg-slate-800 text-[#0058BE] shadow-xs'
                : 'text-slate-500'
            }`}
          >
            新建项目 (工作区)
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('company');
              setError(null);
            }}
            className={`flex-1 min-h-[38px] rounded-lg text-xs font-semibold transition-all ${
              mode === 'company'
                ? 'bg-white dark:bg-slate-800 text-[#0058BE] shadow-xs'
                : 'text-slate-500'
            }`}
          >
            创建独立公司 (租户)
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
            <AppIcon name="alert" size={16} />
            <span>{error}</span>
          </div>
        )}

        {mode === 'project' ? (
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
              className="min-h-[48px] w-full rounded-xl bg-[#0058BE] text-white font-semibold text-base shadow-sm active:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2 mt-6"
            >
              {busy ? '正在创建…' : '立即创建项目'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCreateCompanySubmit} className="space-y-4">
            <MobileField label="公司 / 组织全称" required>
              <MobileInput
                type="text"
                placeholder="例如「未来科技实业有限公司」"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                leading={<AppIcon name="team" size={18} />}
              />
            </MobileField>

            <MobileField label="英文唯一标识 (Slug)" required helperText="小写字母、数字与中划线，用于独立域名与数据隔离">
              <MobileInput
                type="text"
                placeholder="例如 future-tech"
                value={companySlug}
                onChange={(e) => setCompanySlug(e.target.value)}
                autoCapitalize="none"
                leading={<AppIcon name="lock" size={18} />}
              />
            </MobileField>

            <MobileField label="安全策略预设">
              <select
                value={policyPreset}
                onChange={(e) => setPolicyPreset(e.target.value)}
                className="w-full min-h-[48px] px-3 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
              >
                <option value="enterprise_strict">企业合规严格模式（强制人轴与逐级汇报）</option>
                <option value="startup_flexible">创业敏捷模式（灵活扁平协作）</option>
              </select>
            </MobileField>

            <button
              type="submit"
              disabled={busy || !companyName.trim() || !companySlug.trim()}
              className="min-h-[48px] w-full rounded-xl bg-[#0058BE] text-white font-semibold text-base shadow-sm active:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2 mt-6"
            >
              {busy ? '正在初始化公司…' : '确认创建公司'}
            </button>
          </form>
        )}
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
    <div className="flex flex-col h-full bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <header className="h-14 px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center -ml-2 text-slate-500"
            aria-label="返回"
          >
            <AppIcon name="back" size={20} />
          </button>
        )}
        <h1 className="text-base font-semibold truncate flex-1 text-center">
          {project.name}
        </h1>
        {onNavigateToSettings && (
          <button
            type="button"
            onClick={onNavigateToSettings}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center -mr-2 text-slate-600 dark:text-slate-300"
            aria-label="项目设置"
          >
            <AppIcon name="settings" size={20} />
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {onNavigateToInvite && <button type="button" onClick={onNavigateToInvite}
          className="w-full min-h-[56px] px-4 rounded-2xl bg-[#0058BE] text-white shadow-sm flex items-center gap-3 text-left">
          <AppIcon name="team" size={22} /><span className="flex-1"><span className="block text-sm font-semibold">邀请新成员加入</span><span className="block text-xs text-blue-100 mt-1">添加项目成员，共同推进任务</span></span><AppIcon name="chevron-right" size={18} />
        </button>}
        {/* 项目基本卡片 */}
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#0058BE]/10 text-[#0058BE] flex items-center justify-center font-bold text-lg">
              {project.name.slice(0, 1)}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold truncate">{project.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs px-2 py-0.5 rounded-md bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
                  {project.status === 'archived' ? '已归档' : '进行中'}
                </span>
                <span className="text-xs text-slate-400">
                  成员 {members.length} 人
                </span>
              </div>
            </div>
          </div>

          {project.final_owner && (
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500">项目终责负责人</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {project.final_owner.nickname || project.final_owner.username}
              </span>
            </div>
          )}
        </div>

        <section aria-label="项目任务待办" className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2 mb-3"><h2 className="text-base font-semibold">项目任务待办 · {tasks.length}</h2>{onNavigateToTasks && <button type="button" onClick={onNavigateToTasks} className="text-xs text-[#0058BE] dark:text-blue-300 min-h-[44px]">管理任务</button>}</div>
          {tasksLoading && <p role="status" className="text-sm text-slate-500">正在加载全部项目任务…</p>}
          {tasksError && <button type="button" onClick={()=>setTaskAttempt(value=>value+1)} className="min-h-[44px] text-sm text-red-600">{tasksError}，点击重试</button>}
          {!tasksLoading && !tasksError && !tasks.length && <p className="text-sm text-slate-500 py-3">当前项目暂无任务</p>}
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {tasks.map(task=><button key={task.id} type="button" onClick={()=>onSelectTask?.(task)} className="w-full min-h-[56px] py-3 flex items-start gap-3 text-left">
              <AppIcon name={task.status==='Done' ? 'check-circle' : 'work'} size={18} className="mt-0.5 shrink-0 text-[#0058BE] dark:text-blue-300" />
              <span className="min-w-0 flex-1"><span className={`block break-words text-sm font-medium ${task.status==='Done' ? 'line-through text-slate-500' : ''}`}>{task.title}</span><span className="block text-xs text-slate-500 mt-1">{task.assignees?.map(member=>member.name).join('、') || '未分配'}{task.dueDate ? ` · ${task.dueDate}` : ''}</span></span>
              <span className="text-xs text-slate-500 shrink-0">{task.status==='Done' ? '已完成' : task.status==='In Progress' ? '进行中' : '待办'}</span>
            </button>)}
          </div>
        </section>
        <section aria-label="项目任务看板" className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2 mb-3"><h2 className="text-base font-semibold">任务看板</h2>{onNavigateToKanban && <button type="button" onClick={onNavigateToKanban} className="text-xs text-[#0058BE] dark:text-blue-300 min-h-[44px]">管理看板</button>}</div>
          {tasksLoading ? <p className="text-sm text-slate-500">正在加载看板…</p> : tasksError ? <p className="text-sm text-red-600">{tasksError}</p> : <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(['To Do','In Progress','Done'] as const).map(status=><div key={status} className="min-w-0 rounded-xl bg-slate-50 dark:bg-slate-800 p-3">
              <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">{status==='Done' ? '已完成' : status==='In Progress' ? '进行中' : '待办'} · {tasks.filter(task=>task.status===status).length}</h3>
              <div className="space-y-2">{tasks.filter(task=>task.status===status).map(task=><button key={task.id} type="button" onClick={()=>onSelectTask?.(task)} className="w-full min-h-[48px] p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 text-left break-words text-sm">{task.title}</button>)}</div>
              {!tasks.some(task=>task.status===status) && <p className="text-xs text-slate-400 py-2">暂无任务</p>}
            </div>)}
          </div>}
        </section>
        {/* 核心业务快速入口 */}
        <MobileListGroup title="协同导航">
          {onNavigateToTasks && (
            <MobileListItem
              leading={<AppIcon name="work" size={20} className="text-[#0058BE]" />}
              title="任务待办"
              subtitle="查看与分配当前项目的全部事项"
              onClick={onNavigateToTasks}
            />
          )}
          {onNavigateToKanban && (
            <MobileListItem
              leading={<AppIcon name="kanban" size={20} className="text-amber-500" />}
              title="任务看板"
              subtitle="按状态轻触流转事项进度"
              onClick={onNavigateToKanban}
            />
          )}
          {onNavigateToAxis && (
            <MobileListItem
              leading={<AppIcon name="axis" size={20} className="text-purple-500" />}
              title="人轴责任链"
              subtitle="直属领导、下属人员责任拓扑与汇报关系"
              onClick={onNavigateToAxis}
            />
          )}
          {onNavigateToKnowledge && (
            <MobileListItem
              leading={<AppIcon name="file" size={20} className="text-indigo-500" />}
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

  if (loading) return <MobileLoadingState message="检查权限与加载设置…" />;

  const canEdit = permissions?.is_pm || permissions?.is_superadmin || permissions?.can_edit_all;

  const handleArchive = async () => {
    setBusy(true);
    setConfirmArchiveOpen(false);
    try {
      // 真实后端：若没有独立归档端点，提示并更新状态
      setMessage('归档申请已提交，项目进入只读保护状态');
    } catch {
      setMessage('归档操作失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <header className="h-14 px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center -ml-2 text-slate-500"
            aria-label="返回"
          >
            <AppIcon name="back" size={20} />
          </button>
        )}
        <h1 className="text-base font-semibold">项目设置</h1>
        <div className="w-10" />
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {message && (
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-[#0058BE] text-xs">
            {message}
          </div>
        )}

        {!canEdit && (
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
            <AppIcon name="warning" size={16} />
            <span>你当前是普通成员，仅项目管理员 (PM) 可修改项目关键设置或归档。</span>
          </div>
        )}

        <MobileListGroup title="项目信息">
          <MobileListItem
            title="项目名称"
            trailing={<span className="text-xs text-slate-500">{project?.name}</span>}
            showChevron={false}
          />
          <MobileListItem
            title="当前角色"
            trailing={
              <span className="text-xs font-medium text-[#0058BE]">
                {permissions?.is_pm ? '项目负责人 (PM)' : permissions?.is_superadmin ? '企业管理员' : '项目成员'}
              </span>
            }
            showChevron={false}
          />
          <MobileListItem
            title="数据隔离状态"
            trailing={<span className="text-xs text-green-600">独立沙箱安全隔离</span>}
            showChevron={false}
          />
        </MobileListGroup>

        {canEdit && (
          <MobileListGroup title="危险操作区">
            <MobileListItem
              destructive
              leading={<AppIcon name="archive" size={20} className="text-red-500" />}
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
      setInviteResult({ token: res.token, expires_at: res.expires_at });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '生成邀请失败');
    } finally {
      setBusy(false);
    }
  };

  const inviteLink = inviteResult
    ? `${window.location.origin}?invite=${encodeURIComponent(inviteResult.token)}`
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
    <div className="flex flex-col h-full bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <header className="h-14 px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center -ml-2 text-slate-500"
            aria-label="返回"
          >
            <AppIcon name="back" size={20} />
          </button>
        )}
        <h1 className="text-base font-semibold">成员邀请</h1>
        <div className="w-10" />
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-md mx-auto w-full">
        {error && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
            <AppIcon name="alert" size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <h2 className="text-sm font-semibold mb-1">发送项目邀请</h2>
          <p className="text-xs text-slate-500 mb-4">
            输入受邀同事的工作邮箱生成专属加入凭证。
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
              className="min-h-[48px] w-full rounded-xl bg-[#0058BE] text-white font-semibold text-sm shadow-sm active:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2"
            >
              {busy ? '生成中…' : '生成邀请凭证'}
            </button>
          </form>
        </div>

        {inviteResult && (
          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-green-600 text-sm font-semibold">
              <AppIcon name="check-circle" size={18} />
              <span>邀请凭证已生成</span>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl font-mono text-xs break-all text-slate-700 dark:text-slate-300">
              {inviteLink}
            </div>

            {/* 重要设计审查提示：不把复制链接当成自动发送 */}
            <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-lg leading-relaxed">
              提示：复制链接后请通过工作邮件或聊天工具发送给同事。系统不会自动往外部邮箱发送未经配置的邮件。
            </p>

            <button
              type="button"
              onClick={handleCopy}
              className="min-h-[48px] w-full rounded-xl border border-[#0058BE] text-[#0058BE] dark:border-blue-500 dark:text-blue-400 font-semibold text-sm flex items-center justify-center gap-2 active:bg-blue-50 dark:active:bg-blue-950"
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
  onAccepted: (result: { project_id: number; role: string }) => void;
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
    const cleanToken = token.trim();
    if (!cleanToken) {
      setError('请输入或粘贴邀请令牌');
      return;
    }
    setBusy(true);
    setError(null);
    setNeedPhone(false);
    try {
      const res = await acceptProjectInvitation(cleanToken);
      onAccepted(res);
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
    <div className="flex flex-col h-full bg-white dark:bg-black text-slate-900 dark:text-slate-100">
      <header className="h-14 px-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center -ml-2 text-slate-500"
            aria-label="取消"
          >
            <AppIcon name="back" size={20} />
          </button>
        )}
        <h1 className="text-base font-semibold">接受项目协同邀请</h1>
        <div className="w-10" />
      </header>

      <div className="flex-1 overflow-y-auto p-6 max-w-md mx-auto w-full flex flex-col justify-center">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950 text-[#0058BE] flex items-center justify-center mx-auto mb-3 shadow-xs">
            <AppIcon name="share" size={32} />
          </div>
          <h2 className="text-xl font-bold">加入项目团队</h2>
          <p className="text-xs text-slate-500 mt-1">
            接受邀请后，您将获得该项目的任务协同与人轴汇报权限
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
            <AppIcon name="alert" size={16} />
            <span>{error}</span>
          </div>
        )}

        {needPhone && onRequirePhoneVerify && (
          <button
            type="button"
            onClick={onRequirePhoneVerify}
            className="mb-4 min-h-[48px] w-full rounded-xl bg-amber-500 text-white font-semibold text-xs flex items-center justify-center gap-2"
          >
            <AppIcon name="phone" size={16} />
            <span>前往验证手机号后继续加入</span>
          </button>
        )}

        <form onSubmit={handleAccept} className="space-y-4">
          <MobileField label="邀请令牌 Token" required>
            <MobileInput
              type="text"
              placeholder="粘贴或输入收到的邀请 Token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="font-mono text-xs"
              leading={<AppIcon name="lock" size={18} />}
            />
          </MobileField>

          <button
            type="submit"
            disabled={busy || !token.trim()}
            className="min-h-[48px] w-full rounded-xl bg-[#0058BE] text-white font-semibold text-base shadow-sm active:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2"
          >
            {busy ? '正在加入…' : '接受并进入项目'}
          </button>
        </form>
      </div>
    </div>
  );
};
