import React, { useEffect, useState } from 'react';
import { IntegrationItem, Language } from '../../types';
import {
  listCollabNotifications,
  listIntegrations,
  markAllNotificationsRead,
  markNotificationRead,
  triggerOrgSync,
} from '../../api/shell';

interface InboxViewProps {
  onOpenNewTaskWithTitle?: (title: string, desc: string) => void;
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
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [notif, integ] = await Promise.all([
          listCollabNotifications(1),
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
            sender: String((n.payload as { actor?: string })?.actor || '系统'),
            subject: (n.body_text || n.template_key || '通知').slice(0, 80),
            snippet: n.body_text || JSON.stringify(n.payload || {}),
            timestamp: n.created_at
              ? n.created_at.slice(5, 16).replace('T', ' ')
              : '—',
            tag: n.read ? 'Read' : 'New',
            read: n.read,
            needsReply: Boolean((n.payload as { needs_reply?: boolean })?.needs_reply) || String(n.template_key).includes('reply'),
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
  }, [companyId]);

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
    );
  };

  const handleSelect = async (item: InboxRow) => {
    setSelectedId(item.id);
    if (!item.read) {
      try {
        await markNotificationRead(Number(item.id));
        setInboxItems((prev) => prev.map((row) => row.id === item.id ? { ...row, read: true, tag: 'Read' } : row));
      } catch (e) {
        setError(e instanceof Error ? e.message : '标记已读失败');
      }
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
                <p className="text-xs text-on-surface-variant mt-3 whitespace-pre-wrap">{selectedItem.snippet}</p>
                <button type="button" onClick={() => handleConvertToTask(selectedItem)} className="mt-4 px-3 py-2 rounded-lg bg-primary text-on-primary text-xs font-bold">
                  {lang === 'zh' ? '转为任务' : 'Convert to task'}
                </button>
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
