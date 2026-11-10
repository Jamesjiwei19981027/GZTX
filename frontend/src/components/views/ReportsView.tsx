import React, { useEffect, useRef, useState } from 'react';
import { ProjectAgentChat } from '../ProjectAgentChat';
import { AutoGrowingTextarea } from '../AutoGrowingTextarea';
import { Task, Language, Project } from '../../types';
import { ReportProjectSelector } from '../../mobile/features/reports/ReportProjectSelector';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { getTaskStats, getTaskTrend } from '../../api/shell';
import { getLatestProjectAgentReport } from '../../api/reports';
import { ProjectSummaryPanel } from '../ProjectSummaryPanel';
import { ReportReviewPanel } from '../ReportReviewPanel';
import { ProjectSettingsModal } from '../ProjectSettingsModal';
import { getMyPermissions } from '../../api/shell';
import { listMyCompanies, listProjectMembers } from '../../api/backend';
import { mapMember } from '../../api/mappers';
import { downloadCsv } from '../../api/manage';
import { buildReportCsvRows } from '../../utils/reportExport';
import { aggregateAgentReports, aggregateLeadershipReport, ensureReportAgentBindings, generateMyReportDraft, getLatestLeadershipReport, listAgentReports, listMyReports, listProjectReportPolicies, listReportAgentBindings, listReportInbox, markReportRead, runProjectReport, submitAgentReport, submitReportEdit, type AgentReport, type LeadershipReport, type ProjectReportRun, type ReportAgentBinding, type ReportPolicy } from '../../api/reports';

interface ReportsViewProps {
  initialFocus?: 'progress' | 'reports';
  tasks: Task[];
  lang: Language;
  /** Current project selected in the shell. `all` intentionally has no project report scope. */
  projectId?: string;
  projectName?: string;
  projects?: Project[];
  onSelectProject?: (project: Project) => void;
  userId?: string;
  companyId?: number | null;
  onNavigateToPeopleAxis?: () => void;
  onNavigateToInbox?: () => void;
}

export const ReportsView: React.FC<ReportsViewProps> = (props) => (
  <ProjectReportsContent key={`${props.companyId}:${props.userId}:${props.projectId}`} {...props} />
);

const ProjectReportsContent: React.FC<ReportsViewProps> = ({ tasks, lang, projectId, projectName, projects, onSelectProject, userId, companyId, onNavigateToPeopleAxis, onNavigateToInbox, initialFocus }) => {
  const chatEntry = useRef<HTMLDivElement>(null);
  useEffect(() => { if (initialFocus === 'progress') chatEntry.current?.scrollIntoView({ block: 'start' }); }, [initialFocus]);
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'quarter'>('month');
  const [trendData, setTrendData] = useState<{ name: string; created: number; completed: number }[]>([]);
  const [serverStats, setServerStats] = useState<{ total: number; completed: number; pending: number; in_progress: number; overdue: number } | null>(null);
  const [statsState, setStatsState] = useState<{ key: string; error?: boolean }>();
  const [statsAttempt, setStatsAttempt] = useState(0);
  const statsKey = `${projectId}:${timeRange}:${statsAttempt}`;
  const [reportPolicies, setReportPolicies] = useState<ReportPolicy[]>([]);
  const [latestReport, setLatestReport] = useState<ProjectReportRun | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [agentBindings, setAgentBindings] = useState<ReportAgentBinding[]>([]);
  const [agentReports, setAgentReports] = useState<AgentReport[]>([]);
  const [agentSummary, setAgentSummary] = useState<string | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentDraft, setAgentDraft] = useState('');
  const [draftReportId, setDraftReportId] = useState<number | null>(null);
  const [draftGenerating, setDraftGenerating] = useState(false);
  const [leadershipReport, setLeadershipReport] = useState<LeadershipReport | null>(null);
  const [leadershipBusy, setLeadershipBusy] = useState(false);
  const [leadershipError, setLeadershipError] = useState<string | null>(null);

  const [policyDialog, setPolicyDialog] = useState<{ canManage: boolean; members: import('../../types').TeamMember[] } | null>(null);
  const openPolicyDialog = async () => {
    if (!numericProjectId) return;
    try {
      const [perm, mem] = await Promise.all([getMyPermissions(numericProjectId), listProjectMembers(numericProjectId)]);
      setPolicyDialog({
        canManage: Boolean(perm.is_pm || perm.is_superadmin || perm.can_edit_all),
        members: (mem.items || []).map(mapMember),
      });
    } catch (error) {
      setReportError(error instanceof Error ? error.message : '汇报策略加载失败');
    }
  };

  const numericProjectId = projectId && projectId !== 'all' && Number(projectId) > 0 ? Number(projectId) : null;

  useEffect(() => {
    let cancelled = false;
    setReportPolicies([]);
    setLatestReport(null);
    setAgentBindings([]);
    setAgentReports([]);
    setAgentSummary(null);
    setDraftReportId(null);
    setAgentDraft('');
    setLeadershipReport(null);
    setLeadershipError(null);
    setReportError(null);
    if (!numericProjectId) return () => { cancelled = true; };
    const permissionsPromise = getMyPermissions(numericProjectId);
    void permissionsPromise
      .then((permissions) => permissions.is_pm || permissions.is_superadmin
        ? getLatestProjectAgentReport(numericProjectId) : null)
      .then((report) => { if (!cancelled) setAgentSummary(report?.summary_text || null); })
      .catch(() => { /* 非项目管理者无权读取项目汇总。 */ });
    const inbox = permissionsPromise
      .then((permissions) => permissions.is_pm || permissions.is_superadmin
        ? listReportInbox()
        : { items: [] as AgentReport[] })
      .catch(() => ({ items: [] as AgentReport[] }));
    void Promise.all([listProjectReportPolicies(numericProjectId), listReportAgentBindings(numericProjectId), listAgentReports(numericProjectId), inbox, listMyReports(numericProjectId).catch(() => ({ items: [] as AgentReport[] }))])
      .then(([policies, bindings, reports, inbox, mine]) => {
        if (cancelled) return;
        const serverDraft = (mine.items || []).find((item) => item.status === 'draft' && (item.summary_text || '').trim());
        if (serverDraft) { setDraftReportId(serverDraft.id); setAgentDraft(serverDraft.summary_text || ''); }
        setReportPolicies(policies.items || []);
        setAgentBindings(bindings.items || []);
        const readById = new Map((inbox.items || []).map((item) => [item.id, item]));
        setAgentReports((reports.items || []).map((item) => {
          const inboxItem = readById.get(item.id);
          return inboxItem ? { ...item, read: inboxItem.read, read_at: inboxItem.read_at, sources: inboxItem.sources || item.sources } : item;
        }));
      })
      .catch((error) => { if (!cancelled) setReportError(error instanceof Error ? error.message : '加载项目汇报策略失败'); });
    return () => { cancelled = true; };
  }, [numericProjectId]);

  useEffect(() => {
    let cancelled = false;
    if (!companyId) return () => { cancelled = true; };
    void listMyCompanies()
      .then((companies) => {
        const membership = companies.items.find(company => company.id === companyId)?.my_membership;
        return membership?.is_org_leader || membership?.is_super_admin ? getLatestLeadershipReport(companyId) : null;
      })
      .then((report) => { if (!cancelled) setLeadershipReport(report); })
      .catch(() => { /* Non-leaders receive 403; the project report remains usable. */ });
    return () => { cancelled = true; };
  }, [companyId]);

  const handleRunProjectReport = async () => {
    if (!numericProjectId || reportLoading) return;
    setReportLoading(true);
    setReportError(null);
    try {
      const policy = reportPolicies.find((item) => item.enabled) || reportPolicies[0];
      setLatestReport(await runProjectReport(numericProjectId, policy ? { policy_id: policy.id } : {}));
    } catch (error) {
      setReportError(error instanceof Error ? error.message : (lang === 'zh' ? '生成项目 AI 汇报失败' : 'Unable to generate project report'));
    } finally {
      setReportLoading(false);
    }
  };

  const myBinding = agentBindings.find((binding) => binding.role === 'member' && String(binding.user_id) === String(userId));
  const handleEnsureBindings = async () => {
    if (!numericProjectId || agentBusy) return;
    setAgentBusy(true);
    try {
      const result = await ensureReportAgentBindings(numericProjectId);
      setAgentBindings(result.items || []);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : (lang === 'zh' ? '初始化项目智能体失败（需要项目管理者权限）' : 'Unable to initialize project agents (PM permission required)'));
    } finally { setAgentBusy(false); }
  };

  const handleSubmitAgentReport = async () => {
    if (!numericProjectId || !myBinding || !agentDraft.trim() || agentBusy) return;
    setAgentBusy(true);
    try {
      if (draftReportId) {
        await submitReportEdit(draftReportId, { summary: agentDraft.trim() });
      } else {
        await submitAgentReport(numericProjectId, { binding_id: myBinding.id, summary: agentDraft.trim() });
      }
      setAgentDraft('');
      setDraftReportId(null);
      setAgentReports((await listAgentReports(numericProjectId)).items || []);
      setReportError(null);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : (lang === 'zh' ? '提交个人 AI 汇报失败' : 'Unable to submit personal report'));
    } finally { setAgentBusy(false); }
  };

  const handleGenerateMemberDraft = async () => {
    if (!numericProjectId || !myBinding || draftGenerating || agentBusy) return;
    setDraftGenerating(true);
    try {
      const draft = await generateMyReportDraft(numericProjectId);
      setDraftReportId(draft.id);
      setAgentDraft(draft.summary_text || '');
      setReportError(null);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : (lang === 'zh' ? '生成个人 AI 汇报草稿失败' : 'Unable to generate a personal report draft'));
    } finally { setDraftGenerating(false); }
  };

  const handleReadAgentReport = async (report: AgentReport) => {
    if (report.read || report.parent_user_id == null || String(report.parent_user_id) !== String(userId)) return;
    try {
      await markReportRead(report.id);
      setAgentReports((prev) => prev.map((item) => item.id === report.id ? { ...item, read: true, read_at: new Date().toISOString() } : item));
    } catch (error) {
      setReportError(error instanceof Error ? error.message : (lang === 'zh' ? '标记汇报已读失败' : 'Unable to mark report read'));
    }
  };

  const handleAggregateAgentReports = async () => {
    if (!numericProjectId || agentBusy) return;
    setAgentBusy(true);
    try {
      const result = await aggregateAgentReports(numericProjectId);
      setAgentSummary(result.summary_text || null);
      setReportError(null);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : (lang === 'zh' ? '汇总下属 AI 汇报失败（需要项目管理者权限）' : 'Unable to aggregate reports (PM permission required)'));
    } finally { setAgentBusy(false); }
  };

  const handleAggregateLeadershipReport = async () => {
    if (!companyId || leadershipBusy) return;
    setLeadershipBusy(true);
    setLeadershipError(null);
    try {
      setLeadershipReport(await aggregateLeadershipReport(companyId));
    } catch (error) {
      setLeadershipError(error instanceof Error ? error.message : (lang === 'zh' ? '生成总领导汇报失败（需要总领导权限）' : 'Unable to generate leadership report (leader permission required)'));
    } finally { setLeadershipBusy(false); }
  };

  const reportIsStale = (report: AgentReport) => {
    if (!report.submitted_at || report.status !== 'submitted') return false;
    const submitted = Date.parse(report.submitted_at);
    return Number.isFinite(submitted) && Date.now() - submitted > 7 * 24 * 60 * 60 * 1000;
  };

  const reportHasConflict = (report: AgentReport) => {
    const payload = report.payload_json || {};
    const conflicts = payload.conflicts ?? payload.conflict;
    return Array.isArray(conflicts) ? conflicts.length > 0 : Boolean(conflicts);
  };

  const reportNodeStatus = (report: AgentReport) => {
    const payload = report.payload_json || {};
    return String(payload.node_status || payload.progress_status || payload.status_label || '').trim();
  };

  useEffect(() => {
    let cancelled = false;
    setServerStats(null); setTrendData([]);
    void (async () => {
      try {
        const [res, stats] = await Promise.all([getTaskTrend(timeRange, projectId), getTaskStats(timeRange, projectId)]);
        if (cancelled) return;
        setServerStats(stats);
        setStatsState({ key: statsKey });
        setTrendData(
          (res.series || []).map((s) => ({
            name: s.date.slice(5),
            created: s.created,
            completed: s.completed,
          })),
        );
      } catch {
        if (!cancelled) setStatsState({ key: statsKey, error: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [timeRange, tasks, projectId, statsKey]);

  // KPI calculations
  const totalTasks = serverStats?.total ?? tasks.length;
  const completedTasks = serverStats?.completed ?? tasks.filter((t) => t.status === 'Done').length;
  const inProgressTasks = serverStats?.in_progress ?? tasks.filter((t) => t.status === 'In Progress').length;
  const todoTasks = serverStats?.pending ?? tasks.filter((t) => t.status === 'To Do').length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // 逾期任务：优先用服务端统计，回退本地按截止日期计算
  const localToday = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const overdueTasks =
    serverStats?.overdue ??
    tasks.filter((t) => t.status !== 'Done' && !!t.dueDate && t.dueDate < localToday).length;

  // Workload distribution by assignee
  const workloadMap: Record<string, { total: number; done: number }> = {};
  tasks.forEach((t) => {
    const name = t.assignee ? t.assignee.name.split(' ')[0] : lang === 'zh' ? '未指派' : 'Unassigned';
    if (!workloadMap[name]) {
      workloadMap[name] = { total: 0, done: 0 };
    }
    workloadMap[name].total += 1;
    if (t.status === 'Done') {
      workloadMap[name].done += 1;
    }
  });

  const workloadData = Object.keys(workloadMap).map((name) => ({
    name,
    待办执行: workloadMap[name].total - workloadMap[name].done,
    已完成: workloadMap[name].done,
  }));

  const handleExport = () => {
    const rangeLabel = timeRange === 'week' ? '本周' : timeRange === 'month' ? '本月度' : '本季度';
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const rows = buildReportCsvRows({
      projectName: projectName || (projectId === 'all' ? '全部项目' : `项目${projectId}`),
      rangeLabel,
      exportedAt: stamp,
      kpis: { total: totalTasks, completed: completedTasks, inProgress: inProgressTasks, todo: todoTasks, overdue: overdueTasks, completionRate },
      trend: trendData,
      workload: workloadData.map((w) => ({ name: w.name, todo: w.待办执行, done: w.已完成 })),
      tasks,
    });
    downloadCsv(`报表_${projectName || '全部项目'}_${rangeLabel}_${stamp.slice(0, 10)}.csv`, rows);
  };

  return (
    <div className="space-y-8 animate-in pb-12">
      <ReportProjectSelector currentProject={{ id: projectId || 'all', name: projectName || '', active: true } as Project} projects={projects} onSelectProject={onSelectProject} />
      {/* Header & Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-container-lowest dark:bg-surface-container p-6 rounded-xl border border-outline-variant/30 shadow-sm dark:shadow-none">
        <div>
          <h1 className="text-2xl font-medium  text-on-surface flex items-center gap-2 tabular-nums">
            <span aria-hidden="true" className="material-symbols-outlined text-inherit text-[18px]">analytics</span>
            {lang === 'zh' ? 'AI 汇报与助手' : 'AI reports & assistant'}
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {lang === 'zh'
              ? '实时监控团队任务流转周期、工时负载与项目健康度指标'
              : 'Real-time monitoring of cycle times, workload distribution, and project health metrics.'}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
        <button
          type="button"
          data-testid="report-export"
          onClick={handleExport}
          className="px-4 py-2 rounded-lg border border-outline-variant/50 text-xs font-medium cursor-pointer hover:border-primary/50 tabular-nums"
        >
          {lang === 'zh' ? '导出报表' : 'Export'}
        </button>
        <div className="flex items-center  p-1  border-t border-outline-variant/40">
          {(['week', 'month', 'quarter'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-ink-colors ${
                timeRange === range
                  ? 'bg-primary text-on-primary shadow-sm dark:shadow-none'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {range === 'week'
                ? lang === 'zh'
                  ? '本周'
                  : 'This Week'
                : range === 'month'
                ? lang === 'zh'
                  ? '本月度'
                  : 'This Month'
                : lang === 'zh'
                ? '本季度'
                : 'Quarter'}
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* Human responsibility axis remains authoritative. This panel only summarizes project evidence and progress. */}
      <div ref={chatEntry}><ProjectAgentChat companyId={companyId} projectId={projectId} userId={userId} /></div>
      <section className="rounded-xl border border-primary/20 bg-primary/5 p-6 space-y-4" data-testid="project-ai-report-center">
        <div className="flex flex-col md:flex-row md:items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-inherit text-[18px]">description</span>
              <h2 className="text-lg font-medium text-on-surface tabular-nums">{lang === 'zh' ? '项目 AI 汇报中心' : 'Project AI report center'}</h2>
            </div>
            <p className="text-sm text-on-surface-variant mt-1">
              {numericProjectId
                ? `${projectName || '当前项目'}：${lang === 'zh' ? '基于人轴责任、任务、进度和已提交资料生成项目汇报。运行后，直属领导可在收件箱看到提醒。' : 'Summarize the project responsibility axis, tasks, progress and submitted evidence. The direct leader is notified in Inbox after a run.'}`
                : (lang === 'zh' ? '请选择一个具体项目后生成项目级 AI 汇报；跨项目总览不会混用项目上下文。' : 'Select a concrete project to run a project report. The cross-project overview never mixes project context.')}
            </p>
          </div>
          <button type="button" data-testid="report-policy-open" disabled={!numericProjectId} onClick={() => void openPolicyDialog()} className="px-4 py-2 rounded-lg border border-outline-variant/50 text-sm font-medium disabled:opacity-50 cursor-pointer tabular-nums">{lang === 'zh' ? '汇报周期与提醒' : 'Report schedule'}</button>
          <button type="button" disabled={!numericProjectId || reportLoading} onClick={() => void handleRunProjectReport()} className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium disabled:opacity-50 tabular-nums">
            {reportLoading ? (lang === 'zh' ? '生成中…' : 'Generating…') : (lang === 'zh' ? '生成项目汇报' : 'Generate report')}
          </button>
        </div>

        {reportError && <div className=" border-t border-error/30 bg-error/5 px-3 py-2 text-sm text-error">{reportError}</div>}

        {numericProjectId && <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="  p-3 border-t border-outline-variant/30"><span className="material-symbols-outlined text-inherit align-middle mr-1 text-[18px]">account_tree</span>{lang === 'zh' ? '人轴责任链' : 'Responsibility axis'}<p className="text-on-surface-variant mt-1">{lang === 'zh' ? '直属领导关系由人轴决定，AI 不能修改。' : 'Reporting relationships come from the axis and cannot be changed by AI.'}</p>{onNavigateToPeopleAxis && <button type="button" onClick={onNavigateToPeopleAxis} className="mt-2 text-primary font-medium tabular-nums">{lang === 'zh' ? '查看人轴' : 'Open axis'} →</button>}</div>
          <div className="  p-3 border-t border-outline-variant/30"><span className="material-symbols-outlined text-inherit align-middle mr-1 text-[18px]">source</span>{lang === 'zh' ? '汇报来源' : 'Report sources'}<p className="text-on-surface-variant mt-1">{lang === 'zh' ? '任务、正式进度记录和项目节点资料由服务端按权限筛选。' : 'Tasks, formal progress and project node evidence are filtered by server ACL.'}</p></div>
          <div className="  p-3 border-t border-outline-variant/30"><span className="material-symbols-outlined text-inherit align-middle mr-1 text-[18px]">notifications</span>{lang === 'zh' ? '链路提示' : 'Chain notification'}<p className="text-on-surface-variant mt-1">{lang === 'zh' ? '直属领导及其 AI 可通过站内通知跟进汇报。' : 'The direct leader and their AI can follow up through collaboration notifications.'}</p>{onNavigateToInbox && <button type="button" onClick={onNavigateToInbox} className="mt-2 text-primary font-medium tabular-nums">{lang === 'zh' ? '查看通知' : 'Open Inbox'} →</button>}</div>
        </div>}

        {latestReport && <div className="border-t border-outline-variant py-4">
          <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-medium   text-on-surface-variant tabular-nums">{lang === 'zh' ? '最新项目汇报' : 'Latest project report'}</span><span className={`px-2 py-1 rounded-md text-xs font-medium ${latestReport.status === 'completed' ? 'bg-[#2f7d4f]/10 text-[#2f7d4f]' : 'bg-[#a86412]/10 text-[#a86412]'}`}>{latestReport.status}</span><span className="text-xs text-on-surface-variant">run #{latestReport.run_id}</span></div>
          <pre className="mt-3 whitespace-pre-wrap text-sm text-on-surface font-sans leading-6">{latestReport.summary_text || (lang === 'zh' ? '汇报已提交，等待服务端生成内容。' : 'Report submitted; waiting for the server summary.')}</pre>
          <p className="mt-3 text-xs text-on-surface-variant">{lang === 'zh' ? '汇报内容只反映当前项目授权范围；如资料不足，AI 应明确标记缺口。' : 'The report reflects only the authorized project scope; missing evidence should be marked explicitly.'}</p>
        </div>}

        {numericProjectId && !latestReport && <p className="text-xs text-on-surface-variant">{lang === 'zh' ? `可用策略：${reportPolicies.length ? reportPolicies.filter((p) => p.enabled).map((p) => p.name).join('、') : '正在加载…'}` : `Available policies: ${reportPolicies.length ? reportPolicies.filter((p) => p.enabled).map((p) => p.name).join(', ') : 'loading…'}`}</p>}

        {numericProjectId && <div className="border-t border-outline-variant py-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2"><span className="material-symbols-outlined text-inherit">account_tree</span><h3 className="font-medium text-on-surface tabular-nums">{lang === 'zh' ? '人轴智能体汇报链' : 'People-axis agent reporting chain'}</h3><span className="text-xs text-on-surface-variant">{agentBindings.length ? `${agentBindings.length} ${lang === 'zh' ? '个智能体' : 'agents'}` : (lang === 'zh' ? '尚未初始化' : 'Not initialized')}</span><button type="button" onClick={() => void handleEnsureBindings()} disabled={agentBusy} className="ml-auto px-3 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium disabled:opacity-50 tabular-nums">{lang === 'zh' ? '同步人轴智能体' : 'Sync axis agents'}</button></div>
          <p className="text-xs text-on-surface-variant">{lang === 'zh' ? '每个人的智能体沿现有人轴向直属领导提交；项目之间的上下文由 project_id 隔离。提交后直属领导及其 AI 会收到站内提示。' : 'Each member agent submits to the direct leader on the existing axis; project_id isolates context. Submissions notify the direct leader and their AI.'}</p>
          {myBinding && <div className="border-t border-outline-variant py-3 space-y-2"><div className="flex items-center gap-2"><label className="text-xs font-medium text-on-surface tabular-nums">{lang === 'zh' ? '我的 AI 汇报' : 'My AI report'}</label>{draftReportId && <span className="text-xs rounded-md bg-[#a86412]/10 text-[#a86412] px-2 py-1">{lang === 'zh' ? '草稿可编辑' : 'Draft editable'}</span>}<button type="button" onClick={() => void handleGenerateMemberDraft()} disabled={draftGenerating || agentBusy} className="ml-auto px-2 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium disabled:opacity-50 tabular-nums">{draftGenerating ? (lang === 'zh' ? '生成中…' : 'Generating…') : (lang === 'zh' ? '生成 AI 草稿' : 'Generate AI draft')}</button></div><AutoGrowingTextarea aria-label="我的 AI 汇报正文" value={agentDraft} onChange={(event) => setAgentDraft(event.target.value)} rows={4} placeholder={lang === 'zh' ? '补充或修改进展、风险、阻塞、需要上级决策的事项…' : 'Add or edit progress, risks, blockers or decisions needed…'} className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm" /><div className="flex items-center gap-2"><span className="text-xs text-on-surface-variant">{lang === 'zh' ? '提交后将沿人轴发送给直属领导，并写入其 AI 上下文。' : 'Submission follows the people axis to the direct leader and their AI context.'}</span><button type="button" onClick={() => void handleSubmitAgentReport()} disabled={agentBusy || !agentDraft.trim()} className="ml-auto px-3 py-2 rounded-lg bg-primary text-on-primary text-xs font-medium disabled:opacity-50 tabular-nums">{lang === 'zh' ? '提交给直属领导' : 'Submit to direct leader'}</button></div></div>}
          {agentReports.length > 0 && <div className="space-y-2"><div className="flex items-center gap-2"><span className="text-xs font-medium text-on-surface-variant   tabular-nums">{lang === 'zh' ? `项目内成员汇报（${agentReports.length}）` : `Member reports in this project (${agentReports.length})`}</span><button type="button" onClick={() => void handleAggregateAgentReports()} disabled={agentBusy} className="ml-auto text-xs font-medium text-primary disabled:opacity-50 tabular-nums">{lang === 'zh' ? '汇总项目汇报' : 'Aggregate project report'}</button></div>{agentReports.map((report) => { const stale = reportIsStale(report); const conflict = reportHasConflict(report); const nodeStatus = reportNodeStatus(report); return <div key={report.id} onClick={() => void handleReadAgentReport(report)} className={`border-t border-outline-variant py-3 ${!report.read && report.parent_user_id != null && String(report.parent_user_id) === String(userId) ? 'ring-1 ring-primary/40 cursor-pointer' : ''}`}><div className="flex flex-wrap items-center gap-2 text-xs text-on-surface-variant"><span className="font-medium tabular-nums">#{report.id}</span><span className={`rounded-md px-2 py-1 ${report.status === 'submitted' ? 'bg-[#2f7d4f]/10 text-[#2f7d4f]' : 'bg-surface-container-high'}`}>{report.status}</span>{!report.read && report.parent_user_id != null && String(report.parent_user_id) === String(userId) && <span className="rounded-md px-2 py-1 bg-primary/10 text-primary font-medium tabular-nums">{lang === 'zh' ? '未读' : 'Unread'}</span>}{stale && <span className="rounded-md px-2 py-1 bg-[#a86412]/10 text-[#a86412] font-medium tabular-nums">{lang === 'zh' ? '过期' : 'Stale'}</span>}{conflict && <span className="rounded-md px-2 py-1 bg-error/10 text-error font-medium tabular-nums">{lang === 'zh' ? '有冲突' : 'Conflict'}</span>}{nodeStatus && <span className="rounded-md px-2 py-1 bg-surface-container-high text-on-surface-variant">{nodeStatus}</span>}<span className="ml-auto">{report.submitted_at ? report.submitted_at.slice(0, 16).replace('T', ' ') : '—'}</span></div><p className="mt-1 text-sm whitespace-pre-wrap text-on-surface">{report.summary_text || (lang === 'zh' ? '暂无汇报正文' : 'No report text')}</p><div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant"><span className="material-symbols-outlined text-[18px]">source</span><span>{lang === 'zh' ? `${report.source_count || report.sources?.length || 0} 条资料来源` : `${report.source_count || report.sources?.length || 0} sources`}</span>{report.sources?.map((source) => <span key={`${report.id}-${source.id || source.source_id || source.source_type}`} className="rounded bg-surface px-2 py-1">{source.source_type}{source.excerpt ? `：${source.excerpt.slice(0, 36)}` : ''}</span>)}</div><ReportReviewPanel key={report.id} report={report} onSaved={saved => setAgentReports(items => items.map(item => item.id === saved.id ? saved : item))} /></div> })}</div>}
          {agentSummary && <div className=" border-t border-primary/20 bg-primary/5 p-3"><div className="flex items-center gap-2"><span className="material-symbols-outlined text-inherit text-[18px]">summarize</span><div className="text-xs font-medium text-primary tabular-nums">{lang === 'zh' ? '项目智能体汇总 · 总领导项目摘要入口' : 'Project agent aggregate · leader summary'}</div></div><p className="mt-1 text-xs text-on-surface-variant">{lang === 'zh' ? '该摘要只包含当前项目封装结果，供总领导智能体按项目隔离读取。' : 'This envelope contains only the current project and can be read by the top leader agent with project isolation.'}</p><pre className="mt-2 text-sm whitespace-pre-wrap font-sans leading-6">{agentSummary}</pre></div>}
          {numericProjectId && <ProjectSummaryPanel projectId={numericProjectId} refreshKey={agentSummary} />}
        </div>}
      </section>

      <section className="rounded-xl border border-secondary/20 bg-secondary/5 p-6 space-y-3" data-testid="leadership-report-center">
        <div className="flex flex-col md:flex-row md:items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2"><span className="material-symbols-outlined text-inherit text-[18px]">summarize</span><h2 className="text-lg font-medium text-on-surface tabular-nums">{lang === 'zh' ? '总领导项目摘要' : 'Leadership project digest'}</h2></div>
            <p className="text-sm text-on-surface-variant mt-1">{lang === 'zh' ? '总领导智能体只接收各项目已经封装的汇报摘要，项目之间保持上下文隔离。权限由服务端校验。' : 'The leadership agent receives project report envelopes only; project contexts remain isolated. Permissions are enforced by the server.'}</p>
          </div>
          <button type="button" disabled={!companyId || leadershipBusy} onClick={() => void handleAggregateLeadershipReport()} className="px-4 py-2 rounded-lg bg-secondary text-on-secondary text-sm font-medium disabled:opacity-50 tabular-nums">{leadershipBusy ? (lang === 'zh' ? '汇总中…' : 'Aggregating…') : (lang === 'zh' ? '汇总全部项目' : 'Aggregate all projects')}</button>
        </div>
        {leadershipError && <div className=" border-t border-error/30 bg-error/5 px-3 py-2 text-sm text-error">{leadershipError}</div>}
        {leadershipReport ? <div className="border-t border-outline-variant py-4"><div className="flex items-center gap-2 text-xs text-on-surface-variant"><span className="font-medium text-secondary tabular-nums">{lang === 'zh' ? '最新总领导摘要' : 'Latest leadership digest'}</span><span>{leadershipReport.status}</span><span className="ml-auto">{leadershipReport.created_at ? leadershipReport.created_at.slice(0, 16).replace('T', ' ') : '—'}</span></div><pre className="mt-3 whitespace-pre-wrap text-sm text-on-surface font-sans leading-6">{leadershipReport.summary_text}</pre></div> : <p className="text-xs text-on-surface-variant">{lang === 'zh' ? '尚无总领导摘要，点击后由服务端按权限汇总项目封装。' : 'No leadership digest yet. The server will aggregate project envelopes after you click.'}</p>}
      </section>

      {/* KPI Cards Grid */}
      {statsState?.key !== statsKey ? <p role="status">正在加载统计…</p> : statsState.error ? <p role="alert">统计加载失败，未显示旧数据。<button type="button" onClick={() => setStatsAttempt(n => n+1)} className="min-h-[44px] px-3 underline">重试</button></p> : <>
      <p className="text-xs text-on-surface-variant">{projectId === 'all' ? '全部可见任务' : '当前项目及个人待办'}：指标按本周期新建任务统计，趋势按实际新增／完成日期统计。</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface-container-lowest dark:bg-surface-container p-6 rounded-xl border border-outline-variant/30 shadow-sm dark:shadow-none relative overflow-hidden group hover:border-primary/50 transition-ink-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium   text-on-surface-variant tabular-nums">
              {lang === 'zh' ? '总任务体量' : 'Total Tasks'}
            </span>
            <div className="w-10 h-10 rounded-xl bg-surface-container-lowest dark:bg-surface-container text-on-surface-variant flex items-center justify-center">
              <span className="material-symbols-outlined">dataset</span>
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-medium text-on-surface tabular-nums">{totalTasks}</span>
            <span className="text-xs text-on-surface-variant">
              {lang === 'zh' ? '统计周期内' : 'in period'}
            </span>
          </div>
          <div className="mt-3 w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden">
            <div className="bg-primary h-full rounded-md" style={{ width: '100%' }} />
          </div>
        </div>

        <div className="bg-surface-container-lowest dark:bg-surface-container p-6 rounded-xl border border-outline-variant/30 shadow-sm dark:shadow-none relative overflow-hidden group hover:border-primary/50 transition-ink-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium   text-on-surface-variant tabular-nums">
              {lang === 'zh' ? '全局交付率' : 'Completion Rate'}
            </span>
            <div className="w-10 h-10 rounded-xl bg-surface-container-lowest dark:bg-surface-container text-on-surface-variant flex items-center justify-center">
              <span className="material-symbols-outlined">task_alt</span>
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-medium text-on-surface tabular-nums">{completionRate}%</span>
            <span className="text-xs text-on-surface-variant">
              ({completedTasks} / {totalTasks} {lang === 'zh' ? '项完成' : 'done'})
            </span>
          </div>
          <div className="mt-3 w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-tertiary h-full rounded-md transition-ink-colors duration-500"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>

        <div className="bg-surface-container-lowest dark:bg-surface-container p-6 rounded-xl border border-outline-variant/30 shadow-sm dark:shadow-none relative overflow-hidden group hover:border-primary/50 transition-ink-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium   text-on-surface-variant tabular-nums">
              {lang === 'zh' ? '执行中待办' : 'In Progress'}
            </span>
            <div className="w-10 h-10 rounded-xl bg-[#a86412]/10 text-[#a86412] dark:text-[#d9a35b] flex items-center justify-center">
              <span className="material-symbols-outlined">pending_actions</span>
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-medium text-on-surface tabular-nums">{inProgressTasks}</span>
            <span className="text-xs text-on-surface-variant">
              + {todoTasks} {lang === 'zh' ? '项待启动' : 'to do'}
            </span>
          </div>
          <div className="mt-3 w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-[#a86412] h-full rounded-md transition-ink-colors duration-500"
              style={{ width: `${(inProgressTasks / (totalTasks || 1)) * 100}%` }}
            />
          </div>
        </div>

        <div className="bg-surface-container-lowest dark:bg-surface-container p-6 rounded-xl border border-outline-variant/30 shadow-sm dark:shadow-none relative overflow-hidden group hover:border-primary/50 transition-ink-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium   text-on-surface-variant tabular-nums">
              {lang === 'zh' ? '逾期任务' : 'Overdue Tasks'}
            </span>
            <div className="w-10 h-10 rounded-xl bg-error/10 text-error flex items-center justify-center">
              <span className="material-symbols-outlined">warning</span>
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-medium text-error tabular-nums">{overdueTasks}</span>
            <span className="text-xs font-medium text-error/80 tabular-nums">
              {lang === 'zh' ? '需要优先处理' : 'Needs attention'}
            </span>
          </div>
          <div className="mt-3 w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-error h-full rounded-md transition-ink-colors duration-500"
              style={{ width: `${(overdueTasks / (totalTasks || 1)) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Charts Area */}
      <div>
        {/* Trend Area Chart */}
        <div className="bg-surface-container-lowest dark:bg-surface-container p-6 rounded-xl border border-outline-variant/30 shadow-sm dark:shadow-none flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-medium text-on-surface flex items-center gap-2 tabular-nums">
                <span className="material-symbols-outlined text-inherit">show_chart</span>
                {lang === 'zh' ? '任务创生与交付燃尽趋势 (Burndown Trend)' : 'Task Creation vs Completion Trend'}
              </h3>
              <span className="text-xs px-3 py-1 rounded-md bg-primary/10 text-primary font-medium tabular-nums">
                {lang === 'zh' ? '实时同步' : 'Live Sync'}
              </span>
            </div>
            <p className="text-xs text-on-surface-variant mb-6">
              {lang === 'zh'
                ? '对比每日新增任务需求与工程团队闭环交付数量比例'
                : 'Comparing newly created tasks against closed items per day.'}
            </p>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" stroke="var(--color-outline-val)" fontSize={12} tickLine={false} />
                <YAxis stroke="var(--color-outline-val)" fontSize={12} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-surface-container-highest-val)',
                    borderRadius: '8px',
                    border: '1px solid var(--color-outline-variant-val)',
                    color: 'var(--color-on-surface-val)',
                    boxShadow: '0 8px 24px rgba(0,0,0,.06)',
                  }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }} />
                <Area
                  type="monotone"
                  dataKey="created"
                  name={lang === 'zh' ? '新增创建需求' : 'Created Tasks'}
                  stroke="var(--color-outline-val)"
                  strokeWidth={3}
                  fillOpacity={0.08}
                  fill="var(--color-outline-val)"
                />
                <Area
                  type="monotone"
                  dataKey="completed"
                  name={lang === 'zh' ? '完成闭环验收' : 'Completed Tasks'}
                  stroke="var(--color-primary-val)"
                  strokeWidth={3}
                  fillOpacity={0.08}
                  fill="var(--color-primary-val)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Team Workload Bar Chart */}
      <div className="bg-surface-container-lowest dark:bg-surface-container p-6 rounded-xl border border-outline-variant/30 shadow-sm dark:shadow-none">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-medium text-on-surface flex items-center gap-2 tabular-nums">
              <span className="material-symbols-outlined text-inherit">groups</span>
              {lang === 'zh' ? '团队成员负载与饱和度对比 (Workload Distribution)' : 'Team Workload & Capacity'}
            </h3>
            <p className="text-xs text-on-surface-variant mt-1">
              {lang === 'zh'
                ? '监控每位架构师与工程师当前的待处理事项与验收业绩'
                : 'Track active tasks vs completed items assigned per team member.'}
            </p>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={workloadData} margin={{ top: 20, right: 30, left: -20, bottom: 5 }}>
              <XAxis dataKey="name" stroke="var(--color-outline-val)" fontSize={12} tickLine={false} />
              <YAxis stroke="var(--color-outline-val)" fontSize={12} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-surface-container-highest-val)',
                  borderRadius: '8px',
                  border: '1px solid var(--color-outline-variant-val)',
                  color: 'var(--color-on-surface-val)',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              <Bar dataKey="待办执行" name={lang === 'zh' ? '执行中待办' : 'Active Tasks'} stackId="a" fill="var(--color-primary-val)" radius={[0, 0, 4, 4]} />
              <Bar dataKey="已完成" name={lang === 'zh' ? '已完成归档' : 'Completed'} stackId="a" fill="var(--color-outline-val)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      </>}
      {policyDialog && numericProjectId && (
        <ProjectSettingsModal
          projectId={numericProjectId}
          canManage={policyDialog.canManage}
          members={policyDialog.members}
          onClose={() => setPolicyDialog(null)}
        />
      )}
    </div>
  );
};
