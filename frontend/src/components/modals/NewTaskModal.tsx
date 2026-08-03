import React, { useState, useEffect } from 'react';
import { Task, Priority, Status, Category, Project, Language } from '../../types';
import { getT } from '../../i18n';
import type { BackendCategory, BackendTag } from '../../api/backend';

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
  categories?: BackendCategory[];
  tags?: BackendTag[];
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
  categories = [],
  tags = [],
  lang,
}) => {
  const t = getT(lang);

  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [priority, setPriority] = useState<Priority>(defaultPriority);
  const [status, setStatus] = useState<Status>(defaultStatus);
  const [category, setCategory] = useState<Category>(defaultCategory);
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [dueDate, setDueDate] = useState(defaultDate || new Date().toISOString().split('T')[0]);
  const [dueTime, setDueTime] = useState('17:00');
  const [tag, setTag] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);

  useEffect(() => {
    if (isOpen) {
      setTitle(defaultTitle || '');
      setDescription(defaultDescription || '');
      setStatus(defaultStatus);
      setPriority(defaultPriority);
      setCategory(defaultCategory);
      setCategoryId(
        categories.find((item) => item.name === defaultCategory)?.id ?? categories[0]?.id,
      );
      setTag('');
      setAttachments([]);
      setDueDate(defaultDate || new Date().toISOString().split('T')[0]);
      setDueTime('17:00');
    }
  }, [isOpen, defaultTitle, defaultDescription, defaultStatus, defaultPriority, defaultCategory, defaultDate, categories]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onCreateTask({
      title: title.trim(),
      description: description.trim(),
      priority,
      status,
      category,
      categoryId,
      dueDate,
      dueTime,
      subtasks: [],
      tag: tag.trim() || undefined,
      attachments,
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
                value={categories.length ? String(categoryId ?? '') : category}
                onChange={(e) => {
                  if (categories.length) {
                    const id = Number(e.target.value);
                    setCategoryId(Number.isFinite(id) ? id : undefined);
                    const selected = categories.find((item) => item.id === id);
                    if (selected) setCategory(selected.name as Category);
                  } else {
                    setCategory(e.target.value as Category);
                  }
                }}
                className="w-full px-3 py-2.5 bg-surface-container-low dark:bg-[#191c1d] border border-outline-variant rounded-xl text-xs font-bold text-on-surface dark:text-[#f0f1f2] focus:ring-2 focus:ring-primary focus:outline-none"
              >
                {categories.length ? categories.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                )) : (
                  <>
                    <option value="Work">{t.work}</option>
                    <option value="Health">{t.health}</option>
                    <option value="Personal">{t.personal}</option>
                    <option value="Shopping">{t.shopping}</option>
                    <option value="Documentation">{t.documentation}</option>
                  </>
                )}
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
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTag(item.name)}
                    className={`px-2 py-1 rounded-full text-[11px] border ${
                      tag === item.name
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-outline-variant text-on-surface-variant'
                    }`}
                  >
                    #{item.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Attachments are uploaded after the task receives an ID. */}
          <div>
            <label className="block text-xs font-bold uppercase text-on-surface-variant mb-1.5">
              {lang === 'zh' ? '添加附件' : 'Attachments'}
            </label>
            <input
              type="file"
              multiple
              onChange={(e) => setAttachments(Array.from(e.target.files || []))}
              className="w-full text-xs text-on-surface-variant file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-primary"
            />
            {attachments.length > 0 && (
              <p className="mt-1 text-[11px] text-on-surface-variant">
                {attachments.length} {lang === 'zh' ? '个文件将在创建后上传' : 'file(s) will upload after creation'}
              </p>
            )}
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
