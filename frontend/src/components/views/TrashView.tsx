import React, { useCallback, useEffect, useState } from 'react';
import { Language } from '../../types';
import { listTrashTasks, restoreTask } from '../../api/backend';
import type { BackendTask } from '../../api/backend';
import { toLocalDateString } from '../../utils/datetime';
import { useToast } from '../toast/ToastProvider';

interface TrashViewProps {
  lang: Language;
  /** 恢复成功后把任务塞回主列表（App 本地状态），避免整页重拉 */
  onRestored: (task: BackendTask) => void;
}

const PAGE_SIZE = 20;

/** 后端出参是 UTC（带 Z），按本地时区渲染 */
function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 16).replace('T', ' ');
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const TrashView: React.FC<TrashViewProps> = ({ lang, onRestored }) => {
  const toast = useToast();
  const [items, setItems] = useState<BackendTask[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await listTrashTasks({ page: targetPage, page_size: PAGE_SIZE });
      setItems(res.items || []);
      setTotal(res.total || 0);
      setPage(targetPage);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '加载回收站失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1);
  }, [load]);

  const handleRestore = async (task: BackendTask) => {
    setRestoringId(task.id);
    try {
      const restored = await restoreTask(task.id);
      setItems((prev) => prev.filter((item) => item.id !== task.id));
      setTotal((prev) => Math.max(0, prev - 1));
      onRestored(restored);
      toast.success(
        lang === 'zh' ? `已恢复「${task.title}」` : `Restored "${task.title}"`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (lang === 'zh' ? '恢复失败' : 'Restore failed'));
    } finally {
      setRestoringId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-[1000px] mx-auto w-full pb-20 md:pb-8 animate-in fade-in duration-300">
      <div className="mb-6">
        <h1 className="text-3xl font-medium text-on-surface dark:text-on-surface  flex items-center gap-2 tabular-nums">
          <span className="material-symbols-outlined text-inherit text-[18px]">delete</span>
          <span>{lang === 'zh' ? '回收站' : 'Trash'}</span>
        </h1>
        <p className="text-sm text-on-surface-variant mt-1">
          {lang === 'zh'
            ? '已删除的任务保留在这里，30 天后自动清除；点击「恢复」可放回任务列表。'
            : 'Deleted tasks stay here and are purged automatically after 30 days.'}
        </p>
      </div>

      {loadError && (
        <div className="mb-4 rounded-xl border border-outline-variant bg-surface-container-lowest dark:bg-surface-container text-[#a86412] text-sm px-4 py-3 flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <button
            onClick={() => void load(page)}
            className="shrink-0 px-3 py-2 rounded-lg border border-outline-variant text-xs font-medium hover:bg-surface-container tabular-nums"
          >
            {lang === 'zh' ? '重试' : 'Retry'}
          </button>
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-24 text-on-surface-variant text-sm gap-2">
          <span className="inline-block h-5 w-5 rounded-full border-2 border-outline-variant border-t-primary animate-spin" />
          {lang === 'zh' ? '加载中…' : 'Loading…'}
        </div>
      ) : items.length === 0 && !loadError ? (
        <div className="text-center py-16 bg-surface-container-lowest dark:bg-surface-container rounded-xl border border-dashed border-outline-variant">
          <span className="material-symbols-outlined text-4xl text-inherit mb-2">
            delete
          </span>
          <p className="text-base font-normal text-on-surface dark:text-on-surface tabular-nums">
            {lang === 'zh' ? '回收站是空的' : 'Trash is empty'}
          </p>
          <p className="text-xs text-on-surface-variant mt-1">
            {lang === 'zh' ? '删除的任务会先进入这里，可随时恢复。' : 'Deleted tasks land here and can be restored anytime.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((task) => (
            <div
              key={task.id}
              data-testid="trash-row"
              className="list-row-cv flex items-center justify-between gap-4 p-4 bg-surface dark:bg-surface-container-low border-b border-surface-variant dark:border-outline-variant  "
            >
              <div className="min-w-0">
                <p className={`font-medium text-base truncate ${task.status === 2 ? 'ink-done' : 'text-on-surface'}`}>
                  {task.title}
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-on-surface-variant">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                    {lang === 'zh' ? '删除于' : 'Deleted'} {formatDateTime(task.deleted_at)}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[18px]">event</span>
                    {lang === 'zh' ? '原截止' : 'Was due'} {toLocalDateString(task.due_date) || '—'}
                  </span>
                </div>
              </div>
              <button
                data-testid="trash-restore"
                disabled={restoringId === task.id}
                onClick={() => void handleRestore(task)}
                className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-ink-colors disabled:opacity-50 tabular-nums"
              >
                <span className="material-symbols-outlined text-[18px]">restore_from_trash</span>
                <span>
                  {restoringId === task.id
                    ? lang === 'zh' ? '恢复中…' : 'Restoring…'
                    : lang === 'zh' ? '恢复' : 'Restore'}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6 text-sm text-on-surface-variant">
          <button
            disabled={page <= 1 || loading}
            onClick={() => void load(page - 1)}
            className="px-3 py-2 rounded-lg border border-outline-variant text-xs font-medium disabled:opacity-40 hover:bg-surface-container tabular-nums"
          >
            {lang === 'zh' ? '上一页' : 'Prev'}
          </button>
          <span className="text-xs font-medium tabular-nums">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages || loading}
            onClick={() => void load(page + 1)}
            className="px-3 py-2 rounded-lg border border-outline-variant text-xs font-medium disabled:opacity-40 hover:bg-surface-container tabular-nums"
          >
            {lang === 'zh' ? '下一页' : 'Next'}
          </button>
        </div>
      )}
    </div>
  );
};
