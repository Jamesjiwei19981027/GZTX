import React, { useEffect, useMemo, useState } from 'react';
import { AutoGrowingTextarea } from '../AutoGrowingTextarea';
import { useKeyboardViewport } from '../../mobile/runtime/useKeyboardViewport';
import { Task, Priority, Category, Language } from '../../types';
import { getT } from '../../i18n';
import { parseNlDate } from '../../utils/nlDate';
import { parseQuickAddSyntax } from '../../utils/quickAddSyntax';

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 复用 App.handleCreateTask（与 NewTaskModal 同一条创建链路）：成功 true / 失败 false，失败时保留输入便于重试 */
  onCreateTask: (taskData: Omit<Task, 'id'>) => Promise<boolean>;
  projectId: string;
  defaultCategory?: Category;
  lang: Language;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeStr = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const QuickAddModal: React.FC<QuickAddModalProps> = ({
  isOpen,
  onClose,
  onCreateTask,
  projectId,
  defaultCategory = 'Work',
  lang,
}) => {
  const t = getT(lang);
  const { bottomInset, visibleBottom } = useKeyboardViewport();
  const [text, setText] = useState('');
  const [priority, setPriority] = useState<Priority>('Medium');
  /** 手动点过优先级按钮后，不再被 `p0/p1/p2` 语法覆盖 */
  const [priorityTouched, setPriorityTouched] = useState(false);
  // 记录被用户点 X 取消的短语；输入变化产生新短语后预览会重新出现
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setText('');
      setPriority('Medium');
      setPriorityTouched(false);
      setDismissedFor(null);
      setSubmitting(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const parsed = useMemo(() => parseNlDate(text), [text]);
  const parseActive = !!parsed.date && !!parsed.matched && dismissedFor !== parsed.matched;
  // 先摘掉时间短语再解析 #标签 / p0，避免记号被日期解析吃掉
  const syntax = useMemo(
    () => parseQuickAddSyntax(parseActive && parsed.cleanedText ? parsed.cleanedText : text),
    [parseActive, parsed.cleanedText, text],
  );
  // 用户手动点过优先级按钮就以手动值为准
  const effectivePriority = priorityTouched ? priority : syntax.priority ?? priority;

  if (!isOpen) return null;

  const previewLabel = parsed.date
    ? lang === 'zh'
      ? `${parsed.date.getMonth() + 1}月${parsed.date.getDate()}日 ${toTimeStr(parsed.date)}`
      : `${toDateStr(parsed.date)} ${toTimeStr(parsed.date)}`
    : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = text.trim();
    if (!raw || submitting) return;
    const due = parseActive ? parsed.date : null;
    // 标题优先取「去时间短语 + 去语法记号」后的结果；全被吃空则退回原始输入
    const title = syntax.title || (parseActive && parsed.cleanedText ? parsed.cleanedText : raw);
    setSubmitting(true);
    try {
      const ok = await onCreateTask({
        title,
        description: '',
        priority: effectivePriority,
        status: 'To Do',
        category: defaultCategory,
        dueDate: due ? toDateStr(due) : '',
        dueTime: due ? toTimeStr(due) : undefined,
        subtasks: [],
        projectId,
        progress: 0,
        ...(syntax.tag ? { tag: syntax.tag } : {}),
      });
      if (ok) {
        setText('');
        setPriorityTouched(false);
        setDismissedFor(null);
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const priorityOptions: { value: Priority; label: string }[] = [
    { value: 'Low', label: t.priorityLow },
    { value: 'Medium', label: t.priorityMedium },
    { value: 'High', label: t.priorityHigh },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.quickAdd}
      className="fixed inset-0 bg-black/50  z-50 flex items-start justify-center pt-[18vh] p-4 animate-in fade-in duration-200"
      style={{ bottom: bottomInset, paddingTop: bottomInset > 0 ? 16 : undefined }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={{ maxHeight: Math.max(120, visibleBottom - (bottomInset > 0 ? 32 : window.innerHeight * .18 + 16)) }} className="overflow-y-auto bg-surface-container-lowest dark:bg-surface-container rounded-[var(--radius-ink-panel)] max-w-xl w-full p-5 shadow-sm dark:shadow-none border border-surface-variant dark:border-outline">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-inherit">bolt</span>
            <h2 className="text-base font-medium text-on-surface dark:text-on-surface tabular-nums">{t.quickAdd}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-surface-container text-on-surface-variant"
            aria-label={t.cancel}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div className="flex items-center bg-surface-container-lowest dark:bg-surface-container border border-outline-variant dark:border-outline rounded-xl px-3 focus-within:ring-2 focus-within:ring-primary transition-ink-colors">
            <span className="material-symbols-outlined text-inherit text-[18px] mr-2">add_task</span>
            <AutoGrowingTextarea
              rows={1}
              maxRows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t.quickAddPlaceholder}
              autoFocus
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              className="flex-1 min-w-0 bg-transparent border-none focus:outline-none focus:ring-0 py-3 text-sm leading-6 font-medium text-on-surface dark:text-on-surface placeholder-on-surface-variant tabular-nums"
            />
          </div>

          {/* 解析预览：识别到时间时展示可关闭标签；点 X 取消本次解析、保留原标题 */}
          {parseActive && parsed.date && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-2 pl-2 pr-2 py-1 rounded-md bg-primary-fixed/30 text-primary dark:text-primary text-xs font-medium tabular-nums">
                <span className="material-symbols-outlined text-[18px]">event</span>
                <span>{t.quickAddDetected}: {previewLabel}</span>
                <button
                  type="button"
                  onClick={() => setDismissedFor(parsed.matched)}
                  className="p-1 rounded-lg hover:bg-primary/20 flex items-center"
                  aria-label={t.quickAddDismiss}
                  title={t.quickAddDismiss}
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </span>
              {syntax.title && (
                <span className="text-xs text-on-surface-variant truncate">
                  {lang === 'zh' ? '标题' : 'Title'}: {syntax.title}
                </span>
              )}
            </div>
          )}

          {/* 语法糖预览：#标签 与 p0/p1/p2 */}
          {(syntax.tags.length > 0 || syntax.priority) && (
            <div className="flex items-center gap-2 flex-wrap">
              {syntax.tags.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-surface-container dark:bg-surface-container-low text-on-surface-variant text-xs font-medium tabular-nums"
                >
                  <span className="material-symbols-outlined text-[18px]">sell</span>
                  {name}
                </span>
              ))}
              {syntax.priority && !priorityTouched && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-surface-container dark:bg-surface-container-low text-on-surface-variant text-xs font-medium tabular-nums">
                  <span className="material-symbols-outlined text-[18px]">flag</span>
                  {syntax.matched.find((token) => token.startsWith('p'))} →{' '}
                  {syntax.priority === 'High'
                    ? t.priorityHigh
                    : syntax.priority === 'Low'
                      ? t.priorityLow
                      : t.priorityMedium}
                </span>
              )}
            </div>
          )}

          {/* 优先级快选（默认中） */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium  text-on-surface-variant tabular-nums">
              {lang === 'zh' ? '优先级' : 'Priority'}
            </span>
            <div className="flex gap-2">
              {priorityOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setPriority(opt.value);
                    setPriorityTouched(true);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-medium border transition-ink-colors ${
                    effectivePriority === opt.value
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-surface dark:bg-surface-container-low text-on-surface-variant border-outline-variant hover:bg-surface-container'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-surface-variant dark:border-outline-variant">
            <span className="text-xs text-on-surface-variant">{t.quickAddHint}</span>
            <button
              type="submit"
              disabled={!text.trim() || submitting}
              className="px-5 py-2 bg-primary text-on-primary rounded-lg font-medium text-xs shadow-sm dark:shadow-none hover:opacity-90 transition-ink-colors active:scale-95 disabled:opacity-50 tabular-nums"
            >
              {t.quickAddSubmit}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
