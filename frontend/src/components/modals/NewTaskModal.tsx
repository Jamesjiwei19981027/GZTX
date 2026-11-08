import React, { useState, useEffect } from 'react';
import { Task, Priority, Status, Category, Project, Language, TeamMember } from '../../types';
import { getT } from '../../i18n';
import { extractTaskFromChat } from '../../api/backend';
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
  defaultSource?: { channel?: string; title?: string; url?: string };
  categories?: BackendCategory[];
  tags?: BackendTag[];
  companyId?: number | null;
  members?: TeamMember[];
  currentUserId?: string;
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
  defaultSource,
  categories = [],
  tags = [],
  companyId,
  members = [],
  currentUserId,
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
  const [sourceChannel, setSourceChannel] = useState('wechat');
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceMessageId, setSourceMessageId] = useState('');
  const [chatText, setChatText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [showSourceTools, setShowSourceTools] = useState(false);
  const [assigneeUserIds, setAssigneeUserIds] = useState<string[]>([]);
  const [recurrence, setRecurrence] = useState<'' | 'daily' | 'weekdays' | 'weekly' | 'monthly'>('');

  // 重置表单只绑定 isOpen 变化：boot 期间 categories 后到时不得清空用户已输入的内容
  // （竞态修复：旧实现依赖 categories，分类加载完成会把打开状态下的表单整体重置）
  useEffect(() => {
    if (!isOpen) return;
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
    setSourceChannel(defaultSource?.channel || 'wechat');
    setSourceTitle(defaultSource?.title || '');
    setSourceUrl(defaultSource?.url || '');
    setSourceMessageId('');
    setChatText('');
    setShowSourceTools(false);
    setAssigneeUserIds([]);
    setRecurrence('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // categories 后到（boot 未完成时打开弹窗）：只补默认分类 id，不动其他字段
  useEffect(() => {
    if (!isOpen || categories.length === 0) return;
    setCategoryId(
      (prev) => prev ?? (categories.find((item) => item.name === defaultCategory)?.id ?? categories[0]?.id),
    );
  }, [isOpen, categories, defaultCategory]);

  if (!isOpen) return null;

  const handleExtract = async () => {
    if (!chatText.trim()) return;
    setExtracting(true);
    try {
      const result = await extractTaskFromChat({
        chat_text: chatText,
        source_channel: sourceChannel,
        source_title: sourceTitle || undefined,
        source_url: sourceUrl || undefined,
        source_message_id: sourceMessageId || undefined,
        company_id: companyId,
        project_id: Number(currentProject.id) > 0 ? Number(currentProject.id) : null,
      });
      const draft = result.draft;
      setTitle(draft.title || title);
      setDescription(draft.description || description);
      setPriority(draft.priority >= 2 ? 'High' : draft.priority <= 0 ? 'Low' : 'Medium');
      setStatus(draft.status === 2 ? 'Done' : draft.status === 1 ? 'In Progress' : 'To Do');
      if (draft.due_date) setDueDate(draft.due_date.slice(0, 10));
      if (draft.category) {
        const categoryItem = categories.find((item) => item.name === draft.category);
        if (categoryItem) { setCategoryId(categoryItem.id); setCategory(categoryItem.name as Category); }
      }
    } finally {
      setExtracting(false);
    }
  };

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
      sourceChannel,
      sourceTitle: sourceTitle.trim() || undefined,
      sourceUrl: sourceUrl.trim() || undefined,
      sourceMessageId: sourceMessageId.trim() || undefined,
      sourceMeta: chatText.trim() ? { extracted: true, chat_excerpt: chatText.trim().slice(0, 1000) } : undefined,
      projectId: currentProject.id,
      assigneeUserIds,
      progress: status === 'In Progress' ? 30 : status === 'Done' ? 100 : 0,
      isRecurring: recurrence !== '',
      recurrenceRule: recurrence || undefined,
    });

    // Reset and close
    setTitle('');
    setDescription('');
    onClose();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={t.createTaskTitle} className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
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
          <div className="mt-2">
            <button type="button" onClick={() => setShowSourceTools((value) => !value)} className="text-xs font-bold text-primary hover:underline">
              {lang === 'zh' ? '从聊天自动提取任务' : 'Extract from chat'}
            </button>
            {showSourceTools && (
              <div className="mt-2 p-3 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
                <textarea value={chatText} onChange={(e) => setChatText(e.target.value)} rows={3} placeholder={lang === 'zh' ? '粘贴微信/聊天内容，生成可编辑草稿…' : 'Paste chat text to create an editable draft…'} className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-xs" />
                <div className="grid grid-cols-3 gap-2">
                  <select value={sourceChannel} onChange={(e) => setSourceChannel(e.target.value)} className="px-2 py-1.5 rounded-lg border border-outline-variant bg-surface text-xs"><option value="wechat">WeChat</option><option value="chat">Chat</option><option value="email">Email</option></select>
                  <input value={sourceTitle} onChange={(e) => setSourceTitle(e.target.value)} placeholder={lang === 'zh' ? '会话名' : 'Conversation'} className="px-2 py-1.5 rounded-lg border border-outline-variant bg-surface text-xs" />
                  <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder={lang === 'zh' ? '原文链接' : 'Original URL'} className="px-2 py-1.5 rounded-lg border border-outline-variant bg-surface text-xs" />
                </div>
                <button type="button" disabled={extracting || !chatText.trim()} onClick={() => void handleExtract()} className="px-3 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-bold disabled:opacity-50">{extracting ? (lang === 'zh' ? '提取中…' : 'Extracting…') : (lang === 'zh' ? '生成草稿' : 'Generate draft')}</button>
              </div>
            )}
          </div>
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

          {/* Due Date */}
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

          {/* Recurrence */}
          <div>
            <label className="block text-xs font-bold uppercase text-on-surface-variant mb-1.5">
              <span className="inline-flex items-center gap-1">
                <span className="material-symbols-outlined text-sm align-middle">repeat</span>
                {lang === 'zh' ? '重复' : 'Repeat'}
              </span>
            </label>
            <select
              data-testid="new-task-recurrence"
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as typeof recurrence)}
              className="w-full px-3 py-2.5 bg-surface-container-low dark:bg-[#191c1d] border border-outline-variant rounded-xl text-xs font-bold text-on-surface dark:text-[#f0f1f2] focus:ring-2 focus:ring-primary focus:outline-none"
            >
              <option value="">{lang === 'zh' ? '不重复' : 'Does not repeat'}</option>
              <option value="daily">{lang === 'zh' ? '每天' : 'Daily'}</option>
              <option value="weekdays">{lang === 'zh' ? '工作日（周一至周五）' : 'Weekdays (Mon–Fri)'}</option>
              <option value="weekly">{lang === 'zh' ? '每周' : 'Weekly'}</option>
              <option value="monthly">{lang === 'zh' ? '每月' : 'Monthly'}</option>
            </select>
            {recurrence !== '' && (
              <p className="mt-1 text-[11px] text-on-surface-variant">
                {lang === 'zh'
                  ? '完成本次后会自动生成下一次任务。'
                  : 'Completing this task will schedule the next occurrence.'}
              </p>
            )}
          </div>

          {/* Project assignees */}
          <div className="p-3 rounded-xl border border-outline-variant bg-surface-container-low dark:bg-[#191c1d]">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase text-on-surface-variant">
                {lang === 'zh' ? '项目负责人' : 'Project assignees'}
              </label>
              {assigneeUserIds.length > 0 && (
                <button type="button" className="text-[11px] text-primary" onClick={() => setAssigneeUserIds([])}>
                  {lang === 'zh' ? '清空' : 'Clear'}
                </button>
              )}
            </div>
            {members.length > 0 ? (
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {members.map((member) => {
                  const checked = assigneeUserIds.includes(member.id);
                  return (
                    <label key={member.id} className="flex items-center gap-2 text-xs text-on-surface cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setAssigneeUserIds((prev) => checked ? prev.filter((id) => id !== member.id) : [...prev, member.id])}
                        className="accent-primary"
                      />
                      {member.avatar ? <img src={member.avatar} alt="" className="w-5 h-5 rounded-full object-cover" /> : <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center">{member.name.slice(0, 1)}</span>}
                      <span className="truncate">{member.name}</span>
                      {member.id === currentUserId && <span className="text-[10px] text-on-surface-variant">{lang === 'zh' ? '我' : 'me'}</span>}
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-on-surface-variant">
                {lang === 'zh' ? '个人任务将自动归属创建者；进入项目后可选择成员。' : 'Personal tasks stay with their creator; project members can be selected here.'}
              </p>
            )}
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
