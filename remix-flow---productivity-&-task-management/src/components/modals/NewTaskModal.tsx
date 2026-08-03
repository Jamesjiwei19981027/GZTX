import React, { useState, useEffect } from 'react';
import { Task, Priority, Status, Category, Project, TeamMember, Language } from '../../types';
import { getT } from '../../i18n';
import { TEAM_MEMBERS } from '../../data/mockData';

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateTask: (taskData: Omit<Task, 'id'>) => void;
  currentProject: Project;
  defaultStatus?: Status;
  defaultDate?: string;
  defaultPriority?: Priority;
  defaultCategory?: Category;
  defaultTitle?: string;
  defaultDescription?: string;
  lang: Language;
}

export const NewTaskModal: React.FC<NewTaskModalProps> = ({
  isOpen,
  onClose,
  onCreateTask,
  currentProject,
  defaultStatus = 'To Do',
  defaultDate,
  defaultPriority = 'Medium',
  defaultCategory = 'Work',
  defaultTitle = '',
  defaultDescription = '',
  lang,
}) => {
  const t = getT(lang);

  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [priority, setPriority] = useState<Priority>(defaultPriority);
  const [status, setStatus] = useState<Status>(defaultStatus);
  const [category, setCategory] = useState<Category>(defaultCategory);
  const [dueDate, setDueDate] = useState(defaultDate || new Date().toISOString().split('T')[0]);
  const [dueTime, setDueTime] = useState('17:00');
  const [tag, setTag] = useState('日常推进');
  const [assigneeId, setAssigneeId] = useState<string>(TEAM_MEMBERS[0].id);
  const [subtaskInput, setSubtaskInput] = useState('');
  const [subtasks, setSubtasks] = useState<{ id: string; title: string; completed: boolean }[]>([
    { id: 'st-new-1', title: lang === 'zh' ? '核对需求目标' : 'Review requirements', completed: false },
  ]);

  useEffect(() => {
    if (isOpen) {
      setTitle(defaultTitle || '');
      setDescription(defaultDescription || '');
      setStatus(defaultStatus);
      setPriority(defaultPriority);
      setCategory(defaultCategory);
      if (defaultDate) setDueDate(defaultDate);
    }
  }, [isOpen, defaultTitle, defaultDescription, defaultStatus, defaultPriority, defaultCategory, defaultDate]);

  if (!isOpen) return null;

  const handleAddSubtask = () => {
    if (!subtaskInput.trim()) return;
    setSubtasks([
      ...subtasks,
      { id: `st-${Date.now()}`, title: subtaskInput.trim(), completed: false },
    ]);
    setSubtaskInput('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const selectedAssignee = TEAM_MEMBERS.find((m) => m.id === assigneeId) || TEAM_MEMBERS[0];

    onCreateTask({
      title: title.trim(),
      description: description.trim(),
      priority,
      status,
      category,
      dueDate,
      dueTime,
      assignee: selectedAssignee,
      subtasks,
      tag: tag.trim() || undefined,
      projectId: currentProject.id,
      progress: status === 'In Progress' ? 30 : status === 'Done' ? 100 : 0,
    });

    // Reset and close
    setTitle('');
    setDescription('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-surface dark:bg-[#2e3132] rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl border border-surface-variant dark:border-outline my-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-6 pb-3 border-b border-surface-variant dark:border-outline-variant">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary-fixed/30 text-primary flex items-center justify-center font-bold">
              +
            </div>
            <h2 className="text-xl font-bold text-on-surface dark:text-[#f0f1f2]">
              {t.createTaskTitle}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-surface-container text-on-surface-variant"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title Input */}
          <div>
            <label className="block text-xs font-bold uppercase text-on-surface-variant mb-1.5">
              {t.taskTitleLabel} <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t.taskTitlePlaceholder}
              autoFocus
              className="w-full px-4 py-3 bg-surface-container-low dark:bg-[#191c1d] border border-outline-variant dark:border-outline rounded-xl text-sm font-semibold text-on-surface dark:text-[#f0f1f2] focus:ring-2 focus:ring-primary focus:outline-none placeholder-on-surface-variant"
              required
            />
          </div>

          {/* Description Input */}
          <div>
            <label className="block text-xs font-bold uppercase text-on-surface-variant mb-1.5">
              {t.descriptionLabel}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t.descriptionPlaceholder}
              rows={3}
              className="w-full px-4 py-2.5 bg-surface-container-low dark:bg-[#191c1d] border border-outline-variant dark:border-outline rounded-xl text-sm text-on-surface dark:text-[#f0f1f2] focus:ring-2 focus:ring-primary focus:outline-none placeholder-on-surface-variant resize-none"
            ></textarea>
          </div>

          {/* Grid Row 1: Priority & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-on-surface-variant mb-1.5">
                {lang === 'zh' ? '优先级' : 'Priority'}
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full px-3 py-2.5 bg-surface-container-low dark:bg-[#191c1d] border border-outline-variant rounded-xl text-xs font-bold text-on-surface dark:text-[#f0f1f2] focus:ring-2 focus:ring-primary focus:outline-none"
              >
                <option value="Urgent">{t.priorityUrgent}</option>
                <option value="High">{t.priorityHigh}</option>
                <option value="Medium">{t.priorityMedium}</option>
                <option value="Low">{t.priorityLow}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-on-surface-variant mb-1.5">
                {lang === 'zh' ? '看板状态' : 'Status'}
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
                className="w-full px-3 py-2.5 bg-surface-container-low dark:bg-[#191c1d] border border-outline-variant rounded-xl text-xs font-bold text-on-surface dark:text-[#f0f1f2] focus:ring-2 focus:ring-primary focus:outline-none"
              >
                <option value="To Do">{t.toDo}</option>
                <option value="In Progress">{t.inProgress}</option>
                <option value="Done">{t.done}</option>
              </select>
            </div>
          </div>

          {/* Grid Row 2: Category & Due Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-on-surface-variant mb-1.5">
                {t.categoryLabel}
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className="w-full px-3 py-2.5 bg-surface-container-low dark:bg-[#191c1d] border border-outline-variant rounded-xl text-xs font-bold text-on-surface dark:text-[#f0f1f2] focus:ring-2 focus:ring-primary focus:outline-none"
              >
                <option value="Work">{t.work}</option>
                <option value="Health">{t.health}</option>
                <option value="Personal">{t.personal}</option>
                <option value="Shopping">{t.shopping}</option>
                <option value="Documentation">{t.documentation}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-on-surface-variant mb-1.5">
                {t.dueDate}
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 bg-surface-container-low dark:bg-[#191c1d] border border-outline-variant rounded-xl text-xs font-semibold text-on-surface dark:text-[#f0f1f2] focus:ring-2 focus:ring-primary focus:outline-none"
              />
            </div>
          </div>

          {/* Assignee Selection */}
          <div>
            <label className="block text-xs font-bold uppercase text-on-surface-variant mb-1.5">
              {t.assignee}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-32 overflow-y-auto p-1 bg-surface-container-lowest dark:bg-[#191c1d] rounded-xl border border-outline-variant">
              {TEAM_MEMBERS.map((member) => {
                const isSelected = assigneeId === member.id;
                return (
                  <div
                    key={member.id}
                    onClick={() => setAssigneeId(member.id)}
                    className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-primary-fixed/40 text-primary font-bold'
                        : 'hover:bg-surface-container text-on-surface'
                    }`}
                  >
                    <img src={member.avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                    <span className="text-xs truncate">{member.name}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tag input */}
          <div>
            <label className="block text-xs font-bold uppercase text-on-surface-variant mb-1.5">
              {lang === 'zh' ? '分组标签' : 'Tag'}
            </label>
            <input
              type="text"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="例如: 技术调研, UI设计..."
              className="w-full px-3 py-2 bg-surface-container-low dark:bg-[#191c1d] border border-outline-variant rounded-xl text-xs font-medium text-on-surface dark:text-[#f0f1f2] focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>

          {/* Subtasks Section */}
          <div className="pt-2">
            <label className="block text-xs font-bold uppercase text-on-surface-variant mb-1.5">
              {t.subtasks} ({subtasks.length})
            </label>
            <div className="space-y-1.5 max-h-24 overflow-y-auto mb-2">
              {subtasks.map((st, i) => (
                <div key={st.id} className="flex items-center justify-between bg-surface-container-low dark:bg-[#191c1d] px-3 py-1.5 rounded-lg text-xs">
                  <span className="truncate">{st.title}</span>
                  <button
                    type="button"
                    onClick={() => setSubtasks(subtasks.filter((item) => item.id !== st.id))}
                    className="text-error hover:opacity-80"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={subtaskInput}
                onChange={(e) => setSubtaskInput(e.target.value)}
                placeholder={lang === 'zh' ? '输入子任务内容...' : 'Add a subtask step...'}
                className="flex-grow px-3 py-1.5 bg-surface-container-low dark:bg-[#191c1d] border border-outline-variant rounded-lg text-xs text-on-surface focus:outline-none focus:border-primary"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSubtask();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleAddSubtask}
                className="px-3 py-1.5 bg-secondary-container text-on-secondary-container rounded-lg text-xs font-bold hover:opacity-90"
              >
                +
              </button>
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-surface-variant">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-outline-variant font-semibold text-xs text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-primary text-on-primary rounded-xl font-bold text-xs shadow-md hover:opacity-90 transition-all active:scale-95"
            >
              {t.create}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
