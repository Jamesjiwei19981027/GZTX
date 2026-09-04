import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageItem, Language, UserProfile, TeamMember, Task, MessageAttachment } from '../../types';
import {
  likeChannelMessage,
  listChannelMessages,
  listChannels,
  listPresence,
  postChannelMessage,
  postChannelMessageWithAttachments,
  listDirectConversations,
  createDirectConversation,
  listDirectMessages,
  postDirectMessage,
  uploadChannelFile,
  uploadConversationFile,
  downloadCollabFile,
  listChannelFiles,
  listConversationFiles,
  listPinnedLinks,
  createPinnedLink,
  listUserActivity,
  getCallConfig,
} from '../../api/shell';
import type { CallConfig, CollabFile, DirectConversation } from '../../api/shell';
import { getToken } from '../../api/client';

interface MessagesViewProps {
  user: UserProfile;
  lang: Language;
  companyId?: number | null;
  projectId?: string;
  members?: TeamMember[];
  tasks?: Task[];
  onSelectTask?: (task: Task) => void;
  onCreateCompany?: () => void;
}

/** created_at 是 UTC，按本地时区渲染成 MM-DD HH:mm */
function formatMessageTime(iso: string | undefined, lang: Language): string {
  if (!iso) return lang === 'zh' ? '刚刚' : 'Just now';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(5, 16).replace('T', ' ');
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type CallSignal = {
  type?: 'joined' | 'peer_joined' | 'peer_left' | 'offer' | 'answer' | 'ice' | 'error';
  conversation_id?: number;
  user_id?: number;
  participants?: number[];
  from_user_id?: number;
  to_user_id?: number;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  ice_servers?: RTCIceServer[];
  message?: string;
};

export const MessagesView: React.FC<MessagesViewProps> = ({
  user,
  lang,
  companyId,
  projectId,
  members = [],
  tasks = [],
  onSelectTask,
  onCreateCompany,
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
  const [files, setFiles] = useState<CollabFile[]>([]);
  const [pinnedLinks, setPinnedLinks] = useState<{ id: number; title: string; url: string }[]>([]);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [activityItems, setActivityItems] = useState<{ id: number; type: string; title: string; created_at?: string }[]>([]);
  const [callMode, setCallMode] = useState<'idle' | 'voice' | 'video'>('idle');
  const [callConfig, setCallConfig] = useState<CallConfig | null>(null);
  const [callParticipants, setCallParticipants] = useState<number[]>([]);
  const [remoteConnected, setRemoteConnected] = useState(false);
  const callSocketRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<number, RTCPeerConnection>>(new Map());
  const pendingCandidatesRef = useRef<Map<number, RTCIceCandidateInit[]>>(new Map());
  const localMediaRef = useRef<HTMLVideoElement | null>(null);
  const remoteMediaRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** 单调递增的 load 序号，用来丢弃过期请求的结果 */
  const loadSeqRef = useRef(0);

  const channels = [
    { id: 'general' as const, labelZh: '# 全员交流大厅', labelEn: '# general', icon: 'tag' },
    { id: 'project' as const, labelZh: '# 项目冲刺组', labelEn: '# project', icon: 'tag' },
    { id: 'direct' as const, labelZh: '@ 私信与提及', labelEn: '@ direct', icon: 'alternate_email' },
  ];

  const mapAttachments = (items?: unknown[]): MessageAttachment[] =>
    (items || []).map((raw) => {
      const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      return {
      fileId: typeof item.file_id === 'number' ? item.file_id : undefined,
      originalName: String(item.original_name || item.name || 'shared file'),
      name: String(item.name || item.original_name || 'shared file'),
      mimeType: typeof item.mime_type === 'string' ? item.mime_type : undefined,
      sizeBytes: typeof item.size_bytes === 'number' ? item.size_bytes : typeof item.size === 'number' ? item.size : undefined,
      downloadUrl: typeof item.download_url === 'string' ? item.download_url : undefined,
      url: typeof item.url === 'string' ? item.url : undefined,
      };
    });

  const load = useCallback(async () => {
    if (!companyId) {
      setMessages([]);
      setChannelMap({});
      setError(lang === 'zh' ? '请先创建或加入公司后使用团队消息' : 'Create or join a company to use team messages');
      return;
    }
    // 请求竞态：切频道/切会话会连发多次 load，慢的那次回来会把新频道的消息覆盖成旧数据。
    // 只有最后一次发起的请求允许落 state。
    const requestId = loadSeqRef.current + 1;
    loadSeqRef.current = requestId;
    const isStale = () => loadSeqRef.current !== requestId;

    setLoading(true);
    setError(null);
    try {
      const pid = projectId && projectId !== 'all' ? Number(projectId) : undefined;
      const chRes = await listChannels(companyId, Number.isFinite(pid) ? pid : undefined);
      if (isStale()) return;
      const map: Record<string, number> = {};
      for (const c of chRes.items || []) map[c.key] = c.id;
      setChannelMap(map);
      if (activeChannel === 'direct') {
        const conversationRes = await listDirectConversations(companyId);
        if (isStale()) return;
        setConversations(conversationRes.items || []);
        const conversationId = activeConversationId || conversationRes.items?.[0]?.id || null;
        setActiveConversationId(conversationId);
        if (!conversationId) { setMessages([]); return; }
        const msgRes = await listDirectMessages(conversationId);
        if (isStale()) return;
        setMessages((msgRes.items || []).map((m) => ({
          id: String(m.id),
          senderName: m.sender_name,
          senderAvatar: m.sender_avatar || user.avatar,
          content: m.body,
          timestamp: formatMessageTime(m.created_at, lang),
          channel: 'direct',
          likes: 0,
          repliesCount: 0,
          attachments: mapAttachments(m.attachments),
        })));
        return;
      }
      const chId = map[activeChannel];
      if (!chId) {
        setMessages([]);
        return;
      }
      const msgRes = await listChannelMessages(chId);
      if (isStale()) return;
      setMessages(
        (msgRes.items || []).map((m) => ({
          id: String(m.id),
          senderName: m.sender_name,
          senderAvatar: m.sender_avatar || user.avatar,
          content: m.body,
          timestamp: formatMessageTime(m.created_at, lang),
          channel: activeChannel,
          likes: m.likes || 0,
           repliesCount: 0,
           attachments: mapAttachments(m.attachments),
        })),
      );
    } catch (e) {
      if (isStale()) return;
      setError(e instanceof Error ? e.message : '加载消息失败');
      setMessages([]);
    } finally {
      if (!isStale()) setLoading(false);
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
    let cancelled = false;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      void listPresence(companyId)
        .then((res) => {
          if (cancelled) return;
          setPresence(Object.fromEntries((res.items || []).map((item) => [String(item.user_id), item.status])));
        })
        .catch(() => {
          if (!cancelled) setPresence({});
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [companyId]);

  useEffect(() => {
    const channelId = channelMap[activeChannel];
    if (activeChannel === 'direct') {
      if (!activeConversationId) {
        setFiles([]);
        return;
      }
      void listConversationFiles(activeConversationId).then((res) => setFiles(res.items || [])).catch(() => setFiles([]));
      setPinnedLinks([]);
      return;
    }
    if (!channelId) return;
    void Promise.all([listChannelFiles(channelId), listPinnedLinks(channelId)]).then(([fileRes, linkRes]) => {
      setFiles(fileRes.items || []);
      setPinnedLinks(linkRes.items || []);
    }).catch(() => undefined);
  }, [channelMap, activeChannel, activeConversationId]);

  useEffect(() => {
    if (rightTab !== 'about' || !companyId) return;
    void listUserActivity(30)
      .then((res) => setActivityItems(res.items || []))
      .catch(() => setActivityItems([]));
  }, [rightTab, companyId]);

  useEffect(() => {
    if (!companyId) {
      setCallConfig(null);
      return;
    }
    void getCallConfig(companyId).then((config) => setCallConfig(config)).catch(() => setCallConfig({ configured: false, message: 'STUN/TURN not configured' }));
  }, [companyId]);

  const filteredMessages = messages.filter((msg) => {
    if (!companyId && msg.channel !== activeChannel) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return msg.content.toLowerCase().includes(q) || msg.senderName.toLowerCase().includes(q);
  });

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && selectedFiles.length === 0 && !attachmentUrl.trim()) return;
    const text = inputText.trim();
    setInputText('');

    if (!companyId || (activeChannel !== 'direct' && !channelMap[activeChannel])) {
      setError(lang === 'zh' ? '当前没有可用的公司频道' : 'No company channel is available');
      return;
    }

    setUploadingFiles(true);
    try {
      const attachments = attachmentUrl.trim() ? [{ url: attachmentUrl.trim(), name: attachmentUrl.trim().split('/').pop() || 'link' }] : [];
      if (activeChannel === 'direct') {
        let conversationId = activeConversationId;
        if (!conversationId) {
          const other = members.find((member) => member.id !== user.id)?.id;
          if (!other) throw new Error(lang === 'zh' ? '暂无可用私信对象' : 'No direct-message recipient');
          const conversation = await createDirectConversation(companyId, { member_user_ids: [Number(other)] });
          conversationId = conversation.id;
          setActiveConversationId(conversation.id);
          const fileIds = await Promise.all(selectedFiles.map((file) => uploadConversationFile(conversation.id, file).then((item) => item.id)));
          await postDirectMessage(conversation.id, text, attachments, fileIds);
        } else {
          const fileIds = await Promise.all(selectedFiles.map((file) => uploadConversationFile(conversationId as number, file).then((item) => item.id)));
          await postDirectMessage(conversationId as number, text, attachments, fileIds);
        }
      } else {
        const channelId = channelMap[activeChannel];
        const fileIds = await Promise.all(selectedFiles.map((file) => uploadChannelFile(channelId, file).then((item) => item.id)));
        if (attachments.length || fileIds.length) await postChannelMessageWithAttachments(channelId, text, attachments, fileIds);
        else await postChannelMessage(channelId, text);
      }
      setAttachmentUrl('');
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setShowEmojiPicker(false);
      await load();
      setUploadingFiles(false);
    } catch (err) {
      setUploadingFiles(false);
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

  const sendCallSignal = (payload: Record<string, unknown>) => {
    const socket = callSocketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  };

  const closePeerConnection = (remoteUserId: number) => {
    const peer = peerConnectionsRef.current.get(remoteUserId);
    peer?.close();
    peerConnectionsRef.current.delete(remoteUserId);
    pendingCandidatesRef.current.delete(remoteUserId);
    setRemoteConnected(peerConnectionsRef.current.size > 0);
  };

  const flushPendingCandidates = async (remoteUserId: number, peer: RTCPeerConnection) => {
    const pending = pendingCandidatesRef.current.get(remoteUserId) || [];
    if (!peer.remoteDescription || pending.length === 0) return;
    pendingCandidatesRef.current.delete(remoteUserId);
    for (const candidate of pending) await peer.addIceCandidate(candidate);
  };

  const ensurePeerConnection = (remoteUserId: number, initiator: boolean, iceServers?: RTCIceServer[]) => {
    const existing = peerConnectionsRef.current.get(remoteUserId);
    if (existing) return existing;
    const peer = new RTCPeerConnection({ iceServers: iceServers || callConfig?.ice_servers || [] });
    const localStream = mediaStreamRef.current;
    localStream?.getTracks().forEach((track) => peer.addTrack(track, localStream));
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        sendCallSignal({ type: 'ice', candidate: event.candidate.toJSON(), to_user_id: remoteUserId });
      }
    };
    peer.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;
      if (remoteMediaRef.current) remoteMediaRef.current.srcObject = stream;
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
        void remoteAudioRef.current.play().catch(() => undefined);
      }
      setRemoteConnected(true);
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed' || peer.connectionState === 'closed') closePeerConnection(remoteUserId);
    };
    peerConnectionsRef.current.set(remoteUserId, peer);
    if (initiator) {
      void (async () => {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        if (peer.localDescription) {
          sendCallSignal({ type: 'offer', sdp: peer.localDescription, to_user_id: remoteUserId });
        }
      })().catch(() => setError(lang === 'zh' ? '鍒涘缓閫氳瘽 offer 澶辫触' : 'Unable to create a call offer'));
    }
    return peer;
  };

  const handleCallSignal = async (payload: CallSignal) => {
    if (payload.type === 'joined') {
      setCallParticipants(payload.participants || []);
      if (payload.ice_servers) {
        setCallConfig((previous) => ({
          configured: previous?.configured ?? payload.ice_servers!.length > 0,
          ice_servers: payload.ice_servers!,
          message: previous?.message || (payload.ice_servers!.length ? 'ICE servers ready' : 'STUN/TURN is not configured'),
        }));
      }
      const localUserId = Number(payload.user_id ?? user.id);
      for (const participantId of payload.participants || []) {
        if (participantId !== localUserId) ensurePeerConnection(participantId, true, payload.ice_servers);
      }
      return;
    }
    if (payload.type === 'peer_joined' && payload.from_user_id) {
      setCallParticipants((previous) => Array.from(new Set([...previous, payload.from_user_id!])));
      return;
    }
    if (payload.type === 'peer_left' && payload.from_user_id) {
      closePeerConnection(payload.from_user_id);
      setCallParticipants((previous) => previous.filter((id) => id !== payload.from_user_id));
      return;
    }
    if (payload.type === 'error') {
      setError(payload.message || (lang === 'zh' ? '閫氳瘽淇″彿閿欒' : 'Call signaling error'));
      return;
    }
    const remoteUserId = Number(payload.from_user_id);
    if (!Number.isFinite(remoteUserId)) return;
    if (payload.type === 'offer' && payload.sdp) {
      const peer = ensurePeerConnection(remoteUserId, false, payload.ice_servers);
      await peer.setRemoteDescription(payload.sdp);
      await flushPendingCandidates(remoteUserId, peer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      if (peer.localDescription) sendCallSignal({ type: 'answer', sdp: peer.localDescription, to_user_id: remoteUserId });
      return;
    }
    if (payload.type === 'answer' && payload.sdp) {
      const peer = ensurePeerConnection(remoteUserId, false, payload.ice_servers);
      await peer.setRemoteDescription(payload.sdp);
      await flushPendingCandidates(remoteUserId, peer);
      return;
    }
    if (payload.type === 'ice' && payload.candidate) {
      const peer = ensurePeerConnection(remoteUserId, false, payload.ice_servers);
      if (peer.remoteDescription) await peer.addIceCandidate(payload.candidate);
      else pendingCandidatesRef.current.set(remoteUserId, [...(pendingCandidatesRef.current.get(remoteUserId) || []), payload.candidate]);
    }
  };

  const endCall = () => {
    const socket = callSocketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'leave' }));
    socket?.close();
    callSocketRef.current = null;
    peerConnectionsRef.current.forEach((peer) => peer.close());
    peerConnectionsRef.current.clear();
    pendingCandidatesRef.current.clear();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    if (localMediaRef.current) localMediaRef.current.srcObject = null;
    if (remoteMediaRef.current) remoteMediaRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    setRemoteConnected(false);
    setCallParticipants([]);
    setCallMode('idle');
  };

  const startCall = async (mode: 'voice' | 'video') => {
    if (!activeConversationId) {
      setError(lang === 'zh' ? '请先打开一个私信会话再发起通话' : 'Open a direct conversation before calling');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(lang === 'zh' ? '当前浏览器不支持媒体权限' : 'Media permissions are unavailable in this browser');
      return;
    }
    if (typeof RTCPeerConnection === 'undefined') {
      setError(lang === 'zh' ? '当前浏览器不支持 WebRTC' : 'WebRTC is unavailable in this browser');
      return;
    }
    try {
      endCall();
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === 'video' });
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = getToken();
      const socket = new WebSocket(`${protocol}//${window.location.host}/api/v1/calls/ws/${activeConversationId}`);
      callSocketRef.current = socket;
      // 令牌走首帧而非 query：URL 会进反代日志与 Referer
      socket.onopen = () => socket.send(JSON.stringify({ type: 'auth', token: token || '' }));
      socket.onmessage = (event) => {
        try {
          void handleCallSignal(JSON.parse(event.data) as CallSignal).catch(() => setError(lang === 'zh' ? '处理通话信令失败' : 'Unable to process call signaling'));
        } catch {
          setError(lang === 'zh' ? '通话信令格式无效' : 'Invalid call signaling payload');
        }
      };
      socket.onclose = () => {
        if (callSocketRef.current !== socket) return;
        callSocketRef.current = null;
        peerConnectionsRef.current.forEach((peer) => peer.close());
        peerConnectionsRef.current.clear();
        pendingCandidatesRef.current.clear();
        setRemoteConnected(false);
        setCallParticipants([]);
        setCallMode('idle');
      };
      socket.onerror = () => setError(lang === 'zh' ? '通话信令连接失败' : 'Call signaling connection failed');
      setCallMode(mode);
      if (localMediaRef.current) localMediaRef.current.srcObject = mediaStreamRef.current;
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'zh' ? '未获得麦克风/摄像头权限' : 'Microphone/camera permission was denied'));
      endCall();
    }
  };

  const handleDownload = async (attachment: MessageAttachment | CollabFile) => {
    try {
      let fileId: number | undefined;
      let filename = 'shared-file';
      let externalUrl: string | undefined;
      if ('originalName' in attachment) {
        fileId = attachment.fileId;
        filename = attachment.originalName || attachment.name || filename;
        externalUrl = attachment.url;
      } else {
        const collabFile = attachment as CollabFile;
        fileId = collabFile.id;
        filename = collabFile.original_name;
      }
      if (!fileId) {
        if (externalUrl) window.open(externalUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      const blob = await downloadCollabFile(fileId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'file download failed');
    }
  };

  const appendEmoji = (emoji: string) => {
    setInputText((value) => `${value}${emoji}`);
    setShowEmojiPicker(false);
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
                ? '未绑定公司，请先创建或加入公司后使用团队消息'
                : 'Join or create a company to use team messages'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onCreateCompany && !companyId && (
            <button
              type="button"
              onClick={onCreateCompany}
              className="px-4 py-2.5 rounded-2xl bg-primary text-on-primary text-sm font-semibold cursor-pointer"
            >
              {lang === 'zh' ? '创建公司' : 'Create company'}
            </button>
          )}
          <button type="button" onClick={() => void startCall('voice')} className="px-2.5 py-2 rounded-xl border border-outline-variant text-xs font-bold text-on-surface-variant hover:text-primary" title="Voice call"><span className="material-symbols-outlined text-base">call</span></button>
          <button type="button" onClick={() => void startCall('video')} className="px-2.5 py-2 rounded-xl border border-outline-variant text-xs font-bold text-on-surface-variant hover:text-primary" title="Video call"><span className="material-symbols-outlined text-base">videocam</span></button>
        </div>
      </div>

      {callMode !== 'idle' && <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border border-primary/30 bg-primary/5 text-xs">
        <div className="flex items-center gap-2 w-full">
          <span className="font-bold text-primary">{callMode === 'video' ? 'Video call' : 'Voice call'} · {callParticipants.length} participant(s)</span>
          {remoteConnected && <span className="text-emerald-700">Connected</span>}
          {!remoteConnected && <span className="text-on-surface-variant">Waiting for peer…</span>}
          {!callConfig?.configured && <span className="text-amber-700">STUN/TURN not configured; local browser defaults may be limited.</span>}
          {callConfig?.configured && <span className="text-on-surface-variant">ICE servers ready</span>}
          <button type="button" onClick={endCall} className="ml-auto px-3 py-1.5 rounded-lg bg-error text-on-error font-bold">End</button>
        </div>
        <div className="flex gap-2 w-full">
          <video ref={localMediaRef} autoPlay muted playsInline className={callMode === 'video' ? 'w-32 h-20 rounded-lg bg-black object-cover' : 'hidden'} aria-label="Local video preview" />
          <video ref={remoteMediaRef} autoPlay playsInline className={callMode === 'video' ? 'flex-1 min-w-48 h-32 rounded-lg bg-black object-cover' : 'hidden'} aria-label="Remote video" />
          <audio ref={remoteAudioRef} autoPlay className={callMode === 'voice' ? 'w-full' : 'hidden'} aria-label="Remote audio" />
        </div>
      </div>}

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
                   {msg.attachments?.length ? (
                     <div className="mt-2 space-y-1.5">
                       {msg.attachments.map((attachment, index) => (
                         <button key={`${attachment.fileId || attachment.url || attachment.name}-${index}`} type="button" onClick={() => void handleDownload(attachment)} className="flex items-center gap-2 max-w-full px-2.5 py-2 rounded-lg bg-surface-container text-left hover:bg-primary/10">
                           <span className="material-symbols-outlined text-primary text-base">description</span>
                           <span className="text-xs font-semibold truncate">{attachment.originalName || attachment.name || 'shared file'}</span>
                           {attachment.sizeBytes ? <span className="text-[10px] text-on-surface-variant">{Math.ceil(attachment.sizeBytes / 1024)} KB</span> : null}
                         </button>
                       ))}
                     </div>
                   ) : null}
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
             <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))} />
             <div className="relative">
               <button type="button" onClick={() => setShowEmojiPicker((value) => !value)} className="px-2.5 py-2 rounded-xl border border-outline-variant text-on-surface-variant" title={lang === 'zh' ? '表情' : 'Emoji'}>😊</button>
               {showEmojiPicker && <div className="absolute bottom-12 right-0 z-20 p-2 rounded-xl bg-surface border border-outline-variant shadow-lg flex gap-1">{['😀', '👍', '🎉', '✅', '🙏', '🔥'].map((emoji) => <button key={emoji} type="button" onClick={() => appendEmoji(emoji)} className="p-1.5 hover:bg-surface-container rounded">{emoji}</button>)}</div>}
             </div>
             <button type="button" onClick={() => fileInputRef.current?.click()} className="px-2.5 py-2 rounded-xl border border-outline-variant text-on-surface-variant" title={lang === 'zh' ? '上传文件' : 'Upload file'}><span className="material-symbols-outlined text-base">attach_file</span></button>
            <input value={attachmentUrl} onChange={(e) => setAttachmentUrl(e.target.value)} placeholder={lang === 'zh' ? '附件链接（可选）' : 'Attachment URL'} className="hidden xl:block w-36 px-2 py-2 rounded-xl bg-surface-container border border-outline-variant/40 text-[11px]" />
            <button type="button" onClick={() => setAttachmentUrl(window.prompt(lang === 'zh' ? '输入附件 URL' : 'Attachment URL') || '')} className="px-2.5 py-2 rounded-xl border border-outline-variant text-on-surface-variant" title={lang === 'zh' ? '添加附件' : 'Attach'}><span className="material-symbols-outlined text-base">attach_file</span></button>
             {selectedFiles.length > 0 && <span className="absolute -mt-10 ml-2 max-w-[220px] truncate text-[10px] text-on-surface-variant">{selectedFiles.map((file) => file.name).join(', ')}</span>}
             <button
               type="submit"
               disabled={uploadingFiles || (!inputText.trim() && selectedFiles.length === 0 && !attachmentUrl.trim())}
               className="px-5 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold cursor-pointer disabled:opacity-50"
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
            {rightTab === 'files' && <div className="space-y-2">{files.length ? files.map((file, index) => <button key={`${file.message_id || file.id}-${index}`} type="button" onClick={() => void handleDownload(file)} className="w-full text-left block p-2 rounded-lg bg-surface-container text-xs text-primary truncate">{file.original_name || 'shared file'}</button>) : <p className="text-xs text-on-surface-variant">{lang === 'zh' ? '暂无最近分享文件' : 'No shared files yet'}</p>}{pinnedLinks.map((link) => <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="block p-2 rounded-lg bg-primary/5 text-xs text-primary truncate">📌 {link.title}</a>)}{channelMap[activeChannel] && <button type="button" onClick={() => { const title = window.prompt(lang === 'zh' ? '链接标题' : 'Link title'); const url = window.prompt(lang === 'zh' ? '链接 URL' : 'Link URL'); if (title && url) void createPinnedLink(channelMap[activeChannel], { title, url }).then((link) => setPinnedLinks((prev) => [link, ...prev])); }} className="text-[11px] font-bold text-primary">+ {lang === 'zh' ? '固定链接' : 'Pin link'}</button>}</div>}
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
            {rightTab === 'about' && <div className="space-y-2">{activityItems.length ? activityItems.slice(0, 8).map((item) => <div key={item.id} className="relative pl-4 py-2 rounded-lg bg-surface-container text-xs"><span className="absolute left-1.5 top-3 w-1.5 h-1.5 rounded-full bg-primary" /><p className="font-semibold text-on-surface">{item.title || item.type}</p><p className="text-[10px] text-on-surface-variant mt-1">{item.created_at ? item.created_at.slice(5, 16).replace('T', ' ') : ''}</p></div>) : <p className="text-xs text-on-surface-variant">{lang === 'zh' ? '暂无活动记录' : 'No activity yet'}</p>}</div>}
          </div>
        </aside>
      </div>
    </div>
  );
};
