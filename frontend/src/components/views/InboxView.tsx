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
  getExternalMailStatus,
  syncExternalMail,
  listExternalMail,
  getExternalMail,
  updateExternalMailState,
} from '../../api/shell';
import type { ExternalMailItem } from '../../api/shell';
import { appendPageById, hasMoreByTotal } from '../../utils/messagePaging';
import { inboxSourceLabel } from '../../utils/inboxText';

interface InboxViewProps {
  onOpenNewTaskWithTitle?: (title: string, desc: string, source?: { channel?: string; title?: string; url?: string }) => void;
  lang: Language;
  companyId?: number | null;
  /** 仅公司管理员才能读取集成列表；普通成员不发请求 */
  canViewIntegrations?: boolean;
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
  canViewIntegrations = false,
}) => {
  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
  const [inboxItems, setInboxItems] = useState<InboxRow[]>([]);
  const [inboxTotal, setInboxTotal] = useState(0);
  const [inboxPage, setInboxPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'needs_reply'>('all');
  const [state, setState] = useState<'active' | 'archived' | 'all'>('active');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [externalStatus, setExternalStatus] = useState<{ configured: boolean; reason?: string | null } | null>(null);
  const [externalItems, setExternalItems] = useState<ExternalMailItem[]>([]);
  const [externalDetail, setExternalDetail] = useState<ExternalMailItem | null>(null);
  const [syncingExternal, setSyncingExternal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [notif, integ] = await Promise.all([
          listCollabNotifications(1, state),
          companyId && canViewIntegrations
            ? listIntegrations(companyId).catch(() => ({ items: [] }))
            : Promise.resolve({ items: [] }),
        ]);
        if (cancelled) return;
        setInboxTotal(notif.total ?? (notif.items || []).length);
        setInboxPage(1);
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
            tag: n.read ? '已读' : '未读',
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
              connected: Boolean(it.has_credentials) && it.enabled !== false,
              lastSync: it.last_sync_at,
            };
          }),
        );
        setError(null);
        if (companyId) {
          const mailStatus = await getExternalMailStatus(companyId);
          setExternalStatus(mailStatus);
          if (mailStatus.configured) {
            const external = await listExternalMail(companyId, 'active');
            setExternalItems(external.items || []);
          } else {
            setExternalItems([]);
          }
        } else {
          setExternalStatus(null);
          setExternalItems([]);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载收件箱失败');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, state, canViewIntegrations]);

  const reloadExternalMail = async () => {
    if (!companyId) return;
    const mailStatus = await getExternalMailStatus(companyId);
    setExternalStatus(mailStatus);
    if (mailStatus.configured) {
      const external = await listExternalMail(companyId, 'active');
      setExternalItems(external.items || []);
    } else {
      setExternalItems([]);
    }
  };

  const handleExternalSync = async () => {
    if (!companyId || !externalStatus?.configured) return;
    setSyncingExternal(true);
    try {
      await syncExternalMail(companyId);
      await reloadExternalMail();
    } catch (e) {
      setError(e instanceof Error ? e.message : '外部邮件同步失败');
    } finally {
      setSyncingExternal(false);
    }
  };

  const openExternalMail = async (item: ExternalMailItem) => {
    try {
      setExternalDetail(await getExternalMail(item.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法打开外部邮件');
    }
  };

  const changeExternalState = async (stateValue: 'archived' | 'deleted' | 'active') => {
    if (!externalDetail) return;
    try {
      await updateExternalMailState(externalDetail.id, stateValue);
      setExternalDetail(null);
      await reloadExternalMail();
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新外部邮件状态失败');
    }
  };

  const reloadNotifications = async () => {
    const notif = await listCollabNotifications(1, state);
    setInboxTotal(notif.total ?? (notif.items || []).length);
    setInboxPage(1);
    setInboxItems((notif.items || []).map((n) => ({
      id: String(n.id), source: n.template_key || 'collab', icon: 'inbox',
      sender: String(n.sender?.name || (n.payload as { actor?: string })?.actor || '系统'),
      senderName: String(n.sender?.name || (n.payload as { actor?: string })?.actor || '系统'),
      subject: (n.body_text || n.template_key || '通知').slice(0, 80),
      snippet: n.body_text || JSON.stringify(n.payload || {}),
      timestamp: n.created_at ? n.created_at.slice(5, 16).replace('T', ' ') : '—',
      tag: n.read ? '已读' : '未读', read: n.read,
      needsReply: Boolean((n.payload as { needs_reply?: boolean })?.needs_reply) || String(n.template_key).includes('reply'),
      recipients: n.recipient_user_ids || [], attachments: n.attachments || [], replyText: n.reply_text,
      archived: Boolean(n.archived),
    })));
  };

  // 按后端 total 分页：已加载数 < total 就还有下一页
  const loadMoreNotifications = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const next = inboxPage + 1;
      const notif = await listCollabNotifications(next, state);
      const rows: InboxRow[] = (notif.items || []).map((n) => ({
        id: String(n.id), source: n.template_key || 'collab', icon: 'inbox',
        sender: String(n.sender?.name || (n.payload as { actor?: string })?.actor || '系统'),
        senderName: String(n.sender?.name || (n.payload as { actor?: string })?.actor || '系统'),
        subject: (n.body_text || n.template_key || '通知').slice(0, 80),
        snippet: n.body_text || JSON.stringify(n.payload || {}),
        timestamp: n.created_at ? n.created_at.slice(5, 16).replace('T', ' ') : '—',
        tag: n.read ? '已读' : '未读', read: n.read,
        needsReply: Boolean((n.payload as { needs_reply?: boolean })?.needs_reply) || String(n.template_key).includes('reply'),
        recipients: n.recipient_user_ids || [], attachments: n.attachments || [], replyText: n.reply_text,
        archived: Boolean(n.archived),
      }));
      setInboxItems((prev) => {
        const merged = appendPageById(prev.map((r) => ({ ...r, id: Number(r.id) })), rows.map((r) => ({ ...r, id: Number(r.id) })));
        return merged.map((r) => ({ ...r, id: String(r.id) }));
      });
      setInboxTotal(notif.total ?? inboxTotal);
      setInboxPage(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载更多通知失败');
    } finally {
      setLoadingMore(false);
    }
  };

  const changeState = async (item: InboxRow, patch: { read?: boolean; archived?: boolean }) => {
    try {
      await updateNotificationState(Number(item.id), patch);
      await reloadNotifications();
      if (selectedId === item.id && patch.archived) setSelectedId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '通知状态更新失败');
    }
  };

  const handleDelete = async (item: InboxRow) => {
    try {
      await deleteNotification(Number(item.id));
      await reloadNotifications();
      if (selectedId === item.id) setSelectedId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除通知失败');
    }
  };

  const handleSyncNow = async () => {
    if (!companyId) return;
    try {
      await triggerOrgSync(companyId);
      setError('已触发组织同步');
    } catch (e) {
      setError(e instanceof Error ? e.message : '同步失败');
    }
  };

  const handleConvertToTask = (item: InboxRow) => {
    onOpenNewTaskWithTitle?.(
      item.subject,
      `[${inboxSourceLabel(item.source)}] ${item.snippet}`,
      { channel: 'collab', title: item.senderName, url: undefined },
    );
  };

  const handleSelect = async (item: InboxRow) => {
    setSelectedId(item.id);
    setReplyText(item.replyText || '');
    if (!item.read) {
      try {
        await markNotificationRead(Number(item.id));
        setInboxItems((prev) => prev.map((row) => row.id === item.id ? { ...row, read: true, tag: '已读' } : row));
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
          收件箱与集成
        </h1>
        <p className="text-sm text-on-surface-variant mt-1">
          站内协作通知与公司集成状态
        </p>
      </div>

      {error && (
        <div className="px-4 py-2 rounded-xl bg-amber-50 text-amber-900 text-sm border border-amber-200">
          {error}
        </div>
      )}

      {companyId && <section data-source="external-mail" className="rounded-2xl border border-outline-variant/40 bg-surface-container-low p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-sm font-bold text-on-surface">外部邮件</h2>
            <p className="text-xs text-on-surface-variant">{externalStatus?.configured ? '外部邮箱同步的邮件（只读）' : '外部邮件（需先配置邮箱）'}</p>
          </div>
          <button type="button" disabled={!externalStatus?.configured || syncingExternal} onClick={() => void handleExternalSync()} className="ml-auto px-3 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-bold disabled:opacity-50">{syncingExternal ? '同步中…' : '立即同步'}</button>
        </div>
        {!externalStatus?.configured && <p className="text-xs text-amber-700">{externalStatus?.reason || '需要先配置外部邮箱后才能同步。'}</p>}
        {externalItems.length > 0 && <div className="flex flex-wrap gap-2">{externalItems.map((item) => <button key={item.id} type="button" onClick={() => void openExternalMail(item)} className="text-left px-3 py-2 rounded-lg bg-surface text-xs hover:bg-primary/10"><span className="font-semibold">{item.subject || '（无主题）'}</span><span className="block text-[10px] text-on-surface-variant">{item.from_address || '未知发件人'}</span></button>)}</div>}
        {externalDetail && <div className="rounded-xl bg-surface p-3 text-xs space-y-2">
          <div className="flex items-center justify-between"><span className="font-bold">{externalDetail.subject || '（无主题）'}</span><button type="button" onClick={() => setExternalDetail(null)} className="text-on-surface-variant">×</button></div>
          <p className="text-on-surface-variant">发件人：{externalDetail.from_address || '未知'}</p>
          <p className="whitespace-pre-wrap text-on-surface">{externalDetail.body_text || ''}</p>
          <div className="flex gap-2"><button type="button" onClick={() => void changeExternalState('archived')} className="px-2 py-1 rounded bg-surface-container">归档</button><button type="button" onClick={() => void changeExternalState('deleted')} className="px-2 py-1 rounded bg-error-container text-error">删除</button></div>
        </div>}
      </section>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mr-auto">
              协作通知流
            </h2>
            {(['all', 'unread', 'needs_reply'] as const).map((mode) => (
              <button key={mode} type="button" onClick={() => setFilter(mode)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${filter === mode ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}>
                {mode === 'all' ? '全部' : mode === 'unread' ? '未读' : '需回复'}
              </button>
            ))}
            <button type="button" onClick={() => void markAllNotificationsRead().then(() => setInboxItems((prev) => prev.map((item) => ({ ...item, read: true, tag: '已读' })))).catch(() => setError('全部已读失败，请重试'))} className="px-3 py-1.5 rounded-lg text-xs font-bold text-primary bg-primary/10">
              全部已读
            </button>
            <select value={state} onChange={(e) => setState(e.target.value as typeof state)} className="px-2 py-1.5 rounded-lg text-xs font-bold bg-surface-container border border-outline-variant">
              <option value="active">当前</option>
              <option value="archived">已归档</option>
              <option value="all">全部状态</option>
            </select>
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索通知…" className="md:col-span-2 px-3 py-2 rounded-xl border border-outline-variant bg-surface text-xs" />
          {filteredItems.length === 0 && (
            <p className="text-sm text-on-surface-variant py-8 text-center">
              暂无站内通知
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
                  <span className="text-xs font-bold text-on-surface-variant">{inboxSourceLabel(item.source)}</span>
                  <span className="text-[10px] text-on-surface-variant">{item.timestamp}</span>
                </div>
                <div className={`text-sm font-bold text-on-surface mt-0.5 ${item.read ? '' : 'font-extrabold'}`}>{item.subject}</div>
                <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">{item.snippet}</p>
                <button
                  type="button"
                  onClick={() => handleConvertToTask(item)}
                  className="mt-2 text-xs font-bold text-primary cursor-pointer"
                >
                  转为任务
                </button>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={(event) => { event.stopPropagation(); void changeState(item, { read: !item.read }); }} className="text-[11px] font-bold text-on-surface-variant hover:text-primary">{item.read ? '标未读' : '标已读'}</button>
                  <button type="button" onClick={(event) => { event.stopPropagation(); void changeState(item, { archived: !item.archived }); }} className="text-[11px] font-bold text-on-surface-variant hover:text-primary">{item.archived ? '恢复' : '归档'}</button>
                  <button type="button" onClick={(event) => { event.stopPropagation(); void handleDelete(item); }} className="text-[11px] font-bold text-error hover:underline">删除</button>
                </div>
              </div>
            </div>
          ))}
          {hasMoreByTotal(inboxItems.length, inboxTotal) && (
            <div className="md:col-span-2 text-center">
              <button
                type="button"
                data-testid="inbox-load-more"
                disabled={loadingMore}
                onClick={() => void loadMoreNotifications()}
                className="px-4 py-2 rounded-xl bg-surface-container text-xs font-bold text-primary disabled:opacity-50"
              >
                {loadingMore ? '正在加载…' : `加载更多（已显示 ${inboxItems.length} / ${inboxTotal}）`}
              </button>
            </div>
          )}
          <div className="md:col-span-2 p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 min-h-44">
            {selectedItem ? (
              <>
                <div className="flex items-center justify-between gap-3">
                 <h3 className="font-bold text-on-surface">{selectedItem.subject}</h3>
                  <span className="text-xs text-on-surface-variant">{selectedItem.timestamp}</span>
                </div>
                <div className="text-xs text-on-surface-variant mt-2">发送者: <span className="font-semibold text-on-surface">{selectedItem.senderName}</span> · 收件对象: {selectedItem.recipients.length ? selectedItem.recipients.join(', ') : '—'}</div>
                <p className="text-xs text-on-surface-variant mt-3 whitespace-pre-wrap">{selectedItem.snippet}</p>
                {selectedItem.attachments.length > 0 && <div className="mt-3 space-y-2">{selectedItem.attachments.map((file, index) => <a key={`${file.name || file.original_name}-${index}`} href={file.url || file.download_url || '#'} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-2 rounded-lg bg-surface-container-low text-xs text-primary"><span className="material-symbols-outlined text-sm">attach_file</span><span className="truncate">{file.name || file.original_name || '附件'}</span><span className="ml-auto text-on-surface-variant">{file.mime_type || ''}</span></a>)}</div>}
                {selectedItem.needsReply && <div className="mt-4 flex gap-2"><input value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="快捷回复…" className="flex-1 px-3 py-2 rounded-lg border border-outline-variant text-xs" /><button type="button" disabled={replying || !replyText.trim()} onClick={() => void handleReply()} className="px-3 py-2 rounded-lg bg-primary text-on-primary text-xs font-bold disabled:opacity-50">{replying ? '…' : '回复'}</button></div>}
                {selectedItem.replyText && <p className="mt-3 text-xs text-secondary">我的回复：{selectedItem.replyText}</p>}
                <button type="button" onClick={() => handleConvertToTask(selectedItem)} className="mt-4 px-3 py-2 rounded-lg bg-primary text-on-primary text-xs font-bold">
                  转为任务
                </button>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => void changeState(selectedItem, { read: !selectedItem.read })} className="px-3 py-1.5 rounded-lg border border-outline-variant text-xs font-bold">{selectedItem.read ? '标未读' : '标已读'}</button>
                  <button type="button" onClick={() => void changeState(selectedItem, { archived: !selectedItem.archived })} className="px-3 py-1.5 rounded-lg border border-outline-variant text-xs font-bold">{selectedItem.archived ? '恢复' : '归档'}</button>
                  <button type="button" onClick={() => void handleDelete(selectedItem)} className="px-3 py-1.5 rounded-lg border border-error/40 text-error text-xs font-bold">删除</button>
                </div>
              </>
            ) : <p className="text-sm text-on-surface-variant">选择一条通知查看详情</p>}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider">
              集成
            </h2>
            <button
              type="button"
              disabled={!companyId}
              onClick={() => void handleSyncNow()}
              className="text-xs font-bold text-primary cursor-pointer disabled:opacity-40"
            >
              立即同步
            </button>
          </div>
          {integrations.length === 0 && (
            <p className="text-sm text-on-surface-variant">
              暂无已配置集成
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
                  {it.connected ? '已连接' : '未配置'}
                </span>
              </div>
              {it.lastSync && (
                <div className="text-[10px] text-on-surface-variant mt-2">
                  上次同步：{it.lastSync}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
