import React, { useEffect, useState } from 'react';
import { IntegrationItem, Language } from '../../types';
import {
  listCollabNotifications,
  listIntegrations,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationState,
  deleteNotification,
  replyCollabNotification,
  triggerOrgSync,
} from '../../api/shell';

interface InboxViewProps {
  onOpenNewTaskWithTitle?: (title: string, desc: string, source?: { channel?: string; title?: string; url?: string }) => void;
  lang: Language;
  companyId?: number | null;
}

type InboxRow = {
  id: string;
  source: string;
  icon: string;
  sender: string;
  subject: string;
  snippet: string;
  timestamp: string;
  tag: string;
  read: boolean;
  needsReply: boolean;
  senderName: string;
  recipients: number[];
  attachments: { name?: string; original_name?: string; url?: string; download_url?: string; mime_type?: string; size?: number; file_size?: number }[];
  replyText?: string | null;
  archived: boolean;
};

const PROVIDER_META: Record<string, { name: string; icon: string; category: IntegrationItem['category']; description: string }> = {
  wecom: {
    name: '企业微信',
    icon: 'chat',
    category: 'Communication',
    description: '组织架构与消息同步',
  },
  wechat: {
    name: '微信',
    icon: 'chat',
    category: 'Communication',
    description: '消息通道',
  },
  dingtalk: {
    name: '钉钉',
    icon: 'campaign',
    category: 'Communication',
    description: '组织与通知集成',
  },
  feishu: {
    name: '飞书',
    icon: 'forum',
    category: 'Communication',
    description: '组织与通知集成',
  },
  github: {
    name: 'GitHub',
    icon: 'code',
    category: 'Development',
    description: '代码托管与 PR 同步',
  },
  oidc: {
    name: 'OIDC SSO',
    icon: 'key',
    category: 'Storage',
    description: '单点登录',
  },
};

export const InboxView: React.FC<InboxViewProps> = ({
  onOpenNewTaskWithTitle,
  lang,
  companyId,
}) => {
  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
  const [inboxItems, setInboxItems] = useState<InboxRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'needs_reply'>('all');
  const [state, setState] = useState<'active' | 'archived' | 'all'>('active');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [notif, integ] = await Promise.all([
          listCollabNotifications(1, state),
          companyId
            ? listIntegrations(companyId).catch(() => ({ items: [] }))
            : Promise.resolve({ items: [] }),
        ]);
        if (cancelled) return;
        setInboxItems(
          (notif.items || []).map((n) => ({
            id: String(n.id),
            source: n.template_key || 'collab',
            icon: 'inbox',
             sender: String(n.sender?.name || (n.payload as { actor?: string })?.actor || '系统'),
             senderName: String(n.sender?.name || (n.payload as { actor?: string })?.actor || '系统'),
            subject: (n.body_text || n.template_key || '通知').slice(0, 80),
            snippet: n.body_text || JSON.stringify(n.payload || {}),
            timestamp: n.created_at
              ? n.created_at.slice(5, 16).replace('T', ' ')
              : '—',
            tag: n.read ? 'Read' : 'New',
            read: n.read,
             needsReply: Boolean((n.payload as { needs_reply?: boolean })?.needs_reply) || String(n.template_key).includes('reply'),
             recipients: n.recipient_user_ids || [],
             attachments: n.attachments || [],
             replyText: n.reply_text,
             archived: Boolean(n.archived),
           })),
        );
        setIntegrations(
          (integ.items || []).map((it) => {
            const meta = PROVIDER_META[it.provider] || {
              name: it.provider,
              icon: 'extension',
              category: 'Development' as const,
              description: it.provider,
            };
            return {
              id: it.provider,
              name: meta.name,
              icon: meta.icon,
              description: meta.description,
              category: meta.category,
              connected: Boolean(it.enabled ?? it.has_credentials ?? it.status === 'active'),
              lastSync: it.last_sync_at,
            };
          }),
        );
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载收件箱失败');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, state]);

  const reloadNotifications = async () => {
    const notif = await listCollabNotifications(1, state);
    setInboxItems((notif.items || []).map((n) => ({
      id: String(n.id), source: n.template_key || 'collab', icon: 'inbox',
      sender: String(n.sender?.name || (n.payload as { actor?: string })?.actor || '系统'),
      senderName: String(n.sender?.name || (n.payload as { actor?: string })?.actor || '系统'),
      subject: (n.body_text || n.template_key || '通知').slice(0, 80),
      snippet: n.body_text || JSON.stringify(n.payload || {}),
      timestamp: n.created_at ? n.created_at.slice(5, 16).replace('T', ' ') : '—',
      tag: n.read ? 'Read' : 'New', read: n.read,
      needsReply: Boolean((n.payload as { needs_reply?: boolean })?.needs_reply) || String(n.template_key).includes('reply'),
      recipients: n.recipient_user_ids || [], attachments: n.attachments || [], replyText: n.reply_text,
      archived: Boolean(n.archived),
    })));
  };

  const changeState = async (item: InboxRow, patch: { read?: boolean; archived?: boolean }) => {
    try {
      await updateNotificationState(Number(item.id), patch);
      await reloadNotifications();
      if (selectedId === item.id && patch.archived) setSelectedId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : (lang === 'zh' ? '通知状态更新失败' : 'Unable to update notification'));
    }
  };

  const handleDelete = async (item: InboxRow) => {
    try {
      await deleteNotification(Number(item.id));
      await reloadNotifications();
      if (selectedId === item.id) setSelectedId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : (lang === 'zh' ? '删除通知失败' : 'Unable to delete notification'));
    }
  };

  const handleSyncNow = async () => {
    if (!companyId) return;
    try {
      await triggerOrgSync(companyId);
      setError(lang === 'zh' ? '已触发组织同步' : 'Org sync triggered');
    } catch (e) {
      setError(e instanceof Error ? e.message : '同步失败');
    }
  };

  const handleConvertToTask = (item: InboxRow) => {
    onOpenNewTaskWithTitle?.(
      item.subject,
      `[${item.source}] ${item.snippet}`,
      { channel: 'collab', title: item.senderName, url: undefined },
    );
  };

  const handleSelect = async (item: InboxRow) => {
    setSelectedId(item.id);
    setReplyText(item.replyText || '');
    if (!item.read) {
      try {
        await markNotificationRead(Number(item.id));
        setInboxItems((prev) => prev.map((row) => row.id === item.id ? { ...row, read: true, tag: 'Read' } : row));
      } catch (e) {
        setError(e instanceof Error ? e.message : '标记已读失败');
      }
    }
  };

  const handleReply = async () => {
    if (!selectedItem || !replyText.trim()) return;
    setReplying(true);
    try {
      const result = await replyCollabNotification(Number(selectedItem.id), replyText.trim());
      setInboxItems((prev) => prev.map((row) => row.id === selectedItem.id ? { ...row, replyText: result.reply_text, needsReply: false, read: true } : row));
    } catch (error) {
      setError(error instanceof Error ? error.message : '回复失败');
    } finally {
      setReplying(false);
    }
  };

  const filteredItems = inboxItems.filter((item) => {
    if (filter === 'unread' && item.read) return false;
    if (filter === 'needs_reply' && !item.needsReply) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return `${item.subject} ${item.snippet} ${item.sender}`.toLowerCase().includes(q);
  });
  const selectedItem = inboxItems.find((item) => item.id === selectedId) || filteredItems[0];

  return (
    <div className="space-y-8 animate-in pb-12">
      <div className="bg-surface-container-low p-6 rounded-3xl border border-outline-variant/30 shadow-xs">
        <h1 className="text-2xl font-bold tracking-tight text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-3xl">inbox</span>
          {lang === 'zh' ? '收件箱与集成' : 'Inbox & Integrations'}
        </h1>
        <p className="text-sm text-on-surface-variant mt-1">
          {lang === 'zh'
            ? '站内协作通知 + 公司集成配置（非伪邮件）'
            : 'Collab notifications + company integrations'}
        </p>
      </div>

      {error && (
        <div className="px-4 py-2 rounded-xl bg-amber-50 text-amber-900 text-sm border border-amber-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mr-auto">
              {lang === 'zh' ? '协作通知流' : 'Collab feed'}
            </h2>
            {(['all', 'unread', 'needs_reply'] as const).map((mode) => (
              <button key={mode} type="button" onClick={() => setFilter(mode)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${filter === mode ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}>
                {mode === 'all' ? (lang === 'zh' ? '全部' : 'All') : mode === 'unread' ? (lang === 'zh' ? '未读' : 'Unread') : (lang === 'zh' ? '需回复' : 'Needs reply')}
              </button>
            ))}
            <button type="button" onClick={() => void markAllNotificationsRead().then(() => setInboxItems((prev) => prev.map((item) => ({ ...item, read: true, tag: 'Read' }))))} className="px-3 py-1.5 rounded-lg text-xs font-bold text-primary bg-primary/10">
              {lang === 'zh' ? '全部已读' : 'Mark all read'}
            </button>
            <select value={state} onChange={(e) => setState(e.target.value as typeof state)} className="px-2 py-1.5 rounded-lg text-xs font-bold bg-surface-container border border-outline-variant">
              <option value="active">{lang === 'zh' ? '当前' : 'Active'}</option>
              <option value="archived">{lang === 'zh' ? '已归档' : 'Archived'}</option>
              <option value="all">{lang === 'zh' ? '全部状态' : 'All states'}</option>
            </select>
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={lang === 'zh' ? '搜索通知…' : 'Search notifications…'} className="md:col-span-2 px-3 py-2 rounded-xl border border-outline-variant bg-surface text-xs" />
          {filteredItems.length === 0 && (
            <p className="text-sm text-on-surface-variant py-8 text-center">
              {lang === 'zh' ? '暂无站内通知' : 'No notifications'}
            </p>
          )}
          {filteredItems.map((item) => (
            <div
              key={item.id}
              onClick={() => void handleSelect(item)}
              className={`p-4 rounded-2xl bg-surface-container-lowest border flex gap-3 cursor-pointer ${selectedItem?.id === item.id ? 'border-primary ring-1 ring-primary/20' : 'border-outline-variant/30'}`}
            >
              <span className="material-symbols-outlined text-primary">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-on-surface-variant">{item.source}</span>
                  <span className="text-[10px] text-on-surface-variant">{item.timestamp}</span>
                </div>
                <div className={`text-sm font-bold text-on-surface mt-0.5 ${item.read ? '' : 'font-extrabold'}`}>{item.subject}</div>
                <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">{item.snippet}</p>
                <button
                  type="button"
                  onClick={() => handleConvertToTask(item)}
                  className="mt-2 text-xs font-bold text-primary cursor-pointer"
                >
                  {lang === 'zh' ? '转为任务' : 'Convert to task'}
                </button>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={(event) => { event.stopPropagation(); void changeState(item, { read: !item.read }); }} className="text-[11px] font-bold text-on-surface-variant hover:text-primary">{item.read ? (lang === 'zh' ? '标未读' : 'Mark unread') : (lang === 'zh' ? '标已读' : 'Mark read')}</button>
                  <button type="button" onClick={(event) => { event.stopPropagation(); void changeState(item, { archived: !item.archived }); }} className="text-[11px] font-bold text-on-surface-variant hover:text-primary">{item.archived ? (lang === 'zh' ? '恢复' : 'Restore') : (lang === 'zh' ? '归档' : 'Archive')}</button>
                  <button type="button" onClick={(event) => { event.stopPropagation(); void handleDelete(item); }} className="text-[11px] font-bold text-error hover:underline">{lang === 'zh' ? '删除' : 'Delete'}</button>
                </div>
              </div>
            </div>
          ))}
          <div className="md:col-span-2 p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 min-h-44">
            {selectedItem ? (
              <>
                <div className="flex items-center justify-between gap-3">
                 <h3 className="font-bold text-on-surface">{selectedItem.subject}</h3>
                  <span className="text-xs text-on-surface-variant">{selectedItem.timestamp}</span>
                </div>
                <div className="text-xs text-on-surface-variant mt-2">{lang === 'zh' ? '发送者' : 'From'}: <span className="font-semibold text-on-surface">{selectedItem.senderName}</span> · {lang === 'zh' ? '收件对象' : 'To'}: {selectedItem.recipients.length ? selectedItem.recipients.join(', ') : '—'}</div>
                <p className="text-xs text-on-surface-variant mt-3 whitespace-pre-wrap">{selectedItem.snippet}</p>
                {selectedItem.attachments.length > 0 && <div className="mt-3 space-y-2">{selectedItem.attachments.map((file, index) => <a key={`${file.name || file.original_name}-${index}`} href={file.url || file.download_url || '#'} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-2 rounded-lg bg-surface-container-low text-xs text-primary"><span className="material-symbols-outlined text-sm">attach_file</span><span className="truncate">{file.name || file.original_name || 'attachment'}</span><span className="ml-auto text-on-surface-variant">{file.mime_type || ''}</span></a>)}</div>}
                {selectedItem.needsReply && <div className="mt-4 flex gap-2"><input value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder={lang === 'zh' ? '快捷回复…' : 'Quick reply…'} className="flex-1 px-3 py-2 rounded-lg border border-outline-variant text-xs" /><button type="button" disabled={replying || !replyText.trim()} onClick={() => void handleReply()} className="px-3 py-2 rounded-lg bg-primary text-on-primary text-xs font-bold disabled:opacity-50">{replying ? '…' : (lang === 'zh' ? '回复' : 'Reply')}</button></div>}
                {selectedItem.replyText && <p className="mt-3 text-xs text-secondary">{lang === 'zh' ? '我的回复：' : 'My reply: '}{selectedItem.replyText}</p>}
                <button type="button" onClick={() => handleConvertToTask(selectedItem)} className="mt-4 px-3 py-2 rounded-lg bg-primary text-on-primary text-xs font-bold">
                  {lang === 'zh' ? '转为任务' : 'Convert to task'}
                </button>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => void changeState(selectedItem, { read: !selectedItem.read })} className="px-3 py-1.5 rounded-lg border border-outline-variant text-xs font-bold">{selectedItem.read ? (lang === 'zh' ? '标未读' : 'Mark unread') : (lang === 'zh' ? '标已读' : 'Mark read')}</button>
                  <button type="button" onClick={() => void changeState(selectedItem, { archived: !selectedItem.archived })} className="px-3 py-1.5 rounded-lg border border-outline-variant text-xs font-bold">{selectedItem.archived ? (lang === 'zh' ? '恢复' : 'Restore') : (lang === 'zh' ? '归档' : 'Archive')}</button>
                  <button type="button" onClick={() => void handleDelete(selectedItem)} className="px-3 py-1.5 rounded-lg border border-error/40 text-error text-xs font-bold">{lang === 'zh' ? '删除' : 'Delete'}</button>
                </div>
              </>
            ) : <p className="text-sm text-on-surface-variant">{lang === 'zh' ? '选择一条通知查看详情' : 'Select a notification to read it'}</p>}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider">
              {lang === 'zh' ? '集成' : 'Integrations'}
            </h2>
            <button
              type="button"
              disabled={!companyId}
              onClick={() => void handleSyncNow()}
              className="text-xs font-bold text-primary cursor-pointer disabled:opacity-40"
            >
              {lang === 'zh' ? '立即同步' : 'Sync now'}
            </button>
          </div>
          {integrations.length === 0 && (
            <p className="text-sm text-on-surface-variant">
              {lang === 'zh' ? '暂无已配置集成' : 'No integrations configured'}
            </p>
          )}
          {integrations.map((it) => (
            <div
              key={it.id}
              className="p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/30"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">{it.icon}</span>
                <div className="flex-1">
                  <div className="text-sm font-bold">{it.name}</div>
                  <div className="text-[11px] text-on-surface-variant">{it.description}</div>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    it.connected
                      ? 'bg-emerald-500/10 text-emerald-600'
                      : 'bg-slate-500/10 text-slate-500'
                  }`}
                >
                  {it.connected
                    ? lang === 'zh'
                      ? '已连接'
                      : 'On'
                    : lang === 'zh'
                      ? '未启用'
                      : 'Off'}
                </span>
              </div>
              {it.lastSync && (
                <div className="text-[10px] text-on-surface-variant mt-2">
                  sync: {it.lastSync}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
