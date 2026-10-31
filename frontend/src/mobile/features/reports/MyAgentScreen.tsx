import React, { useState, useEffect, useRef } from 'react';
import { AutoGrowingTextarea } from '../../../components/AutoGrowingTextarea';
import { useKeyboardAvoidance } from '../../runtime/useKeyboardViewport';
import { Project, UserProfile } from '../../../types';
import { ReportProjectSelector } from './ReportProjectSelector';
import { AppIcon } from '../../ui/AppIcon';
import { MobileTopBar } from '../../ui/MobileTopBar';
import { MobileEmptyState, MobileLoadingState, MobileErrorState } from '../../ui/MobileState';
import { useMobileNavigation } from '../../navigation/MobileNavigationProvider';
import {
  listAgentReports,
  listReportAgentBindings,
  listReportInbox,
  AgentReport,
  ReportAgentBinding,
} from '../../../api/reports';
import { agentChat } from '../../../api/agents';
import { loadLocalDraft, saveLocalDraft } from './reportCapabilities';

export interface MyAgentScreenProps {
  user: UserProfile;
  currentProject: Project;
  projects?: Project[];
  onSelectProject?: (project: Project) => void;
  companyId: number | string | null;
  projectMembers: Array<{ id: string | number; name: string; avatar?: string; role?: string }>;
  initialViewMode?: 'hub' | 'chat';
  onBack?: () => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  time: string;
  sourceText?: string;
}

export const MyAgentScreen: React.FC<MyAgentScreenProps> = (props) => (
  <MyAgentContent key={`${props.companyId}:${props.user.id}:${props.currentProject.id}:${props.initialViewMode ?? 'hub'}`} {...props} />
);

const MyAgentContent: React.FC<MyAgentScreenProps> = ({
  user,
  currentProject,
  projects,
  onSelectProject,
  companyId,
  initialViewMode = 'hub',
  onBack,
}) => {
  const { push } = useMobileNavigation();
  const keyboard = useKeyboardAvoidance();
  const [viewMode, setViewMode] = useState<'hub' | 'chat'>(initialViewMode);

  // 项目隔离检查
  const isAllProjects = !currentProject.id || currentProject.id === 'all';
  const numericProjectId = !isAllProjects && Number(currentProject.id) > 0 ? Number(currentProject.id) : null;
  const numCompanyId = companyId != null ? Number(companyId) : 1;

  // 状态加载
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bindings, setBindings] = useState<ReportAgentBinding[]>([]);
  const [myReports, setMyReports] = useState<AgentReport[]>([]);
  const [inboxReports, setInboxReports] = useState<AgentReport[]>([]);

  // 聊天对话状态
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [micHint, setMicHint] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  // 初始化加载当前项目汇报与智能体数据
  useEffect(() => {
    let cancelled = false;
    if (!numericProjectId) return;

    setLoading(true);
    setError(null);

    Promise.all([
      listReportAgentBindings(numericProjectId).catch(() => ({ items: [] as ReportAgentBinding[] })),
      listAgentReports(numericProjectId).catch(() => ({ items: [] as AgentReport[] })),
      listReportInbox().catch(() => ({ items: [] as AgentReport[] })),
    ])
      .then(([bindingsRes, reportsRes, inboxRes]) => {
        if (cancelled) return;
        setBindings(bindingsRes.items || []);
        const allR = reportsRes.items || [];
        setMyReports(allR.filter((r) => String(r.author_user_id) === String(user.id)));
        const projectReportIds = new Set(allR.map((report) => report.id));
        setInboxReports((inboxRes.items || []).filter((report) => projectReportIds.has(report.id)));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载项目汇报状态失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [numericProjectId, user.id]);

  // 判定当前用户权限角色
  const isManager =
    bindings.some((b) => b.role === 'project' && String(b.user_id) === String(user.id)) ||
    user.role === 'Admin' ||
    user.role === 'Owner' ||
    user.role === 'PM';

  const myDraft = numericProjectId ? loadLocalDraft(user.id || 'me', numericProjectId) : null;
  const draftCount = myDraft?.summary ? 1 : 0;
  const historyCount = myReports.filter((r) => r.status === 'submitted' || r.status === 'aggregated').length;
  const unreadInboxCount = inboxReports.filter((r) => !r.read && !r.read_at).length;

  // 智能体聊天发送消息
  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || inputMessage).trim();
    if (!textToSend || chatSending || !numericProjectId) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setChatSending(true);

    try {
      const res = await agentChat({
        company_id: numCompanyId,
        project_id: numericProjectId,
        message: textToSend,
      });

      if (!active.current) return;
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: res.reply || '已记录您提供的事实与进展。',
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        sourceText: `来源：本次对话 · 今天 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      if (!active.current) return;
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `抱歉，发送失败：${err instanceof Error ? err.message : '网络或模型响应异常'}`,
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      if (active.current) setChatSending(false);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  // 将对话内容加入汇报草稿
  const handleAddToDraft = (content: string) => {
    if (!numericProjectId) return;
    const existing = loadLocalDraft(user.id || 'me', numericProjectId);
    const newSummary = existing?.summary
      ? `${existing.summary}\n\n【对话补充】${content}`
      : `【对话进展】${content}`;

    saveLocalDraft(user.id || 'me', numericProjectId, {
      summary: newSummary,
      draftReportId: existing?.draftReportId,
    });

    push({ screen: 'ai-report-create', title: '编辑我的 AI 汇报' });
  };

  // 项目隔离阻断界面
  if (isAllProjects || !numericProjectId) {
    return (
      <div className="flex flex-col h-full bg-[#f7f8fa] dark:bg-slate-950">
        <MobileTopBar title="AI 汇报与助手" showBack={!!onBack} onBack={onBack} />
        <ReportProjectSelector currentProject={currentProject} projects={projects} onSelectProject={onSelectProject} />
        <div className="flex-1 p-6 flex flex-col items-center justify-center">
          <MobileEmptyState
            iconName="folder"
            title="请选择具体项目"
            description="根据安全规范，智能体会话、汇报材料与上下文在项目间严格隔离。“全部项目”下无法确定汇报归属。"
          />
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 视图 B：与我的 AI 对话 (Design ID 36)
  // -------------------------------------------------------------
  if (viewMode === 'chat') {
    return (
      <div ref={keyboard.ref} style={{ paddingBottom: keyboard.overlap }} className="flex flex-col h-full min-h-0 bg-[#f7f8fa] dark:bg-slate-950 select-none">
        <MobileTopBar
          title="与我的 AI 对话"
          showBack
          onBack={initialViewMode === 'chat' && onBack ? onBack : () => setViewMode('hub')}
          backLabel="返回"
        />
        <ReportProjectSelector currentProject={currentProject} projects={projects} onSelectProject={onSelectProject} />

        {/* 顶部项目隔离提示 */}
        <div className="px-4 py-2.5 bg-blue-50/80 dark:bg-blue-950/40 border-b border-blue-100 dark:border-blue-900/60 flex items-center gap-2">
          <AppIcon name="info" size={16} className="text-[#0058BE] dark:text-blue-400 shrink-0" />
          <span className="text-xs text-blue-900 dark:text-blue-200 truncate">
            {user.name}的项目 AI · 上下文仅限当前项目（{currentProject.name}）
          </span>
        </div>

        {/* 消息滚动流 */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
              您可以告诉我今天完成了哪些事项、遇到什么阻碍，我会帮您归纳到汇报草稿中。
            </div>
          ) : (
            messages.map((m) => {
              const isUser = m.role === 'user';
              return (
                <div key={m.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl p-3.5 text-sm leading-relaxed ${
                      isUser
                        ? 'bg-[#edf4ff] text-slate-900 dark:bg-blue-900/40 dark:text-slate-100 rounded-br-xs'
                        : 'bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100 border border-slate-200/80 dark:border-slate-800 rounded-bl-xs shadow-xs'
                    }`}
                  >
                    {!isUser && (
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0058BE] dark:text-blue-400 mb-1.5">
                        <AppIcon name="ai" size={15} />
                        <span>已记下本次进展</span>
                      </div>
                    )}
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    {m.sourceText && (
                      <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
                        {m.sourceText}
                      </div>
                    )}
                  </div>

                  {/* AI 回复后的快捷动作按钮 */}
                  {!isUser && (
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => handleAddToDraft(m.content)}
                        className="mobile-touch-target px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium text-[#0058BE] dark:text-blue-400 shadow-2xs hover:bg-slate-50 cursor-pointer flex items-center gap-1"
                      >
                        <AppIcon name="edit" size={13} />
                        <span>加入汇报草稿</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 底部输入框与语音说明 */}
        <div className="shrink-0 p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
          {micHint && (
            <div className="mb-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between">
              <span>语音输入依赖 ASR 引擎与系统授权。当前未配置，已切换为文字输入 (G10)。</span>
              <button
                type="button"
                onClick={() => setMicHint(false)}
                className="text-amber-900 font-bold ml-2 cursor-pointer"
              >
                ×
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0 flex items-end gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-xl">
              <AutoGrowingTextarea
                aria-label="项目进展与工作事实"
                rows={1}
                maxRows={6}
                enterKeyHint="enter"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void handleSendMessage();
                  }
                }}
                placeholder="输入项目进展与工作事实…"
                className="flex-1 min-w-0 bg-transparent text-sm leading-6 text-slate-900 dark:text-slate-100 outline-hidden placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setMicHint(true)}
                title="语音输入"
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
              >
                <AppIcon name="phone" size={18} />
              </button>
            </div>
            <button
              type="button"
              aria-label="发送项目进展"
              disabled={!inputMessage.trim() || chatSending}
              onClick={() => void handleSendMessage()}
              className="w-10 h-10 rounded-xl bg-[#0058BE] text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-opacity"
            >
              {chatSending ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <AppIcon name="send" size={18} />
              )}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 text-center mt-2">
            只有已提交的对话与项目材料才能进入最终汇报来源依据。
          </p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 视图 A：项目内 AI 入口 (Design ID 35)
  // -------------------------------------------------------------
  return (
    <div className="flex flex-col h-full bg-[#f7f8fa] dark:bg-slate-950 overflow-y-auto select-none">
      <MobileTopBar title="AI 汇报与助手" showBack={!!onBack} onBack={onBack} />
        <ReportProjectSelector currentProject={currentProject} projects={projects} onSelectProject={onSelectProject} />

      {loading && <MobileLoadingState message="加载项目汇报配置…" />}
      {error && <MobileErrorState message={error} />}

      <div className="p-4 space-y-4">
        {/* 项目隔离安全提示条 */}
        <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-900/60 rounded-xl flex items-start gap-2.5">
          <AppIcon name="info" size={17} className="text-[#0058BE] dark:text-blue-400 shrink-0 mt-0.5" />
          <span className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
            当前项目：<strong>{currentProject.name}</strong>。其他项目的对话、材料与草稿不会进入这里。
          </span>
        </div>

        {/* 我的项目 AI 主卡片 */}
        <button
          type="button"
          onClick={() => push({ tab: 'knowledge', screen: 'knowledge-root', title: '知识' })}
          className="w-full p-4 text-left rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
        >
          <strong className="block text-slate-900 dark:text-white">我的知识空间</strong>
          <span className="text-xs text-slate-500 dark:text-slate-400">整理个人知识 与知识关系，供当前项目 AI 参考</span>
        </button>
        <div className="p-5 bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-slate-900 dark:to-blue-950/30 border border-blue-200/60 dark:border-blue-900/40 rounded-2xl shadow-xs">
          <div className="flex items-center gap-2 text-[#0058BE] dark:text-blue-400 mb-2">
            <AppIcon name="ai" size={20} />
            <h2 className="text-base font-semibold">我的项目 AI</h2>
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-300 font-medium mb-4">
            {user.name}的汇报助手
          </p>
          <button
            type="button"
            onClick={() => setViewMode('chat')}
            className="w-full min-h-[46px] rounded-xl bg-[#0058BE] text-white text-sm font-semibold flex items-center justify-center gap-2 active:bg-blue-800 transition-colors cursor-pointer shadow-xs"
          >
            <AppIcon name="messages" size={17} />
            <span>告诉 AI 最新进展</span>
          </button>
        </div>

        {/* 汇报工作卡片列表 */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
            汇报工作
          </h3>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
            {/* 整理本周汇报 */}
            <div
              onClick={() => push({ screen: 'ai-report-create', title: '编辑我的 AI 汇报' })}
              className="flex items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer active:bg-slate-100 transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-[#0058BE] flex items-center justify-center shrink-0">
                <AppIcon name="file" size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <strong className="text-sm font-semibold text-slate-800 dark:text-slate-200 block truncate">
                  整理本周汇报
                </strong>
                <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
                  {draftCount > 0 ? '已有 1 份草稿待提交' : '基于任务与进展生成'}
                </p>
              </div>
              <AppIcon name="chevron-right" size={18} className="text-slate-400 shrink-0" />
            </div>

            {/* 补充材料 */}
            <div
              onClick={() => push({ screen: 'work-root', title: '工作台' })}
              className="flex items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer active:bg-slate-100 transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center shrink-0">
                <AppIcon name="check-circle" size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <strong className="text-sm font-semibold text-slate-800 dark:text-slate-200 block truncate">
                  补充材料与任务
                </strong>
                <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
                  完善任务进度、成果材料与证据
                </p>
              </div>
              <AppIcon name="chevron-right" size={18} className="text-slate-400 shrink-0" />
            </div>

            {/* 汇报历史 */}
            <div
              onClick={() => push({ screen: 'ai-report-detail', title: '汇报历史与版本' })}
              className="flex items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer active:bg-slate-100 transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 flex items-center justify-center shrink-0">
                <AppIcon name="clock" size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <strong className="text-sm font-semibold text-slate-800 dark:text-slate-200 block truncate">
                  汇报历史与版本
                </strong>
                <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
                  已提交 {historyCount} 份不可变记录
                </p>
              </div>
              <AppIcon name="chevron-right" size={18} className="text-slate-400 shrink-0" />
            </div>
          </div>
        </section>

        {/* 管理者能力（仅授权管理者可见） */}
        {isManager && (
          <section className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                管理者能力
              </h3>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">已授权</span>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
              {/* 下属汇报收件箱 */}
              <div
                onClick={() => push({ screen: 'ai-inbox', title: '下属汇报收件箱' })}
                className="flex items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer active:bg-slate-100 transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center shrink-0">
                  <AppIcon name="bell" size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <strong className="text-sm font-semibold text-slate-800 dark:text-slate-200 block truncate">
                    下属汇报收件箱
                  </strong>
                  <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
                    {unreadInboxCount > 0 ? `${unreadInboxCount} 条未读汇报` : '查看下属提交的汇报'}
                  </p>
                </div>
                {unreadInboxCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-red-500 text-white shrink-0">
                    {unreadInboxCount}
                  </span>
                )}
                <AppIcon name="chevron-right" size={18} className="text-slate-400 shrink-0" />
              </div>

              {/* 项目资料对照 */}
              <div
                onClick={() => push({ screen: 'ai-project-contrast', title: '项目资料对照' })}
                className="flex items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer active:bg-slate-100 transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/50 text-sky-600 flex items-center justify-center shrink-0">
                  <AppIcon name="filter" size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <strong className="text-sm font-semibold text-slate-800 dark:text-slate-200 block truncate">
                    项目资料对照
                  </strong>
                  <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
                    对比任务快照与资料冲突
                  </p>
                </div>
                <AppIcon name="chevron-right" size={18} className="text-slate-400 shrink-0" />
              </div>

              {/* 项目汇总与发布 */}
              <div
                onClick={() => push({ screen: 'ai-project-aggregate', title: '项目汇总与发布' })}
                className="flex items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer active:bg-slate-100 transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 flex items-center justify-center shrink-0">
                  <AppIcon name="ai" size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <strong className="text-sm font-semibold text-slate-800 dark:text-slate-200 block truncate">
                    项目汇总与发布
                  </strong>
                  <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
                    生成项目级汇报封装
                  </p>
                </div>
                <AppIcon name="chevron-right" size={18} className="text-slate-400 shrink-0" />
              </div>

              {/* 智能体绑定管理 */}
              <div
                onClick={() => push({ screen: 'ai-agent-bindings', title: '项目智能体绑定管理' })}
                className="flex items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer active:bg-slate-100 transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                  <AppIcon name="team" size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <strong className="text-sm font-semibold text-slate-800 dark:text-slate-200 block truncate">
                    智能体绑定管理
                  </strong>
                  <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
                    同步并管理项目内汇报智能体
                  </p>
                </div>
                <AppIcon name="chevron-right" size={18} className="text-slate-400 shrink-0" />
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
