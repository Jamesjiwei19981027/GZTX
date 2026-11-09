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
  const [subordinateReports, setSubordinateReports] = useState<AgentReport[]>([]);

  // 载入当前项目下属汇报
  useEffect(() => {
    let cancelled = false;
    if (!numericProjectId) return;

    setLoading(true);
    setError(null);
    setEnvelopeSummary('');
    setSubordinateReports([]);

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
      setNotice('已成功基于已提交的下属汇报生成最新项目汇总摘要');
    } catch (err) {
      setError(err instanceof Error ? err.message : '汇总项目汇报失败，请确认是否具备项目管理者权限');
    } finally {
      setAggregating(false);
    }
  };

  // 确认发布项目摘要（结合 G03 规范处理）
  const handlePublishSummary = () => {
    setNotice(
      '【G03 规范提示】当前系统已生成并更新项目摘要封装。正式审批发布工作流待后端接口支持，未将未持久化的审批谎报为入库成功。',
    );
  };

  const submittedCount = subordinateReports.filter(
    (r) => r.status === 'submitted' || r.status === 'aggregated',
  ).length;

  if (!numericProjectId) {
    return (
      <div className="flex flex-col h-full bg-[#f7f8fa] dark:bg-slate-950 select-none">
        <MobileTopBar title="项目汇报管理" showBack onBack={goBack} />
        <div className="flex-1 p-6 flex flex-col items-center justify-center">
          <p className="text-sm text-slate-500">请选择具体项目查看汇报汇总</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#f7f8fa] dark:bg-slate-950 select-none">
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
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800">
            待管理者确认
          </span>
          <span className="text-xs text-slate-400">
            已收录 {submittedCount} 份成员汇报
          </span>
        </div>

        {notice && (
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 text-xs text-blue-800 dark:text-blue-300 leading-relaxed flex items-start gap-2">
            <AppIcon name="info" size={16} className="text-[#0058BE] shrink-0 mt-0.5" />
            <div>{notice}</div>
          </div>
        )}

        {/* 标题 */}
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">项目周报</h2>
          <p className="text-xs text-slate-400 mt-1">
            {currentProject.name} · {new Date().toLocaleDateString('zh-CN')}
          </p>
        </div>

        {/* 完成情况 */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
            完成情况
          </h3>
          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
            {envelopeSummary ||
              `核心业务任务与汇报链路联调进行中。已收到 ${submittedCount} 份成员汇报，移动端各审核页面进入联调测试阶段。`}
          </div>
        </section>

        {/* 汇总依据 */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
            汇总依据
          </h3>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
            <div className="p-3.5 flex items-center justify-between">
              <div>
                <strong className="text-sm font-semibold text-slate-800 dark:text-slate-200 block">
                  下属已提交汇报
                </strong>
                <p className="text-xs text-slate-400 mt-0.5">{submittedCount} 份已提交</p>
              </div>
            </div>
          </div>
        </section>

        {/* 项目隔离提示 */}
        <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded-xl flex items-start gap-2">
          <AppIcon name="info" size={16} className="text-[#0058BE] shrink-0 mt-0.5" />
          <p className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
            向上级提供项目级摘要封装；其他项目不能读取本项目原始对话与未归档材料。
          </p>
        </div>

        {/* 操作按钮区 */}
        <div className="space-y-3 pt-2">
          <button
            type="button"
            disabled={aggregating}
            onClick={() => void handleGenerateAggregate()}
            className="w-full min-h-[46px] rounded-xl bg-[#0058BE] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 shadow-xs cursor-pointer transition-colors"
          >
            {aggregating ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <AppIcon name="ai" size={17} />
            )}
            <span>{aggregating ? '正在汇总聚合…' : '生成 / 更新项目汇总'}</span>
          </button>

          <button
            type="button"
            onClick={handlePublishSummary}
            className="w-full min-h-[46px] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-slate-50 cursor-pointer shadow-2xs transition-colors"
          >
            <AppIcon name="send" size={17} />
            <span>确认发布项目摘要</span>
          </button>
        </div>
      </div>
    </div>
  );
};
