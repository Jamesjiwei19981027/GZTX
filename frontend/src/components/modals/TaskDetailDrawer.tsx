import React, { useState, useEffect } from 'react';
import { Task, Status, Priority, Language, TeamMember } from '../../types';
import { getT } from '../../i18n';
import { TaskScheduleHistory } from '../TaskScheduleHistory';

interface TaskDetailDrawerProps {
  task: Task | null;
  onClose: () => void;
  onUpdateTask: (updatedTask: Task) => void | Promise<boolean | void>;
  onDeleteTask: (taskId: string) => void;
  members?: TeamMember[];
  currentUserId?: string;
  lang: Language;
}

export const TaskDetailDrawer: React.FC<TaskDetailDrawerProps> = ({
  task,
  onClose,
  onUpdateTask,
  onDeleteTask,
  members = [],
  currentUserId,
  lang,
}) => {
  const t = getT(lang);
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleSaved, setScheduleSaved] = useState(false);
  useEffect(() => {
    setDueDate(task?.dueDate || ''); setDueTime(task?.dueTime || '');
    setScheduleError(''); setScheduleSaved(false);
  }, [task?.id, task?.dueDate, task?.dueTime]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<Status>('To Do');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [linkedNodeId, setLinkedNodeId] = useState('');
  const [assigneeUserIds, setAssigneeUserIds] = useState<string[]>([]);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setStatus(task.status);
      setPriority(task.priority);
      setLinkedNodeId(task.linkedNodeId || '');
      setAssigneeUserIds((task.assignees || (task.assignee ? [task.assignee] : [])).map((member) => member.id));
    }
  }, [task]);

  if (!task) return null;

  const handleToggleSubtask = (subtaskId: string) => {
    const updatedSubtasks = task.subtasks.map((st) =>
      st.id === subtaskId ? { ...st, completed: !st.completed } : st
    );
    onUpdateTask({ ...task, subtasks: updatedSubtasks });
  };

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;
    const newSt = {
      id: `st-${Date.now()}`,
      title: newSubtaskTitle.trim(),
      completed: false,
    };
    onUpdateTask({
      ...task,
      subtasks: [...(task.subtasks || []), newSt],
    });
    setNewSubtaskTitle('');
  };

  const handleStatusChange = (newStatus: Status) => {
    setStatus(newStatus);
    onUpdateTask({ ...task, status: newStatus });
  };

  const handlePriorityChange = (newPriority: Priority) => {
    setPriority(newPriority);
    onUpdateTask({ ...task, priority: newPriority });
  };

  const handleAssigneeChange = (userId: string, checked: boolean) => {
    const nextIds = checked
      ? [...assigneeUserIds, userId]
      : assigneeUserIds.filter((id) => id !== userId);
    setAssigneeUserIds(nextIds);
    const selected = nextIds.map((id) => members.find((member) => member.id === id) || task.assignees?.find((member) => member.id === id)).filter(Boolean) as TeamMember[];
    onUpdateTask({
      ...task,
      assigneeUserIds: nextIds,
      assignees: selected,
      assignee: selected[0],
    });
  };

  const isDone = status === 'Done';

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex justify-end animate-in fade-in duration-200">
      <div
        className="bg-surface dark:bg-[#191c1d] w-full max-w-md h-full shadow-2xl border-l border-surface-variant dark:border-outline-variant flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div>
          <div className="p-6 border-b border-surface-variant dark:border-outline-variant flex items-center justify-between sticky top-0 bg-surface/90 dark:bg-[#191c1d]/90 backdrop-blur-md z-10">
            <div className="flex items-center gap-3">
              <span className={`w-3 h-3 rounded-full ${isDone ? 'bg-secondary' : 'bg-primary'}`}></span>
              <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                {lang === 'zh' ? '任务详情 ID:' : 'Task ID:'} #{task.id}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                data-testid="task-delete"
                onClick={() => {
                  // 软删可恢复：直接执行，由 App 弹「撤销」toast（回收站 30 天内可恢复）
                  onDeleteTask(task.id);
                }}
                className="p-1.5 hover:bg-error-container/20 text-error rounded-lg transition-colors"
                title={lang === 'zh' ? '删除任务（可在回收站恢复）' : 'Delete task (restorable from Trash)'}
              >
                <span className="material-symbols-outlined text-lg">delete</span>
              </button>
              <button
                onClick={onClose}
                aria-label={lang === 'zh' ? '关闭任务详情' : 'Close task details'}
                className="p-1.5 hover:bg-surface-container rounded-lg text-on-surface-variant transition-colors"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
          </div>

          {/* Main Drawer Content */}
          <div className="p-6 space-y-6">
            {/* Title */}
            <div>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  onUpdateTask({ ...task, title: e.target.value });
                }}
                className="text-xl font-extrabold text-on-surface dark:text-[#f0f1f2] bg-transparent border-b border-transparent focus:border-primary focus:outline-none w-full pb-1 transition-colors"
              />
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs bg-surface-container dark:bg-[#2e3132] px-2.5 py-1 rounded-full text-on-surface-variant font-semibold">
                  #{task.tag || task.category}
                </span>
                {task.projectId && (
                  <span className="text-xs text-primary font-medium">
                    {lang === 'zh' ? '所属团队项目' : 'Assigned Project Space'}
                  </span>
                )}
              </div>
            </div>
            {task.sourceChannel && (
              <div className="p-3 rounded-xl border border-primary/20 bg-primary/5 text-xs">
                <div className="flex items-center gap-2 font-bold text-primary"><span className="material-symbols-outlined text-sm">link</span>{lang === 'zh' ? '来源' : 'Source'} · {task.sourceTitle || task.sourceChannel}</div>
                {task.sourceUrl && <a href={task.sourceUrl} target="_blank" rel="noreferrer" className="block mt-1 text-primary underline truncate">{lang === 'zh' ? '查看原文' : 'View original'}</a>}
              </div>
            )}

            {/* Status & Priority Selectors */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-surface-container-low dark:bg-[#2e3132] rounded-2xl">
              <div>
                <label className="block text-[11px] font-bold uppercase text-on-surface-variant mb-1">
                  {lang === 'zh' ? '当前执行状态' : 'Status'}
                </label>
                <select
                  value={status}
                  onChange={(e) => handleStatusChange(e.target.value as Status)}
                  className="w-full px-3 py-1.5 bg-surface dark:bg-[#191c1d] border border-outline-variant rounded-lg text-xs font-bold text-on-surface dark:text-[#f0f1f2] focus:ring-1 focus:ring-primary focus:outline-none"
                >
                  <option value="To Do">{t.toDo}</option>
                  <option value="In Progress">{t.inProgress}</option>
                  <option value="Done">{t.done}</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-on-surface-variant mb-1">
                  {lang === 'zh' ? '紧急优先级' : 'Priority'}
                </label>
                <select
                  value={priority}
                  onChange={(e) => handlePriorityChange(e.target.value as Priority)}
                  className="w-full px-3 py-1.5 bg-surface dark:bg-[#191c1d] border border-outline-variant rounded-lg text-xs font-bold text-on-surface dark:text-[#f0f1f2] focus:ring-1 focus:ring-primary focus:outline-none"
                >
                  <option value="High">{t.priorityHigh}</option>
                  <option value="Medium">{t.priorityMedium}</option>
                  <option value="Low">{t.priorityLow}</option>
                </select>
              </div>
            </div>

            {/* Assignee & Dates Info */}
            <div className="space-y-3 pt-2 border-t border-surface-variant/60">
              <div className="flex justify-between items-center text-xs">
                <span className="text-on-surface-variant font-medium">{t.assignee}</span>
                {task.assignee ? (
                  <div className="flex items-center gap-2">
                    <img src={task.assignee.avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                    <span className="font-bold text-on-surface dark:text-[#f0f1f2]">{task.assignee.name}</span>
                  </div>
                ) : (
                  <span className="text-on-surface-variant italic">{lang === 'zh' ? '未指派' : 'Unassigned'}</span>
                )}
              </div>

              {members.length > 0 && (
                <div className="rounded-xl bg-surface-container-low dark:bg-[#2e3132] p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase text-on-surface-variant">{lang === 'zh' ? '项目成员' : 'Project members'}</span>
                    <button type="button" className="text-[11px] text-primary" onClick={() => {
                      setAssigneeUserIds([]);
                      onUpdateTask({ ...task, assigneeUserIds: [], assignees: [], assignee: undefined });
                    }}>{lang === 'zh' ? '清空' : 'Clear'}</button>
                  </div>
                  {members.map((member) => (
                    <label key={member.id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={assigneeUserIds.includes(member.id)} onChange={(event) => handleAssigneeChange(member.id, event.target.checked)} className="accent-primary" />
                      {member.avatar ? <img src={member.avatar} alt="" className="w-5 h-5 rounded-full object-cover" /> : <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center">{member.name.slice(0, 1)}</span>}
                      <span className="truncate">{member.name}</span>
                      {member.id === currentUserId && <span className="text-[10px] text-on-surface-variant">{lang === 'zh' ? '我' : 'me'}</span>}
                    </label>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="space-y-1"><span>{lang === 'zh' ? '截止日期' : 'Due date'}</span><input type="date" aria-label="截止日期" value={dueDate}
                    onChange={event => { setDueDate(event.target.value); setScheduleSaved(false); }} className="block w-full min-h-[44px] px-2 rounded-lg border border-outline-variant bg-surface text-on-surface" /></label>
                  <label className="space-y-1"><span>{lang === 'zh' ? '截止时刻' : 'Due time'}</span><input type="time" aria-label="截止时刻" value={dueTime}
                    onChange={event => { setDueTime(event.target.value); setScheduleSaved(false); }} className="block w-full min-h-[44px] px-2 rounded-lg border border-outline-variant bg-surface text-on-surface" /></label>
                </div>
                <button type="button" disabled={scheduleBusy || !!dueTime && !dueDate} onClick={async () => {
                  setScheduleBusy(true); setScheduleError('');
                  try {
                    const saved = await onUpdateTask({ ...task, dueDate, dueTime: dueTime || undefined });
                    if (saved === false) setScheduleError(lang === 'zh' ? '日程保存失败，请重试；已保留修改。' : 'Save failed. Your changes are preserved.');
                    else setScheduleSaved(true);
                  } catch (error) { setScheduleError(error instanceof Error ? error.message : '日程保存失败'); }
                  finally { setScheduleBusy(false); }
                }} className="min-h-[44px] px-3 rounded-lg bg-primary/10 text-primary font-semibold text-xs disabled:opacity-50">{scheduleBusy ? (lang === 'zh' ? '正在保存…' : 'Saving…') : (lang === 'zh' ? '保存日程' : 'Save schedule')}</button>
                {scheduleError && <p role="alert" className="text-xs text-error">{scheduleError}</p>}
                {scheduleSaved && <p role="status" className="text-xs text-secondary">{lang === 'zh' ? '日程已更新' : 'Schedule updated'}</p>}
                <TaskScheduleHistory taskId={task.id} revision={`${task.dueDate}:${task.dueTime}`} />
              </div>
              {task.projectId && (
                <label className="flex justify-between items-center text-xs text-on-surface-variant font-medium">
                  <span>{lang === 'zh' ? '关联人轴节点 ID' : 'People-axis node ID'}</span>
                  <input value={linkedNodeId} onChange={(event) => { setLinkedNodeId(event.target.value); onUpdateTask({ ...task, linkedNodeId: event.target.value || undefined }); }} placeholder="—" className="w-28 px-2 py-1 rounded-lg border border-outline-variant bg-surface text-xs text-right" inputMode="numeric" />
                </label>
              )}
            </div>

            {/* Description Notes */}
            <div>
              <label className="block text-xs font-bold uppercase text-on-surface-variant mb-2">
                {lang === 'zh' ? '执行要点与详细背景' : 'Description Notes'}
              </label>
              <textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  onUpdateTask({ ...task, description: e.target.value });
                }}
                rows={4}
                placeholder={lang === 'zh' ? '点击输入具体内容...' : 'Add details...'}
                className="w-full p-3 bg-surface-container-low dark:bg-[#2e3132] border border-outline-variant rounded-xl text-xs text-on-surface dark:text-[#f0f1f2] focus:ring-1 focus:ring-primary focus:outline-none resize-none leading-relaxed"
              ></textarea>
            </div>

            {/* Subtask Checklist */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold uppercase text-on-surface-variant">
                  {t.subtasks} ({task.subtasks.filter((st) => st.completed).length}/{task.subtasks.length})
                </label>
              </div>

              <div className="space-y-2 mb-3">
                {task.subtasks.map((st) => (
                  <div
                    key={st.id}
                    onClick={() => handleToggleSubtask(st.id)}
                    className="flex items-center gap-3 p-3 bg-surface-container-low dark:bg-[#2e3132] rounded-xl cursor-pointer hover:bg-surface-container transition-colors border border-transparent hover:border-outline-variant"
                  >
                    <input
                      type="checkbox"
                      checked={st.completed}
                      onChange={() => {}} // handled by parent div click
                      className="w-4 h-4 accent-secondary rounded cursor-pointer"
                    />
                    <span className={`text-xs font-medium flex-grow truncate ${st.completed ? 'line-through text-on-surface-variant' : 'text-on-surface dark:text-[#f0f1f2]'}`}>
                      {st.title}
                    </span>
                  </div>
                ))}
              </div>

              <form onSubmit={handleAddSubtask} className="flex gap-2">
                <input
                  type="text"
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  placeholder={lang === 'zh' ? '添加子步骤...' : 'Add checklist item...'}
                  className="flex-grow px-3 py-2 bg-surface-container-low dark:bg-[#2e3132] border border-outline-variant rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary"
                />
                <button
                  type="submit"
                  className="px-3 py-2 bg-primary/10 text-primary hover:bg-primary hover:text-on-primary rounded-xl text-xs font-bold transition-colors"
                >
                  +
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Bottom Sticky Action Bar */}
        <div className="p-6 border-t border-surface-variant dark:border-outline-variant bg-surface dark:bg-[#191c1d] sticky bottom-0">
          <button
            onClick={() => handleStatusChange(isDone ? 'To Do' : 'Done')}
            className={`w-full py-3 rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 active:scale-98 ${
              isDone
                ? 'bg-surface-container text-on-surface border border-outline-variant hover:bg-surface-container-high'
                : 'bg-secondary text-on-secondary hover:opacity-90'
            }`}
          >
            <span className="material-symbols-outlined text-xl">
              {isDone ? 'replay' : 'check_circle'}
            </span>
            <span>{isDone ? (lang === 'zh' ? '重新标记为待办' : 'Reopen Task') : t.markAsDone}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
