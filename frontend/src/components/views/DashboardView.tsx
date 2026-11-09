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
        <section aria-label={lang === 'zh' ? '重点待办与跟进' : 'Priority tasks and follow-ups'} className="mb-4 bg-surface-container-lowest dark:bg-surface-container p-6 rounded-xl border border-surface-variant dark:border-outline-variant shadow-sm dark:shadow-none">
          <div className="flex justify-between items-center mb-5">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-inherit">alarm</span>
              <h3 className="font-medium text-lg text-on-surface dark:text-on-surface tabular-nums">
                {lang === 'zh' ? '重点待办与跟进' : 'Priority tasks and follow-ups'}
              </h3>
            </div>
            <button
              onClick={onNavigateToTasks}
              className="text-primary dark:text-primary font-medium text-sm hover:underline flex items-center gap-1 tabular-nums"
            >
              <span>{t.viewAll}</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          </div>

          <div className="divide-y divide-outline-variant">
            {upcomingTasks.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant text-sm">
                {lang === 'zh' ? '暂无待办截止任务' : 'No upcoming deadlines'}
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
                    className="flex items-center justify-between gap-4 py-4 hover:bg-surface-container transition-ink-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
                      <span aria-hidden="true" className={`w-2 h-2 rounded-full ${indicatorColor} flex-shrink-0`}></span>
                      <div className="overflow-hidden">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-sm md:text-base text-on-surface dark:text-on-surface truncate group-hover:text-primary transition-ink-colors tabular-nums">
                            {task.title}
                          </h4>
                          {task.priority === 'High' ? (
                            <span className="text-xs font-medium px-2 py-1 rounded bg-error-container text-on-error-container tabular-nums">
                              {lang === 'zh' ? '高' : 'High'}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-on-surface-variant mt-1">
                          <span className={`flex items-center gap-1 font-medium ${task.dueDate && new Date(`${task.dueDate}T${task.dueTime || '23:59'}:00`).getTime() < Date.now() ? 'text-error' : 'text-outline'}`}>
                            <span className="material-symbols-outlined text-[18px]">schedule</span>
                            {task.dueDate ? <>{relativeDue(task.dueDate, task.dueTime)} · {task.dueDate} {task.dueTime ? `• ${task.dueTime}` : ''}</> : lang === 'zh' ? '未设置截止时间' : 'No deadline'}
                          </span>
                          <span>•</span>
                          <span className="truncate">{lang === 'zh' ? '项目:' : 'Project:'} {task.category}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {(task.assignees?.length ? task.assignees : task.assignee ? [task.assignee] : []).slice(0, 3).map((member) => (
                        member.avatar ? <img key={member.id} src={member.avatar} alt={member.name} title={member.name} className="w-7 h-7 rounded-full object-cover border border-outline-variant hidden sm:block" /> : <span key={member.id} title={member.name} className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center border border-outline-variant hidden sm:flex tabular-nums">{member.name.slice(0, 1)}</span>
                      ))}
                      {(task.assignees?.length || 0) > 3 && <span className="text-xs font-medium text-on-surface-variant tabular-nums">+{(task.assignees?.length || 0) - 3}</span>}
                      <button className="opacity-0 group-hover:opacity-100 p-2 hover:bg-surface dark:hover:bg-surface-container-lowest rounded-lg text-on-surface-variant transition-ink-colors">
                        <span className="material-symbols-outlined text-[18px]">chevron_right</span>
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
        className={`mb-6 p-5 rounded-xl border shadow-sm dark:shadow-none transition-ink-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          todayAllDone
            ? 'bg-secondary-container/40 border-secondary/30'
            : overdueCount > 0
              ? 'bg-error-container/30 border-error/30'
              : 'bg-surface-container-lowest dark:bg-surface-container border-surface-variant dark:border-outline-variant'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`material-symbols-outlined text-[18px] shrink-0 ${
              todayAllDone ? 'text-inherit' : overdueCount > 0 ? 'text-inherit' : 'text-inherit'
            }`}
            style={todayAllDone ? { fontVariationSettings: "'FILL' 1" } : undefined}
          >
            {todayAllDone ? 'check_circle' : 'calendar_today'}
          </span>
          <div className="min-w-0">
            <h3 className="font-medium text-base text-on-surface dark:text-on-surface tabular-nums">
              {lang === 'zh' ? '今日聚焦' : "Today's Focus"}
            </h3>
            <p className="text-sm text-on-surface-variant mt-1">
              {todayAllDone
                ? lang === 'zh'
                  ? `今天的 ${todayTasks.length} 件事全部完成`
                  : `All ${todayTasks.length} tasks for today are done. Nice work!`
                : lang === 'zh'
                  ? `今天还有 ${todayOpenCount} 件事到期${overdueCount > 0 ? `，另有 ${overdueCount} 件已逾期待处理` : ''}。`
                  : `${todayOpenCount} due today${overdueCount > 0 ? `, ${overdueCount} overdue` : ''}.`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <button type="button" onClick={event => { event.stopPropagation(); onNavigateToKanban ? onNavigateToKanban('pending') : onNavigateToTasks(); }} className="text-center min-h-[44px]"><p className="text-2xl font-medium text-primary tabular-nums">{totalCount-completedCount}</p><p className="text-xs font-normal text-on-surface-variant tabular-nums">{lang === 'zh' ? '待办事项' : 'Pending'}</p></button>
          <button type="button" className="text-center min-h-[44px]" onClick={event => { event.stopPropagation(); onNavigateToKanban ? onNavigateToKanban('today') : onNavigateToTasks(); }}>
            <p className="text-2xl font-medium text-on-surface dark:text-on-surface tabular-nums">{todayOpenCount}</p>
            <p className="text-xs   text-on-surface-variant font-normal tabular-nums">
              {lang === 'zh' ? '今天到期' : 'Due today'}
            </p>
          </button>
          <button type="button" className="text-center min-h-[44px]" onClick={event => { event.stopPropagation(); onNavigateToKanban ? onNavigateToKanban('overdue') : onNavigateToTasks(); }}>
            <p className={`text-2xl font-medium ${overdueCount > 0 ? 'text-error' : 'text-on-surface dark:text-on-surface'}`}>
              {overdueCount}
            </p>
            <p className="text-xs   text-on-surface-variant font-normal tabular-nums">
              {lang === 'zh' ? '已逾期' : 'Overdue'}
            </p>
          </button>
          <span className="material-symbols-outlined text-inherit">arrow_forward</span>
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
            className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg font-medium text-sm shadow-sm dark:shadow-none hover:opacity-90 transition-ink-colors active:scale-95 tabular-nums"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>{t.newTask}</span>
          </button>
      </div>
      {/* Welcome Message Header */}
      <section className="mb-6 md:mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-[22px] md:text-[28px] font-medium text-on-surface dark:text-on-surface  tabular-nums">
              {lang === 'zh' ? '工作台' : 'Workbench'}
            </h1>
            <p className="text-sm md:text-base text-on-surface-variant mt-1">
              {lang === 'zh'
                ? `今天您有 ${urgentCount} 个高优先级任务待完成`
                : `You have ${urgentCount} high-priority tasks to complete today`}
            </p>
          </div>

        </div>
      </section>

      {/* Core Innovation Flagship Banner: People-Axis Liability Chain */}
      {onNavigateToPeopleAxis && (
        <section
          onClick={onNavigateToPeopleAxis}
          className="mb-6 bg-surface-container-lowest dark:bg-surface-container p-6 rounded-[var(--radius-ink-panel)] border border-outline-variant shadow-sm dark:shadow-none transition-ink-colors cursor-pointer group relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div className="space-y-2 z-10">
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 rounded-md bg-primary text-on-primary text-xs font-medium   tabular-nums">
                {lang === 'zh' ? '核心体系推荐' : 'Flagship Paradigm'}
              </span>
              <span className="text-xs font-medium text-secondary flex items-center gap-1 tabular-nums">
                <span className="w-2 h-2 rounded-full bg-secondary"></span>
                {lang === 'zh' ? 'Web / App 责任链规则 100% 同一后端语义' : 'Web/App Parity Synchronized'}
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-medium text-on-surface group-hover:text-primary transition-ink-colors flex items-center gap-2 tabular-nums">
              <span>{lang === 'zh' ? '「人轴责任链」：人为主干，事项挂载，终责收口' : 'People-Axis: People as Spine, Tasks Attached, PM at Terminal'}</span>
              <span className="material-symbols-outlined text-[18px] text-inherit group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </h2>
            <p className="text-xs md:text-sm text-on-surface-variant font-normal max-w-3xl tabular-nums">
              {lang === 'zh'
                ? '告别传统平权任务看板。先看人如何串成主干与下级组织延伸，再看凭证与智能体如何辅助证据闭环，终责项目PM在轴终点签批收口。'
                : 'Move beyond legacy task boards. Chained human accountability with AI risk analysis and milestone evidence proofs flowing to terminal PM sign-off.'}
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-2 bg-surface-container-lowest dark:bg-surface-container px-4 py-2 rounded-xl border border-outline-variant/30 shadow-sm dark:shadow-none group-hover:border-primary/50 transition-ink-colors">
            <span className="material-symbols-outlined text-inherit text-[18px]">alt_route</span>
            <span className="text-xs font-medium text-on-surface tabular-nums">
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
            className="bg-surface-container-lowest dark:bg-surface-container p-4 md:p-5 rounded-xl border border-surface-variant dark:border-outline-variant shadow-sm dark:shadow-none transition-ink-colors cursor-pointer flex flex-col justify-between h-32 group"
          >
            <div className="flex justify-between items-start">
              <span className="material-symbols-outlined text-inherit text-[18px] transition-ink-colors">
                inventory_2
              </span>
              <span className="text-xs text-on-surface-variant font-medium tabular-nums">{completionPercentage}%</span>
            </div>
            <div>
              <p className="text-xs font-normal text-on-surface-variant   tabular-nums">
                {t.totalTasks}
              </p>
              <p className="text-2xl md:text-3xl font-medium text-on-surface dark:text-on-surface mt-1 tabular-nums">
                {totalCount}
              </p>
            </div>
          </div>

          {/* Completed */}
          <div
            onClick={onNavigateToTasks}
            className="bg-surface-container-lowest dark:bg-surface-container p-4 md:p-5 rounded-xl border border-surface-variant dark:border-outline-variant shadow-sm dark:shadow-none transition-ink-colors cursor-pointer flex flex-col justify-between h-32 group"
          >
            <div className="flex justify-between items-start">
              <span className="material-symbols-outlined text-inherit text-[18px] transition-ink-colors" style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
              <span className="text-xs text-secondary font-medium tabular-nums">+{completedCount}</span>
            </div>
            <div>
              <p className="text-xs font-normal text-on-surface-variant   tabular-nums">
                {t.completed}
              </p>
              <p className="text-2xl md:text-3xl font-medium text-on-surface dark:text-on-surface mt-1 tabular-nums">
                {completedCount}
              </p>
            </div>
          </div>

          {/* In Progress */}
          <div
            onClick={onNavigateToTasks}
            className="bg-surface-container-lowest dark:bg-surface-container p-4 md:p-5 rounded-xl border border-surface-variant dark:border-outline-variant shadow-sm dark:shadow-none transition-ink-colors cursor-pointer flex flex-col justify-between h-32 group"
          >
            <div className="flex justify-between items-start">
              <span className="material-symbols-outlined text-inherit text-[18px] transition-ink-colors">
                pending
              </span>
              <span className="w-2 h-2 rounded-full bg-tertiary  mt-1"></span>
            </div>
            <div>
              <p className="text-xs font-normal text-on-surface-variant   tabular-nums">
                {t.inProgress}
              </p>
              <p className="text-2xl md:text-3xl font-medium text-on-surface dark:text-on-surface mt-1 tabular-nums">
                {inProgressCount}
              </p>
            </div>
          </div>

          {/* Urgent */}
          <div
            onClick={onNavigateToTasks}
            className="bg-surface-container-lowest dark:bg-surface-container p-4 md:p-5 rounded-xl border border-surface-variant dark:border-outline-variant shadow-sm dark:shadow-none transition-ink-colors cursor-pointer flex flex-col justify-between h-32 group"
          >
            <div className="flex justify-between items-start">
              <span className="material-symbols-outlined text-inherit text-[18px] transition-ink-colors">
                priority_high
              </span>
              <span className="text-xs px-2 py-1 rounded bg-error-container text-on-error-container font-medium tabular-nums">
                {lang === 'zh' ? '紧急' : 'Hot'}
              </span>
            </div>
            <div>
              <p className="text-xs font-normal text-on-surface-variant   tabular-nums">
                {t.urgent}
              </p>
              <p className="text-2xl md:text-3xl font-medium text-on-surface dark:text-on-surface mt-1 tabular-nums">
                {urgentCount}
              </p>
            </div>
          </div>
        </div>

        {/* Weekly Progress Circle Card (4 cols) */}
        <div className="lg:col-span-4 bg-surface-container-lowest dark:bg-surface-container text-on-surface p-6 rounded-xl border border-outline-variant shadow-sm dark:shadow-none flex flex-col items-center justify-center text-center relative overflow-hidden">

          <h3 className="font-medium text-base mb-4 text-on-surface-variant tabular-nums">
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
              <span className="text-3xl font-medium text-primary tabular-nums">{completionPercentage}%</span>
              <span className="text-xs text-on-surface-variant">{lang === 'zh' ? '达成率' : 'Done'}</span>
            </div>
          </div>

          <p className="mt-4 text-xs font-normal text-on-surface-variant tabular-nums">
            {lang === 'zh'
              ? `还差 ${Math.max(0, totalCount - completedCount)} 个任务即可达成周目标`
              : `${Math.max(0, totalCount - completedCount)} tasks to hit your weekly goal`}
          </p>
        </div>
      </div>

      {/* Bottom Bento Layer: Deadlines & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Activity & Tip Banner (5 cols) */}
        <section className="lg:col-span-12 bg-surface-container-lowest dark:bg-surface-container p-6 rounded-xl border border-surface-variant dark:border-outline-variant shadow-sm dark:shadow-none flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-5">
              <span className="material-symbols-outlined text-inherit">history</span>
              <h3 className="font-medium text-lg text-on-surface dark:text-on-surface tabular-nums">
                {t.recentActivity}
              </h3>
            </div>

            {/* Activity Timeline */}
            <div className="space-y-5 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-[2px] before:bg-surface-variant dark:before:bg-outline-variant">
              {activities.map((act) => (
                <div key={act.id} className="flex gap-3 relative">
                  <div className={`w-6 h-6 rounded-full ${act.colorClass} flex items-center justify-center z-10 shadow-sm dark:shadow-none ring-4 ring-surface dark:ring-surface-container-lowest`}>
                    <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                      {act.icon}
                    </span>
                  </div>
                  <div className="text-xs">
                    <p className="text-on-surface dark:text-on-surface">
                      <span className="font-medium tabular-nums">{act.titleText}</span> {act.targetText}
                    </p>
                    <p className="text-on-surface-variant mt-1">{act.timestamp}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tip Photo Banner at Bottom */}
          <div className="mt-8 pt-2">
            <div className="border-t border-outline-variant py-4">
              <div>
                <p className="text-on-surface font-normal text-xs md:text-sm tabular-nums">
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
