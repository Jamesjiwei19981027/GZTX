import React from 'react';
import { Task, Activity, Language, UserProfile, Project } from '../../types';
import { WorkbenchOverview } from '../WorkbenchOverview';
import { WorkAssistantEntry } from '../WorkAssistantEntry';
import { TaskTrendCard } from '../TaskTrendCard';
import type { TaskWorkspaceScope } from '../../utils/taskWorkspace';
import { getT } from '../../i18n';

interface DashboardViewProps {
  user: UserProfile;
  tasks: Task[];
  activities: Activity[];
  onSelectTask: (task: Task) => void;
  onOpenNewTask: () => void;
  onNavigateToTasks: () => void;
  onNavigateToKanban?: (scope?: TaskWorkspaceScope) => void;
  onEditScheduledTask?: (task: Task) => void;
  onOpenNewTaskWithDate?: (date: string) => void;
  onNavigateToPeopleAxis?: () => void;
  onNavigateToAssistant?: (action: 'progress' | 'reports') => void;
  lang: Language;
  projects?: Project[];
  currentProject?: Project;
  onOpenCalendar?: () => void;
  onOpenProject?: (project: Project) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  tasks,
  activities,
  onSelectTask,
  onOpenNewTask,
  onNavigateToTasks,
  onNavigateToKanban,
  onEditScheduledTask,
  onOpenNewTaskWithDate,
  onNavigateToPeopleAxis,
  onNavigateToAssistant,
  lang,
  projects = [], currentProject, onOpenCalendar, onOpenProject,
}) => {
  const t = getT(lang);

  const relativeDue = (value: string, time?: string) => {
    const due = new Date(`${value}T${time || '23:59'}:00`);
    if (Number.isNaN(due.getTime())) return value;
    const hours = Math.round((due.getTime() - Date.now()) / 3600000);
    if (hours < 0) return lang === 'zh' ? `已逾期 ${Math.abs(hours)} 小时` : `${Math.abs(hours)}h overdue`;
    if (hours < 24) return lang === 'zh' ? `${hours || 1} 小时后` : `in ${hours || 1}h`;
    const days = Math.round(hours / 24);
    return lang === 'zh' ? `${days} 天后` : `in ${days}d`;
  };

  // Dynamic calculations based on real tasks list
  const totalCount = tasks.length;
  const completedCount = tasks.filter((t) => t.status === 'Done').length;
  const inProgressCount = tasks.filter((t) => t.status === 'In Progress').length;
  const urgentCount = tasks.filter((t) => t.priority === 'High' && t.status !== 'Done').length;

  const completionPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Open tasks sorted by deadline, with undated tasks still available for follow-up.
  const upcomingTasks = tasks
    .filter((t) => t.status !== 'Done')
    .sort((a, b) => `${a.dueDate || '9999-12-31'}T${a.dueTime || '23:59'}`.localeCompare(`${b.dueDate || '9999-12-31'}T${b.dueTime || '23:59'}`))
    .slice(0, 5);

  // 今日聚焦：今天到期 + 逾期；今天全部完成时给正反馈
  const todayLocal = (() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  })();
  const todayTasks = tasks.filter((t) => t.dueDate === todayLocal);
  const todayOpenCount = todayTasks.filter((t) => t.status !== 'Done').length;
  const overdueCount = tasks.filter(
    (t) => t.status !== 'Done' && t.dueDate && t.dueDate < todayLocal,
  ).length;
  const todayAllDone = todayTasks.length > 0 && todayOpenCount === 0;

  return (
    <div className="max-w-[1200px] mx-auto w-full pb-20 md:pb-8 animate-in fade-in duration-300">
        {/* Upcoming Deadlines (7 cols) */}
        <section aria-label={lang === 'zh' ? '重点待办与跟进' : 'Priority tasks and follow-ups'} className="mb-4 bg-surface dark:bg-[#1c1a18] p-6 rounded-2xl border border-surface-variant dark:border-outline-variant shadow-sm">
          <div className="flex justify-between items-center mb-5">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-error">alarm</span>
              <h3 className="font-bold text-lg text-on-surface dark:text-[#efe9de]">
                {lang === 'zh' ? '重点待办与跟进' : 'Priority tasks and follow-ups'}
              </h3>
            </div>
            <button
              onClick={onNavigateToTasks}
              className="text-primary dark:text-[#adc6ff] font-semibold text-sm hover:underline flex items-center gap-0.5"
            >
              <span>{t.viewAll}</span>
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </button>
          </div>

          <div className="space-y-3">
            {upcomingTasks.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant text-sm">
                {lang === 'zh' ? '暂无待办截止任务，去轻松休息下！' : 'No upcoming deadlines! Take a breather.'}
              </div>
            ) : (
              upcomingTasks.map((task) => {
                const indicatorColor = task.priority === 'High'
                  ? 'bg-error'
                  : task.priority === 'Medium'
                    ? 'bg-secondary'
                    : 'bg-on-surface-variant';

                return (
                  <div
                    key={task.id}
                    onClick={() => onSelectTask(task)}
                    className="flex items-center justify-between p-4 bg-surface-container-low dark:bg-[#262421] rounded-xl border border-transparent hover:border-outline-variant dark:hover:border-outline transition-ink cursor-pointer group shadow-sm hover:shadow-md"
                  >
                    <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
                      <span aria-hidden="true" className={`w-2 h-2 rounded-full ${indicatorColor} flex-shrink-0`}></span>
                      <div className="overflow-hidden">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-sm md:text-base text-on-surface dark:text-[#efe9de] truncate group-hover:text-primary transition-colors">
                            {task.title}
                          </h4>
                          {task.priority === 'High' ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-error-container text-on-error-container">
                              {lang === 'zh' ? '高' : 'High'}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-on-surface-variant mt-1">
                          <span className="flex items-center gap-1 font-medium text-error">
                            <span className="material-symbols-outlined text-xs">schedule</span>
                            {task.dueDate ? <>{relativeDue(task.dueDate, task.dueTime)} · {task.dueDate} {task.dueTime ? `• ${task.dueTime}` : ''}</> : lang === 'zh' ? '未设置截止时间' : 'No deadline'}
                          </span>
                          <span>•</span>
                          <span className="truncate">{lang === 'zh' ? '项目:' : 'Project:'} {task.category}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {(task.assignees?.length ? task.assignees : task.assignee ? [task.assignee] : []).slice(0, 3).map((member) => (
                        member.avatar ? <img key={member.id} src={member.avatar} alt={member.name} title={member.name} className="w-7 h-7 rounded-full object-cover border border-outline-variant hidden sm:block" /> : <span key={member.id} title={member.name} className="w-7 h-7 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center border border-outline-variant hidden sm:flex">{member.name.slice(0, 1)}</span>
                      ))}
                      {(task.assignees?.length || 0) > 3 && <span className="text-[10px] font-bold text-on-surface-variant">+{(task.assignees?.length || 0) - 3}</span>}
                      <button className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-surface dark:hover:bg-[#1c1a18] rounded-full text-on-surface-variant transition-ink">
                        <span className="material-symbols-outlined text-lg">chevron_right</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

      {onNavigateToAssistant && <div className="mb-4"><WorkAssistantEntry onOpen={onNavigateToAssistant} lang={lang} /></div>}
      {/* 今日聚焦：今天到期 + 逾期数量，点击跳我的任务 */}
      <section
        data-testid="today-focus"
        onClick={() => onNavigateToKanban ? onNavigateToKanban('pending') : onNavigateToTasks()}
        className={`mb-6 p-5 rounded-2xl border shadow-sm hover:shadow-md transition-ink cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          todayAllDone
            ? 'bg-secondary-container/40 border-secondary/30'
            : overdueCount > 0
              ? 'bg-error-container/30 border-error/30'
              : 'bg-surface dark:bg-[#1c1a18] border-surface-variant dark:border-outline-variant'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`material-symbols-outlined text-3xl shrink-0 ${
              todayAllDone ? 'text-secondary' : overdueCount > 0 ? 'text-error' : 'text-primary'
            }`}
            style={todayAllDone ? { fontVariationSettings: "'FILL' 1" } : undefined}
          >
            {todayAllDone ? 'check_circle' : 'calendar_today'}
          </span>
          <div className="min-w-0">
            <h3 className="font-bold text-base text-on-surface dark:text-[#efe9de]">
              {lang === 'zh' ? '今日聚焦' : "Today's Focus"}
            </h3>
            <p className="text-sm text-on-surface-variant mt-0.5">
              {todayAllDone
                ? lang === 'zh'
                  ? `今天的 ${todayTasks.length} 件事全部完成，干得漂亮！`
                  : `All ${todayTasks.length} tasks for today are done. Nice work!`
                : lang === 'zh'
                  ? `今天还有 ${todayOpenCount} 件事到期${overdueCount > 0 ? `，另有 ${overdueCount} 件已逾期待处理` : ''}。`
                  : `${todayOpenCount} due today${overdueCount > 0 ? `, ${overdueCount} overdue` : ''}.`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <button type="button" onClick={event => { event.stopPropagation(); onNavigateToKanban ? onNavigateToKanban('pending') : onNavigateToTasks(); }} className="text-center min-h-[44px]"><p className="text-2xl font-extrabold text-primary">{totalCount-completedCount}</p><p className="text-[10px] font-bold text-on-surface-variant">{lang === 'zh' ? '待办事项' : 'Pending'}</p></button>
          <button type="button" className="text-center min-h-[44px]" onClick={event => { event.stopPropagation(); onNavigateToKanban ? onNavigateToKanban('today') : onNavigateToTasks(); }}>
            <p className="text-2xl font-extrabold text-on-surface dark:text-[#efe9de]">{todayOpenCount}</p>
            <p className="text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">
              {lang === 'zh' ? '今天到期' : 'Due today'}
            </p>
          </button>
          <button type="button" className="text-center min-h-[44px]" onClick={event => { event.stopPropagation(); onNavigateToKanban ? onNavigateToKanban('overdue') : onNavigateToTasks(); }}>
            <p className={`text-2xl font-extrabold ${overdueCount > 0 ? 'text-error' : 'text-on-surface dark:text-[#efe9de]'}`}>
              {overdueCount}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">
              {lang === 'zh' ? '已逾期' : 'Overdue'}
            </p>
          </button>
          <span className="material-symbols-outlined text-on-surface-variant">arrow_forward</span>
        </div>
      </section>

      <div className="mb-4"><TaskTrendCard projectId={currentProject?.id} tasks={tasks} /></div>
      {currentProject && <div className="mb-6"><WorkbenchOverview tasks={tasks} projects={projects} currentProject={currentProject}
        onSelectTask={onSelectTask} onEditScheduledTask={onEditScheduledTask} onOpenNewTaskWithDate={onOpenNewTaskWithDate}
        onOpenCalendar={onOpenCalendar} onOpenProject={onOpenProject} /></div>}
      <div className="mb-6 flex justify-end">
          <button
            onClick={onOpenNewTask}
            aria-label={t.newTask}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary rounded-xl font-medium text-sm shadow-sm hover:opacity-90 transition-ink active:scale-95"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            <span>{t.newTask}</span>
          </button>
      </div>
      {/* Welcome Message Header */}
      <section className="mb-6 md:mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-on-surface dark:text-[#efe9de] tracking-tight">
              {lang === 'zh' ? `早上好, ${user.name.split(' ')[0]}` : `Good morning, ${user.name.split(' ')[0]}`}
            </h1>
            <p className="text-sm md:text-base text-on-surface-variant mt-1">
              {lang === 'zh'
                ? `今天您有 ${urgentCount} 个高优先级任务待完成。`
                : `You have ${urgentCount} high-priority tasks to complete today.`}
            </p>
          </div>

        </div>
      </section>

      {/* Core Innovation Flagship Banner: People-Axis Liability Chain */}
      {onNavigateToPeopleAxis && (
        <section
          onClick={onNavigateToPeopleAxis}
          className="mb-6 bg-surface-container-lowest p-6 rounded-[var(--radius-ink-panel)] border border-outline-variant shadow-md hover:shadow-lg transition-ink cursor-pointer group relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div className="space-y-1.5 z-10">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-primary text-on-primary text-[11px] font-black tracking-wide uppercase">
                {lang === 'zh' ? '核心体系推荐' : 'Flagship Paradigm'}
              </span>
              <span className="text-xs font-medium text-secondary flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-secondary"></span>
                {lang === 'zh' ? 'Web / App 责任链规则 100% 同一后端语义' : 'Web/App Parity Synchronized'}
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-black text-on-surface group-hover:text-primary transition-colors flex items-center gap-2">
              <span>{lang === 'zh' ? '「人轴责任链」：人为主干，事项挂载，终责收口' : 'People-Axis: People as Spine, Tasks Attached, PM at Terminal'}</span>
              <span className="material-symbols-outlined text-xl text-amber-500 group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </h2>
            <p className="text-xs md:text-sm text-on-surface-variant font-medium max-w-3xl">
              {lang === 'zh'
                ? '告别传统平权任务看板。先看人如何串成主干与下级组织延伸，再看凭证与智能体如何辅助证据闭环，终责项目PM在轴终点签批收口。'
                : 'Move beyond legacy task boards. Chained human accountability with AI risk analysis and milestone evidence proofs flowing to terminal PM sign-off.'}
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-2 bg-surface dark:bg-[#1c1a18] px-4 py-2.5 rounded-2xl border border-outline-variant/30 shadow-sm group-hover:border-primary/50 transition-ink">
            <span className="material-symbols-outlined text-primary text-2xl">alt_route</span>
            <span className="text-xs font-extrabold text-on-surface">
              {lang === 'zh' ? '进入人轴视图' : 'Open Axis View'}
            </span>
          </div>
        </section>
      )}

      {/* Top Bento Layer: Stats & Weekly Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        {/* 4 Stats Cards (8 cols) */}
        <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* Total Tasks */}
          <div
            onClick={onNavigateToTasks}
            className="bg-surface dark:bg-[#1c1a18] p-4 md:p-5 rounded-2xl border border-surface-variant dark:border-outline-variant shadow-sm hover:shadow-md transition-ink cursor-pointer flex flex-col justify-between h-32 group"
          >
            <div className="flex justify-between items-start">
              <span className="material-symbols-outlined text-primary text-2xl transition-ink-colors">
                inventory_2
              </span>
              <span className="text-xs text-on-surface-variant font-medium">{completionPercentage}%</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                {t.totalTasks}
              </p>
              <p className="text-2xl md:text-3xl font-bold text-on-surface dark:text-[#efe9de] mt-0.5">
                {totalCount}
              </p>
            </div>
          </div>

          {/* Completed */}
          <div
            onClick={onNavigateToTasks}
            className="bg-surface dark:bg-[#1c1a18] p-4 md:p-5 rounded-2xl border border-surface-variant dark:border-outline-variant shadow-sm hover:shadow-md transition-ink cursor-pointer flex flex-col justify-between h-32 group"
          >
            <div className="flex justify-between items-start">
              <span className="material-symbols-outlined text-secondary text-2xl transition-ink-colors" style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
              <span className="text-xs text-secondary font-semibold">+{completedCount}</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                {t.completed}
              </p>
              <p className="text-2xl md:text-3xl font-bold text-on-surface dark:text-[#efe9de] mt-0.5">
                {completedCount}
              </p>
            </div>
          </div>

          {/* In Progress */}
          <div
            onClick={onNavigateToTasks}
            className="bg-surface dark:bg-[#1c1a18] p-4 md:p-5 rounded-2xl border border-surface-variant dark:border-outline-variant shadow-sm hover:shadow-md transition-ink cursor-pointer flex flex-col justify-between h-32 group"
          >
            <div className="flex justify-between items-start">
              <span className="material-symbols-outlined text-tertiary text-2xl transition-ink-colors">
                pending
              </span>
              <span className="w-2 h-2 rounded-full bg-tertiary animate-ping mt-1"></span>
            </div>
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                {t.inProgress}
              </p>
              <p className="text-2xl md:text-3xl font-bold text-on-surface dark:text-[#efe9de] mt-0.5">
                {inProgressCount}
              </p>
            </div>
          </div>

          {/* Urgent */}
          <div
            onClick={onNavigateToTasks}
            className="bg-surface dark:bg-[#1c1a18] p-4 md:p-5 rounded-2xl border border-surface-variant dark:border-outline-variant shadow-sm hover:shadow-md transition-ink cursor-pointer flex flex-col justify-between h-32 group"
          >
            <div className="flex justify-between items-start">
              <span className="material-symbols-outlined text-error text-2xl transition-ink-colors">
                priority_high
              </span>
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-error-container text-on-error-container font-bold">
                {lang === 'zh' ? '紧急' : 'Hot'}
              </span>
            </div>
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                {t.urgent}
              </p>
              <p className="text-2xl md:text-3xl font-bold text-on-surface dark:text-[#efe9de] mt-0.5">
                {urgentCount}
              </p>
            </div>
          </div>
        </div>

        {/* Weekly Progress Circle Card (4 cols) */}
        <div className="lg:col-span-4 bg-surface-container-lowest text-on-surface p-6 rounded-2xl border border-outline-variant shadow-md flex flex-col items-center justify-center text-center relative overflow-hidden">

          <h3 className="font-medium text-base mb-4 text-on-surface-variant">
            {t.weeklyProgress}
          </h3>

          {/* SVG Progress Circle */}
          <div className="relative inline-flex items-center justify-center my-2">
            <svg className="w-32 h-32 transform -rotate-90">
              <circle
                cx="64"
                cy="64"
                r="52"
                stroke="currentColor"
                strokeWidth="10"
                fill="transparent"
                className="text-outline-variant"
              />
              <circle
                cx="64"
                cy="64"
                r="52"
                stroke="currentColor"
                strokeWidth="10"
                strokeDasharray={2 * Math.PI * 52}
                strokeDashoffset={2 * Math.PI * 52 * (1 - completionPercentage / 100)}
                strokeLinecap="round"
                fill="transparent"
                className="text-primary transition-[stroke-dashoffset] duration-1000 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-medium text-primary">{completionPercentage}%</span>
              <span className="text-[10px] text-on-surface-variant">{lang === 'zh' ? '达成率' : 'Done'}</span>
            </div>
          </div>

          <p className="mt-4 text-xs font-medium text-on-surface-variant">
            {lang === 'zh'
              ? `还差 ${Math.max(0, totalCount - completedCount)} 个任务即可达成周目标`
              : `${Math.max(0, totalCount - completedCount)} tasks to hit your weekly goal`}
          </p>
        </div>
      </div>

      {/* Bottom Bento Layer: Deadlines & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Activity & Tip Banner (5 cols) */}
        <section className="lg:col-span-12 bg-surface dark:bg-[#1c1a18] p-6 rounded-2xl border border-surface-variant dark:border-outline-variant shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-5">
              <span className="material-symbols-outlined text-secondary">history</span>
              <h3 className="font-bold text-lg text-on-surface dark:text-[#efe9de]">
                {t.recentActivity}
              </h3>
            </div>

            {/* Activity Timeline */}
            <div className="space-y-5 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-[2px] before:bg-surface-variant dark:before:bg-outline-variant">
              {activities.map((act) => (
                <div key={act.id} className="flex gap-3 relative">
                  <div className={`w-6 h-6 rounded-full ${act.colorClass} flex items-center justify-center z-10 shadow-sm ring-4 ring-surface dark:ring-[#1c1a18]`}>
                    <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                      {act.icon}
                    </span>
                  </div>
                  <div className="text-xs">
                    <p className="text-on-surface dark:text-[#efe9de]">
                      <span className="font-bold">{act.titleText}</span> {act.targetText}
                    </p>
                    <p className="text-on-surface-variant mt-0.5">{act.timestamp}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tip Photo Banner at Bottom */}
          <div className="mt-8 pt-2">
            <div className="rounded-xl overflow-hidden aspect-[16/9] sm:aspect-[21/9] lg:aspect-[16/9] relative group cursor-pointer shadow-md border border-outline-variant/30 bg-surface-container">
              <span className="material-symbols-outlined absolute -right-3 -top-3 text-on-surface-variant/20 text-[110px] transition-ink-colors pointer-events-none select-none">
                diversity_3
              </span>
              <div className="absolute inset-0 flex items-end p-4">
                <p className="text-on-surface font-medium text-xs md:text-sm">
                  {t.tipGroup}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
