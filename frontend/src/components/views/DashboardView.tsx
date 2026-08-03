import React from 'react';
import { Task, Activity, Language, UserProfile } from '../../types';
import { getT } from '../../i18n';

interface DashboardViewProps {
  user: UserProfile;
  tasks: Task[];
  activities: Activity[];
  onSelectTask: (task: Task) => void;
  onOpenNewTask: () => void;
  onNavigateToTasks: () => void;
  onNavigateToPeopleAxis?: () => void;
  lang: Language;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  tasks,
  activities,
  onSelectTask,
  onOpenNewTask,
  onNavigateToTasks,
  onNavigateToPeopleAxis,
  lang,
}) => {
  const t = getT(lang);

  // Dynamic calculations based on real tasks list
  const totalCount = tasks.length;
  const completedCount = tasks.filter((t) => t.status === 'Done').length;
  const inProgressCount = tasks.filter((t) => t.status === 'In Progress').length;
  const urgentCount = tasks.filter((t) => t.priority === 'Urgent' || t.priority === 'High').length;
  
  const completionPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Upcoming deadlines (To Do or In Progress sorted by date)
  const upcomingTasks = tasks
    .filter((t) => t.status !== 'Done')
    .slice(0, 4);

  return (
    <div className="max-w-[1200px] mx-auto w-full pb-20 md:pb-8 animate-in fade-in duration-300">
      {/* Welcome Message Header */}
      <section className="mb-6 md:mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-on-surface dark:text-[#f0f1f2] tracking-tight">
              {lang === 'zh' ? `早上好, ${user.name.split(' ')[0]}` : `Good morning, ${user.name.split(' ')[0]}`}
            </h1>
            <p className="text-sm md:text-base text-on-surface-variant mt-1">
              {lang === 'zh'
                ? `今天您有 ${urgentCount} 个高优先级任务待完成。`
                : `You have ${urgentCount} high-priority tasks to complete today.`}
            </p>
          </div>
          <button
            onClick={onOpenNewTask}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary rounded-xl font-semibold text-sm shadow-sm hover:opacity-90 transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            <span>{t.newTask}</span>
          </button>
        </div>
      </section>

      {/* Core Innovation Flagship Banner: People-Axis Liability Chain */}
      {onNavigateToPeopleAxis && (
        <section
          onClick={onNavigateToPeopleAxis}
          className="mb-6 bg-gradient-to-r from-primary/10 via-surface-container to-amber-500/10 dark:from-[#1f2327] dark:to-[#28251e] p-6 rounded-3xl border border-primary/30 shadow-md hover:shadow-lg transition-all cursor-pointer group relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div className="space-y-1.5 z-10">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-primary text-on-primary text-[11px] font-black tracking-wide uppercase">
                {lang === 'zh' ? '核心体系推荐' : 'Flagship Paradigm'}
              </span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
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
          <div className="shrink-0 flex items-center gap-2 bg-surface dark:bg-[#191c1d] px-4 py-2.5 rounded-2xl border border-outline-variant/30 shadow-sm group-hover:border-primary/50 transition-all">
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
            className="bg-surface dark:bg-[#191c1d] p-4 md:p-5 rounded-2xl border border-surface-variant dark:border-outline-variant shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between h-32 group"
          >
            <div className="flex justify-between items-start">
              <span className="material-symbols-outlined text-primary text-2xl group-hover:scale-110 transition-transform">
                inventory_2
              </span>
              <span className="text-xs text-on-surface-variant font-medium">100%</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                {t.totalTasks}
              </p>
              <p className="text-2xl md:text-3xl font-bold text-on-surface dark:text-[#f0f1f2] mt-0.5">
                {totalCount}
              </p>
            </div>
          </div>

          {/* Completed */}
          <div
            onClick={onNavigateToTasks}
            className="bg-surface dark:bg-[#191c1d] p-4 md:p-5 rounded-2xl border border-surface-variant dark:border-outline-variant shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between h-32 group"
          >
            <div className="flex justify-between items-start">
              <span className="material-symbols-outlined text-secondary text-2xl group-hover:scale-110 transition-transform" style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
              <span className="text-xs text-secondary font-semibold">+{completedCount}</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                {t.completed}
              </p>
              <p className="text-2xl md:text-3xl font-bold text-on-surface dark:text-[#f0f1f2] mt-0.5">
                {completedCount}
              </p>
            </div>
          </div>

          {/* In Progress */}
          <div
            onClick={onNavigateToTasks}
            className="bg-surface dark:bg-[#191c1d] p-4 md:p-5 rounded-2xl border border-surface-variant dark:border-outline-variant shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between h-32 group"
          >
            <div className="flex justify-between items-start">
              <span className="material-symbols-outlined text-tertiary text-2xl group-hover:scale-110 transition-transform">
                pending
              </span>
              <span className="w-2 h-2 rounded-full bg-tertiary animate-ping mt-1"></span>
            </div>
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                {t.inProgress}
              </p>
              <p className="text-2xl md:text-3xl font-bold text-on-surface dark:text-[#f0f1f2] mt-0.5">
                {inProgressCount}
              </p>
            </div>
          </div>

          {/* Urgent */}
          <div
            onClick={onNavigateToTasks}
            className="bg-surface dark:bg-[#191c1d] p-4 md:p-5 rounded-2xl border border-surface-variant dark:border-outline-variant shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between h-32 group"
          >
            <div className="flex justify-between items-start">
              <span className="material-symbols-outlined text-error text-2xl group-hover:scale-110 transition-transform">
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
              <p className="text-2xl md:text-3xl font-bold text-on-surface dark:text-[#f0f1f2] mt-0.5">
                {urgentCount}
              </p>
            </div>
          </div>
        </div>

        {/* Weekly Progress Circle Card (4 cols) */}
        <div className="lg:col-span-4 bg-gradient-to-br from-primary to-[#2170e4] text-on-primary p-6 rounded-2xl shadow-md flex flex-col items-center justify-center text-center relative overflow-hidden">
          <div className="absolute -right-6 -bottom-6 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none"></div>
          
          <h3 className="font-bold text-base mb-4 tracking-wide uppercase text-on-primary/90">
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
                className="text-white/20"
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
                className="text-white transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-extrabold">{completionPercentage}%</span>
              <span className="text-[10px] uppercase tracking-wider opacity-80">{lang === 'zh' ? '达成率' : 'Done'}</span>
            </div>
          </div>

          <p className="mt-4 text-xs font-medium opacity-90">
            {lang === 'zh'
              ? `还差 ${Math.max(0, totalCount - completedCount)} 个任务即可达成周目标`
              : `${Math.max(0, totalCount - completedCount)} tasks to hit your weekly goal`}
          </p>
        </div>
      </div>

      {/* Bottom Bento Layer: Deadlines & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Upcoming Deadlines (7 cols) */}
        <section className="lg:col-span-7 bg-surface dark:bg-[#191c1d] p-6 rounded-2xl border border-surface-variant dark:border-outline-variant shadow-sm">
          <div className="flex justify-between items-center mb-5">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-error">alarm</span>
              <h3 className="font-bold text-lg text-on-surface dark:text-[#f0f1f2]">
                {t.upcomingDeadlines}
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
              upcomingTasks.map((task, idx) => {
                const barColors = ['bg-error', 'bg-tertiary', 'bg-primary', 'bg-secondary'];
                const indicatorColor = barColors[idx % barColors.length];

                return (
                  <div
                    key={task.id}
                    onClick={() => onSelectTask(task)}
                    className="flex items-center justify-between p-4 bg-surface-container-low dark:bg-[#2e3132] rounded-xl border border-transparent hover:border-outline-variant dark:hover:border-outline transition-all cursor-pointer group shadow-sm hover:shadow-md"
                  >
                    <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
                      <div className={`w-1.5 h-11 rounded-full ${indicatorColor} flex-shrink-0`}></div>
                      <div className="overflow-hidden">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-sm md:text-base text-on-surface dark:text-[#f0f1f2] truncate group-hover:text-primary transition-colors">
                            {task.title}
                          </h4>
                          {task.priority === 'Urgent' || task.priority === 'High' ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-error-container text-on-error-container">
                              {task.priority === 'Urgent' ? (lang === 'zh' ? '紧急' : 'Urgent') : (lang === 'zh' ? '高' : 'High')}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-on-surface-variant mt-1">
                          <span className="flex items-center gap-1 font-medium text-error">
                            <span className="material-symbols-outlined text-xs">schedule</span>
                            {task.dueDate} {task.dueTime ? `• ${task.dueTime}` : ''}
                          </span>
                          <span>•</span>
                          <span className="truncate">{lang === 'zh' ? '项目:' : 'Project:'} {task.category}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {task.assignee && (
                        <img
                          src={task.assignee.avatar}
                          alt={task.assignee.name}
                          className="w-7 h-7 rounded-full object-cover border border-outline-variant hidden sm:block"
                        />
                      )}
                      <button className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-surface dark:hover:bg-[#191c1d] rounded-full text-on-surface-variant transition-all">
                        <span className="material-symbols-outlined text-lg">chevron_right</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Recent Activity & Tip Banner (5 cols) */}
        <section className="lg:col-span-5 bg-surface dark:bg-[#191c1d] p-6 rounded-2xl border border-surface-variant dark:border-outline-variant shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-5">
              <span className="material-symbols-outlined text-secondary">history</span>
              <h3 className="font-bold text-lg text-on-surface dark:text-[#f0f1f2]">
                {t.recentActivity}
              </h3>
            </div>

            {/* Activity Timeline */}
            <div className="space-y-5 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-[2px] before:bg-surface-variant dark:before:bg-outline-variant">
              {activities.map((act) => (
                <div key={act.id} className="flex gap-3 relative">
                  <div className={`w-6 h-6 rounded-full ${act.colorClass} flex items-center justify-center z-10 shadow-sm ring-4 ring-surface dark:ring-[#191c1d]`}>
                    <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                      {act.icon}
                    </span>
                  </div>
                  <div className="text-xs">
                    <p className="text-on-surface dark:text-[#f0f1f2]">
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
            <div className="rounded-xl overflow-hidden aspect-[16/9] sm:aspect-[21/9] lg:aspect-[16/9] relative group cursor-pointer shadow-md border border-outline-variant/30">
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDT6fzj8YQD3FIU8-krsemZWLfGHMRL0WJBqi-IxCnXoRKygCmjcgbMHWq8TsWanEuZCNhJVGKd1keTSbBV8A-8KIE0ss2XOxMctrVYhrrBZxy_3c3Z3gvd-mqNmPbz_EBS-VsbpJxCZqmpL452HqUyZ_C99fwLJ_ViaGLmRu1gnCgLXkxLSycK850Mxn6zd9F1G_IHk1OQKtoe-lnvoh72jCflm8RZBY0Y1Vet3UtJThk3XSJuVWsXwyrQQfHD1f8T7w30Yvto5Kg"
                alt="Workspace"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex items-end p-4">
                <p className="text-white font-semibold text-xs md:text-sm drop-shadow">
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
