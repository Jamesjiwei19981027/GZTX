import React, { useCallback, useEffect, useState } from 'react';
import { MessageItem, Language, UserProfile, TeamMember, Task } from '../../types';
import {
  likeChannelMessage,
  listChannelMessages,
  listChannels,
  listPresence,
  postChannelMessage,
  listDirectConversations,
  createDirectConversation,
  listDirectMessages,
  postDirectMessage,
  listChannelFiles,
  listPinnedLinks,
  createPinnedLink,
} from '../../api/shell';
import type { DirectConversation } from '../../api/shell';

interface MessagesViewProps {
  user: UserProfile;
  lang: Language;
  companyId?: number | null;
  projectId?: string;
  members?: TeamMember[];
  tasks?: Task[];
  onSelectTask?: (task: Task) => void;
}

export const MessagesView: React.FC<MessagesViewProps> = ({
  user,
  lang,
  companyId,
  projectId,
  members = [],
  tasks = [],
  onSelectTask,
}) => {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [channelMap, setChannelMap] = useState<Record<string, number>>({});
  const [activeChannel, setActiveChannel] = useState<'general' | 'project' | 'direct'>('general');
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [presence, setPresence] = useState<Record<string, string>>({});
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [rightTab, setRightTab] = useState<'files' | 'tasks' | 'about'>('tasks');
  const [files, setFiles] = useState<{ name?: string; original_name?: string; url?: string; message_id: number }[]>([]);
  const [pinnedLinks, setPinnedLinks] = useState<{ id: number; title: string; url: string }[]>([]);
  const [attachmentUrl, setAttachmentUrl] = useState('');

  const channels = [
    { id: 'general' as const, labelZh: '# 全员交流大厅', labelEn: '# general', icon: 'tag' },
    { id: 'project' as const, labelZh: '# 项目冲刺组', labelEn: '# project', icon: 'tag' },
    { id: 'direct' as const, labelZh: '@ 私信与提及', labelEn: '@ direct', icon: 'alternate_email' },
  ];

  const load = useCallback(async () => {
    if (!companyId) {
      setMessages([]);
      setChannelMap({});
      setError(lang === 'zh' ? '请先加入公司后使用团队消息' : 'Join a company to use team messages');
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
      if (activeChannel === 'direct') {
        const conversationRes = await listDirectConversations(companyId);
        setConversations(conversationRes.items || []);
        const conversationId = activeConversationId || conversationRes.items?.[0]?.id || null;
        setActiveConversationId(conversationId);
        if (!conversationId) { setMessages([]); return; }
        const msgRes = await listDirectMessages(conversationId);
        setMessages((msgRes.items || []).map((m) => ({ id: String(m.id), senderName: m.sender_name, senderAvatar: m.sender_avatar || user.avatar, content: m.body, timestamp: m.created_at ? m.created_at.slice(5, 16).replace('T', ' ') : 'Just now', channel: 'direct', likes: 0, repliesCount: 0 })));
        return;
      }
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
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, projectId, activeChannel, activeConversationId, lang, user.avatar]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!companyId) {
      setPresence({});
      return;
    }
    void listPresence(companyId)
      .then((res) => setPresence(Object.fromEntries((res.items || []).map((item) => [String(item.user_id), item.status]))))
      .catch(() => setPresence({}));
  }, [companyId]);

  useEffect(() => {
    const channelId = channelMap[activeChannel];
    if (!channelId || activeChannel === 'direct') return;
    void Promise.all([listChannelFiles(channelId), listPinnedLinks(channelId)]).then(([fileRes, linkRes]) => {
      setFiles(fileRes.items || []);
      setPinnedLinks(linkRes.items || []);
    }).catch(() => undefined);
  }, [channelMap, activeChannel]);

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

    if (!companyId || (activeChannel !== 'direct' && !channelMap[activeChannel])) {
      setError(lang === 'zh' ? '当前没有可用的公司频道' : 'No company channel is available');
      return;
    }

    try {
      const attachments = attachmentUrl.trim() ? [{ url: attachmentUrl.trim(), name: attachmentUrl.trim().split('/').pop() || 'link' }] : [];
      if (activeChannel === 'direct') {
        if (!activeConversationId) {
          const other = members.find((member) => member.id !== user.id)?.id;
          if (!other) throw new Error(lang === 'zh' ? '暂无可用私信对象' : 'No direct-message recipient');
          const conversation = await createDirectConversation(companyId, { member_user_ids: [Number(other)] });
          setActiveConversationId(conversation.id);
          await postDirectMessage(conversation.id, text, attachments);
        } else {
          await postDirectMessage(activeConversationId, text, attachments);
        }
      } else {
        await postChannelMessage(channelMap[activeChannel], text);
      }
      setAttachmentUrl('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败');
    }
  };

  const handleLike = async (id: string) => {
    if (!companyId) {
      setError(lang === 'zh' ? '请先加入公司后点赞' : 'Join a company before liking messages');
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
                ? '未绑定公司，请先加入公司后使用团队消息'
                : 'Join a company to use team messages'}
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[600px]">
        <div className="lg:col-span-3 bg-surface-container-lowest p-5 rounded-3xl border border-outline-variant/30 shadow-xs">
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
            {activeChannel === 'direct' && (
              <div className="mt-3 pt-3 border-t border-outline-variant/30 space-y-1">
                {conversations.map((conversation) => (
                  <button key={conversation.id} type="button" onClick={() => setActiveConversationId(conversation.id)} className={`w-full text-left px-3 py-2 rounded-lg text-xs ${activeConversationId === conversation.id ? 'bg-primary/10 text-primary font-bold' : 'text-on-surface-variant hover:bg-surface-container'}`}>
                    {conversation.title || conversation.members.map((member) => member.name).join(', ') || (lang === 'zh' ? '私信会话' : 'Direct conversation')}
                  </button>
                ))}
                {!conversations.length && <p className="text-[11px] text-on-surface-variant px-3">{lang === 'zh' ? '暂无私信会话，发送消息时创建。' : 'No direct conversations yet.'}</p>}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-6 bg-surface-container-lowest rounded-3xl border border-outline-variant/30 shadow-xs flex flex-col">
          <div className="flex-1 overflow-y-auto p-5 space-y-4 max-h-[520px]">
            {filteredMessages.length === 0 && (
              <p className="text-sm text-on-surface-variant text-center py-12">
                {lang === 'zh' ? '暂无消息，发送第一条吧' : 'No messages yet'}
              </p>
            )}
            {filteredMessages.map((msg) => (
              <div key={msg.id} className="flex gap-3">
                <img
                  src={msg.senderAvatar || undefined}
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
            <input value={attachmentUrl} onChange={(e) => setAttachmentUrl(e.target.value)} placeholder={lang === 'zh' ? '附件链接（可选）' : 'Attachment URL'} className="hidden xl:block w-36 px-2 py-2 rounded-xl bg-surface-container border border-outline-variant/40 text-[11px]" />
            <button type="button" onClick={() => setAttachmentUrl(window.prompt(lang === 'zh' ? '输入附件 URL' : 'Attachment URL') || '')} className="px-2.5 py-2 rounded-xl border border-outline-variant text-on-surface-variant" title={lang === 'zh' ? '添加附件' : 'Attach'}><span className="material-symbols-outlined text-base">attach_file</span></button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold cursor-pointer"
            >
              {lang === 'zh' ? '发送' : 'Send'}
            </button>
          </form>
        </div>
        <aside className="lg:col-span-3 bg-surface-container-lowest p-5 rounded-3xl border border-outline-variant/30 shadow-xs space-y-5">
          <div>
            <h2 className="text-sm font-bold text-on-surface">{lang === 'zh' ? '频道成员' : 'Members'}</h2>
            <p className="text-xs text-on-surface-variant mt-1">{members.length} {lang === 'zh' ? '位成员' : 'members'}</p>
          </div>
          <div className="space-y-2">
            {members.slice(0, 8).map((member) => (
              <div key={member.id} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${presence[member.id] === 'online' ? 'bg-secondary' : presence[member.id] === 'busy' ? 'bg-amber-500' : 'bg-outline-variant'}`} />
                <img src={member.avatar || undefined} alt="" className="w-7 h-7 rounded-full bg-surface-container object-cover" />
                <span className="text-xs font-semibold truncate">{member.name}</span>
              </div>
            ))}
            {!members.length && <p className="text-xs text-on-surface-variant">{lang === 'zh' ? '暂无成员数据' : 'No member data'}</p>}
          </div>
          <div className="pt-4 border-t border-outline-variant/30">
            <div className="flex gap-1 mb-3">{(['files', 'tasks', 'about'] as const).map((tab) => <button key={tab} type="button" onClick={() => setRightTab(tab)} className={`px-2 py-1 rounded-lg text-[11px] font-bold ${rightTab === tab ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}>{tab === 'files' ? (lang === 'zh' ? '文件' : 'Files') : tab === 'tasks' ? (lang === 'zh' ? '任务' : 'Tasks') : (lang === 'zh' ? '关于' : 'About')}</button>)}</div>
            {rightTab === 'files' && <div className="space-y-2">{files.length ? files.map((file, index) => <a key={`${file.message_id}-${index}`} href={file.url || '#'} target="_blank" rel="noreferrer" className="block p-2 rounded-lg bg-surface-container text-xs text-primary truncate">{file.name || file.original_name || 'shared file'}</a>) : <p className="text-xs text-on-surface-variant">{lang === 'zh' ? '暂无最近分享文件' : 'No shared files yet'}</p>}{pinnedLinks.map((link) => <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="block p-2 rounded-lg bg-primary/5 text-xs text-primary truncate">📌 {link.title}</a>)}{channelMap[activeChannel] && <button type="button" onClick={() => { const title = window.prompt(lang === 'zh' ? '链接标题' : 'Link title'); const url = window.prompt(lang === 'zh' ? '链接 URL' : 'Link URL'); if (title && url) void createPinnedLink(channelMap[activeChannel], { title, url }).then((link) => setPinnedLinks((prev) => [link, ...prev])); }} className="text-[11px] font-bold text-primary">+ {lang === 'zh' ? '固定链接' : 'Pin link'}</button>}</div>}
            {rightTab === 'tasks' && <>
            <h2 className="text-sm font-bold text-on-surface">{lang === 'zh' ? '项目任务' : 'Project tasks'}</h2>
            <div className="space-y-2 mt-3">
              {tasks.slice(0, 5).map((task) => (
                <button key={task.id} type="button" onClick={() => onSelectTask?.(task)} className="w-full text-left p-2 rounded-lg hover:bg-surface-container text-xs">
                  <span className="font-semibold line-clamp-2">{task.title}</span>
                  <span className="text-on-surface-variant">{task.status}</span>
                </button>
              ))}
              {!tasks.length && <p className="text-xs text-on-surface-variant">{lang === 'zh' ? '暂无关联任务' : 'No linked tasks'}</p>}
            </div>
            </>}
            {rightTab === 'about' && <p className="text-xs text-on-surface-variant">{lang === 'zh' ? '这是 WorkTodo 协作消息。频道消息、私信和通知附件均来自后端持久化数据。' : 'WorkTodo collaboration messages are persisted by the backend.'}</p>}
          </div>
        </aside>
      </div>
    </div>
  );
};
