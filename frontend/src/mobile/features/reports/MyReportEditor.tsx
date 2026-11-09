import React, { useState, useEffect, useRef } from 'react';
import { AutoGrowingTextarea } from '../../../components/AutoGrowingTextarea';
import { useKeyboardAvoidance } from '../../runtime/useKeyboardViewport';
import { Project, UserProfile } from '../../../types';
import { ReportProjectSelector } from './ReportProjectSelector';
import { AppIcon } from '../../ui/AppIcon';
import { MobileTopBar } from '../../ui/MobileTopBar';
import { MobileLoadingState } from '../../ui/MobileState';
import { useMobileNavigation } from '../../navigation/MobileNavigationProvider';
import {
  generateMyReportDraft,
  submitReportEdit,
  submitAgentReport,
  listReportAgentBindings,
  getReportDetail,
  listMyReports,
  AgentReport,
  ReportSource,
} from '../../../api/reports';
import {
  resolveDirectSupervisor,
  loadLocalDraft,
  saveLocalDraft,
  clearLocalDraft,
  mergeDraftText,
} from './reportCapabilities';
import { ReportSources } from './ReportSources';

export interface MyReportEditorProps {
  user: UserProfile;
  currentProject: Project;
  projects?: Project[];
  onSelectProject?: (project: Project) => void;
  projectMembers: Array<{ id: string | number; name: string; avatar?: string; role?: string }>;
  initialDraftReportId?: number | null;
}

export const MyReportEditor: React.FC<MyReportEditorProps> = (props) => (
  <MyReportEditorContent key={`${props.user.id}:${props.currentProject.id}`} {...props} />
);

const MyReportEditorContent: React.FC<MyReportEditorProps> = ({
  user,
  currentProject,
  projects,
  onSelectProject,
  projectMembers,
  initialDraftReportId,
}) => {
  const { goBack, push } = useMobileNavigation();
  const keyboard = useKeyboardAvoidance();
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  const isAllProjects = !currentProject.id || currentProject.id === 'all';
  const numericProjectId = !isAllProjects && Number(currentProject.id) > 0 ? Number(currentProject.id) : null;

  // 汇报周期文本计算（本周一至周日）
  const periodText = (() => {
    const now = new Date();
    const day = now.getDay() || 7;
    const mon = new Date(now);
    mon.setDate(now.getDate() - day + 1);
    const sun = new Date(now);
    sun.setDate(now.getDate() - day + 7);
    return `${mon.getMonth() + 1} 月 ${mon.getDate()} 日—${sun.getMonth() + 1} 月 ${sun.getDate()} 日`;
  })();

  // 草稿字段状态
  const [completedText, setCompletedText] = useState('');
  const [inProgressRiskText, setInProgressRiskText] = useState('');
  const [draftReportId, setDraftReportId] = useState<number | null>(initialDraftReportId || null);
  const [sources, setSources] = useState<ReportSource[]>([]);
  const [taskSnapshots, setTaskSnapshots] = useState<Array<{ id: number; title: string; status?: string }>>([]);
  const [evidenceSnapshots, setEvidenceSnapshots] = useState<Array<{ id: number; summary?: string; status?: string }>>([]);

  // 直属领导与绑定信息
  const [parentUserId, setParentUserId] = useState<number | null>(null);
  const [myBindingId, setMyBindingId] = useState<number | null>(null);

  // 加载与错误状态
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // 初始化草稿与绑定
  useEffect(() => {
    if (!numericProjectId) return;

    // 1. 读取本地隔离暂存草稿
    const local = loadLocalDraft(user.id || 'me', numericProjectId);
    if (local?.summary) {
      // 拆分已完成与风险段落
      const parts = local.summary.split('\n\n');
      if (parts.length > 1) {
        setCompletedText(parts[0] || '');
        setInProgressRiskText(parts.slice(1).join('\n\n'));
      } else {
        setCompletedText(local.summary);
      }
      if (local.draftReportId) {
        setDraftReportId(local.draftReportId);
        getReportDetail(local.draftReportId)
          .then((r) => {
            if (!active.current) return;
            if (r.parent_user_id != null) {
              setParentUserId(r.parent_user_id);
            }
          })
          .catch(() => {});
      }
    } else if (initialDraftReportId) {
      getReportDetail(initialDraftReportId)
        .then((r) => {
          if (!active.current) return;
          if (r.parent_user_id != null) {
            setParentUserId(r.parent_user_id);
          }
        })
        .catch(() => {});
    }

    // 1.5 服务端草稿（含「记录进展」存进来的记录）并入编辑器，避免草稿只存在服务端、页面看不到
    listMyReports(numericProjectId)
      .then((res) => {
        if (!active.current) return;
        const serverDraft = (res.items || []).find((r) => r.status === 'draft' && (r.summary_text || '').trim());
        if (!serverDraft) return;
        const localCombined = local?.summary || '';
        const merged = mergeDraftText(localCombined, serverDraft.summary_text || '');
        if (merged !== localCombined.trim()) {
          setCompletedText(merged);
          setInProgressRiskText('');
        }
        setDraftReportId((prev) => prev ?? serverDraft.id);
        if (serverDraft.sources?.length) setSources((prev) => (prev.length ? prev : serverDraft.sources || []));
        if (serverDraft.parent_user_id != null) setParentUserId(serverDraft.parent_user_id);
      })
      .catch(() => {});

    // 2. 加载智能体绑定，确定 bindingId（直属领导仅由服务端草稿/人轴确定，前端不猜测）
    listReportAgentBindings(numericProjectId)
      .then((res) => {
        if (!active.current) return;
        const items = res.items || [];
        const memberBinding = items.find(
          (b) => b.role === 'member' && String(b.user_id) === String(user.id),
        );
        if (memberBinding) {
          setMyBindingId(memberBinding.id);
        }
      })
      .catch(() => {});
  }, [numericProjectId, user.id, initialDraftReportId]);

  // 编辑内容时实时自动保存到本地隔离存储（防意外丢失）
  useEffect(() => {
    if (!numericProjectId) return;
    const combined = [completedText.trim(), inProgressRiskText.trim()].filter(Boolean).join('\n\n');
    if (combined) {
      saveLocalDraft(user.id || 'me', numericProjectId, {
        summary: combined,
        draftReportId,
      });
    }
  }, [completedText, inProgressRiskText, draftReportId, numericProjectId, user.id]);

  // 直属领导校验
  const supervisor = resolveDirectSupervisor(projectMembers, user.id, parentUserId);

  // 重新生成草稿（严格走服务端真实模型生成接口）
  const handleRegenerateDraft = async () => {
    if (!numericProjectId || generating || submitting) return;
    setGenerating(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const draft = await generateMyReportDraft(numericProjectId);
      if (!active.current) return;
      setDraftReportId(draft.id);

      // 解析生成内容
      const summary = draft.summary_text || '';
      const parts = summary.split('\n\n');
      if (parts.length > 1) {
        setCompletedText(parts[0] || '');
        setInProgressRiskText(parts.slice(1).join('\n\n'));
      } else {
        setCompletedText(summary);
        setInProgressRiskText('');
      }

      setSources(draft.sources || []);
      const payload = draft.payload_json || {};
      if (Array.isArray(payload.task_snapshot)) {
        setTaskSnapshots(payload.task_snapshot as Array<{ id: number; title: string; status?: string }>);
      }
      if (Array.isArray(payload.evidence_snapshot)) {
        setEvidenceSnapshots(payload.evidence_snapshot as Array<{ id: number; summary?: string; status?: string }>);
      }

      if (draft.parent_user_id != null) {
        setParentUserId(draft.parent_user_id);
      }

      setInfoMessage('已成功基于当前项目任务与资料生成最新事实汇报草稿');
    } catch (err) {
      // 真实报错原因展示，严禁伪造假数据
      const msg = err instanceof Error ? err.message : '生成草稿异常';
      setErrorMessage(msg);
    } finally {
      setGenerating(false);
    }
  };

  // 提交汇报给直属领导
  const handleSubmitReport = async () => {
    if (!numericProjectId || submitting || generating) return;

    // 直属领导不能是自己判定（仅在服务器明确返回了直属上级且为自己时拦截）
    if (parentUserId != null && supervisor.isSelf) {
      setErrorMessage('直属领导不能是自己。人轴责任链要求汇报流向明确的上级管理者。');
      return;
    }

    const summary = [completedText.trim(), inProgressRiskText.trim()].filter(Boolean).join('\n\n');
    if (!summary) {
      setErrorMessage('请填写已完成或进行中的工作事实内容后再提交');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      let finalReport: AgentReport | { id: number; project_id: number; parent_user_id?: number | null; status: string; summary_text: string; source_count: number };
      if (draftReportId) {
        finalReport = await submitReportEdit(draftReportId, { summary, sources });
      } else if (myBindingId) {
        finalReport = await submitAgentReport(numericProjectId, {
          binding_id: myBindingId,
          summary,
        });
      } else {
        // 如果尚无 binding，先通过 generate 初始化草稿再提交
        const draft = await generateMyReportDraft(numericProjectId);
        if (!active.current) return;
        finalReport = await submitReportEdit(draft.id, { summary, sources });
      }

      if (!active.current) return;
      // 提交成功，清空本地草稿缓存
      clearLocalDraft(user.id || 'me', numericProjectId);

      // 跳转送达状态页（Design ID 38）
      push({
        screen: 'ai-report-submitted',
        title: '汇报提交与送达',
        params: {
          reportId: String(finalReport.id),
          projectId: String(numericProjectId),
        },
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '提交汇报失败，请检查网络或权限');
    } finally {
      setSubmitting(false);
    }
  };

  if (isAllProjects || !numericProjectId) {
    return (
      <div className="flex flex-col h-full bg-surface dark:bg-surface-container-lowest">
        <MobileTopBar title="写汇报" showBack onBack={goBack} />
        <ReportProjectSelector currentProject={currentProject} projects={projects} onSelectProject={onSelectProject} />
        <div className="flex-1 p-6 flex flex-col items-center justify-center">
          <p className="text-sm text-on-surface-variant">请先在具体项目中编辑与提交个人汇报</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={keyboard.ref} style={{ paddingBottom: keyboard.overlap }} className="flex flex-col h-full min-h-0 bg-surface dark:bg-surface-container-lowest select-none">
      <MobileTopBar
        title="写汇报"
        showBack
        onBack={goBack}
        backLabel="返回"
      />
        <ReportProjectSelector currentProject={currentProject} projects={projects} onSelectProject={onSelectProject} />

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {/* 顶部草稿状态标签 */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-surface-container text-[#a86412] dark:bg-surface-container dark:text-[#d9a35b] border border-outline-variant dark:border-[#d9a35b] tabular-nums">
            草稿 · 仅自己可见
          </span>
          <span className="text-xs text-outline">
            项目：{currentProject.name}
          </span>
        </div>

        {/* 错误提示条 */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-error-container dark:bg-error border border-outline-variant dark:border-outline-variant text-xs text-error dark:text-error flex items-start gap-2">
            <AppIcon name="alert" size={18} className="shrink-0 mt-1 text-inherit" />
            <div className="flex-1 leading-relaxed">{errorMessage}</div>
          </div>
        )}

        {/* 成功/信息提示条 */}
        {infoMessage && (
          <div className="p-3 rounded-xl bg-surface-container-lowest dark:bg-surface-container border border-outline-variant dark:border-[#6bbf8a] text-xs text-[#2f7d4f] dark:text-[#6bbf8a] flex items-start gap-2">
            <AppIcon name="check-circle" size={18} className="shrink-0 mt-1 text-inherit" />
            <div className="flex-1 leading-relaxed">{infoMessage}</div>
          </div>
        )}

        {/* 汇报周期 */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-on-surface dark:text-outline tabular-nums">
            汇报周期
          </label>
          <div className="min-h-[48px] rounded-xl bg-surface-container-lowest dark:bg-surface-container border border-outline-variant/80 dark:border-outline-variant px-4 py-2 flex items-center justify-between text-sm text-on-surface dark:text-outline shadow-2xs">
            <span>{periodText}</span>
            <AppIcon name="calendar" size={18} className="text-inherit" />
          </div>
        </div>

        {/* 已完成 */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-on-surface dark:text-outline tabular-nums">
            已完成
          </label>
          <AutoGrowingTextarea
            aria-label="已完成汇报内容"
            rows={4}
            value={completedText}
            onChange={(e) => setCompletedText(e.target.value)}
            placeholder="描述本周已落地的具体成果、任务完成情况及评审结果…"
            className="w-full rounded-lg bg-surface-container-lowest dark:bg-surface-container-lowest border border-outline-variant/80 dark:border-outline-variant p-3 text-sm text-on-surface dark:text-outline placeholder:text-outline outline-hidden focus:border-primary transition-ink-colors leading-relaxed shadow-2xs resize-none"
          />
        </div>

        {/* 进行中 / 风险 */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-on-surface dark:text-outline tabular-nums">
            进行中 / 风险
          </label>
          <AutoGrowingTextarea
            aria-label="进行中与风险汇报内容"
            rows={3}
            value={inProgressRiskText}
            onChange={(e) => setInProgressRiskText(e.target.value)}
            placeholder="描述当前阻塞问题、待决策事项或依赖外部的事项…"
            className="w-full rounded-lg bg-surface-container-lowest dark:bg-surface-container-lowest border border-outline-variant/80 dark:border-outline-variant p-3 text-sm text-on-surface dark:text-outline placeholder:text-outline outline-hidden focus:border-primary transition-ink-colors leading-relaxed shadow-2xs resize-none"
          />
        </div>

        {/* 来源依据卡片 */}
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-medium text-on-surface-variant dark:text-outline   tabular-nums">
              来源依据
            </h3>
            <span className="text-xs text-outline">严格基于项目事实</span>
          </div>
          <ReportSources
            sources={sources}
            taskSnapshot={taskSnapshots}
            evidenceSnapshot={evidenceSnapshots}
          />
        </section>

        {/* 直属领导判定卡片 */}
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-on-surface-variant dark:text-outline   px-1 tabular-nums">
            提交接收人
          </h3>
          {parentUserId == null ? (
            <div className="p-4 rounded-xl border border-outline-variant/80 dark:border-outline-variant bg-surface-container-lowest dark:bg-surface-container shadow-2xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-surface-container dark:bg-surface-container-lowest text-on-surface-variant dark:text-outline flex items-center justify-center shrink-0">
                <AppIcon name="user" size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <strong className="text-sm font-medium text-on-surface dark:text-outline block truncate tabular-nums">
                  提交时由系统按人轴确定直属接收人
                </strong>
                <p className="text-xs text-outline dark:text-on-surface-variant truncate mt-1">
                  以人轴最新责任链实时流转，无需手动选择
                </p>
              </div>
              <AppIcon name="check-circle" size={18} className="text-inherit text-inherit" />
            </div>
          ) : (
            <>
              <div
                className={`p-4 rounded-xl border flex items-center gap-3 bg-surface-container-lowest dark:bg-surface-container ${
                  parentUserId != null && supervisor.isSelf
                    ? 'border-outline-variant dark:border-outline-variant bg-error-container dark:bg-error'
                    : 'border-outline-variant/80 dark:border-outline-variant shadow-2xs'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-surface-container dark:bg-surface-container text-primary dark:text-primary font-medium flex items-center justify-center shrink-0 tabular-nums">
                  {supervisor.name ? supervisor.name.slice(0, 1) : '上'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <strong className="text-sm font-medium text-on-surface dark:text-outline truncate tabular-nums">
                      {supervisor.name}
                    </strong>
                    {parentUserId != null && supervisor.isSelf && (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-error-container text-error tabular-nums">
                        非法上级
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-outline dark:text-on-surface-variant truncate mt-1">
                    {supervisor.role} · 人轴实时判定
                  </p>
                </div>
                <AppIcon name="check-circle" size={18} className={supervisor.isValid ? 'text-inherit' : 'text-inherit'} />
              </div>
              {parentUserId != null && supervisor.isSelf && (
                <p className="text-xs text-error px-1">
                  直属领导不能是自己。请在人轴画布或设置中指定您的直属上级后再提交。
                </p>
              )}
            </>
          )}
        </section>
      </div>

      {/* 底部操作栏 */}
      <div className="shrink-0 p-3 bg-surface-container-lowest dark:bg-surface-container-lowest border-t border-outline-variant/80 dark:border-outline-variant flex items-center gap-3">
        <button
          type="button"
          disabled={generating || submitting}
          onClick={() => void handleRegenerateDraft()}
          className="flex-1 min-h-[48px] rounded-lg bg-surface-container dark:bg-surface-container-lowest text-on-surface dark:text-outline text-sm font-medium flex items-center justify-center gap-2 hover:bg-surface-container active:bg-surface-container-high disabled:opacity-50 cursor-pointer transition-ink-colors tabular-nums"
        >
          {generating ? (
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          ) : (
            <AppIcon name="ai" size={18} className="text-inherit" />
          )}
          <span>{generating ? '正在提取事实…' : '重新生成'}</span>
        </button>

        <button
          type="button"
          disabled={submitting || generating || (parentUserId != null && supervisor.isSelf)}
          onClick={() => void handleSubmitReport()}
          className="flex-1 min-h-[48px] rounded-lg bg-primary text-on-primary text-sm font-medium flex items-center justify-center gap-2 hover:bg-primary/90 active:bg-primary/90 disabled:opacity-50 cursor-pointer shadow-sm dark:shadow-none transition-ink-colors tabular-nums"
        >
          {submitting ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <AppIcon name="send" size={18} />
          )}
          <span>{submitting ? '正在提交…' : '确认提交'}</span>
        </button>
      </div>
    </div>
  );
};
