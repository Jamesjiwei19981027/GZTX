import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  listChannels,
  listChannelMessages,
  postChannelMessage,
  likeChannelMessage,
  listDirectConversations,
  listDirectMessages,
  postDirectMessage,
  createChannelSummary,
  createConversationSummary,
  type CommunicationSummary,
  listChannelFiles,
  uploadChannelFile,
  listPinnedLinks,
  createPinnedLink,
  type DirectConversation,
  type CollabFile,
} from '../../../api/shell';
import { ApiError } from '../../../api/client';
import { UserProfile, TeamMember, Language, Task } from '../../../types';
import { AppIcon } from '../../ui/AppIcon';
import { MobileInput, MobileTextarea } from '../../ui/MobileField';
import { MobileListGroup, MobileListItem } from '../../ui/MobileList';
import { MobileSheet } from '../../ui/MobileSheet';
import { MobileEmptyState, MobileLoadingState } from '../../ui/MobileState';
import { WorkContactsPage } from '../../../components/WorkContactsPage';

export interface MobileMessageScreensProps {
  currentUserId?: string;
  companyId: number | null;
  projectId?: string;
  members?: TeamMember[];
  onOpenCall?: (targetName: string, callType: 'audio' | 'video', conversationId?: number) => void;
  onConvertToTaskDraft?: (draft: { title: string; description: string; sourceChannel: string }) => void;
  onBack?: () => void;
  lang?: Language;
}

// -------------------------------------------------------------
// 44 消息会话列表 (项目频道与私聊列表)
// -------------------------------------------------------------
export const MobileMessageListScreen: React.FC<MobileMessageScreensProps & {
  onSelectChannel: (channel: { id: number; name: string }) => void;
  onSelectDirect: (conv: DirectConversation) => void;
  onOpenInbox?: () => void;
  onOpenContacts?: () => void;
}> = ({
  companyId,
  projectId,
  onSelectChannel,
  onSelectDirect,
  onOpenInbox,
  onOpenContacts,
  onBack,
  lang = 'zh',
}) => {
  const [channels, setChannels] = useState<{ id: number; key: string; name: string }[]>([]);
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatType, setChatType] = useState<'channels' | 'direct'>('channels');
  const [newChatOpen, setNewChatOpen] = useState(false);
  const onOpenNewChat = () => onOpenContacts ? onOpenContacts() : setNewChatOpen(true);

  useEffect(() => {
    let active = true;
    const fetchChatList = async () => {
      if (!companyId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const pIdNum = projectId && projectId !== 'all' ? Number(projectId) : undefined;
        const [chRes, dmRes] = await Promise.all([
          listChannels(companyId, pIdNum),
          listDirectConversations(companyId).catch(() => ({ items: [] })),
        ]);
        if (active) {
          setChannels(chRes.items || []);
          setConversations(dmRes.items || []);
        }
      } catch {
        /* ignore */
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchChatList();
    return () => {
      active = false;
    };
  }, [companyId, projectId]);

  if (newChatOpen) return <WorkContactsPage companyId={companyId} onBack={() => setNewChatOpen(false)}
    onCreated={(id,title) => { setNewChatOpen(false); onSelectDirect({id,title,company_id:companyId!,kind:'direct',members:[]}); }} />;

  return (
    <div className="flex flex-col h-full bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <header className="h-14 px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
        <h1 className="text-base font-semibold">消息中心</h1>
        <div className="flex items-center">
        {onOpenInbox && <button type="button" onClick={onOpenInbox} aria-label="通知与收件箱"
          className="mobile-touch-target text-slate-500 dark:text-slate-300"><AppIcon name="bell" size={20} /></button>}
        <button
          type="button"
          onClick={onOpenNewChat}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2 text-[#0058BE]"
          aria-label="新建私聊"
        >
          <AppIcon name="plus" size={22} />
        </button>
        </div>
      </header>

      {/* 频道 vs 私聊切换栏 */}
      <div className="px-4 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setChatType('channels')}
          className={`min-h-[34px] px-3.5 rounded-full text-xs font-semibold transition-colors ${
            chatType === 'channels'
              ? 'bg-[#0058BE] text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
          }`}
        >
          项目频道 ({channels.length})
        </button>
        <button
          type="button"
          onClick={() => setChatType('direct')}
          className={`min-h-[34px] px-3.5 rounded-full text-xs font-semibold transition-colors ${
            chatType === 'direct'
              ? 'bg-[#0058BE] text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
          }`}
        >
          直接私聊 ({conversations.length})
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <MobileLoadingState message="获取会话列表…" />
        ) : chatType === 'channels' ? (
          channels.length === 0 ? (
            <MobileEmptyState
              title="暂无项目频道"
              description="选择项目后可进入项目频道，也可选择工作联系人发起私聊"
              actionLabel="选择工作联系人"
              onAction={onOpenNewChat}
            />
          ) : (
            <MobileListGroup title="频道列表">
              {channels.map((ch) => (
                <MobileListItem
                  key={ch.id}
                  leading={
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950 text-[#0058BE] flex items-center justify-center font-bold text-sm">
                      #
                    </div>
                  }
                  title={ch.name}
                  subtitle={`项目公共频道 #${ch.key}`}
                  onClick={() => onSelectChannel(ch)}
                />
              ))}
            </MobileListGroup>
          )
        ) : conversations.length === 0 ? (
          <MobileEmptyState
            title="暂无直接私聊"
            description="点击右上角「+」选择工作联系人发起私聊"
            actionLabel="发起私聊"
            onAction={onOpenNewChat}
          />
        ) : (
          <MobileListGroup title="私聊与讨论组">
            {conversations.map((conv) => {
              const title =
                conv.title ||
                conv.members.map((m) => m.name).join('、') ||
                `会话 #${conv.id}`;
              const lastText = conv.last_message?.body || '暂无消息记录';

              return (
                <MobileListItem
                  key={conv.id}
                  leading={
                    <div className="w-10 h-10 rounded-full bg-[#0058BE]/10 text-[#0058BE] flex items-center justify-center font-bold text-sm">
                      {title.slice(0, 1)}
                    </div>
                  }
                  title={title}
                  subtitle={
                    <span className="truncate block text-xs text-slate-500">
                      {lastText}
                    </span>
                  }
                  onClick={() => onSelectDirect(conv)}
                />
              );
            })}
          </MobileListGroup>
        )}
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 45 项目聊天 / 私聊 (消息流、单列、操作菜单与转任务)
// -------------------------------------------------------------
export const MobileChatDetailScreen: React.FC<{
  type: 'channel' | 'direct';
  id: number;
  name: string;
  currentUserId?: string;
  companyId: number | null;
  onOpenProfile: () => void;
  onOpenCall?: (targetName: string, callType: 'audio' | 'video') => void;
  onConvertToTaskDraft?: (draft: { title: string; description: string; sourceChannel: string }) => void;
  onBack: () => void;
  lang?: Language;
}> = ({
  type,
  id,
  name,
  currentUserId,
  companyId,
  onOpenProfile,
  onOpenCall,
  onConvertToTaskDraft,
  onBack,
  lang = 'zh',
}) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<any | null>(null);
  const [summary, setSummary] = useState<CommunicationSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    try {
      if (type === 'channel') {
        const res = await listChannelMessages(id);
        setMessages(res.items || []);
      } else {
        const res = await listDirectMessages(id);
        setMessages(res.items || []);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 6000);
    return () => clearInterval(interval);
  }, [type, id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || sending) return;
    const textToSend = inputText.trim();
    setInputText('');
    setSending(true);
    try {
      if (type === 'channel') {
        await postChannelMessage(id, textToSend);
      } else {
        await postDirectMessage(id, textToSend);
      }
      await fetchMessages();
    } catch {
      setInputText(textToSend); // 失败保留
    } finally {
      setSending(false);
    }
  };

  const handleLike = async (msg: any) => {
    if (type !== 'channel') return;
    try {
      const res = await likeChannelMessage(msg.id);
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, likes: res.likes } : m)),
      );
    } catch {
      /* ignore */
    }
  };

  const handleSummary = async () => {
    setSummaryLoading(true);
    try {
      const result = type === 'channel'
        ? await createChannelSummary(id)
        : await createConversationSummary(id);
      setSummary(result);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      {/* 顶栏 */}
      <header className="h-14 px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[48px] min-w-[48px] flex items-center justify-center -ml-2 text-slate-500"
          aria-label="返回会话列表"
        >
          <AppIcon name="back" size={20} />
        </button>

        <h1 className="text-base font-semibold truncate flex-1 text-center px-2">
          {name}
        </h1>

        <div className="flex items-center gap-1">
          {onOpenCall && (
            <>
              <button
                type="button"
                onClick={() => onOpenCall(name, 'audio', type === 'direct' ? id : undefined)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-600 dark:text-slate-300"
                aria-label="语音通话"
              >
                <AppIcon name="phone" size={18} />
              </button>
              <button
                type="button"
                onClick={() => onOpenCall(name, 'video', type === 'direct' ? id : undefined)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-600 dark:text-slate-300"
                aria-label="视频通话"
              >
                <AppIcon name="video" size={18} />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => void handleSummary()}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#0058BE]"
            aria-label="AI总结聊天记录"
            disabled={summaryLoading}
          >
            <AppIcon name="ai" size={18} />
          </button>

          <button
            type="button"
            onClick={onOpenProfile}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-600 dark:text-slate-300"
            aria-label="会话资料"
          >
            <AppIcon name="info" size={18} />
          </button>
        </div>
      </header>

      {summary && (
        <section className="mx-3 mt-3 p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 text-xs space-y-2">
          <div className="font-semibold text-[#0058BE]">AI 聊天总结 · {summary.source_count} 条来源</div>
          <p className="whitespace-pre-wrap leading-relaxed text-slate-700 dark:text-slate-200">{summary.summary_text}</p>
          <div className="text-[11px] text-slate-500">生成方式：{summary.provider === 'deterministic' ? '事实规则摘要' : summary.provider}</div>
        </section>
      )}

      {/* 消息流单列 (45) */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {messages.length === 0 ? (
          <div className="py-20 text-center text-xs text-slate-400">
            暂无消息，发送一条消息开启讨论吧
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = String(msg.user_id) === String(currentUserId);
            return (
              <div
                key={msg.id}
                className={`flex gap-2.5 max-w-[85%] ${
                  isMe ? 'ml-auto flex-row-reverse' : ''
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center justify-center shrink-0">
                  {msg.sender_name?.slice(0, 1) || '友'}
                </div>

                <div className="flex flex-col gap-1">
                  {!isMe && (
                    <span className="text-[11px] text-slate-400 px-1">
                      {msg.sender_name}
                    </span>
                  )}

                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedMessage(msg)}
                    className={`p-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words cursor-pointer select-text ${
                      isMe
                        ? 'bg-[#0058BE] text-white rounded-tr-sm'
                        : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200/80 dark:border-slate-800 rounded-tl-sm'
                    }`}
                  >
                    {msg.body}

                    {/* 消息点赞计数 */}
                    {msg.likes > 0 && (
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-300">
                        <AppIcon name="thumbs-up" size={12} />
                        <span>{msg.likes}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* 底部可达输入栏 */}
      <form
        onSubmit={handleSend}
        className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0"
      >
        <div className="flex-1">
          <input
            type="text"
            placeholder="输入协同消息…"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="w-full min-h-[46px] px-3.5 text-sm bg-slate-100 dark:bg-slate-800 border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0058BE]"
          />
        </div>

        <button
          type="submit"
          disabled={sending || !inputText.trim()}
          className="min-h-[46px] px-4 rounded-xl bg-[#0058BE] text-white font-semibold text-xs flex items-center justify-center gap-1 active:opacity-90 disabled:opacity-40"
        >
          <AppIcon name="send" size={16} />
          <span>发送</span>
        </button>
      </form>

      {/* 消息操作菜单 Sheet (转任务 98、点赞、复制) */}
      <MobileSheet
        isOpen={Boolean(selectedMessage)}
        onClose={() => setSelectedMessage(null)}
        title="消息操作"
        snapPoints={['half']}
        defaultSnap="half"
      >
        {selectedMessage && (
          <div className="flex flex-col gap-2 pb-6">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300 line-clamp-3">
              “{selectedMessage.body}”
            </div>

            {/* 98 消息转任务 */}
            {onConvertToTaskDraft && (
              <MobileListItem
                leading={<AppIcon name="plus" size={18} className="text-[#0058BE]" />}
                title="将此消息转为任务待办草稿"
                subtitle="提取内容作为新任务标题并进入草稿确认"
                onClick={() => {
                  onConvertToTaskDraft({
                    title: selectedMessage.body.slice(0, 30),
                    description: `来源消息:\n${selectedMessage.body}`,
                    sourceChannel: `chat_${type}_${id}`,
                  });
                  setSelectedMessage(null);
                }}
              />
            )}

            {type === 'channel' && (
              <MobileListItem
                leading={<AppIcon name="thumbs-up" size={18} className="text-amber-500" />}
                title="为此消息点赞 (+1)"
                onClick={() => {
                  handleLike(selectedMessage);
                  setSelectedMessage(null);
                }}
              />
            )}

            <MobileListItem
              leading={<AppIcon name="copy" size={18} className="text-slate-500" />}
              title="复制消息文本"
              onClick={async () => {
                await navigator.clipboard.writeText(selectedMessage.body);
                setSelectedMessage(null);
              }}
            />
          </div>
        )}
      </MobileSheet>
    </div>
  );
};

// -------------------------------------------------------------
// 47 会话资料 (二级页面，含共享文件、钉选链接与成员)
// -------------------------------------------------------------
export const MobileConversationProfileScreen: React.FC<{
  type: 'channel' | 'direct';
  id: number;
  name: string;
  onBack: () => void;
  lang?: Language;
}> = ({ type, id, name, onBack, lang = 'zh' }) => {
  const [files, setFiles] = useState<CollabFile[]>([]);
  const [pinnedLinks, setPinnedLinks] = useState<{ id: number; title: string; url: string }[]>([]);
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [showAddLink, setShowAddLink] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchProfile = async () => {
      setLoading(true);
      try {
        if (type === 'channel') {
          const [fRes, lRes] = await Promise.all([
            listChannelFiles(id).catch(() => ({ items: [] })),
            listPinnedLinks(id).catch(() => ({ items: [] })),
          ]);
          if (active) {
            setFiles(fRes.items || []);
            setPinnedLinks(lRes.items || []);
          }
        }
      } catch {
        /* ignore */
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchProfile();
    return () => {
      active = false;
    };
  }, [type, id]);

  const handleAddLink = async () => {
    if (!newLinkTitle.trim() || !newLinkUrl.trim() || type !== 'channel') return;
    try {
      const created = await createPinnedLink(id, {
        title: newLinkTitle.trim(),
        url: newLinkUrl.trim(),
      });
      setPinnedLinks((prev) => [created, ...prev]);
      setNewLinkTitle('');
      setNewLinkUrl('');
      setShowAddLink(false);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <header className="h-14 px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[48px] min-w-[48px] flex items-center justify-center -ml-2 text-slate-500"
          aria-label="返回聊天"
        >
          <AppIcon name="back" size={20} />
        </button>
        <h1 className="text-base font-semibold">会话资料</h1>
        <div className="w-10" />
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 基本卡片 */}
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950 text-[#0058BE] font-bold text-lg flex items-center justify-center">
            {type === 'channel' ? '#' : name.slice(0, 1)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold truncate">{name}</h2>
            <p className="text-xs text-slate-400">
              {type === 'channel' ? '项目公共讨论频道' : '直接私信讨论'}
            </p>
          </div>
        </div>

        {/* 钉选固定链接 */}
        {type === 'channel' && (
          <MobileListGroup
            title={`钉选链接 (${pinnedLinks.length})`}
            footer="频道内重要文档、Figma 或代码仓库快捷入口。"
          >
            {pinnedLinks.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                暂无钉选链接
              </div>
            ) : (
              pinnedLinks.map((link) => (
                <MobileListItem
                  key={link.id}
                  leading={<AppIcon name="pin" size={18} className="text-amber-500" />}
                  title={link.title}
                  subtitle={link.url}
                  onClick={() => window.open(link.url, '_blank')}
                />
              ))
            )}
            <div className="p-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowAddLink(!showAddLink)}
                className="w-full min-h-[36px] text-xs font-semibold text-[#0058BE] flex items-center justify-center gap-1"
              >
                <AppIcon name="plus" size={14} />
                <span>添加新钉选链接</span>
              </button>
            </div>
          </MobileListGroup>
        )}

        {/* 共享文件与附件 */}
        <MobileListGroup title={`共享材料与文件 (${files.length})`}>
          {files.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400">
              会话中暂无共享文件
            </div>
          ) : (
            files.map((file) => (
              <MobileListItem
                key={file.id}
                leading={<AppIcon name="file" size={18} className="text-[#0058BE]" />}
                title={file.original_name}
                subtitle={`${(file.size_bytes / 1024).toFixed(1)} KB`}
                onClick={() => window.open(file.download_url, '_blank')}
              />
            ))
          )}
        </MobileListGroup>
      </div>

      {/* 添加钉选链接弹层 */}
      {showAddLink && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 max-w-xs w-full shadow-xl space-y-3">
            <h3 className="text-sm font-bold">添加钉选链接</h3>
            <MobileInput
              placeholder="链接标题"
              value={newLinkTitle}
              onChange={(e) => setNewLinkTitle(e.target.value)}
            />
            <MobileInput
              placeholder="https://..."
              value={newLinkUrl}
              onChange={(e) => setNewLinkUrl(e.target.value)}
            />
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddLink(false)}
                className="flex-1 min-h-[40px] rounded-xl border text-xs"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleAddLink}
                className="flex-1 min-h-[40px] rounded-xl bg-[#0058BE] text-white text-xs font-semibold"
              >
                确认钉选
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
