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
    <div className="flex flex-col h-full bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <header className="h-14 px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center -ml-2 text-slate-500"
            aria-label="返回"
          >
            <AppIcon name="back" size={20} />
          </button>
        )}
        <div className="flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-xl">
          <button
            type="button"
            onClick={() => setTab('notifications')}
            className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold transition-all ${
              tab === 'notifications'
                ? 'bg-white dark:bg-slate-700 text-[#0058BE] shadow-xs'
                : 'text-slate-500'
            }`}
          >
            通知收件箱
          </button>
          <button
            type="button"
            onClick={() => setTab('external-mail')}
            className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold transition-all ${
              tab === 'external-mail'
                ? 'bg-white dark:bg-slate-700 text-[#0058BE] shadow-xs'
                : 'text-slate-500'
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
              className="text-xs font-medium text-[#0058BE] disabled:opacity-40"
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
          <div className="px-4 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setFilterState('active')}
              className={`min-h-[32px] px-3 rounded-full text-xs font-medium ${
                filterState === 'active'
                  ? 'bg-[#0058BE] text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              未归档
            </button>
            <button
              type="button"
              onClick={() => setFilterState('archived')}
              className={`min-h-[32px] px-3 rounded-full text-xs font-medium ${
                filterState === 'archived'
                  ? 'bg-[#0058BE] text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              已归档
            </button>
            <button
              type="button"
              onClick={() => setFilterState('all')}
              className={`min-h-[32px] px-3 rounded-full text-xs font-medium ${
                filterState === 'all'
                  ? 'bg-[#0058BE] text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
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
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                              : 'bg-blue-50 dark:bg-blue-950 text-[#0058BE]'
                          }`}
                        >
                          <AppIcon name="bell" size={18} />
                        </div>
                        {!item.read && (
                          <span className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-[#0058BE] ring-2 ring-white dark:ring-slate-900" />
                        )}
                      </div>
                    }
                    title={
                      <div className="flex items-center justify-between gap-1">
                        <span className={`truncate ${item.read ? 'font-normal' : 'font-bold'}`}>
                          {item.sender?.name || '系统协同通知'}
                        </span>
                        <span className="text-[11px] text-slate-400 font-normal shrink-0">
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
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 font-medium shrink-0">
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
                  className="min-h-[40px] px-5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-[#0058BE] disabled:opacity-50"
                >
                  {loadingMore ? '正在加载…' : `加载更多（已显示 ${notifications.length} / ${notifTotal}）`}
                </button>
                {moreError && <p className="text-[11px] text-red-600 mt-1">{moreError}</p>}
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
                <h2 className="text-base font-bold">
                  {selectedNotif.sender?.name || '系统通知'}
                </h2>
                <div className="text-xs text-slate-400 mt-0.5">
                  发送时间: {selectedNotif.created_at || '近期'}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleArchiveNotif(selectedNotif.id, selectedNotif.archived)}
                  className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1"
                >
                  <AppIcon name="archive" size={14} />
                  <span>{selectedNotif.archived ? '移出归档' : '归档'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteNotif(selectedNotif.id)}
                  className="min-h-[36px] px-2.5 rounded-lg border border-red-200 text-xs text-red-500"
                >
                  删除
                </button>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-sm leading-relaxed whitespace-pre-wrap">
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
                className="min-h-[44px] w-full rounded-xl border border-[#0058BE] text-[#0058BE] dark:border-blue-500 dark:text-blue-400 text-xs font-semibold flex items-center justify-center gap-1.5 active:bg-blue-50"
              >
                <AppIcon name="plus" size={16} />
                <span>将此通知转为任务待办草稿</span>
              </button>
            )}

            {/* 回复记录与快速回复 */}
            {selectedNotif.reply_text ? (
              <div className="p-3.5 bg-green-50 dark:bg-green-950/40 rounded-xl border border-green-200 dark:border-green-900 text-xs space-y-1">
                <div className="font-semibold text-green-700 dark:text-green-300">
                  我的回复 ({selectedNotif.replied_at?.slice(5, 16) || '已提交'})：
                </div>
                <div className="text-slate-700 dark:text-slate-300">
                  {selectedNotif.reply_text}
                </div>
              </div>
            ) : selectedNotif.requires_reply ? (
              <div className="space-y-2 pt-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  快捷回复通知：
                </label>
                <MobileTextarea
                  placeholder="输入你的答复意见，发送至发件人…"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="min-h-[80px]"
                />
                {replyMessage && (
                  <div className="text-xs text-[#0058BE]">{replyMessage}</div>
                )}
                <button
                  type="button"
                  disabled={replyBusy || !replyText.trim()}
                  onClick={handleSendReply}
                  className="min-h-[44px] w-full rounded-xl bg-[#0058BE] text-white font-semibold text-xs active:opacity-90 disabled:opacity-40"
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

  /* 关键规范：未配置外部邮件时展示真实未配置状态，严禁假邮件或假成功！ */
  if (!mailStatus?.configured) {
    return (
      <div className="flex-1 p-6 flex flex-col items-center justify-center text-center max-w-sm mx-auto">
        <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500 flex items-center justify-center mb-4">
          <AppIcon name="mail" size={30} />
        </div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
          外部邮箱未配置
        </h2>
        <p className="text-xs text-slate-500 leading-relaxed mb-4">
          {mailStatus?.reason || '当前企业工作区未配置 IMAP / Exchange 外部邮件服务器，无法接收外部邮件。'}
        </p>

        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-xs text-left leading-relaxed space-y-1">
          <div className="font-semibold">真实连接状态：未就绪</div>
          <div>若需关联外部客户邮件并一键转任务，请由管理员在管理后台配置企业邮件网关。</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>连接账户: {mailStatus.username || mailStatus.host}</span>
        <button
          type="button"
          disabled={syncing}
          onClick={handleSync}
          className="min-h-[34px] px-2.5 rounded-lg bg-[#0058BE] text-white font-medium flex items-center gap-1 active:opacity-90 disabled:opacity-40"
        >
          <AppIcon name="refresh" size={14} />
          <span>{syncing ? '同步中…' : '立即拉取邮件'}</span>
        </button>
      </div>

      {syncNotice && (
        <div className="p-3 bg-blue-50 text-[#0058BE] text-xs rounded-xl">
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
              leading={<AppIcon name="mail" size={18} className="text-[#0058BE]" />}
              title={mail.subject || '（无主题）'}
              subtitle={
                <div className="space-y-0.5">
                  <div className="text-[11px] text-slate-500">发件人: {mail.from_address}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 line-clamp-1">
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
                    className="min-h-[34px] px-2 rounded-lg bg-blue-50 text-[#0058BE] text-[11px] font-semibold"
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
