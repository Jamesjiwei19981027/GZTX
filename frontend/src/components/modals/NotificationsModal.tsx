import React, { useEffect, useState } from 'react';
import { NotificationItem, Language } from '../../types';
import { notificationTarget, notificationTitle, type NotificationTarget } from '../../utils/notificationText';
import {
  listCollabNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../api/shell';
import { appendPageById, hasMoreByTotal } from '../../utils/messagePaging';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTaskId?: (taskId: string) => void;
  onOpenSettings?: () => void;
  /** 材料/汇报类通知点击后跳转到对应项目页面 */
  onOpenTarget?: (target: NotificationTarget) => void;
  lang: Language;
}

function mapNotif(n: {
  id: number;
  template_key: string;
  payload?: Record<string, unknown>;
  body_text?: string;
  read: boolean;
  created_at?: string;
}): NotificationItem & { target?: NotificationTarget } {
  const taskId = n.payload?.task_id;
  return {
    id: String(n.id),
    title: notificationTitle(n.template_key),
    message: n.body_text || JSON.stringify(n.payload || {}),
    timestamp: n.created_at
      ? n.created_at.slice(5, 16).replace('T', ' ')
      : '—',
    read: Boolean(n.read),
    type: 'system',
    linkTaskId: taskId != null ? String(taskId) : undefined,
    target: notificationTarget(n.template_key, n.payload) ?? undefined,
  };
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  onSelectTaskId,
  onOpenSettings,
  onOpenTarget,
  lang,
}) => {
  const [notifications, setNotifications] = useState<(NotificationItem & { target?: NotificationTarget })[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    void (async () => {
      try {
        const res = await listCollabNotifications(1);
        setNotifications((res.items || []).map(mapNotif));
        setTotal(res.total ?? (res.items || []).length);
        setPage(1);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载通知失败');
      }
    })();
  }, [isOpen]);

  if (!isOpen) return null;

  // 按后端 total 分页：已加载数 < total 就还有下一页
  const handleLoadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const res = await listCollabNotifications(next);
      setNotifications((prev) =>
        appendPageById(
          prev.map((n) => ({ ...n, id: Number(n.id) })),
          (res.items || []).map(mapNotif).map((n) => ({ ...n, id: Number(n.id) })),
        ).map((n) => ({ ...n, id: String(n.id) })),
      );
      setTotal(res.total ?? total);
      setPage(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载更多通知失败');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await markNotificationRead(Number(id));
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '标记失败');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      setError(err instanceof Error ? err.message : '标记失败');
    }
  };

  const handleNotificationClick = async (item: NotificationItem & { target?: NotificationTarget }) => {
    if (!item.read) {
      try {
        await markNotificationRead(Number(item.id));
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)),
        );
      } catch {
        /* ignore */
      }
    }
    if (item.target && onOpenTarget) {
      onOpenTarget(item.target);
      onClose();
      return;
    }
    if (item.linkTaskId && onSelectTaskId) {
      onSelectTaskId(item.linkTaskId);
      onClose();
    }
  };

  const filtered = notifications.filter((n) =>
    activeTab === 'unread' ? !n.read : true,
  );
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50  animate-in">
      <div className="bg-surface-container-lowest dark:bg-surface-container w-full max-w-xl rounded-[var(--radius-ink-panel)] border border-outline-variant/40 shadow-sm dark:shadow-none flex flex-col max-h-[85vh] overflow-hidden">
        <div className="p-6 border-b border-outline-variant/20 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-on-surface flex items-center gap-2 tabular-nums">
              {lang === 'zh' ? '通知中心' : 'Notifications'}
              {unreadCount > 0 && (
                <span className="px-2 py-1 rounded-md bg-error text-on-error text-xs font-medium tabular-nums">
                  {unreadCount}
                </span>
              )}
            </h2>
            <p className="text-xs text-on-surface-variant">
              {lang === 'zh' ? '协作站内信（后端）' : 'Collab inbox (backend)'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-xl cursor-pointer">
            ✕
          </button>
        </div>

        {error && (
          <div className="px-4 py-2 text-xs bg-surface-container text-[#a86412]">{error}</div>
        )}

        <div className="px-6 py-3 flex items-center gap-2 border-b border-outline-variant/20">
          {(['all', 'unread'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 rounded-lg text-xs font-medium cursor-pointer ${
                activeTab === tab
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant'
              }`}
            >
              {tab === 'all'
                ? lang === 'zh'
                  ? '全部'
                  : 'All'
                : lang === 'zh'
                  ? '未读'
                  : 'Unread'}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void handleMarkAllRead()}
            className="ml-auto text-xs font-medium text-primary cursor-pointer tabular-nums"
          >
            {lang === 'zh' ? '全部已读' : 'Mark all read'}
          </button>
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="text-xs font-medium text-on-surface-variant cursor-pointer tabular-nums"
            >
              {lang === 'zh' ? '设置' : 'Settings'}
            </button>
          )}
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {filtered.length === 0 && (
            <p className="text-sm text-on-surface-variant text-center py-10">
              {lang === 'zh' ? '暂无通知' : 'No notifications'}
            </p>
          )}
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => void handleNotificationClick(item)}
              className={`w-full text-left p-4 rounded-lg border cursor-pointer ${
                item.read
                  ? 'border-outline-variant/20 bg-surface-container/30'
                  : 'border-primary/30 bg-primary/5'
              }`}
            >
              <div className="flex justify-between gap-2">
                <span className="text-sm font-medium text-on-surface tabular-nums">{item.title}</span>
                <span className="text-xs text-on-surface-variant">{item.timestamp}</span>
              </div>
              <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">
                {item.message}
              </p>
              {!item.read && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => void handleMarkAsRead(item.id, e)}
                  className="inline-block mt-2 text-xs font-medium text-primary tabular-nums"
                >
                  {lang === 'zh' ? '标为已读' : 'Mark read'}
                </span>
              )}
            </button>
          ))}
          {hasMoreByTotal(notifications.length, total) && (
            <div className="text-center pt-1">
              <button
                type="button"
                data-testid="notifications-load-more"
                disabled={loadingMore}
                onClick={() => void handleLoadMore()}
                className="px-4 py-2 rounded-lg bg-surface-container text-xs font-medium text-primary cursor-pointer disabled:opacity-50 tabular-nums"
              >
                {loadingMore ? '正在加载…' : `加载更多（已显示 ${notifications.length} / ${total}）`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
