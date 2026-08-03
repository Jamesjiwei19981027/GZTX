import React, { useState } from 'react';
import { Task, Status, Priority, Category, Language } from '../../types';
import { getT } from '../../i18n';

interface MyTasksViewProps {
  tasks: Task[];
  onToggleTaskCompletion: (taskId: string, e: React.MouseEvent) => void;
  onSelectTask: (task: Task) => void;
  lang: Language;
}

export const MyTasksView: React.FC<MyTasksViewProps> = ({
  tasks,
  onToggleTaskCompletion,
  onSelectTask,
  lang,
}) => {
  const t = getT(lang);

  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [onlyToday, setOnlyToday] = useState<boolean>(false);

  // Filter tasks
  const filteredTasks = tasks.filter((task) => {
    if (statusFilter !== 'All' && task.status !== statusFilter) return false;
    if (priorityFilter !== 'All' && task.priority !== priorityFilter) return false;
    if (onlyToday) {
      // check if today or dates close
      const todayStr = new Date().toISOString().split('T')[0];
      return task.dueDate.startsWith('2024-10-15') || task.dueDate === todayStr;
    }
    return true;
  });

  // Calculate overall completion
  const totalCount = tasks.length;
  const completedCount = tasks.filter((t) => t.status === 'Done').length;
  const completionPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Group by category
  const categories: Category[] = ['Work', 'Health', 'Personal', 'Shopping', 'Documentation'];
  const categoryColors: Record<Category, string> = {
    Work: 'bg-primary text-primary',
    Health: 'bg-secondary text-secondary',
    Personal: 'bg-tertiary text-tertiary',
    Shopping: 'bg-[#924700] text-[#924700]',
    Documentation: 'bg-on-surface-variant text-on-surface-variant',
  };

  const getCategoryLabel = (cat: Category) => {
    switch (cat) {
      case 'Work':
        return t.work;
      case 'Health':
        return t.health;
      case 'Personal':
        return t.personal;
      case 'Shopping':
        return t.shopping;
      case 'Documentation':
        return t.documentation;
    }
  };

  const getPriorityBadge = (priority: Priority) => {
    switch (priority) {
      case 'Urgent':
        return (
          <span className="bg-error text-on-error font-bold text-[11px] px-2 py-0.5 rounded-full shadow-xs">
            {t.priorityUrgent}
          </span>
        );
      case 'High':
        return (
          <span className="bg-error-container text-on-error-container font-semibold text-[11px] px-2 py-0.5 rounded-full">
            {t.priorityHigh}
          </span>
        );
      case 'Medium':
        return (
          <span className="bg-primary-fixed text-on-primary-fixed-variant font-semibold text-[11px] px-2 py-0.5 rounded-full">
            {t.priorityMedium}
          </span>
        );
      case 'Low':
        return (
          <span className="bg-surface-container-high text-on-surface-variant font-semibold text-[11px] px-2 py-0.5 rounded-full">
            {t.priorityLow}
          </span>
        );
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto w-full pb-20 md:pb-8 animate-in fade-in duration-300">
      {/* Top Header & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-extrabold text-on-surface dark:text-[#f0f1f2] tracking-tight">
            {t.myTasks}
          </h1>
          <span className="bg-primary-fixed text-on-primary-fixed font-bold text-xs px-3 py-1 rounded-full">
            {tasks.filter((t) => t.status !== 'Done').length} {lang === 'zh' ? '项待办' : 'Active'}
          </span>
        </div>

        {/* Filter Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-surface dark:bg-[#191c1d] border border-outline-variant dark:border-outline rounded-xl text-xs font-semibold text-on-surface dark:text-[#f0f1f2] focus:outline-none focus:ring-2 focus:ring-primary shadow-xs"
          >
            <option value="All">{t.statusAll}</option>
            <option value="To Do">{t.toDo}</option>
            <option value="In Progress">{t.inProgress}</option>
            <option value="Done">{t.done}</option>
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 bg-surface dark:bg-[#191c1d] border border-outline-variant dark:border-outline rounded-xl text-xs font-semibold text-on-surface dark:text-[#f0f1f2] focus:outline-none focus:ring-2 focus:ring-primary shadow-xs"
          >
            <option value="All">{t.priorityAll}</option>
            <option value="Urgent">{t.priorityUrgent}</option>
            <option value="High">{t.priorityHigh}</option>
            <option value="Medium">{t.priorityMedium}</option>
            <option value="Low">{t.priorityLow}</option>
          </select>

          {/* Today Filter */}
          <button
            onClick={() => setOnlyToday(!onlyToday)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all border shadow-xs ${
              onlyToday
                ? 'bg-primary text-on-primary border-primary shadow-sm'
                : 'bg-surface dark:bg-[#191c1d] text-on-surface dark:text-[#f0f1f2] border-outline-variant dark:border-outline hover:bg-surface-container-low'
            }`}
          >
            <span className="material-symbols-outlined text-sm">calendar_today</span>
            <span>{t.today}</span>
          </button>
        </div>
      </div>

      {/* Progress Bar Section */}
      <div className="mb-8 bg-surface dark:bg-[#191c1d] p-5 rounded-2xl border border-surface-variant dark:border-outline-variant shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-bold text-on-surface dark:text-[#f0f1f2]">
            {t.overallCompletion}
          </span>
          <span className="text-base font-extrabold text-secondary">{completionPercentage}%</span>
        </div>
        <div className="w-full bg-surface-container-highest dark:bg-[#2e3132] rounded-full h-2 overflow-hidden">
          <div
            className="bg-secondary h-2 rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${completionPercentage}%` }}
          ></div>
        </div>
      </div>

      {/* Task List Grouped by Category */}
      <div className="space-y-8">
        {categories.map((cat) => {
          const catTasks = filteredTasks.filter((t) => t.category === cat);
          if (catTasks.length === 0) return null;

          return (
            <div key={cat} className="space-y-3">
              {/* Category Header */}
              <div className="flex items-center gap-2 px-1">
                <span className={`w-2.5 h-2.5 rounded-full ${categoryColors[cat].split(' ')[0]}`}></span>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant">
                  {getCategoryLabel(cat)} ({catTasks.length})
                </h3>
              </div>

              {/* Tasks in this category */}
              <div className="space-y-2.5">
                {catTasks.map((task) => {
                  const isDone = task.status === 'Done';
                  return (
                    <div
                      key={task.id}
                      onClick={() => onSelectTask(task)}
                      className={`group flex items-center justify-between p-4 bg-surface dark:bg-[#191c1d] border rounded-2xl transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md hover:-translate-y-0.5 ${
                        isDone
                          ? 'border-surface-variant dark:border-outline-variant opacity-75 bg-surface-container-lowest/50'
                          : 'border-surface-variant dark:border-outline-variant hover:border-primary/50'
                      }`}
                    >
                      {/* Left: Checkbox & Info */}
                      <div className="flex items-center gap-4 min-w-0">
                        {/* Custom Interactive Checkbox */}
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleTaskCompletion(task.id, e);
                          }}
                          className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-150 flex-shrink-0 cursor-pointer ${
                            isDone
                              ? 'bg-secondary border-2 border-secondary text-on-secondary shadow-xs scale-105'
                              : 'border-2 border-outline hover:border-primary bg-surface dark:bg-[#2e3132]'
                          }`}
                        >
                          <span
                            className="material-symbols-outlined text-base font-bold transition-opacity duration-150"
                            style={{ opacity: isDone ? 1 : 0 }}
                          >
                            check
                          </span>
                        </div>

                        {/* Title & Meta */}
                        <div className="flex flex-col min-w-0">
                          <span
                            className={`font-semibold text-base truncate transition-colors ${
                              isDone
                                ? 'line-through text-on-surface-variant'
                                : 'text-on-surface dark:text-[#f0f1f2] group-hover:text-primary dark:group-hover:text-[#adc6ff]'
                            }`}
                          >
                            {task.title}
                          </span>
                          <div className="flex flex-wrap items-center gap-2.5 mt-1">
                            {getPriorityBadge(task.priority)}

                            <span className="flex items-center gap-1 text-xs font-medium text-on-surface-variant">
                              <span className="material-symbols-outlined text-xs">event</span>
                              {task.dueDate} {task.dueTime ? `• ${task.dueTime}` : ''}
                            </span>

                            {task.tag && (
                              <span className="text-[11px] bg-surface-container dark:bg-[#2e3132] text-on-surface-variant px-2 py-0.5 rounded-md font-medium">
                                #{task.tag}
                              </span>
                            )}

                            {task.subtasks && task.subtasks.length > 0 && (
                              <span className="flex items-center gap-1 text-xs text-on-surface-variant">
                                <span className="material-symbols-outlined text-xs">checklist</span>
                                {task.subtasks.filter((st) => st.completed).length}/{task.subtasks.length}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Assignee & Action */}
                      <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                        {(task.assignees?.length ? task.assignees : task.assignee ? [task.assignee] : []).slice(0, 3).map((member) => (
                          member.avatar ? <img key={member.id} src={member.avatar} alt={member.name} title={member.name} className="w-7 h-7 rounded-full object-cover border border-outline-variant hidden sm:block shadow-xs" /> : <span key={member.id} title={member.name} className="w-7 h-7 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center border border-outline-variant hidden sm:flex">{member.name.slice(0, 1)}</span>
                        ))}
                        {(task.assignees?.length || 0) > 3 && <span className="text-[10px] font-bold text-on-surface-variant">+{(task.assignees?.length || 0) - 3}</span>}
                        <button className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-surface-container dark:hover:bg-[#2e3132] rounded-full text-on-surface-variant transition-all">
                          <span className="material-symbols-outlined text-lg">drag_indicator</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {filteredTasks.length === 0 && (
          <div className="text-center py-16 bg-surface dark:bg-[#191c1d] rounded-2xl border border-dashed border-outline-variant">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-2">
              task_alt
            </span>
            <p className="text-base font-semibold text-on-surface dark:text-[#f0f1f2]">
              {lang === 'zh' ? '当前筛选条件下没有任务' : 'No tasks match your filter'}
            </p>
            <p className="text-xs text-on-surface-variant mt-1">
              {lang === 'zh' ? '请尝试更换筛选条件或新建一个任务' : 'Try resetting your filter or creating a new task'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
