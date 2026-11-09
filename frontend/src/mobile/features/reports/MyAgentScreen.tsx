import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AutoGrowingTextarea } from '../../../components/AutoGrowingTextarea';
import { useKeyboardAvoidance } from '../../runtime/useKeyboardViewport';
import { Project, UserProfile, PeopleAxisNode } from '../../../types';
import { ReportProjectSelector } from './ReportProjectSelector';
import { AppIcon } from '../../ui/AppIcon';
import { MobileTopBar } from '../../ui/MobileTopBar';
import { MobileEmptyState, MobileLoadingState, MobileErrorState } from '../../ui/MobileState';
import { useMobileNavigation } from '../../navigation/MobileNavigationProvider';
import {
  listAgentReports,
  listReportAgentBindings,
  listReportInbox,
  markReportRead,
  latestReportByUser,
  AgentReport,
  ReportAgentBinding,
} from '../../../api/reports';
import { getProjectTree } from '../../../api/backend';
import { mapTreeToPeopleAxis } from '../../../api/mappers';
import { getMyPermissions, MyProjectPermissions } from '../../../api/shell';
import { agentChat } from '../../../api/agents';
import { loadLocalDraft, saveLocalDraft } from './reportCapabilities';
import { parseApiDateTime } from '../../../utils/datetime';

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

function formatReportTime(timeStr?: string | null): string {
  if (!timeStr) return '';
  const d = parseApiDateTime(timeStr);
  if (isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${min}`;
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
  const [allReports, setAllReports] = useState<AgentReport[]>([]);
  const [myReports, setMyReports] = useState<AgentReport[]>([]);
  const [inboxReports, setInboxReports] = useState<AgentReport[]>([]);
  const [axisNodes, setAxisNodes] = useState<PeopleAxisNode[]>([]);
  const [permissions, setPermissions] = useState<MyProjectPermissions | null>(null);

  // 聊天对话状态
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [micHint, setMicHint] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  // 初始化加载当前项目汇报、职责树与权限数据
  useEffect(() => {
    let cancelled = false;
    if (!numericProjectId) return;

    setLoading(true);
    setError(null);

    Promise.all([
      getProjectTree(numericProjectId).catch(() => ({ nodes: [] })),
      getMyPermissions(numericProjectId).catch(() => null),
      listReportAgentBindings(numericProjectId).catch(() => ({ items: [] as ReportAgentBinding[] })),
      listAgentReports(numericProjectId).catch(() => ({ items: [] as AgentReport[] })),
      listReportInbox().catch(() => ({ items: [] as AgentReport[] })),
    ])
      .then(([treeRes, permRes, bindingsRes, reportsRes, inboxRes]) => {
        if (cancelled) return;
        const mapped = mapTreeToPeopleAxis(treeRes.nodes || [], undefined, 'vertical');
        setAxisNodes(mapped);
        setPermissions(permRes);
        setBindings(bindingsRes.items || []);
        const allR = reportsRes.items || [];
        setAllReports(allR);
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

  // 计算“我”的节点与直属下属（复用“我的职责”同一数据源）
  const currentUserIdNum = Number(user.id);
  const selfNode = useMemo(() => {
    return (
      axisNodes.find(
        (n) =>
          n.ownerUserIds?.includes(currentUserIdNum) ||
          String(n.person?.id) === String(user.id),
      ) || null
    );
  }, [axisNodes, currentUserIdNum, user.id]);

  const subordinateNodes = useMemo(() => {
    if (!selfNode) return [];
    return axisNodes.filter((n) => n.parentId === selfNode.id);
  }, [axisNodes, selfNode]);

  // 项目负责人判断（项目汇总与发布按钮权限）
  const isProjectLead = Boolean(
    permissions?.is_pm ||
    permissions?.is_superadmin ||
    user.role === 'Admin' ||
    user.role === 'Owner' ||
    user.role === 'PM' ||
    bindings.some((b) => b.role === 'project' && String(b.user_id) === String(user.id))
  );

  const myDraft = numericProjectId ? loadLocalDraft(user.id || 'me', numericProjectId) : null;
  const hasDraft = Boolean(myDraft?.summary?.trim());
  const mySubmittedReports = myReports.filter((r) => r.status === 'submitted' || r.status === 'aggregated');
  const latestMyReport = latestReportByUser(mySubmittedReports, user.id);
  const myLatestRead = Boolean(latestMyReport?.read || latestMyReport?.read_at);

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

    push({ screen: 'ai-report-create', title: '写汇报' });
  };

  // 查看下属汇报详情并同步已读状态
  const handleOpenSubordinateReport = async (report: AgentReport) => {
    if (!report.read && !report.read_at) {
      try {
        await markReportRead(report.id);
        setInboxReports((prev) =>
          prev.map((r) =>
            r.id === report.id ? { ...r, read: true, read_at: new Date().toISOString() } : r,
          ),
        );
      } catch (err) {
        console.warn('markReportRead error', err);
      }
    }
    push({
      screen: 'ai-report-detail',
      title: '汇报详情与版本',
      params: { reportId: String(report.id), fromManager: '1' },
    });
  };

  // 项目隔离阻断界面
  if (isAllProjects || !numericProjectId) {
    return (
      <div className="flex flex-col h-full bg-surface dark:bg-surface-container-lowest">
        <MobileTopBar title="汇报" showBack={!!onBack} onBack={onBack} />
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
  // 视图 B：与我的 AI 对话
  // -------------------------------------------------------------
  if (viewMode === 'chat') {
    return (
      <div ref={keyboard.ref} style={{ paddingBottom: keyboard.overlap }} className="flex flex-col h-full min-h-0 bg-surface dark:bg-surface-container-lowest select-none">
        <MobileTopBar
          title="与我的 AI 对话"
          showBack
          onBack={initialViewMode === 'chat' && onBack ? onBack : () => setViewMode('hub')}
          backLabel="返回"
        />
        <ReportProjectSelector currentProject={currentProject} projects={projects} onSelectProject={onSelectProject} />

        {/* 顶部项目隔离提示 */}
        <div className="px-4 py-2 bg-surface-container dark:bg-surface-container border-b border-primary dark:border-primary flex items-center gap-2">
          <AppIcon name="info" size={18} className="text-inherit text-inherit shrink-0" />
          <span className="text-xs text-primary dark:text-primary truncate">
            {user.name}的项目 AI · 上下文仅限当前项目（{currentProject.name}）
          </span>
        </div>

        {/* 消息滚动流 */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="py-8 text-center text-xs text-outline dark:text-on-surface-variant">
              您可以告诉我今天完成了哪些事项、遇到什么阻碍，我会帮您归纳到汇报草稿中。
            </div>
          ) : (
            messages.map((m) => {
              const isUser = m.role === 'user';
              return (
                <div key={m.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-[var(--radius-ink-panel)] p-4 text-sm leading-relaxed ${
                      isUser
                        ? 'bg-[#edf4ff] text-on-surface dark:bg-surface-container dark:text-on-surface rounded-br-xs'
                        : 'bg-surface-container-lowest text-on-surface dark:bg-surface-container dark:text-on-surface border border-outline-variant/80 dark:border-outline-variant rounded-bl-xs shadow-sm dark:shadow-none'
                    }`}
                  >
                    {!isUser && (
                      <div className="flex items-center gap-2 text-xs font-medium text-primary dark:text-primary mb-2 tabular-nums">
                        <AppIcon name="ai" size={18} />
                        <span>已记下本次进展</span>
                      </div>
                    )}
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    {m.sourceText && (
                      <div className="mt-2 pt-2 border-t border-outline-variant dark:border-outline-variant text-xs text-outline">
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
                        className="mobile-touch-target px-3 py-2 rounded-lg bg-surface-container-lowest dark:bg-surface-container-lowest border border-outline-variant dark:border-outline-variant text-xs font-medium text-primary dark:text-primary shadow-2xs hover:bg-surface cursor-pointer flex items-center gap-1 tabular-nums"
                      >
                        <AppIcon name="edit" size={18} />
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
        <div className="shrink-0 p-3 bg-surface-container-lowest dark:bg-surface-container-lowest border-t border-outline-variant dark:border-outline-variant">
          {micHint && (
            <div className="mb-2 p-2 rounded-lg bg-surface-container dark:bg-surface-container border border-outline-variant text-xs text-[#a86412] dark:text-[#d9a35b] flex items-center justify-between">
              <span>语音输入依赖 ASR 引擎与系统授权。当前未配置，已切换为文字输入 (G10)。</span>
              <button
                type="button"
                onClick={() => setMicHint(false)}
                className="text-[#a86412] font-medium ml-2 cursor-pointer tabular-nums"
              >
                ×
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0 flex items-end gap-2 bg-surface-container-lowest dark:bg-surface-container px-3 py-2 rounded-xl">
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
                className="flex-1 min-w-0 bg-transparent text-sm leading-6 text-on-surface dark:text-on-surface outline-hidden placeholder:text-outline"
              />
              <button
                type="button"
                onClick={() => setMicHint(true)}
                title="语音输入"
                className="text-outline hover:text-on-surface-variant dark:hover:text-outline cursor-pointer"
              >
                <AppIcon name="phone" size={18} />
              </button>
            </div>
            <button
              type="button"
              aria-label="发送项目进展"
              disabled={!inputMessage.trim() || chatSending}
              onClick={() => void handleSendMessage()}
              className="w-10 h-10 rounded-lg bg-primary text-on-primary flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-opacity"
            >
              {chatSending ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <AppIcon name="send" size={18} />
              )}
            </button>
          </div>
          <p className="text-xs text-outline text-center mt-2">
            只有已提交的对话与项目材料才能进入最终汇报来源依据。
          </p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 视图 A：汇报主界面
  // -------------------------------------------------------------
  return (
    <div className="flex flex-col h-full bg-surface dark:bg-surface-container-lowest overflow-y-auto select-none">
      <MobileTopBar title="汇报" showBack={!!onBack} onBack={onBack} />
      <ReportProjectSelector currentProject={currentProject} projects={projects} onSelectProject={onSelectProject} />

      {loading && <MobileLoadingState message="加载汇报配置…" />}
      {error && <MobileErrorState message={error} />}

      <div className="p-4 space-y-4">
        {/* 项目隔离安全提示条 */}
        <div className="p-3 bg-surface-container-lowest dark:bg-surface-container border border-primary dark:border-primary rounded-xl flex items-start gap-2">
          <AppIcon name="info" size={18} className="text-inherit text-inherit shrink-0 mt-1" />
          <span className="text-xs text-primary dark:text-primary leading-relaxed">
            当前项目：<strong className="font-medium">{currentProject.name}</strong>。其他项目的对话、材料与草稿不会进入这里。
          </span>
        </div>

        {/* 知识空间快捷入口 */}
        <button
          type="button"
          onClick={() => push({ tab: 'knowledge', screen: 'knowledge-root', title: '知识' })}
          className="w-full p-4 text-left rounded-lg bg-surface-container-lowest dark:bg-surface-container-lowest border border-outline-variant dark:border-outline-variant"
        >
          <strong className="block text-on-surface dark:text-on-surface">我的知识空间</strong>
          <span className="text-xs text-on-surface-variant dark:text-outline">整理个人知识 与知识关系，供当前项目 AI 参考</span>
        </button>

        {/* 我的项目 AI 助手（保持“告诉 AI 最新进展”入口） */}
        <div className="p-5 bg-surface-container-lowest dark:bg-surface-container     border border-primary dark:border-primary rounded-xl shadow-sm dark:shadow-none">
          <div className="flex items-center gap-2 text-primary dark:text-primary mb-2">
            <AppIcon name="ai" size={18} />
            <h2 className="text-base font-medium tabular-nums">我的项目 AI</h2>
          </div>
          <p className="text-sm text-on-surface dark:text-outline font-normal mb-4 tabular-nums">
            {user.name}的汇报助手
          </p>
          <button
            type="button"
            onClick={() =>
              push({
                screen: 'record-progress',
                title: '记录进展',
                params: { projectId: numericProjectId ? String(numericProjectId) : undefined },
              })
            }
            className="w-full min-h-[48px] rounded-lg bg-primary text-on-primary text-sm font-medium flex items-center justify-center gap-2 active:bg-primary/90 transition-ink-colors cursor-pointer shadow-sm dark:shadow-none tabular-nums"
          >
            <AppIcon name="messages" size={18} />
            <span>记录进展</span>
          </button>
        </div>

        {/* 第一块：我的汇报 */}
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-on-surface-variant dark:text-outline   px-1 tabular-nums">
            我的汇报
          </h3>
          <div className="bg-surface-container-lowest dark:bg-surface-container rounded-xl border border-outline-variant/80 dark:border-outline-variant p-4 shadow-sm dark:shadow-none space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-on-surface dark:text-outline tabular-nums">
                  当前汇报状态
                </span>
                {hasDraft ? (
                  <span className="px-2 py-1 rounded text-xs font-medium bg-surface-container text-[#a86412] dark:bg-surface-container dark:text-[#d9a35b] border border-outline-variant tabular-nums">
                    草稿待提交
                  </span>
                ) : latestMyReport ? (
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      myLatestRead
                        ? 'bg-surface-container text-[#2f7d4f] dark:bg-surface-container dark:text-[#6bbf8a] border border-outline-variant'
                        : 'bg-surface-container text-primary dark:bg-surface-container dark:text-primary border border-primary'
                    }`}
                  >
                    {myLatestRead ? '已读' : '已提交未读'}
                  </span>
                ) : (
                  <span className="px-2 py-1 rounded text-xs font-medium bg-surface-container text-on-surface-variant dark:bg-surface-container-lowest dark:text-outline tabular-nums">
                    未提交
                  </span>
                )}
              </div>

              {hasDraft ? (
                <p className="text-xs text-on-surface-variant dark:text-outline line-clamp-2">
                  {myDraft?.summary || '已有保存的汇报草稿尚未正式提交'}
                </p>
              ) : latestMyReport ? (
                <p className="text-xs text-on-surface-variant dark:text-outline truncate">
                  最近提交：{formatReportTime(latestMyReport.submitted_at || latestMyReport.created_at)} · {latestMyReport.summary_text || '已提交工作汇报'}
                </p>
              ) : (
                <p className="text-xs text-outline dark:text-on-surface-variant">
                  本周期暂无已提交的汇报记录，点击下方写汇报生成。
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => push({ screen: 'ai-report-create', title: '写汇报' })}
                className="flex-1 min-h-[40px] rounded-lg bg-primary text-on-primary text-xs font-medium flex items-center justify-center gap-2 active:bg-primary/90 cursor-pointer shadow-sm dark:shadow-none transition-ink-colors tabular-nums"
              >
                <AppIcon name="edit" size={18} />
                <span>{hasDraft ? '继续编辑' : '写汇报'}</span>
              </button>
              <button
                type="button"
                onClick={() => push({ screen: 'ai-report-detail', title: '汇报历史与版本' })}
                className="min-h-[40px] px-4 rounded-lg bg-surface-container dark:bg-surface-container-lowest text-on-surface dark:text-outline text-xs font-medium flex items-center justify-center gap-2 hover:bg-surface-container cursor-pointer transition-ink-colors tabular-nums"
              >
                <AppIcon name="clock" size={18} />
                <span>历史</span>
              </button>
            </div>
          </div>
        </section>

        {/* 第二块：下属汇报（只有有下属的人可见） */}
        {subordinateNodes.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-medium text-on-surface-variant dark:text-outline   tabular-nums">
                下属汇报 ({subordinateNodes.length})
              </h3>
              {isProjectLead && (
                <button
                  type="button"
                  onClick={() => push({ screen: 'ai-project-aggregate', title: '项目汇总与发布' })}
                  className="text-xs font-medium text-primary dark:text-primary flex items-center gap-1 cursor-pointer tabular-nums"
                >
                  <AppIcon name="ai" size={18} />
                  <span>项目汇总与发布</span>
                </button>
              )}
            </div>

            <div className="bg-surface-container-lowest dark:bg-surface-container rounded-xl border border-outline-variant/80 dark:border-outline-variant overflow-hidden divide-y divide-outline-variant dark:divide-outline-variant">
              {subordinateNodes.map((sub) => {
                const subUserId = sub.ownerUserIds?.[0] ?? (Number(sub.person?.id) || null);
                const subSubmitted = allReports.filter(
                  (r) =>
                    String(r.author_user_id) === String(subUserId) &&
                    (r.status === 'submitted' || r.status === 'aggregated'),
                );
                const latestSubReport = latestReportByUser(subSubmitted, subUserId);
                const inboxItem = latestSubReport
                  ? inboxReports.find((r) => r.id === latestSubReport.id)
                  : null;
                const isRead = Boolean(
                  inboxItem ? inboxItem.read || inboxItem.read_at : latestSubReport?.read || latestSubReport?.read_at,
                );

                const hasReport = Boolean(latestSubReport);
                const subTimeStr = latestSubReport
                  ? formatReportTime(latestSubReport.submitted_at || latestSubReport.created_at)
                  : '';

                return (
                  <div
                    key={sub.id}
                    onClick={() => {
                      if (latestSubReport) {
                        void handleOpenSubordinateReport(latestSubReport);
                      }
                    }}
                    className={`p-4 flex items-center gap-3 transition-ink-colors ${
                      hasReport
                        ? 'hover:bg-surface dark:hover:bg-surface-container-lowest/50 cursor-pointer active:bg-surface-container'
                        : 'opacity-80'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-surface-container dark:bg-surface-container text-primary dark:text-primary font-medium flex items-center justify-center shrink-0 text-sm tabular-nums">
                      {sub.person.name.slice(0, 1)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <strong className="text-sm font-medium text-on-surface dark:text-outline truncate tabular-nums">
                          {sub.person.name}
                        </strong>
                        <span className="text-xs text-outline truncate">
                          {sub.roleTitle || '团队成员'}
                        </span>
                      </div>
                      <p className="text-xs text-on-surface-variant dark:text-outline truncate mt-1">
                        {hasReport
                          ? latestSubReport.summary_text.slice(0, 30) || '提交了工作汇报'
                          : '本周期未提交'}
                      </p>
                      {hasReport && subTimeStr && (
                        <span className="text-xs text-outline block mt-1">
                          {subTimeStr} 提交
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          !hasReport
                            ? 'bg-surface-container text-outline dark:bg-surface-container-lowest dark:text-on-surface-variant'
                            : isRead
                            ? 'bg-surface-container text-on-surface-variant dark:bg-surface-container-lowest dark:text-outline'
                            : 'bg-surface-container text-primary dark:bg-surface-container dark:text-primary'
                        }`}
                      >
                        {!hasReport ? '本周期未提交' : isRead ? '已读' : '已提交未读'}
                      </span>
                      {hasReport && (
                        <AppIcon name="chevron-right" size={18} className="text-inherit" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
