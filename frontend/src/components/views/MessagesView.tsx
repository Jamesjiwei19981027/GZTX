import React, { useCallback, useEffect, useState } from 'react';
import { MessageItem, Language, UserProfile } from '../../types';
import { loadMessages, saveMessages } from '../../data/mockData';
import {
  likeChannelMessage,
  listChannelMessages,
  listChannels,
  postChannelMessage,
} from '../../api/shell';

interface MessagesViewProps {
  user: UserProfile;
  lang: Language;
  companyId?: number | null;
  projectId?: string;
}

export const MessagesView: React.FC<MessagesViewProps> = ({
  user,
  lang,
  companyId,
  projectId,
}) => {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [channelMap, setChannelMap] = useState<Record<string, number>>({});
  const [activeChannel, setActiveChannel] = useState<'general' | 'project' | 'direct'>('general');
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const channels = [
    { id: 'general' as const, labelZh: '# 全员交流大厅', labelEn: '# general', icon: 'tag' },
    { id: 'project' as const, labelZh: '# 项目冲刺组', labelEn: '# project', icon: 'tag' },
    { id: 'direct' as const, labelZh: '@ 私信与提及', labelEn: '@ direct', icon: 'alternate_email' },
  ];

  const load = useCallback(async () => {
    if (!companyId) {
      setMessages(loadMessages());
      setChannelMap({});
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const pid = projectId && projectId !== 'all' ? Number(projectId) : undefined;
      const chRes = await listChannels(companyId, Number.isFinite(pid) ? pid : undefined);
      const map: Record<string, number> = {};
      for (const c of chRes.items || []) map[c.key] = c.id;
      setChannelMap(map);
      const chId = map[activeChannel];
      if (!chId) {
        setMessages([]);
        return;
      }
      const msgRes = await listChannelMessages(chId);
      setMessages(
        (msgRes.items || []).map((m) => ({
          id: String(m.id),
          senderName: m.sender_name,
          senderAvatar: m.sender_avatar || user.avatar,
          content: m.body,
          timestamp: m.created_at
            ? m.created_at.slice(5, 16).replace('T', ' ')
            : lang === 'zh'
              ? '刚刚'
              : 'Just now',
          channel: activeChannel,
          likes: m.likes || 0,
          repliesCount: 0,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载消息失败');
      setMessages(loadMessages());
    } finally {
      setLoading(false);
    }
  }, [companyId, projectId, activeChannel, lang, user.avatar]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredMessages = messages.filter((msg) => {
    if (!companyId && msg.channel !== activeChannel) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return msg.content.toLowerCase().includes(q) || msg.senderName.toLowerCase().includes(q);
  });

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const text = inputText.trim();
    setInputText('');

    if (!companyId || !channelMap[activeChannel]) {
      const newMsg: MessageItem = {
        id: `msg_${Date.now()}`,
        senderName: user.name,
        senderAvatar: user.avatar,
        content: text,
        timestamp: lang === 'zh' ? '刚刚' : 'Just now',
        channel: activeChannel,
        likes: 0,
        repliesCount: 0,
      };
      const updated = [...messages, newMsg];
      setMessages(updated);
      saveMessages(updated);
      return;
    }

    try {
      await postChannelMessage(channelMap[activeChannel], text);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败');
    }
  };

  const handleLike = async (id: string) => {
    if (!companyId) {
      const updated = messages.map((msg) =>
        msg.id === id ? { ...msg, likes: (msg.likes || 0) + 1 } : msg,
      );
      setMessages(updated);
      saveMessages(updated);
      return;
    }
    try {
      const res = await likeChannelMessage(Number(id));
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, likes: res.likes } : m)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '点赞失败');
    }
  };

  return (
    <div className="space-y-6 animate-in pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-container-low p-6 rounded-3xl border border-outline-variant/30 shadow-xs">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-3xl">forum</span>
            {lang === 'zh' ? '消息中心' : 'Messages'}
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {companyId
              ? lang === 'zh'
                ? '已连接后端频道（发帖/点赞写回）'
                : 'Connected to backend channels'
              : lang === 'zh'
                ? '未绑定公司，使用本地演示消息'
                : 'Local demo messages'}
          </p>
        </div>
        {loading && (
          <span className="text-xs font-bold text-primary">{lang === 'zh' ? '同步中…' : 'Syncing…'}</span>
        )}
      </div>

      {error && (
        <div className="px-4 py-2 rounded-xl bg-amber-50 text-amber-900 text-sm border border-amber-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-[600px]">
        <div className="bg-surface-container-lowest p-5 rounded-3xl border border-outline-variant/30 shadow-xs">
          <div className="relative mb-4">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-outline text-lg">
              search
            </span>
            <input
              type="text"
              placeholder={lang === 'zh' ? '搜索聊天内容...' : 'Search...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-surface-container border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface"
            />
          </div>
          <div className="space-y-1">
            {channels.map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => setActiveChannel(ch.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                  activeChannel === ch.id
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                {lang === 'zh' ? ch.labelZh : ch.labelEn}
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 bg-surface-container-lowest rounded-3xl border border-outline-variant/30 shadow-xs flex flex-col">
          <div className="flex-1 overflow-y-auto p-5 space-y-4 max-h-[520px]">
            {filteredMessages.length === 0 && (
              <p className="text-sm text-on-surface-variant text-center py-12">
                {lang === 'zh' ? '暂无消息，发送第一条吧' : 'No messages yet'}
              </p>
            )}
            {filteredMessages.map((msg) => (
              <div key={msg.id} className="flex gap-3">
                <img
                  src={msg.senderAvatar || 'https://via.placeholder.com/40'}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover bg-surface-container"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-bold text-on-surface">{msg.senderName}</span>
                    <span className="text-[10px] text-on-surface-variant">{msg.timestamp}</span>
                  </div>
                  <p className="text-sm text-on-surface mt-1 whitespace-pre-wrap">{msg.content}</p>
                  <button
                    type="button"
                    onClick={() => void handleLike(msg.id)}
                    className="mt-2 text-xs font-semibold text-on-surface-variant hover:text-primary cursor-pointer"
                  >
                    ♥ {msg.likes || 0}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={(e) => void handleSendMessage(e)} className="p-4 border-t border-outline-variant/30 flex gap-2">
            <input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={lang === 'zh' ? '输入消息…' : 'Type a message…'}
              className="flex-1 px-4 py-2.5 rounded-xl bg-surface-container border border-outline-variant/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold cursor-pointer"
            >
              {lang === 'zh' ? '发送' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
