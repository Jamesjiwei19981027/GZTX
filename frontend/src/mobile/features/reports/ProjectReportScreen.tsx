import React, { useState, useEffect } from 'react';
import { Project, UserProfile } from '../../../types';
import { AppIcon } from '../../ui/AppIcon';
import { MobileTopBar } from '../../ui/MobileTopBar';
import { MobileLoadingState, MobileErrorState } from '../../ui/MobileState';
import { useMobileNavigation } from '../../navigation/MobileNavigationProvider';
import {
  aggregateAgentReports,
  getLatestProjectAgentReport,
  listAgentReports,
  AgentReport,
} from '../../../api/reports';
import { listReportSummaries, publishReportSummary, type ReportSummary } from '../../../api/manage';

export interface ProjectReportScreenProps {
  user: UserProfile;
  currentProject: Project;
}

export const ProjectReportScreen: React.FC<ProjectReportScreenProps> = ({
  user: _user,
  currentProject,
}) => {
  const { goBack } = useMobileNavigation();

  const numericProjectId =
    currentProject.id && currentProject.id !== 'all' && Number(currentProject.id) > 0
      ? Number(currentProject.id)
      : null;

  // 聚合状态
  const [loading, setLoading] = useState(false);
  const [aggregating, setAggregating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [envelopeSummary, setEnvelopeSummary] = useState<string>('');
  const [summaries, setSummaries] = useState<{ latest: ReportSummary | null; pending: ReportSummary | null; canPublish: boolean } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [subordinateReports, setSubordinateReports] = useState<AgentReport[]>([]);

  // 载入当前项目下属汇报
  useEffect(() => {
    let cancelled = false;
    if (!numericProjectId) return;

    setLoading(true);
    setError(null);
    setEnvelopeSummary('');
    setSubordinateReports([]);

    const loadSummaries = () => listReportSummaries(numericProjectId).then((r) => {
      if (cancelled) return;
      setSummaries({
        latest: r.latest_published,
        pending: r.items.find((i) => i.status !== 'published') || null,
        canPublish: r.can_publish,
      });
    }).catch(() => undefined);
    void loadSummaries();
    Promise.all([listAgentReports(numericProjectId), getLatestProjectAgentReport(numericProjectId)])
      .then(([res, latest]) => {
        if (cancelled) return;
        const reports = res.items || [];
        setSubordinateReports(reports);
        setEnvelopeSummary(latest?.summary_text || '');
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载项目汇报记录失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [numericProjectId]);

  // 生成项目汇总
  const handleGenerateAggregate = async () => {
    if (!numericProjectId || aggregating) return;
    setAggregating(true);
    setError(null);
    setNotice(null);

    try {
      const res = await aggregateAgentReports(numericProjectId);
      setEnvelopeSummary(res.summary_text || '');
      const fresh = await listReportSummaries(numericProjectId);
      setSummaries({ latest: fresh.latest_published, pending: fresh.items.find((i) => i.status !== 'published') || null, canPublish: fresh.can_publish });
      setNotice('已成功基于已提交的下属汇报生成最新项目汇总摘要');
    } catch (err) {
      setError(err instanceof Error ? err.message : '汇总项目汇报失败，请确认是否具备项目管理者权限');
    } finally {
      setAggregating(false);
    }
  };

  // 确认发布项目摘要（结合 G03 规范处理）
  const handlePublishSummary = async () => {
    if (!numericProjectId || publishing) return;
    const pending = summaries?.pending;
    if (!pending) {
      setError('没有待发布的项目汇总，请先点「生成 / 更新项目汇总」');
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      const done = await publishReportSummary(numericProjectId, pending.id);
      setSummaries((prev) => ({ latest: done, pending: null, canPublish: prev?.canPublish ?? true }));
      setNotice('已发布，项目成员和上级可以在汇报页看到这一版');
    } catch (err) {
      setError(err instanceof Error ? err.message : '发布失败');
    } finally {
      setPublishing(false);
    }
  };

  const submittedCount = subordinateReports.filter(
    (r) => r.status === 'submitted' || r.status === 'aggregated',
  ).length;

  if (!numericProjectId) {
    return (
      <div className="flex flex-col h-full bg-surface dark:bg-surface-container-lowest select-none">
        <MobileTopBar title="项目汇报管理" showBack onBack={goBack} />
        <div className="flex-1 p-6 flex flex-col items-center justify-center">
          <p className="text-sm text-on-surface-variant">请选择具体项目查看汇报汇总</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface dark:bg-surface-container-lowest select-none">
      <MobileTopBar
        title="项目汇总与发布"
        showBack
        onBack={goBack}
        backLabel="返回"
      />

      {loading && <MobileLoadingState message="加载项目汇报配置…" />}
      {error && <MobileErrorState message={error} />}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 顶部待确认状态标签 */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-surface-container text-[#a86412] dark:bg-surface-container dark:text-[#d9a35b] border border-outline-variant dark:border-[#d9a35b] tabular-nums">
            待管理者确认
          </span>
          <span className="text-xs text-outline">
            已收录 {submittedCount} 份成员汇报
          </span>
        </div>

        {notice && (
          <div className="p-3 rounded-xl bg-surface-container-lowest dark:bg-surface-container border border-primary text-xs text-primary dark:text-primary leading-relaxed flex items-start gap-2">
            <AppIcon name="info" size={18} className="text-inherit shrink-0 mt-1" />
            <div>{notice}</div>
          </div>
        )}

        {/* 标题 */}
        <div>
          <h2 className="text-xl font-medium text-on-surface dark:text-on-surface tabular-nums">项目周报</h2>
          <p className="text-xs text-outline mt-1">
            {currentProject.name} · {new Date().toLocaleDateString('zh-CN')}
          </p>
        </div>

        {/* 完成情况 */}
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-on-surface-variant   px-1 tabular-nums">
            完成情况
          </h3>
          <div className="p-4 bg-surface-container-lowest dark:bg-surface-container rounded-xl border border-outline-variant/80 dark:border-outline-variant shadow-sm dark:shadow-none text-sm text-on-surface dark:text-outline leading-relaxed whitespace-pre-wrap">
            {envelopeSummary ||
              `核心业务任务与汇报链路联调进行中。已收到 ${submittedCount} 份成员汇报，移动端各审核页面进入联调测试阶段。`}
          </div>
        </section>

        {/* 汇总依据 */}
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-on-surface-variant   px-1 tabular-nums">
            汇总依据
          </h3>
          <div className="bg-surface-container-lowest dark:bg-surface-container rounded-xl border border-outline-variant/80 dark:border-outline-variant overflow-hidden divide-y divide-outline-variant dark:divide-outline-variant">
            <div className="p-4 flex items-center justify-between">
              <div>
                <strong className="text-sm font-medium text-on-surface dark:text-outline block tabular-nums">
                  下属已提交汇报
                </strong>
                <p className="text-xs text-outline mt-1">{submittedCount} 份已提交</p>
              </div>
            </div>
          </div>
        </section>

        {/* 项目隔离提示 */}
        <div className="p-3 bg-surface-container-lowest dark:bg-surface-container border border-primary dark:border-primary rounded-xl flex items-start gap-2">
          <AppIcon name="info" size={18} className="text-inherit shrink-0 mt-1" />
          <p className="text-xs text-primary dark:text-primary leading-relaxed">
            向上级提供项目级摘要封装；其他项目不能读取本项目原始对话与未归档材料。
          </p>
        </div>

        {/* 操作按钮区 */}
        <div className="space-y-3 pt-2">
          {summaries?.latest && (
            <div className="p-3 rounded-xl bg-surface-container-lowest dark:bg-surface-container border border-outline-variant text-xs text-[#2f7d4f]" data-testid="mobile-published-summary">
              <div className="font-medium mb-1 tabular-nums">已发布版本 #{summaries.latest.id} · {(summaries.latest.published_at || '').slice(0, 16).replace('T', ' ')}</div>
              <pre className="whitespace-pre-wrap font-sans">{summaries.latest.summary_text}</pre>
            </div>
          )}
          <button
            type="button"
            disabled={aggregating}
            onClick={() => void handleGenerateAggregate()}
            className="w-full min-h-[48px] rounded-lg bg-primary text-on-primary text-sm font-medium flex items-center justify-center gap-2 hover:bg-primary/90 active:bg-primary/90 disabled:opacity-50 shadow-sm dark:shadow-none cursor-pointer transition-ink-colors tabular-nums"
          >
            {aggregating ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <AppIcon name="ai" size={18} />
            )}
            <span>{aggregating ? '正在汇总聚合…' : '生成 / 更新项目汇总'}</span>
          </button>

          <button
            type="button"
            disabled={publishing || !summaries?.pending}
            onClick={() => void handlePublishSummary()}
            className="w-full min-h-[48px] rounded-lg bg-surface-container-lowest dark:bg-surface-container-lowest border border-outline-variant dark:border-outline-variant text-on-surface dark:text-outline text-sm font-medium flex items-center justify-center gap-2 hover:bg-surface cursor-pointer shadow-2xs transition-ink-colors tabular-nums"
          >
            <AppIcon name="send" size={18} />
            <span>{publishing ? '发布中…' : '确认发布项目摘要'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
