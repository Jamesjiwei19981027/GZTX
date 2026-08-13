import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Task, Status, Priority, Category, Language } from '../../types';
import { getT } from '../../i18n';

interface MyTasksViewProps {
  tasks: Task[];
  onToggleTaskCompletion: (taskId: string, e: React.MouseEvent) => void;
  onSelectTask: (task: Task) => void;
  onBatchComplete?: (taskIds: string[]) => Promise<void> | void;
  onBatchReschedule?: (taskIds: string[], dueDate: string) => Promise<void> | void;
  onBatchDelete?: (taskIds: string[]) => Promise<void> | void;
  lang: Language;
}

function formatDateLocal(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return formatDateLocal(d);
}

function nextMondayStr(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const delta = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + delta);
  return formatDateLocal(d);
}

/** 顺延目标选择下拉（明天 / 下周一 / 选日期），逾期分组头与批量操作条共用 */
const RescheduleMenu: React.FC<{
  lang: Language;
  testIdPrefix: string;
  onPick: (dueDate: string) => void;
  triggerLabel: string;
  triggerClass?: string;
}> = ({ lang, testIdPrefix, onPick, triggerLabel, triggerClass }) => {
  const [open, setOpen] = useState(false);
  const [customDate, setCustomDate] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const pick = (date: string) => {
    setOpen(false);
    setCustomDate('');
    onPick(date);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        data-testid={`${testIdPrefix}-trigger`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={
          triggerClass ||
          'flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-error-container/60 text-on-error-container text-[11px] font-bold hover:bg-error-container transition-colors'
        }
      >
        <span className="material-symbols-outlined text-sm">event</span>
        <span>{triggerLabel}</span>
        <span className="material-symbols-outlined text-sm">expand_more</span>
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-52 bg-surface dark:bg-[#2e3132] rounded-xl shadow-xl border border-surface-variant dark:border-outline p-2 z-40 animate-in fade-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            data-testid={`${testIdPrefix}-tomorrow`}
            onClick={() => pick(tomorrowStr())}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-container-low dark:hover:bg-[#191c1d] text-xs font-semibold text-on-surface dark:text-[#f0f1f2]"
          >
            {lang === 'zh' ? '明天' : 'Tomorrow'}
            <span className="ml-2 text-on-surface-variant font-normal">{tomorrowStr()}</span>
          </button>
          <button
            data-testid={`${testIdPrefix}-next-monday`}
            onClick={() => pick(nextMondayStr())}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-container-low dark:hover:bg-[#191c1d] text-xs font-semibold text-on-surface dark:text-[#f0f1f2]"
          >
            {lang === 'zh' ? '下周一' : 'Next Monday'}
            <span className="ml-2 text-on-surface-variant font-normal">{nextMondayStr()}</span>
          </button>
          <div className="border-t border-surface-variant dark:border-outline-variant mt-1 pt-2 px-1 pb-1 space-y-1.5">
            <p className="text-[10px] font-bold uppercase text-on-surface-variant px-1">
              {lang === 'zh' ? '选日期' : 'Pick a date'}
            </p>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                data-testid={`${testIdPrefix}-date`}
                value={customDate}
                min={formatDateLocal(new Date())}
                onChange={(e) => setCustomDate(e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-outline-variant bg-surface dark:bg-[#191c1d] text-xs text-on-surface dark:text-[#f0f1f2]"
              />
              <button
                data-testid={`${testIdPrefix}-date-confirm`}
                disabled={!customDate}
                onClick={() => customDate && pick(customDate)}
                className="shrink-0 px-2.5 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-bold disabled:opacity-40"
              >
                {lang === 'zh' ? '确定' : 'Go'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const MyTasksView: React.FC<MyTasksViewProps> = ({
  tasks,
  onToggleTaskCompletion,
  onSelectTask,
  onBatchComplete,
  onBatchReschedule,
  onBatchDelete,
  lang,
}) => {
  const t = getT(lang);

  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [onlyToday, setOnlyToday] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const todayStr = formatDateLocal(new Date());

  // Filter tasks
  const filteredTasks = tasks.filter((task) => {
    if (statusFilter !== 'All' && task.status !== statusFilter) return false;
    if (priorityFilter !== 'All' && task.priority !== priorityFilter) return false;
    if (onlyToday) return task.dueDate === todayStr;
    return true;
  });

  // 默认排序：状态（进行中/待办在前，已完成垫底）→ 优先级 → 截止时间（无截止的靠后）
  const statusRank: Record<Status, number> = { 'In Progress': 0, 'To Do': 1, Done: 2 };
  const priorityRank: Record<Priority, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    const byStatus = statusRank[a.status] - statusRank[b.status];
    if (byStatus !== 0) return byStatus;
    const byPriority = priorityRank[a.priority] - priorityRank[b.priority];
    if (byPriority !== 0) return byPriority;
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });

  // 逾期分组置顶（未完成且截止日期早于今天），其余仍按分类分组
  const isOverdue = (task: Task) =>
    task.status !== 'Done' && !!task.dueDate && task.dueDate < todayStr;
  const overdueTasks = sortedTasks.filter(isOverdue);
  const normalTasks = sortedTasks.filter((task) => !isOverdue(task));

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

  // 键盘流的可见顺序：逾期组在前，随后按分类分组顺序
  const orderedTasks = useMemo(() => {
    const list: Task[] = [...overdueTasks];
    for (const cat of categories) {
      list.push(...normalTasks.filter((task) => task.category === cat));
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, statusFilter, priorityFilter, onlyToday]);

  const orderedRef = useRef(orderedTasks);
  orderedRef.current = orderedTasks;
  const highlightedRef = useRef(highlightedId);
  highlightedRef.current = highlightedId;

  const toggleSelected = (taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  // j/k 上下移动高亮、x 切换选中、e 打开详情、c 完成；输入框聚焦时忽略
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || active?.isContentEditable)
        return;
      const key = e.key.toLowerCase();
      if (!['j', 'k', 'x', 'e', 'c'].includes(key)) return;
      const list = orderedRef.current;
      if (!list.length) return;
      const currentIndex = list.findIndex((task) => task.id === highlightedRef.current);
      if (key === 'j' || key === 'k') {
        e.preventDefault();
        const nextIndex =
          currentIndex < 0
            ? key === 'j' ? 0 : list.length - 1
            : Math.min(list.length - 1, Math.max(0, currentIndex + (key === 'j' ? 1 : -1)));
        const nextTask = list[nextIndex];
        setHighlightedId(nextTask.id);
        document
          .querySelector(`[data-task-id="${nextTask.id}"]`)
          ?.scrollIntoView({ block: 'nearest' });
        return;
      }
      const current = currentIndex >= 0 ? list[currentIndex] : null;
      if (!current) return;
      e.preventDefault();
      if (key === 'x') toggleSelected(current.id);
      else if (key === 'e') onSelectTask(current);
      else if (key === 'c')
        onToggleTaskCompletion(current.id, {
          stopPropagation: () => undefined,
        } as React.MouseEvent);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSelectTask, onToggleTaskCompletion]);

  // 任务集变化后清理无效选中（如被删除/筛掉的任务）
  useEffect(() => {
    setSelectedIds((prev) => {
      const validIds = new Set(tasks.map((task) => task.id));
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [tasks]);

  const selectionActive = selectedIds.size > 0;

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

  const renderTaskRow = (task: Task) => {
    const isDone = task.status === 'Done';
    const isSelected = selectedIds.has(task.id);
    const isHighlighted = highlightedId === task.id;
    return (
      <div
        key={task.id}
        data-testid="task-row"
        data-task-id={task.id}
        onClick={() => onSelectTask(task)}
        className={`group flex items-center justify-between p-4 bg-surface dark:bg-[#191c1d] border rounded-2xl transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md hover:-translate-y-0.5 ${
          isDone
            ? 'border-surface-variant dark:border-outline-variant opacity-75 bg-surface-container-lowest/50'
            : 'border-surface-variant dark:border-outline-variant hover:border-primary/50'
        } ${isHighlighted ? 'ring-2 ring-primary/60' : ''} ${isSelected ? 'bg-primary/5 border-primary/40' : ''}`}
      >
        {/* Left: Select checkbox (hover / selection mode) + completion toggle + info */}
        <div className="flex items-center gap-3 min-w-0">
          <input
            type="checkbox"
            data-testid="task-select"
            checked={isSelected}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              toggleSelected(task.id);
            }}
            className={`w-4 h-4 accent-primary rounded cursor-pointer shrink-0 transition-opacity ${
              selectionActive || isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            title={lang === 'zh' ? '选择任务（批量操作）' : 'Select task'}
          />

          {/* Custom Interactive Checkbox */}
          <div
            data-testid="task-toggle"
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

              <span
                className={`flex items-center gap-1 text-xs font-medium ${
                  isOverdue(task) ? 'text-error font-bold' : 'text-on-surface-variant'
                }`}
              >
                <span className="material-symbols-outlined text-xs">event</span>
                {task.dueDate} {task.dueTime ? `• ${task.dueTime}` : ''}
              </span>

              {task.isRecurring && (
                <span
                  data-testid="task-recurring-badge"
                  className="flex items-center gap-0.5 text-[11px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-md font-semibold"
                  title={lang === 'zh' ? '重复任务' : 'Recurring task'}
                >
                  <span className="material-symbols-outlined text-xs">repeat</span>
                  {lang === 'zh' ? '重复' : 'Repeat'}
                </span>
              )}

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

      {/* Task List: overdue group first, then grouped by category */}
      <div className="space-y-8">
        {overdueTasks.length > 0 && (
          <div className="space-y-3" data-testid="overdue-group">
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-error"></span>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-error">
                  {lang === 'zh' ? '已逾期' : 'Overdue'} ({overdueTasks.length})
                </h3>
              </div>
              {onBatchReschedule && (
                <RescheduleMenu
                  lang={lang}
                  testIdPrefix="overdue-reschedule"
                  triggerLabel={lang === 'zh' ? '全部顺延' : 'Reschedule all'}
                  onPick={(date) =>
                    void onBatchReschedule(overdueTasks.map((task) => task.id), date)
                  }
                />
              )}
            </div>
            <div className="space-y-2.5">{overdueTasks.map((task) => renderTaskRow(task))}</div>
          </div>
        )}

        {categories.map((cat) => {
          const catTasks = normalTasks.filter((t) => t.category === cat);
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
              <div className="space-y-2.5">{catTasks.map((task) => renderTaskRow(task))}</div>
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

      {/* 键盘流提示（有任务时显示一次性的静态提示行） */}
      {orderedTasks.length > 0 && (
        <p className="mt-6 text-[11px] text-on-surface-variant text-center">
          {lang === 'zh'
            ? '键盘：J/K 移动 · X 选中 · E 打开详情 · C 完成 · ? 查看全部快捷键'
            : 'Keys: J/K move · X select · E open · C complete · ? all shortcuts'}
        </p>
      )}

      {/* Bottom floating batch actions bar */}
      {selectionActive && (
        <div
          data-testid="batch-bar"
          className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-surface dark:bg-[#2e3132] border border-outline-variant dark:border-outline rounded-2xl shadow-2xl px-4 py-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <span className="text-xs font-bold text-on-surface dark:text-[#f0f1f2] whitespace-nowrap">
            {lang === 'zh' ? `已选 ${selectedIds.size} 项` : `${selectedIds.size} selected`}
          </span>
          <div className="h-5 w-px bg-outline-variant" />
          {onBatchComplete && (
            <button
              data-testid="batch-complete"
              onClick={() => {
                const ids = [...selectedIds];
                setSelectedIds(new Set());
                void onBatchComplete(ids);
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary/15 text-secondary text-xs font-bold hover:bg-secondary/25 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">check_circle</span>
              <span>{lang === 'zh' ? '完成' : 'Complete'}</span>
            </button>
          )}
          {onBatchReschedule && (
            <RescheduleMenu
              lang={lang}
              testIdPrefix="batch-reschedule"
              triggerLabel={lang === 'zh' ? '顺延' : 'Reschedule'}
              triggerClass="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors"
              onPick={(date) => {
                const ids = [...selectedIds];
                setSelectedIds(new Set());
                void onBatchReschedule(ids, date);
              }}
            />
          )}
          {onBatchDelete && (
            <button
              data-testid="batch-delete"
              onClick={() => {
                const ids = [...selectedIds];
                setSelectedIds(new Set());
                void onBatchDelete(ids);
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-error-container/50 text-on-error-container text-xs font-bold hover:bg-error-container transition-colors"
            >
              <span className="material-symbols-outlined text-sm">delete</span>
              <span>{lang === 'zh' ? '删除' : 'Delete'}</span>
            </button>
          )}
          <div className="h-5 w-px bg-outline-variant" />
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            {lang === 'zh' ? '取消' : 'Cancel'}
          </button>
        </div>
      )}
    </div>
  );
};
