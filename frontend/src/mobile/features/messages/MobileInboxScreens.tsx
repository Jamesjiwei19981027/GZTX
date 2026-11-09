import React, { useEffect, useState, useMemo } from 'react';
import {
  listCollabNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  updateNotificationState,
  deleteNotification,
  replyCollabNotification,
  getExternalMailStatus,
  listExternalMail,
  syncExternalMail,
  updateExternalMailState,
  type ExternalMailStatus,
  type ExternalMailItem,
} from '../../../api/shell';
import { ApiError } from '../../../api/client';
import { Language, Task } from '../../../types';
import { AppIcon } from '../../ui/AppIcon';
import { MobileInput, MobileTextarea } from '../../ui/MobileField';
import { MobileListGroup, MobileListItem } from '../../ui/MobileList';
import { MobileSheet } from '../../ui/MobileSheet';
import { MobileEmptyState, MobileLoadingState } from '../../ui/MobileState';
import { appendPageById, hasMoreByTotal } from '../../../utils/messagePaging';

export interface MobileInboxScreenProps {
  companyId: number | null;
  onConvertToTaskDraft?: (draft: { title: string; description: string; sourceChannel: string }) => void;
  onBack?: () => void;
  lang?: Language;
}

// -------------------------------------------------------------
// 48 & 98 站内通知收件箱与归档筛选
// -------------------------------------------------------------
export const MobileInboxScreen: React.FC<MobileInboxScreenProps> = ({
  companyId,
  onConvertToTaskDraft,
  onBack,
  lang = 'zh',
}) => {
  const [tab, setTab] = useState<'notifications' | 'external-mail'>('notifications');
  const [filterState, setFilterState] = useState<'active' | 'archived' | 'all'>('active');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notifTotal, setNotifTotal] = useState(0);
  const [notifPage, setNotifPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNotif, setSelectedNotif] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  // 49 详情与回复
  const [replyText, setReplyText] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyMessage, setReplyMessage] = useState<string | null>(null);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await listCollabNotifications(1, filterState);
      setNotifications(res.items || []);
      setNotifTotal(res.total ?? (res.items || []).length);
      setNotifPage(1);
      setMoreError(null);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  // 按后端 total 分页：已加载数 < total 就还有下一页
  const handleLoadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const next = notifPage + 1;
      const res = await listCollabNotifications(next, filterState);
      setNotifications((prev) => appendPageById(prev, res.items || []));
      setNotifTotal(res.total ?? notifTotal);
      setNotifPage(next);
    } catch (err) {
      setMoreError(err instanceof ApiError ? err.message : '加载更多失败');
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (tab === 'notifications') {
      fetchNotifications();
    }
  }, [tab, filterState]);

  const handleMarkAllRead = async () => {
    setBusy(true);
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  const handleSelectNotification = async (item: any) => {
    setSelectedNotif(item);
    setReplyText('');
    setReplyMessage(null);
    if (!item.read) {
      try {
        await markNotificationRead(item.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)),
        );
      } catch {
        /* ignore */
      }
    }
  };

  const handleSendReply = async () => {
    if (!selectedNotif || !replyText.trim()) return;
    setReplyBusy(true);
    setReplyMessage(null);
    try {
      const res = await replyCollabNotification(selectedNotif.id, replyText.trim());
      setReplyMessage('回复已成功发送');
      setSelectedNotif((prev: any) => ({
        ...prev,
        reply_text: res.reply_text,
        replied_at: res.replied_at,
      }));
      setReplyText('');
    } catch (err) {
      setReplyMessage(err instanceof ApiError ? err.message : '发送回复失败');
    } finally {
      setReplyBusy(false);
    }
  };

  const handleArchiveNotif = async (id: number, currentArchived = false) => {
    try {
      await updateNotificationState(id, { archived: !currentArchived });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (selectedNotif?.id === id) setSelectedNotif(null);
    } catch {
      /* ignore */
    }
  };

  const handleDeleteNotif = async (id: number) => {
    try {
      await deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (selectedNotif?.id === id) setSelectedNotif(null);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface dark:bg-surface text-on-surface dark:text-on-surface">
      <header className="h-14 px-4 bg-surface-container-lowest dark:bg-surface-container-lowest border-b border-outline-variant dark:border-outline-variant flex items-center justify-between shrink-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center -ml-2 text-on-surface-variant"
            aria-label="返回"
          >
            <AppIcon name="back" size={18} />
          </button>
        )}
        <div className="flex p-1 bg-surface-container-lowest dark:bg-surface-container rounded-xl">
          <button
            type="button"
            onClick={() => setTab('notifications')}
            className={`min-h-[32px] px-3 rounded-lg text-xs font-medium transition-ink-colors ${
              tab === 'notifications'
                ? 'bg-surface-container-lowest dark:bg-surface-container-high text-primary shadow-sm dark:shadow-none'
                : 'text-on-surface-variant'
            }`}
          >
            通知收件箱
          </button>
          <button
            type="button"
            onClick={() => setTab('external-mail')}
            className={`min-h-[32px] px-3 rounded-lg text-xs font-medium transition-ink-colors ${
              tab === 'external-mail'
                ? 'bg-surface-container-lowest dark:bg-surface-container-high text-primary shadow-sm dark:shadow-none'
                : 'text-on-surface-variant'
            }`}
          >
            外部邮件
          </button>
        </div>
        <div className="w-10 flex justify-end">
          {tab === 'notifications' && (
            <button
              type="button"
              disabled={busy}
              onClick={handleMarkAllRead}
              className="text-xs font-medium text-primary disabled:opacity-40 tabular-nums"
              title="全部标为已读"
            >
              已读
            </button>
          )}
        </div>
      </header>

      {tab === 'notifications' ? (
        <>
          {/* 98 通知筛选过滤器 */}
          <div className="px-4 py-2 bg-surface-container-lowest dark:bg-surface-container-lowest border-b border-outline-variant dark:border-outline-variant flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setFilterState('active')}
              className={`min-h-[32px] px-3 rounded-lg text-xs font-medium ${
                filterState === 'active'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container dark:bg-surface-container-lowest text-on-surface-variant dark:text-outline'
              }`}
            >
              未归档
            </button>
            <button
              type="button"
              onClick={() => setFilterState('archived')}
              className={`min-h-[32px] px-3 rounded-lg text-xs font-medium ${
                filterState === 'archived'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container dark:bg-surface-container-lowest text-on-surface-variant dark:text-outline'
              }`}
            >
              已归档
            </button>
            <button
              type="button"
              onClick={() => setFilterState('all')}
              className={`min-h-[32px] px-3 rounded-lg text-xs font-medium ${
                filterState === 'all'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container dark:bg-surface-container-lowest text-on-surface-variant dark:text-outline'
              }`}
            >
              全部通知
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {loading ? (
              <MobileLoadingState message="获取站内通知…" />
            ) : notifications.length === 0 ? (
              <MobileEmptyState
                title="暂无通知"
                description={
                  filterState === 'archived' ? '无已归档通知' : '当前收件箱没有新的协作通知'
                }
              />
            ) : (
              <MobileListGroup>
                {notifications.map((item) => (
                  <MobileListItem
                    key={item.id}
                    leading={
                      <div className="relative">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center ${
                            item.read
                              ? 'bg-surface-container dark:bg-surface-container-lowest text-outline'
                              : 'bg-surface-container dark:bg-surface-container text-primary'
                          }`}
                        >
                          <AppIcon name="bell" size={18} />
                        </div>
                        {!item.read && (
                          <span className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-white dark:ring-outline-variant" />
                        )}
                      </div>
                    }
                    title={
                      <div className="flex items-center justify-between gap-1">
                        <span className={`truncate ${item.read ? 'font-normal' : 'font-medium'}`}>
                          {item.sender?.name || '系统协同通知'}
                        </span>
                        <span className="text-xs text-outline font-normal shrink-0">
                          {item.created_at ? item.created_at.slice(5, 16) : ''}
                        </span>
                      </div>
                    }
                    subtitle={
                      <span className="line-clamp-2 text-xs leading-relaxed">
                        {item.body_text || '无详细内容'}
                      </span>
                    }
                    trailing={
                      item.requires_reply ? (
                        <span className="text-xs px-2 py-1 rounded bg-surface-container text-[#a86412] dark:bg-surface-container dark:text-[#d9a35b] font-medium shrink-0 tabular-nums">
                          需回复
                        </span>
                      ) : undefined
                    }
                    onClick={() => handleSelectNotification(item)}
                  />
                ))}
              </MobileListGroup>
            )}
            {!loading && notifications.length > 0 && hasMoreByTotal(notifications.length, notifTotal) && (
              <div className="text-center pt-1">
                <button
                  type="button"
                  data-testid="inbox-load-more"
                  disabled={loadingMore}
                  onClick={() => void handleLoadMore()}
                  className="min-h-[40px] px-5 rounded-lg bg-surface-container-lowest dark:bg-surface-container-lowest border border-outline-variant dark:border-outline-variant text-xs text-primary disabled:opacity-50"
                >
                  {loadingMore ? '正在加载…' : `加载更多（已显示 ${notifications.length} / ${notifTotal}）`}
                </button>
                {moreError && <p className="text-xs text-error mt-1">{moreError}</p>}
              </div>
            )}
          </div>
        </>
      ) : (
        /* 50 外部邮件分栏 */
        <MobileExternalMailView
          companyId={companyId}
          onConvertToTaskDraft={onConvertToTaskDraft}
        />
      )}

      {/* 49 通知 / 汇报详情 Sheet */}
      <MobileSheet
        isOpen={Boolean(selectedNotif)}
        onClose={() => setSelectedNotif(null)}
        title="通知详情"
        snapPoints={['half', 'full']}
        defaultSnap="half"
      >
        {selectedNotif && (
          <div className="flex flex-col gap-4 pb-8">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-medium tabular-nums">
                  {selectedNotif.sender?.name || '系统通知'}
                </h2>
                <div className="text-xs text-outline mt-1">
                  发送时间: {selectedNotif.created_at || '近期'}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleArchiveNotif(selectedNotif.id, selectedNotif.archived)}
                  className="min-h-[36px] px-2 rounded-lg border border-outline-variant dark:border-outline-variant text-xs text-on-surface-variant dark:text-outline flex items-center gap-1"
                >
                  <AppIcon name="archive" size={18} />
                  <span>{selectedNotif.archived ? '移出归档' : '归档'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteNotif(selectedNotif.id)}
                  className="min-h-[36px] px-2 rounded-lg border border-outline-variant text-xs text-error"
                >
                  删除
                </button>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-surface-container-lowest dark:bg-surface-container border border-outline-variant/80 dark:border-outline-variant text-sm leading-relaxed whitespace-pre-wrap">
              {selectedNotif.body_text}
            </div>

            {/* 转任务草稿按钮 (98) */}
            {onConvertToTaskDraft && (
              <button
                type="button"
                onClick={() => {
                  onConvertToTaskDraft({
                    title: `跟进通知: ${selectedNotif.body_text?.slice(0, 24) || '协同事项'}`,
                    description: selectedNotif.body_text || '',
                    sourceChannel: 'collab_notification',
                  });
                  setSelectedNotif(null);
                }}
                className="min-h-[44px] w-full rounded-lg border border-primary text-primary dark:border-primary dark:text-primary text-xs font-medium flex items-center justify-center gap-2 active:bg-surface-container tabular-nums"
              >
                <AppIcon name="plus" size={18} />
                <span>将此通知转为任务待办草稿</span>
              </button>
            )}

            {/* 回复记录与快速回复 */}
            {selectedNotif.reply_text ? (
              <div className="p-4 bg-surface-container-lowest dark:bg-surface-container rounded-xl border border-outline-variant dark:border-[#6bbf8a] text-xs space-y-1">
                <div className="font-medium text-[#2f7d4f] dark:text-[#6bbf8a] tabular-nums">
                  我的回复 ({selectedNotif.replied_at?.slice(5, 16) || '已提交'})：
                </div>
                <div className="text-on-surface dark:text-outline">
                  {selectedNotif.reply_text}
                </div>
              </div>
            ) : selectedNotif.requires_reply ? (
              <div className="space-y-2 pt-1">
                <label className="text-xs font-medium text-on-surface dark:text-outline tabular-nums">
                  快捷回复通知：
                </label>
                <MobileTextarea
                  placeholder="输入你的答复意见，发送至发件人…"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="min-h-[80px]"
                />
                {replyMessage && (
                  <div className="text-xs text-primary">{replyMessage}</div>
                )}
                <button
                  type="button"
                  disabled={replyBusy || !replyText.trim()}
                  onClick={handleSendReply}
                  className="min-h-[44px] w-full rounded-lg bg-primary text-on-primary font-medium text-xs active:opacity-90 disabled:opacity-40 tabular-nums"
                >
                  {replyBusy ? '正在发送…' : '发送回复'}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </MobileSheet>
    </div>
  );
};

// -------------------------------------------------------------
// 50 外部邮件屏幕 (含真实未配置状态说明)
// -------------------------------------------------------------
export const MobileExternalMailView: React.FC<{
  companyId: number | null;
  onConvertToTaskDraft?: (draft: { title: string; description: string; sourceChannel: string }) => void;
}> = ({ companyId, onConvertToTaskDraft }) => {
  const [mailStatus, setMailStatus] = useState<ExternalMailStatus | null>(null);
  const [mailItems, setMailItems] = useState<ExternalMailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchStatusAndMail = async () => {
      if (!companyId) {
        setMailStatus({ provider: 'imap', configured: false, reason: '未绑定企业' });
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const st = await getExternalMailStatus(companyId);
        if (active) {
          setMailStatus(st);
          if (st.configured) {
            const list = await listExternalMail(companyId, 'active');
            if (active) setMailItems(list.items || []);
          }
        }
      } catch {
        if (active) {
          setMailStatus({ provider: 'imap', configured: false, reason: '邮件服务查询遇到异常' });
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchStatusAndMail();
    return () => {
      active = false;
    };
  }, [companyId]);

  const handleSync = async () => {
    if (!companyId) return;
    setSyncing(true);
    setSyncNotice(null);
    try {
      const res = await syncExternalMail(companyId);
      setSyncNotice(`同步完成：新抓取 ${res.synced} 封，跳过 ${res.skipped} 封`);
      const list = await listExternalMail(companyId, 'active');
      setMailItems(list.items || []);
    } catch (err) {
      setSyncNotice(err instanceof ApiError ? err.message : '邮件同步失败');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <MobileLoadingState message="检测外部邮件 IMAP 服务状态…" />;

  /* 关键规范：未配置外部邮件时展示真实未配置状态，严禁假邮件或假成功 */
  if (!mailStatus?.configured) {
    return (
      <div className="flex-1 p-6 flex flex-col items-center justify-center text-center max-w-sm mx-auto">
        <div className="w-16 h-16 rounded-full bg-surface-container dark:bg-surface-container-lowest text-on-surface-variant flex items-center justify-center mb-4">
          <AppIcon name="mail" size={18} />
        </div>
        <h2 className="text-lg font-medium text-on-surface dark:text-on-surface mb-1 tabular-nums">
          外部邮箱未配置
        </h2>
        <p className="text-xs text-on-surface-variant leading-relaxed mb-4">
          {mailStatus?.reason || '当前企业工作区未配置 IMAP / Exchange 外部邮件服务器，无法接收外部邮件。'}
        </p>

        <div className="p-4 rounded-xl bg-surface-container-lowest dark:bg-surface-container border border-outline-variant dark:border-[#d9a35b] text-[#a86412] dark:text-[#d9a35b] text-xs text-left leading-relaxed space-y-1">
          <div className="font-medium tabular-nums">真实连接状态：未就绪</div>
          <div>若需关联外部客户邮件并一键转任务，请由管理员在管理后台配置企业邮件网关。</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      <div className="flex items-center justify-between text-xs text-on-surface-variant">
        <span>连接账户: {mailStatus.username || mailStatus.host}</span>
        <button
          type="button"
          disabled={syncing}
          onClick={handleSync}
          className="min-h-[32px] px-2 rounded-lg bg-primary text-on-primary font-medium flex items-center gap-1 active:opacity-90 disabled:opacity-40 tabular-nums"
        >
          <AppIcon name="refresh" size={18} />
          <span>{syncing ? '同步中…' : '立即拉取邮件'}</span>
        </button>
      </div>

      {syncNotice && (
        <div className="p-3 bg-surface-container-lowest dark:bg-surface-container text-primary text-xs rounded-xl">
          {syncNotice}
        </div>
      )}

      {mailItems.length === 0 ? (
        <MobileEmptyState
          title="外部邮箱暂无新信件"
          description="可点击上方「立即拉取邮件」从服务器同步"
        />
      ) : (
        <MobileListGroup title={`收件箱邮件 (${mailItems.length})`}>
          {mailItems.map((mail) => (
            <MobileListItem
              key={mail.id}
              leading={<AppIcon name="mail" size={18} className="text-inherit" />}
              title={mail.subject || '（无主题）'}
              subtitle={
                <div className="space-y-1">
                  <div className="text-xs text-on-surface-variant">发件人: {mail.from_address}</div>
                  <div className="text-xs text-on-surface-variant dark:text-outline line-clamp-1">
                    {mail.body_text}
                  </div>
                </div>
              }
              trailing={
                onConvertToTaskDraft ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onConvertToTaskDraft({
                        title: mail.subject || '处理外部邮件',
                        description: `发件人: ${mail.from_address}\n\n${mail.body_text || ''}`,
                        sourceChannel: 'external_mail',
                      });
                    }}
                    className="min-h-[32px] px-2 rounded-lg bg-surface-container text-primary text-xs font-medium tabular-nums"
                  >
                    转任务
                  </button>
                ) : undefined
              }
            />
          ))}
        </MobileListGroup>
      )}
    </div>
  );
};
