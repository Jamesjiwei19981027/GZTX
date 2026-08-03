import React, { useState } from 'react';
import { Task, Status, Priority, Language, TeamMember } from '../../types';
import { getT } from '../../i18n';

function relativeCompletedAt(value: string | undefined, lang: Language): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const hours = Math.max(0, Math.round((Date.now() - date.getTime()) / 3600000));
  if (hours < 24) return lang === 'zh' ? `${hours || 1} 小时前完成` : `completed ${hours || 1}h ago`;
  const days = Math.round(hours / 24);
  return lang === 'zh' ? `${days} 天前完成` : `completed ${days}d ago`;
}

interface KanbanViewProps {
  tasks: Task[];
  members?: TeamMember[];
  lastUpdatedAt?: string;
  onUpdateTaskStatus: (taskId: string, newStatus: Status) => void;
  onSelectTask: (task: Task) => void;
  onOpenNewTaskWithStatus: (status: Status) => void;
  lang: Language;
}

export const KanbanView: React.FC<KanbanViewProps> = ({
  tasks,
  members = [],
  lastUpdatedAt,
  onUpdateTaskStatus,
  onSelectTask,
  onOpenNewTaskWithStatus,
  lang,
}) => {
  const t = getT(lang);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<Status | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [query, setQuery] = useState('');

  const categoryOptions = Array.from(new Set(tasks.map((task) => task.category).filter(Boolean)));

  const visibleTasks = tasks.filter((task) => {
    const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter;
    const matchesCategory = categoryFilter === 'all' || task.category === categoryFilter;
    const matchesQuery = !query.trim() || `${task.title} ${task.description || ''} ${task.tag || ''}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesPriority && matchesCategory && matchesQuery;
  });

  const columns: { id: Status; label: string; color: string; badgeColor: string }[] = [
    {
      id: 'To Do',
      label: t.toDo,
      color: 'border-t-4 border-outline-variant dark:border-outline',
      badgeColor: 'bg-surface-container-high text-on-surface-variant',
    },
    {
      id: 'In Progress',
      label: t.inProgress,
      color: 'border-t-4 border-primary',
      badgeColor: 'bg-primary-fixed text-on-primary-fixed',
    },
    {
      id: 'Done',
      label: t.done,
      color: 'border-t-4 border-secondary',
      badgeColor: 'bg-secondary text-on-secondary',
    },
  ];

  const getPriorityBadge = (priority: Priority) => {
    switch (priority) {
      case 'Urgent':
        return (
          <span className="bg-error text-on-error font-bold text-[10px] px-2 py-0.5 rounded shadow-xs">
            {lang === 'zh' ? '急' : 'Urgent'}
          </span>
        );
      case 'High':
        return (
          <span className="bg-error-container text-on-error-container font-bold text-[10px] px-2 py-0.5 rounded">
            {lang === 'zh' ? '高' : 'High'}
          </span>
        );
      case 'Medium':
        return (
          <span className="bg-primary-fixed text-on-primary-fixed font-semibold text-[10px] px-2 py-0.5 rounded">
            {lang === 'zh' ? '中' : 'Med'}
          </span>
        );
      case 'Low':
        return (
          <span className="bg-surface-container-high text-on-surface-variant font-semibold text-[10px] px-2 py-0.5 rounded">
            {lang === 'zh' ? '低' : 'Low'}
          </span>
        );
    }
  };

  // Drag & drop handlers
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.setData('text/plain', taskId);
  };

  const handleDragOver = (e: React.DragEvent, status: Status) => {
    e.preventDefault();
    setDragOverStatus(status);
  };

  const handleDrop = (e: React.DragEvent, status: Status) => {
    e.preventDefault();
    setDragOverStatus(null);
    const id = e.dataTransfer.getData('text/plain') || draggedTaskId;
    if (id) {
      onUpdateTaskStatus(id, status);
      setDraggedTaskId(null);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto w-full pb-20 md:pb-8 animate-in fade-in duration-300">
      {/* Kanban Header */}
      <div className="flex flex-wrap gap-4 justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-on-surface dark:text-[#f0f1f2] tracking-tight">
            {t.kanban}
          </h1>
          <p className="text-xs md:text-sm text-on-surface-variant mt-1">
            {lang === 'zh'
              ? '拖放卡片在列之间快速更新状态，或点击卡片查看执行细节。'
              : 'Drag cards between columns to update status, or click to inspect details.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex -space-x-2 mr-2">
            {members.slice(0, 5).map((member) => (
              <img key={member.id} src={member.avatar || undefined} alt={member.name} title={member.name} className="w-8 h-8 rounded-full border-2 border-surface object-cover bg-surface-container" />
            ))}
            {members.length > 5 && <span className="w-8 h-8 rounded-full border-2 border-surface bg-surface-container text-[10px] font-bold flex items-center justify-center">+{members.length - 5}</span>}
          </div>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={lang === 'zh' ? '筛选任务' : 'Filter tasks'} className="w-36 px-3 py-2 rounded-xl border border-outline-variant bg-surface text-xs" />
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as Priority | 'all')} className="px-3 py-2 rounded-xl border border-outline-variant bg-surface text-xs">
            <option value="all">{lang === 'zh' ? '全部优先级' : 'All priorities'}</option>
            <option value="Urgent">{lang === 'zh' ? '紧急' : 'Urgent'}</option>
            <option value="High">{lang === 'zh' ? '高' : 'High'}</option>
            <option value="Medium">{lang === 'zh' ? '中' : 'Medium'}</option>
            <option value="Low">{lang === 'zh' ? '低' : 'Low'}</option>
          </select>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-outline-variant bg-surface text-xs">
            <option value="all">{lang === 'zh' ? '全部分类' : 'All categories'}</option>
            {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </div>
      </div>
      <div className="mb-5 text-xs text-on-surface-variant flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-secondary" />
        <span>{lang === 'zh' ? '正常运行' : 'Operational'}</span>
        <span>·</span>
        <span>{lang === 'zh' ? '最后更新' : 'Last updated'} {lastUpdatedAt || (lang === 'zh' ? '暂无活动记录' : 'no activity recorded')}</span>
      </div>

      {/* Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {columns.map((col) => {
          const colTasks = visibleTasks.filter((t) => t.status === col.id);
          const isOver = dragOverStatus === col.id;

          return (
            <div
              key={col.id}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={() => setDragOverStatus(null)}
              onDrop={(e) => handleDrop(e, col.id)}
              className={`bg-surface-container-low dark:bg-[#191c1d] rounded-2xl p-4 flex flex-col transition-all duration-200 border ${
                col.color
              } ${
                isOver
                  ? 'border-primary ring-2 ring-primary/20 bg-primary-fixed/10 dark:bg-[#2e3132]'
                  : 'border-surface-variant dark:border-outline-variant shadow-sm'
              }`}
            >
              {/* Column Title Header */}
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-surface-variant dark:border-outline-variant">
                <h3 className="font-bold text-base text-on-surface dark:text-[#f0f1f2] flex items-center gap-2">
                  <span>{col.label}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-extrabold ${col.badgeColor}`}>
                    {colTasks.length}
                  </span>
                </h3>
                <button
                  onClick={() => onOpenNewTaskWithStatus(col.id)}
                  className="p-1 hover:bg-surface dark:hover:bg-[#2e3132] rounded-lg text-on-surface-variant hover:text-primary transition-colors"
                  title={lang === 'zh' ? '添加任务到此列' : 'Add task to column'}
                >
                  <span className="material-symbols-outlined text-lg">add</span>
                </button>
              </div>

              {/* Task Cards Column Body */}
              <div className="space-y-3.5 min-h-[360px]">
                {colTasks.length === 0 ? (
                  <div className="h-48 border-2 border-dashed border-outline-variant/40 rounded-xl flex flex-col items-center justify-center text-center p-4">
                    <span className="material-symbols-outlined text-3xl text-on-surface-variant/50 mb-1">
                      post_add
                    </span>
                    <span className="text-xs text-on-surface-variant">
                      {lang === 'zh' ? '此列暂无卡片' : 'No tasks here yet'}
                    </span>
                  </div>
                ) : (
                  colTasks.map((task) => {
                    const completedSub = task.subtasks.filter((st) => st.completed).length;
                    const totalSub = task.subtasks.length;
                    const taskAssignees = task.assignees?.length
                      ? task.assignees
                      : task.assignee
                        ? [task.assignee]
                        : [];

                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onClick={() => onSelectTask(task)}
                        className="bg-surface dark:bg-[#2e3132] p-4 rounded-xl border border-surface-variant dark:border-outline shadow-xs hover:shadow-md hover:border-primary/50 transition-all duration-200 cursor-grab active:cursor-grabbing group relative"
                      >
                        {/* Top Labels Row */}
                        <div className="flex justify-between items-center gap-2 mb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-sm text-on-surface-variant/70" title={lang === 'zh' ? '拖动手柄' : 'Drag handle'}>drag_indicator</span>
                            {getPriorityBadge(task.priority)}
                            {task.tag && (
                              <span className="text-[10px] bg-surface-container dark:bg-[#191c1d] text-on-surface-variant px-1.5 py-0.5 rounded font-medium">
                                #{task.tag}
                              </span>
                            )}
                          </div>
                          
                          {/* Quick Column Shift Actions on hover */}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {col.id !== 'To Do' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateTaskStatus(
                                    task.id,
                                    col.id === 'Done' ? 'In Progress' : 'To Do'
                                  );
                                }}
                                className="p-1 hover:bg-surface-container rounded text-on-surface-variant hover:text-primary"
                                title={lang === 'zh' ? '移往前一列' : 'Move left'}
                              >
                                <span className="material-symbols-outlined text-sm">arrow_back</span>
                              </button>
                            )}
                            {col.id !== 'Done' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateTaskStatus(
                                    task.id,
                                    col.id === 'To Do' ? 'In Progress' : 'Done'
                                  );
                                }}
                                className="p-1 hover:bg-surface-container rounded text-on-surface-variant hover:text-primary"
                                title={lang === 'zh' ? '移往下一列' : 'Move right'}
                              >
                                <span className="material-symbols-outlined text-sm">arrow_forward</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Card Title */}
                        <h4 className="font-bold text-sm text-on-surface dark:text-[#f0f1f2] leading-snug group-hover:text-primary dark:group-hover:text-[#adc6ff] transition-colors line-clamp-2">
                          {task.title}
                        </h4>

                        {/* Description snippet */}
                        {task.description && (
                          <p className="text-xs text-on-surface-variant mt-1 line-clamp-2 leading-relaxed opacity-90">
                            {task.description}
                          </p>
                        )}

                        {/* Progress bar for In Progress */}
                        {col.id === 'In Progress' && task.progress !== undefined && (
                          <div className="mt-3">
                            <div className="flex justify-between items-center text-[11px] font-semibold text-primary mb-1">
                              <span>{lang === 'zh' ? '研发执行进度' : 'Progress'}</span>
                              <span>{task.progress}%</span>
                            </div>
                            <div className="w-full bg-surface-container-highest dark:bg-[#191c1d] rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-primary h-1.5 rounded-full transition-all duration-500"
                                style={{ width: `${task.progress}%` }}
                              ></div>
                            </div>
                          </div>
                        )}

                        {/* Bottom Meta Row */}
                        <div className="flex justify-between items-center mt-3 pt-3 border-t border-surface-variant/60 dark:border-outline-variant/30 text-xs text-on-surface-variant">
                          <div className="flex items-center gap-3">
                            {totalSub > 0 && (
                              <span className="flex items-center gap-1 font-medium">
                                <span className="material-symbols-outlined text-xs">checklist</span>
                                {completedSub}/{totalSub}
                              </span>
                            )}
                            <span className="flex items-center gap-1 font-medium">
                              <span className="material-symbols-outlined text-xs">event</span>
                              {task.dueDate.split('-').slice(1).join('/')}
                            </span>
                            {col.id === 'Done' && relativeCompletedAt(task.completedAt, lang) && <span className="text-[10px] text-secondary">{relativeCompletedAt(task.completedAt, lang)}</span>}
                          </div>

                          {taskAssignees.length > 0 ? (
                            <div className="flex items-center -space-x-2" title={taskAssignees.map((member) => member.name).join(', ')}>
                              {taskAssignees.slice(0, 3).map((member) => (
                                member.avatar ? (
                                  <img key={member.id} src={member.avatar} alt={member.name} className="w-6 h-6 rounded-full object-cover border-2 border-surface dark:border-[#2e3132]" />
                                ) : (
                                  <span key={member.id} className="w-6 h-6 rounded-full border-2 border-surface dark:border-[#2e3132] bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">{member.name.slice(0, 1)}</span>
                                )
                              ))}
                              {taskAssignees.length > 3 && <span className="w-6 h-6 rounded-full border-2 border-surface dark:border-[#2e3132] bg-surface-container text-[10px] font-bold flex items-center justify-center">+{taskAssignees.length - 3}</span>}
                            </div>
                          ) : (
                            <span className="material-symbols-outlined text-base text-on-surface-variant/60">
                              account_circle
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Add Task Button at Column Footer */}
              <button
                onClick={() => onOpenNewTaskWithStatus(col.id)}
                className="mt-4 w-full py-2.5 bg-surface dark:bg-[#2e3132] hover:bg-surface-container border border-dashed border-outline-variant rounded-xl text-xs font-semibold text-on-surface-variant hover:text-primary transition-all flex items-center justify-center gap-1.5 shadow-xs"
              >
                <span className="material-symbols-outlined text-base">add</span>
                <span>{t.newTask}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
