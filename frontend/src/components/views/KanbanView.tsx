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
      color: 'border-outline-variant dark:border-outline',
      badgeColor: 'bg-surface-container-high text-on-surface-variant',
    },
    {
      id: 'In Progress',
      label: t.inProgress,
      color: 'border-outline-variant',
      badgeColor: 'bg-primary-fixed text-on-primary-fixed',
    },
    {
      id: 'Done',
      label: t.done,
      color: 'border-outline-variant',
      badgeColor: 'bg-secondary text-on-secondary',
    },
  ];

  const getPriorityBadge = (priority: Priority) => {
    switch (priority) {
      case 'High':
        return (
          <span className="inline-flex items-center gap-2 text-xs font-medium text-on-surface-variant"><span aria-hidden="true" className="w-2 h-2 rounded-full bg-error" />
            {lang === 'zh' ? '高' : 'High'}
          </span>
        );
      case 'Medium':
        return (
          <span className="inline-flex items-center gap-2 text-xs font-medium text-on-surface-variant"><span aria-hidden="true" className="w-2 h-2 rounded-full bg-[#a86412]" />
            {lang === 'zh' ? '中' : 'Med'}
          </span>
        );
      case 'Low':
        return (
          <span className="inline-flex items-center gap-2 text-xs font-medium text-on-surface-variant"><span aria-hidden="true" className="w-2 h-2 rounded-full bg-outline" />
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
          <h1 className="text-3xl font-medium text-on-surface dark:text-on-surface  tabular-nums">
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
              member.avatar ? (
                <img key={member.id} src={member.avatar} alt={member.name} title={member.name} className="w-8 h-8 rounded-full border-2 border-surface object-cover bg-surface-container" />
              ) : (
                <span key={member.id} title={member.name} className="w-8 h-8 rounded-full border-2 border-surface bg-primary/10 text-primary text-xs font-medium flex items-center justify-center tabular-nums">
                  {member.name.slice(0, 1)}
                </span>
              )
            ))}
            {members.length > 5 && <span className="w-8 h-8 rounded-full border-2 border-surface bg-surface-container text-xs font-medium flex items-center justify-center tabular-nums">+{members.length - 5}</span>}
          </div>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={lang === 'zh' ? '筛选任务' : 'Filter tasks'} className="w-36 px-3 py-2 rounded-lg border border-outline-variant bg-surface text-xs" />
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as Priority | 'all')} className="px-3 py-2 rounded-lg border border-outline-variant bg-surface text-xs">
            <option value="all">{lang === 'zh' ? '全部优先级' : 'All priorities'}</option>
            <option value="High">{lang === 'zh' ? '高' : 'High'}</option>
            <option value="Medium">{lang === 'zh' ? '中' : 'Medium'}</option>
            <option value="Low">{lang === 'zh' ? '低' : 'Low'}</option>
          </select>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-outline-variant bg-surface text-xs">
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
              className={`bg-surface-container-lowest dark:bg-surface-container rounded-xl p-4 flex flex-col transition-ink-colors duration-200 border ${
                col.color
              } ${
                isOver
                  ? 'border-primary ring-2 ring-primary/20 bg-primary-fixed/10 dark:bg-surface-container'
                  : 'border-surface-variant dark:border-outline-variant shadow-sm dark:shadow-none'
              }`}
            >
              {/* Column Title Header */}
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-surface-variant dark:border-outline-variant">
                <h3 className="font-medium text-base text-on-surface dark:text-on-surface flex items-center gap-2 tabular-nums">
                  <span>{col.label}</span>
                  <span className={`text-xs px-2 py-1 rounded-md font-medium ${col.badgeColor}`}>
                    {colTasks.length}
                  </span>
                </h3>
                <button
                  onClick={() => onOpenNewTaskWithStatus(col.id)}
                  className="p-1 hover:bg-surface dark:hover:bg-surface-container-high rounded-lg text-on-surface-variant hover:text-primary transition-ink-colors"
                  title={lang === 'zh' ? '添加任务到此列' : 'Add task to column'}
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                </button>
              </div>

              {/* Task Cards Column Body */}
              <div className="space-y-4 min-h-[360px]">
                {colTasks.length === 0 ? (
                  <div className="h-48 border-2 border-dashed border-outline-variant/40 rounded-xl flex flex-col items-center justify-center text-center p-4">
                    <span className="material-symbols-outlined text-[18px] text-inherit mb-1">
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
                        className="py-4 border-b border-outline-variant hover:bg-surface-container transition-ink-colors duration-200 cursor-grab active:cursor-grabbing group relative"
                      >
                        {/* Top Labels Row */}
                        <div className="flex justify-between items-center gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-[18px] text-inherit" title={lang === 'zh' ? '拖动手柄' : 'Drag handle'}>drag_indicator</span>
                            {getPriorityBadge(task.priority)}
                            {task.tag && (
                              <span className="text-xs bg-surface-container dark:bg-surface-container-low text-on-surface-variant px-2 py-1 rounded font-medium tabular-nums">
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
                                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
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
                                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Card Title */}
                        <h4 className={`font-medium text-sm leading-snug transition-ink-colors line-clamp-2 ${task.status === 'Done' ? 'ink-done' : 'text-on-surface group-hover:text-primary'}`}>
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
                            <div className="flex justify-between items-center text-xs font-medium text-primary mb-1 tabular-nums">
                              <span>{lang === 'zh' ? '研发执行进度' : 'Progress'}</span>
                              <span>{task.progress}%</span>
                            </div>
                            <div className="w-full bg-surface-container-highest dark:bg-surface-container-low rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-primary h-1.5 rounded-full transition-ink-colors duration-500"
                                style={{ width: `${task.progress}%` }}
                              ></div>
                            </div>
                          </div>
                        )}

                        {/* Bottom Meta Row */}
                        <div className="flex justify-between items-center mt-3 pt-3 border-t border-surface-variant/60 dark:border-outline-variant/30 text-xs text-on-surface-variant">
                          <div className="flex items-center gap-3">
                            {totalSub > 0 && (
                              <span className="flex items-center gap-1 font-medium tabular-nums">
                                <span className="material-symbols-outlined text-[18px]">checklist</span>
                                {completedSub}/{totalSub}
                              </span>
                            )}
                            <span className="flex items-center gap-1 font-medium tabular-nums">
                              <span className="material-symbols-outlined text-[18px]">event</span>
                              {task.dueDate.split('-').slice(1).join('/')}
                            </span>
                            {col.id === 'Done' && relativeCompletedAt(task.completedAt, lang) && <span className="text-xs text-secondary">{relativeCompletedAt(task.completedAt, lang)}</span>}
                          </div>

                          {taskAssignees.length > 0 ? (
                            <div className="flex items-center -space-x-2" title={taskAssignees.map((member) => member.name).join(', ')}>
                              {taskAssignees.slice(0, 3).map((member) => (
                                member.avatar ? (
                                  <img key={member.id} src={member.avatar} alt={member.name} className="w-6 h-6 rounded-full object-cover border-2 border-surface dark:border-surface-container-high" />
                                ) : (
                                  <span key={member.id} className="w-6 h-6 rounded-full border-2 border-surface dark:border-surface-container-high bg-primary/10 text-primary text-xs font-medium flex items-center justify-center tabular-nums">{member.name.slice(0, 1)}</span>
                                )
                              ))}
                              {taskAssignees.length > 3 && <span className="w-6 h-6 rounded-full border-2 border-surface dark:border-surface-container-high bg-surface-container text-xs font-medium flex items-center justify-center tabular-nums">+{taskAssignees.length - 3}</span>}
                            </div>
                          ) : (
                            <span className="material-symbols-outlined text-[18px] text-inherit">
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
                className="mt-4 w-full py-2 bg-surface dark:bg-surface-container-high hover:bg-surface-container border border-dashed border-outline-variant rounded-lg text-xs font-medium text-on-surface-variant hover:text-primary transition-ink-colors flex items-center justify-center gap-2 shadow-sm dark:shadow-none tabular-nums"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                <span>{t.newTask}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
