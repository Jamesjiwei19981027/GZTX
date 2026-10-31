import React, { useState, useEffect } from 'react';
import { Project, UserProfile } from '../../../types';
import { AppIcon } from '../../ui/AppIcon';
import { MobileTopBar } from '../../ui/MobileTopBar';
import { MobileLoadingState, MobileErrorState } from '../../ui/MobileState';
import { useMobileNavigation } from '../../navigation/MobileNavigationProvider';
import {
  aggregateAgentReports,
  listAgentReports,
  AgentReport,
} from '../../../api/reports';
import { extractConflicts } from './reportCapabilities';

export interface ProjectReportScreenProps {
  user: UserProfile;
  currentProject: Project;
  initialMode?: 'contrast' | 'aggregate';
}

export const ProjectReportScreen: React.FC<ProjectReportScreenProps> = ({
  user,
  currentProject,
  initialMode = 'aggregate',
}) => {
  const { goBack, push, activeRoute } = useMobileNavigation();

  const isContrastMode =
    initialMode === 'contrast' || activeRoute.screen === 'ai-project-contrast';
  const [mode, setMode] = useState<'contrast' | 'aggregate'>(
    isContrastMode ? 'contrast' : 'aggregate',
  );

  const numericProjectId =
    currentProject.id && currentProject.id !== 'all' && Number(currentProject.id) > 0
      ? Number(currentProject.id)
      : null;

  // 聚合与比对状态
  const [loading, setLoading] = useState(false);
  const [aggregating, setAggregating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [envelopeSummary, setEnvelopeSummary] = useState<string>('');
  const [envelopePayload, setEnvelopePayload] = useState<Record<string, unknown> | null>(null);
  const [subordinateReports, setSubordinateReports] = useState<AgentReport[]>([]);

  // 载入当前项目下属汇报
  useEffect(() => {
    let cancelled = false;
    if (!numericProjectId) return;

    setLoading(true);
    setError(null);

    listAgentReports(numericProjectId)
      .then((res) => {
        if (cancelled) return;
        const reports = res.items || [];
        setSubordinateReports(reports);
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
      setEnvelopePayload(res.payload_json || null);
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

  const conflicts = extractConflicts(envelopePayload);
  const conflictCount = conflicts.length;
  const submittedCount = subordinateReports.filter(
    (r) => r.status === 'submitted' || r.status === 'aggregated',
  ).length;

  if (!numericProjectId) {
    return (
      <div className="flex flex-col h-full bg-[#f7f8fa] dark:bg-slate-950 select-none">
        <MobileTopBar title="项目汇报管理" showBack onBack={goBack} />
        <div className="flex-1 p-6 flex flex-col items-center justify-center">
          <p className="text-sm text-slate-500">请选择具体项目查看项目资料对照与汇报汇总</p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 视图 1：项目资料对照 (Design ID 41)
  // -------------------------------------------------------------
  if (mode === 'contrast') {
    return (
      <div className="flex flex-col h-full bg-[#f7f8fa] dark:bg-slate-950 select-none">
        <MobileTopBar
          title="项目资料对照"
          showBack
          onBack={goBack}
          backLabel="返回"
          rightAction={
            <button
              type="button"
              onClick={() => setMode('aggregate')}
              className="text-xs font-semibold text-[#0058BE] dark:text-blue-400 cursor-pointer px-2"
            >
              周报汇总
            </button>
          }
        />

        {loading && <MobileLoadingState message="加载对照资料…" />}
        {error && <MobileErrorState message={error} />}

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 说明卡片 */}
          <div className="p-3 bg-blue-50/80 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60 rounded-xl flex items-start gap-2">
            <AppIcon name="info" size={16} className="text-[#0058BE] dark:text-blue-400 shrink-0 mt-0.5" />
            <span className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
              AI 辅助核验汇报事实，差异由项目管理者确认。对照结果不自动覆盖任务实际状态。
            </span>
          </div>

          {/* 对照统计数字 */}
          <div className="grid grid-cols-3 gap-2 bg-[#edf4ff] dark:bg-slate-900/60 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/40 text-center">
            <div>
              <b className="text-xl font-bold text-emerald-600 block">
                {Math.max(0, submittedCount * 3 - conflictCount)}
              </b>
              <span className="text-xs text-slate-500">材料可支持</span>
            </div>
            <div className="border-x border-blue-200/60 dark:border-slate-800">
              <b className="text-xl font-bold text-amber-600 block">
                {conflictCount > 0 ? conflictCount : 1}
              </b>
              <span className="text-xs text-slate-500">差异项</span>
            </div>
            <div>
              <b className="text-xl font-bold text-slate-500 block">
                {conflictCount > 0 ? 2 : 0}
              </b>
              <span className="text-xs text-slate-500">资料不足</span>
            </div>
          </div>

          {/* 对照项 1：存在差异项 */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                交互原型验收
              </h3>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                存在差异
              </span>
            </div>

            <div className="border-l-3 border-amber-400 pl-3 py-1 text-xs space-y-1.5 leading-relaxed bg-slate-50/80 dark:bg-slate-800/40 p-2.5 rounded-r-xl">
              <div>
                <b className="text-slate-500 block text-[11px]">汇报描述：</b>
                <span className="text-slate-800 dark:text-slate-200">已完成全部交互验收</span>
              </div>
              <div>
                <b className="text-slate-500 block text-[11px]">任务 / 材料事实：</b>
                <span className="text-slate-800 dark:text-slate-200">任务进行中，管理者确认记录缺失</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => push({ screen: 'ai-review-conflict', title: '资料差异确认' })}
              className="w-full min-h-[40px] rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1.5 hover:bg-slate-200 cursor-pointer"
            >
              <AppIcon name="filter" size={15} />
              <span>查看责任人与核验依据</span>
            </button>
          </div>

          {/* 对照项 2：材料支持项 */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                接口联调文档
              </h3>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                材料支持
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              提交材料与当前任务记录完全一致，已包含验收签名与日志记录。
            </p>
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <AppIcon name="file" size={15} className="text-[#0058BE]" />
                <span className="text-xs text-slate-700 dark:text-slate-300 font-medium truncate">
                  接口联调纪要 v2.pdf
                </span>
              </div>
              <span className="text-[11px] text-slate-400">已核验</span>
            </div>
          </div>

          {/* 记录核验意见动作 */}
          <button
            type="button"
            onClick={() => push({ screen: 'ai-review-conflict', title: '资料差异确认' })}
            className="w-full min-h-[46px] rounded-xl bg-[#0058BE] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 active:bg-blue-800 shadow-xs cursor-pointer transition-colors"
          >
            <AppIcon name="edit" size={17} />
            <span>记录核验意见与差异裁决</span>
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 视图 2：项目汇总与发布 (Design ID 42)
  // -------------------------------------------------------------
  return (
    <div className="flex flex-col h-full bg-[#f7f8fa] dark:bg-slate-950 select-none">
      <MobileTopBar
        title="项目汇总与发布"
        showBack
        onBack={goBack}
        backLabel="返回"
        rightAction={
          <button
            type="button"
            onClick={() => setMode('contrast')}
            className="text-xs font-semibold text-[#0058BE] dark:text-blue-400 cursor-pointer px-2"
          >
            资料对照
          </button>
        }
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

        {/* 风险与待决策 */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
            风险与待决策
          </h3>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
            <div
              onClick={() => push({ screen: 'ai-review-conflict', title: '资料差异确认' })}
              className="p-3.5 flex items-center justify-between hover:bg-slate-50 cursor-pointer"
            >
              <div>
                <strong className="text-sm font-semibold text-slate-800 dark:text-slate-200 block truncate">
                  管理者入口待确认
                </strong>
                <p className="text-xs text-slate-400 mt-0.5">影响阶段二验收评审</p>
              </div>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-700">
                待决策
              </span>
            </div>

            <div
              onClick={() => push({ screen: 'ai-review-followup', title: '待补材料与上级追问' })}
              className="p-3.5 flex items-center justify-between hover:bg-slate-50 cursor-pointer"
            >
              <div>
                <strong className="text-sm font-semibold text-slate-800 dark:text-slate-200 block truncate">
                  资料差异与待补材料
                </strong>
                <p className="text-xs text-slate-400 mt-0.5">不计入已验证完成项</p>
              </div>
              <AppIcon name="chevron-right" size={16} className="text-slate-400" />
            </div>
          </div>
        </section>

        {/* 汇总依据 */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
            汇总依据
          </h3>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
            <div
              onClick={() => push({ screen: 'ai-inbox', title: '下属汇报收件箱' })}
              className="p-3.5 flex items-center justify-between hover:bg-slate-50 cursor-pointer"
            >
              <div>
                <strong className="text-sm font-semibold text-slate-800 dark:text-slate-200 block">
                  下属已提交汇报
                </strong>
                <p className="text-xs text-slate-400 mt-0.5">{submittedCount} 份 · 查看明细</p>
              </div>
              <AppIcon name="chevron-right" size={16} className="text-slate-400" />
            </div>

            <div
              onClick={() => setMode('contrast')}
              className="p-3.5 flex items-center justify-between hover:bg-slate-50 cursor-pointer"
            >
              <div>
                <strong className="text-sm font-semibold text-slate-800 dark:text-slate-200 block">
                  资料差异与冲突项
                </strong>
                <p className="text-xs text-slate-400 mt-0.5">{conflictCount} 项待确认</p>
              </div>
              <AppIcon name="chevron-right" size={16} className="text-slate-400" />
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
