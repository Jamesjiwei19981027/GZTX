import React, { useEffect, useState, useMemo } from 'react';
import { WorkbenchOverview } from '../../../components/WorkbenchOverview';
import { WorkAssistantEntry } from '../../../components/WorkAssistantEntry';
import { TaskTrendCard } from '../../../components/TaskTrendCard';
import type { TaskWorkspaceScope } from '../../../utils/taskWorkspace';
import {
  listTrashTasks,
  restoreTask,
  type BackendTask,
} from '../../../api/backend';
import { ApiError } from '../../../api/client';
import { mapTask } from '../../../api/mappers';
import { Task, Project, Activity, UserProfile, Language, Status } from '../../../types';
import { AppIcon } from '../../ui/AppIcon';
import { MobileInput } from '../../ui/MobileField';
import { MobileListGroup, MobileListItem } from '../../ui/MobileList';
import { MobileEmptyState, MobileLoadingState } from '../../ui/MobileState';
import { MobileConfirm } from '../../ui/MobileConfirm';

// -------------------------------------------------------------
// 05 & 06 移动端工作台 (员工工作台 / 管理者工作台模式)
// -------------------------------------------------------------
export interface MobileWorkbenchProps {
  user: UserProfile;
  tasks: Task[];
  projects: Project[];
  currentProject: Project;
  activities: Activity[];
  onSelectTask: (task: Task) => void;
  onOpenNewTask: () => void;
  onOpenQuickAdd: () => void;
  onOpenSearch: () => void;
  onNavigateToTasks: () => void;
  onNavigateToKanban: (scope?: TaskWorkspaceScope) => void;
  onNavigateToCalendar: () => void;
  onNavigateToStatistics: () => void;
  onNavigateToTrash: () => void;
  onNavigateToAxis?: () => void;
  onNavigateToAssistant?: (action: 'progress' | 'reports') => void;
  onOpenProject?: (project: Project) => void;
  onOpenProjects?: () => void;
  onToggleTaskCompletion?: (task: Task) => void;
  onEditScheduledTask?: (task: Task) => void;
  onOpenNewTaskWithDate?: (date: string) => void;
  lang?: Language;
}

export const MobileWorkbenchScreen: React.FC<MobileWorkbenchProps> = ({
  user,
  tasks,
  projects,
  currentProject,
  activities,
  onSelectTask,
  onOpenNewTask,
  onOpenQuickAdd,
  onOpenSearch,
  onNavigateToTasks,
  onNavigateToKanban,
  onNavigateToCalendar,
  onNavigateToStatistics,
  onNavigateToTrash,
  onNavigateToAxis,
  onNavigateToAssistant,
  onOpenProject,
  onOpenProjects,
  onToggleTaskCompletion,
  onEditScheduledTask,
  onOpenNewTaskWithDate,
  lang = 'zh',
}) => {
  // 角色工作台模式切换：员工工作台 (05) vs 管理者工作台 (06)
  const isManagerRole =
    user.role === 'PM' ||
    user.role === '项目负责人' ||
    user.role === '管理员' ||
    user.role === '总领导' ||
    user.role === '主管';

  const [workbenchMode, setWorkbenchMode] = useState<'employee' | 'manager'>(
    isManagerRole ? 'manager' : 'employee',
  );

  const todayStr = useMemo(() => { const day=new Date(); return `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`; }, []);

  // 任务分流统计（真实可见数据）
  const stats = useMemo(() => {
    const total = tasks.length;
    const pending = tasks.filter((t) => t.status === 'To Do');
    const inProgress = tasks.filter((t) => t.status === 'In Progress');
    const done = tasks.filter((t) => t.status === 'Done');
    const dueToday = tasks.filter((t) => t.dueDate === todayStr && t.status !== 'Done');
    const overdue = tasks.filter((t) => t.dueDate && t.dueDate < todayStr && t.status !== 'Done');
    const highPriority = tasks.filter((t) => t.priority === 'High' && t.status !== 'Done');

    return {
      total,
      pending,
      inProgress,
      done,
      dueToday,
      overdue,
      highPriority,
    };
  }, [tasks, todayStr]);

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-y-auto pb-16 bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      {/* 顶部工作台头部 */}
      <div className="bg-white dark:bg-slate-900 px-5 pt-4 pb-3 border-b border-slate-200/80 dark:border-slate-800 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="w-10 h-10 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-[#0058BE]/10 text-[#0058BE] font-bold text-sm flex items-center justify-center shrink-0">
                {user.name.slice(0, 1)}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate text-slate-900 dark:text-white">
                {user.name}
              </div>
              <button type="button" aria-label="项目列表" onClick={onOpenProjects}
                className="min-h-[44px] max-w-full flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                <AppIcon name="folder" size={14} /><span className="truncate">{currentProject.name}</span><AppIcon name="chevron-right" size={14} />
              </button>
            </div>
          </div>


        </div>

        {/* 员工 (05) 与 管理者 (06) 视图切换 */}
        {isManagerRole && (
          <div className="flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-xl mt-3">
            <button
              type="button"
              onClick={() => setWorkbenchMode('employee')}
              className={`flex-1 min-h-[34px] rounded-lg text-xs font-semibold transition-all ${
                workbenchMode === 'employee'
                  ? 'bg-white dark:bg-slate-700 text-[#0058BE] shadow-xs'
                  : 'text-slate-500'
              }`}
            >
              员工待办视图 (05)
            </button>
            <button
              type="button"
              onClick={() => setWorkbenchMode('manager')}
              className={`flex-1 min-h-[34px] rounded-lg text-xs font-semibold transition-all ${
                workbenchMode === 'manager'
                  ? 'bg-white dark:bg-slate-700 text-[#0058BE] shadow-xs'
                  : 'text-slate-500'
              }`}
            >
              管理者全貌视图 (06)
            </button>
          </div>
        )}
      </div>

      <div className="p-4 space-y-4">
        <section aria-label="重点待办与跟进">
            {/* 聚焦：今日待办与紧急事项 */}
            <MobileListGroup
              title="重点待办与跟进"
              footer={
                tasks.filter(t => t.status !== 'Done').length > 5
                  ? `显示前 5 项待办，共 ${tasks.filter(t => t.status !== 'Done').length} 项`
                  : undefined
              }
            >
              {tasks.filter((t) => t.status !== 'Done').length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  暂无待办事项
                </div>
              ) : (
                tasks
                  .filter((t) => t.status !== 'Done')
                  .sort((a, b) => `${a.dueDate || '9999-12-31'}T${a.dueTime || '23:59'}`.localeCompare(`${b.dueDate || '9999-12-31'}T${b.dueTime || '23:59'}`))
                  .slice(0, 5)
                  .map((task) => (
                    <MobileListItem
                      key={task.id}
                      leading={
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleTaskCompletion?.(task);
                          }}
                          className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center text-slate-400 hover:text-green-600"
                          aria-label="完成任务"
                        >
                          <div className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-600 flex items-center justify-center" />
                        </button>
                      }
                      title={task.title}
                      subtitle={
                        <div className="flex items-center gap-2 mt-0.5">
                          {task.dueDate && (
                            <span
                              className={`text-[11px] ${
                                task.dueDate < todayStr ? 'text-red-500 font-medium' : 'text-slate-400'
                              }`}
                            >
                              {task.dueDate === todayStr ? '今日到期' : task.dueDate}
                            </span>
                          )}
                          {task.priority === 'High' && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-red-50 text-red-600 font-medium">
                              高优
                            </span>
                          )}
                        </div>
                      }
                      onClick={() => onSelectTask(task)}
                    />
                  ))
              )}
            </MobileListGroup>
        </section>
        {onNavigateToAssistant && <WorkAssistantEntry onOpen={onNavigateToAssistant} lang={lang} />}
        <section aria-label="待办汇总" className="grid grid-cols-3 gap-2.5">
          {[{label:'待办事项',count:stats.pending.length+stats.inProgress.length,scope:'pending' as const},
            {label:'今日到期',count:stats.dueToday.length,scope:'today' as const},
            {label:'已逾期',count:stats.overdue.length,scope:'overdue' as const}].map(item=><button key={item.label} type="button" onClick={()=>onNavigateToKanban(item.scope)}
              className="min-h-[80px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-center items-center gap-1">
              <span className="text-[11px] text-slate-500">{item.label}</span><span className="text-xl font-bold text-[#0058BE] dark:text-blue-300">{item.count}</span>
            </button>)}
        </section>
        <TaskTrendCard projectId={currentProject.id} tasks={tasks} />
        <WorkbenchOverview tasks={tasks} projects={projects} currentProject={currentProject}
          onSelectTask={onSelectTask} onEditScheduledTask={onEditScheduledTask} onOpenNewTaskWithDate={onOpenNewTaskWithDate}
          onOpenCalendar={onNavigateToCalendar} onOpenProject={onOpenProject} />
        <button type="button" onClick={onOpenNewTask} className="min-h-[48px] w-full rounded-2xl bg-[#0058BE] text-white font-semibold flex items-center justify-center gap-2">
          <AppIcon name="plus" size={18} /><span>新建任务</span>
        </button>
        {workbenchMode === 'manager' && (
          /* ---------------- 06: 管理者工作台主体 ---------------- */
          <>
            {/* 管理者风险指标 */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="p-3 bg-white dark:bg-slate-900 rounded-2xl border border-red-200 dark:border-red-900/40 shadow-xs flex flex-col items-center justify-center text-center">
                <span className="text-[11px] text-red-500">逾期风险</span>
                <span className="text-xl font-bold text-red-500 mt-0.5">
                  {stats.overdue.length}
                </span>
              </div>

              <div className="p-3 bg-white dark:bg-slate-900 rounded-2xl border border-amber-200 dark:border-amber-900/40 shadow-xs flex flex-col items-center justify-center text-center">
                <span className="text-[11px] text-amber-600">高优先待办</span>
                <span className="text-xl font-bold text-amber-600 mt-0.5">
                  {stats.highPriority.length}
                </span>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={onNavigateToStatistics}
                className="p-3 bg-white dark:bg-slate-900 rounded-2xl border border-blue-200 dark:border-blue-900/40 shadow-xs flex flex-col items-center justify-center text-center cursor-pointer active:bg-slate-50"
              >
                <span className="text-[11px] text-[#0058BE]">事项总数</span>
                <span className="text-xl font-bold text-[#0058BE] mt-0.5">
                  {stats.total}
                </span>
              </div>
            </div>

            {/* 人轴与团队直达 */}
            {onNavigateToAxis && (
              <div
                role="button"
                tabIndex={0}
                onClick={onNavigateToAxis}
                className="p-4 rounded-2xl bg-gradient-to-r from-[#0058BE] to-blue-700 text-white shadow-sm flex items-center justify-between cursor-pointer active:opacity-95"
              >
                <div>
                  <div className="text-sm font-bold">人轴责任拓扑</div>
                  <div className="text-xs text-blue-100 mt-0.5">
                    查看直属下属、责任节点与逐级汇报链条
                  </div>
                </div>
                <AppIcon name="arrow-right" size={20} className="text-white" />
              </div>
            )}

            {/* 风险待审事项列表 */}
            <MobileListGroup
              title="重点风险与逾期事项"
              footer="数据来自项目实时同步，管理者可进入人轴下达指示或重新分配。"
            >
              {stats.overdue.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  当前项目无逾期滞纳事项
                </div>
              ) : (
                stats.overdue.slice(0, 5).map((task) => (
                  <MobileListItem
                    key={task.id}
                    leading={
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                    }
                    title={task.title}
                    subtitle={`截止日期: ${task.dueDate} · 已逾期`}
                    trailing={
                      <span className="text-xs text-red-500 font-medium">需介入</span>
                    }
                    onClick={() => onSelectTask(task)}
                  />
                ))
              )}
            </MobileListGroup>

            {/* 项目动态与活动流 */}
            <MobileListGroup title="最近团队动态">
              {activities.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">暂无活动记录</div>
              ) : (
                activities.slice(0, 5).map((act) => (
                  <MobileListItem
                    key={act.id}
                    leading={
                      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
                        <AppIcon name="clock" size={16} />
                      </div>
                    }
                    title={act.titleText}
                    subtitle={act.targetText}
                    trailing={
                      <span className="text-[11px] text-slate-400">
                        {act.timestamp.slice(11, 16) || '刚刚'}
                      </span>
                    }
                    showChevron={false}
                  />
                ))
              )}
            </MobileListGroup>
          </>
        )}
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 64 回收站 (软删除任务恢复与分页列表)
// -------------------------------------------------------------
export const MobileTrashScreen: React.FC<{
  onRestored?: (restored: BackendTask) => void;
  onBack?: () => void;
  lang?: Language;
}> = ({ onRestored, onBack, lang = 'zh' }) => {
  const [trashTasks, setTrashTasks] = useState<BackendTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchTrash = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listTrashTasks({ page: 1, page_size: 50 });
      setTrashTasks(res.items || []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '加载回收站失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrash();
  }, []);

  const handleRestore = async (id: number) => {
    setBusyId(id);
    setError(null);
    try {
      const restored = await restoreTask(id);
      setTrashTasks((prev) => prev.filter((t) => t.id !== id));
      setSuccessMsg(`任务「${restored.title}」已成功恢复`);
      onRestored?.(restored);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '恢复任务失败');
    } finally {
      setBusyId(null);
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
        <h1 className="text-base font-semibold">回收站</h1>
        <div className="w-10" />
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 text-red-600 text-xs flex items-center gap-2">
            <AppIcon name="alert" size={16} />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 rounded-xl bg-green-50 text-green-700 text-xs flex items-center gap-2">
            <AppIcon name="check-circle" size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* 提示文案：30 天软删保留 */}
        <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-[#0058BE] rounded-xl text-xs flex items-start gap-2">
          <AppIcon name="info" size={16} className="shrink-0 mt-0.5" />
          <span>
            回收站中的任务将保留 30 天，期间可随时一键恢复到项目待办中；逾期将由系统自动永久清除。
          </span>
        </div>

        {loading ? (
          <MobileLoadingState message="载入回收站事项…" />
        ) : trashTasks.length === 0 ? (
          <MobileEmptyState
            title="回收站空空如也"
            description="最近未有被删除的任务"
          />
        ) : (
          <MobileListGroup title={`软删事项 (${trashTasks.length})`}>
            {trashTasks.map((task) => (
              <MobileListItem
                key={task.id}
                title={task.title}
                subtitle={
                  task.deleted_at
                    ? `删除时间: ${task.deleted_at.slice(0, 16).replace('T', ' ')}`
                    : '已软删除'
                }
                showChevron={false}
                trailing={
                  <button
                    type="button"
                    disabled={busyId === task.id}
                    onClick={() => handleRestore(task.id)}
                    className="min-h-[40px] px-3.5 rounded-xl bg-[#0058BE] text-white text-xs font-semibold flex items-center gap-1 active:opacity-90 disabled:opacity-40"
                  >
                    <AppIcon name="undo" size={14} />
                    <span>{busyId === task.id ? '恢复中…' : '恢复'}</span>
                  </button>
                }
              />
            ))}
          </MobileListGroup>
        )}
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 65 全局搜索 (事项 / 项目 / 分类跨维度搜索)
// -------------------------------------------------------------
export const MobileGlobalSearchScreen: React.FC<{
  tasks: Task[];
  projects: Project[];
  onSelectTask: (task: Task) => void;
  onSelectProject: (proj: Project) => void;
  onClose?: () => void;
  lang?: Language;
}> = ({ tasks, projects, onSelectTask, onSelectProject, onClose, lang = 'zh' }) => {
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'tasks' | 'projects'>('all');

  const filteredTasks = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        (t.tag || '').toLowerCase().includes(q),
    );
  }, [tasks, query]);

  const filteredProjects = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q),
    );
  }, [projects, query]);

  return (
    <div className="flex flex-col h-full bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <header className="h-14 px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0">
        <div className="flex-1">
          <MobileInput
            placeholder="搜索任务标题、项目、标签…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            clearable
            onClear={() => setQuery('')}
            autoFocus
            leading={<AppIcon name="search" size={18} />}
          />
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-2 text-sm text-[#0058BE] font-medium shrink-0"
          >
            取消
          </button>
        )}
      </header>

      {/* 搜索分类过滤栏 */}
      <div className="px-4 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setFilterType('all')}
          className={`min-h-[34px] px-3.5 rounded-full text-xs font-medium transition-colors ${
            filterType === 'all'
              ? 'bg-[#0058BE] text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
          }`}
        >
          全部结果
        </button>
        <button
          type="button"
          onClick={() => setFilterType('tasks')}
          className={`min-h-[34px] px-3.5 rounded-full text-xs font-medium transition-colors ${
            filterType === 'tasks'
              ? 'bg-[#0058BE] text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
          }`}
        >
          事项 ({filteredTasks.length})
        </button>
        <button
          type="button"
          onClick={() => setFilterType('projects')}
          className={`min-h-[34px] px-3.5 rounded-full text-xs font-medium transition-colors ${
            filterType === 'projects'
              ? 'bg-[#0058BE] text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
          }`}
        >
          项目 ({filteredProjects.length})
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!query.trim() ? (
          <div className="py-16 text-center text-xs text-slate-400">
            请输入关键词检索事项待办、项目或相关标签
          </div>
        ) : filteredTasks.length === 0 && filteredProjects.length === 0 ? (
          <MobileEmptyState
            title="无匹配结果"
            description={`未找到与「${query}」相关的任务或项目`}
          />
        ) : (
          <>
            {/* 项目结果 */}
            {(filterType === 'all' || filterType === 'projects') && filteredProjects.length > 0 && (
              <MobileListGroup title={`匹配项目 (${filteredProjects.length})`}>
                {filteredProjects.map((p) => (
                  <MobileListItem
                    key={p.id}
                    leading={<AppIcon name="folder" size={20} className="text-[#0058BE]" />}
                    title={p.name}
                    subtitle={p.description || '项目工作区'}
                    onClick={() => {
                      onSelectProject(p);
                      onClose?.();
                    }}
                  />
                ))}
              </MobileListGroup>
            )}

            {/* 任务结果 */}
            {(filterType === 'all' || filterType === 'tasks') && filteredTasks.length > 0 && (
              <MobileListGroup title={`匹配事项 (${filteredTasks.length})`}>
                {filteredTasks.map((t) => (
                  <MobileListItem
                    key={t.id}
                    leading={
                      <div
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          t.status === 'Done'
                            ? 'bg-green-500'
                            : t.status === 'In Progress'
                              ? 'bg-blue-500'
                              : 'bg-slate-400'
                        }`}
                      />
                    }
                    title={t.title}
                    subtitle={
                      <div className="flex items-center gap-2 mt-0.5">
                        {t.dueDate && <span className="text-[11px] text-slate-400">{t.dueDate}</span>}
                        {t.tag && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {t.tag}
                          </span>
                        )}
                      </div>
                    }
                    trailing={
                      <span className="text-[11px] text-slate-400">
                        {t.status === 'Done' ? '已完成' : t.status === 'In Progress' ? '进行中' : '待办'}
                      </span>
                    }
                    onClick={() => {
                      onSelectTask(t);
                      onClose?.();
                    }}
                  />
                ))}
              </MobileListGroup>
            )}
          </>
        )}
      </div>
    </div>
  );
};
