import React, { useState, useEffect } from 'react';
import { Project, UserProfile } from '../../../types';
import { AppIcon } from '../../ui/AppIcon';
import { MobileTopBar } from '../../ui/MobileTopBar';
import { MobileEmptyState, MobileLoadingState, MobileErrorState } from '../../ui/MobileState';
import { useMobileNavigation } from '../../navigation/MobileNavigationProvider';
import {
  aggregateLeadershipReport,
  getLatestLeadershipReport,
  LeadershipReport,
} from '../../../api/reports';

export interface LeadershipReportScreenProps {
  user: UserProfile;
  companyId: number | string | null;
  projects: Project[];
}

export const LeadershipReportScreen: React.FC<LeadershipReportScreenProps> = ({
  user,
  companyId,
  projects,
}) => {
  const { goBack } = useMobileNavigation();
  const numCompanyId = companyId != null ? Number(companyId) : 1;

  // 状态
  const [loading, setLoading] = useState(false);
  const [aggregating, setAggregating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<LeadershipReport | null>(null);
  const [filterChip, setFilterChip] = useState<'all' | 'risk' | 'decision'>('all');
  const [isLeader, setIsLeader] = useState<boolean | null>(null);

  // 初始化加载组织总领导汇报
  useEffect(() => {
    let cancelled = false;
    if (!numCompanyId) return;

    setLoading(true);
    setError(null);

    getLatestLeadershipReport(numCompanyId)
      .then((res) => {
        if (cancelled) return;
        setIsLeader(true);
        setReport(res);
      })
      .catch((err) => {
        if (cancelled) return;
        const status = (err as any)?.code || (err as any)?.status;
        if (status === 403 || String(err).includes('403')) {
          setIsLeader(false);
        } else {
          setIsLeader(true);
          setError(err instanceof Error ? err.message : '加载总领导总览失败');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [numCompanyId]);

  // 触发生成跨项目摘要汇总
  const handleAggregate = async () => {
    if (!numCompanyId || aggregating) return;
    setAggregating(true);
    setError(null);

    try {
      const res = await aggregateLeadershipReport(numCompanyId);
      setReport(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成总领导汇总失败');
    } finally {
      setAggregating(false);
    }
  };

  // 权限防御
  if (isLeader === false) {
    return (
      <div className="flex flex-col h-full bg-[#f7f8fa] dark:bg-slate-950 select-none">
        <MobileTopBar title="总领导项目总览" showBack onBack={goBack} />
        <div className="flex-1 p-6 flex flex-col items-center justify-center">
          <MobileEmptyState
            iconName="lock"
            title="需要总领导权限"
            description="跨项目总览仅对组织总领导开放。系统保证总领导仅接收允许的项目摘要封装，不合并各项目原始上下文。"
          />
        </div>
      </div>
    );
  }

  const projectCount = projects.filter((p) => p.id !== 'all').length || 1;

  return (
    <div className="flex flex-col h-full bg-[#f7f8fa] dark:bg-slate-950 select-none">
      <MobileTopBar
        title="总领导项目总览"
        showBack
        onBack={goBack}
        backLabel="返回"
      />

      {loading && <MobileLoadingState message="加载总领导项目总览…" />}
      {error && <MobileErrorState message={error} />}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 顶部过滤 Chips */}
        <div className="flex items-center gap-2">
          {(['all', 'risk', 'decision'] as const).map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setFilterChip(chip)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                filterChip === chip
                  ? 'bg-[#0058BE] text-white shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
              }`}
            >
              {chip === 'all' ? '全部项目' : chip === 'risk' ? '风险优先' : '待决策'}
            </button>
          ))}
        </div>

        {/* 统计横幅 */}
        <div className="grid grid-cols-3 gap-2 bg-[#edf4ff] dark:bg-slate-900/60 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/40 text-center">
          <div>
            <b className="text-xl font-bold text-[#0058BE] dark:text-blue-400 block">
              {projectCount}
            </b>
            <span className="text-xs text-slate-500">项目</span>
          </div>
          <div className="border-x border-blue-200/60 dark:border-slate-800">
            <b className="text-xl font-bold text-amber-600 block">
              {projectCount > 1 ? 2 : 1}
            </b>
            <span className="text-xs text-slate-500">需关注</span>
          </div>
          <div>
            <b className="text-xl font-bold text-slate-600 block">1</b>
            <span className="text-xs text-slate-500">待决策</span>
          </div>
        </div>

        {/* 最新跨项目总结卡片 */}
        {report && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
              组织总汇报摘要
            </h3>
            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
              {report.summary_text}
            </div>
          </section>
        )}

        {/* 项目卡片列表（项目摘要封装） */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
            项目封装列表
          </h3>

          {projects
            .filter((p) => p.id !== 'all')
            .map((p, idx) => {
              const isFirst = idx === 0;
              return (
                <div
                  key={p.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {p.name}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        isFirst
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      }`}
                    >
                      {isFirst ? '需关注' : '正常'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {isFirst
                      ? '核心链路联调完成，移动端页面正在审核。已完成 17 / 25 项。'
                      : '成员角色切换与项目基础数据验证进行中。'}
                  </p>

                  {/* 进度条 */}
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-[#0058BE] h-full rounded-full transition-all"
                      style={{ width: isFirst ? '68%' : '45%' }}
                    />
                  </div>

                  <p className="text-[11px] text-slate-400">
                    项目封装摘要 · 更新于 {new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                  </p>

                  {isFirst && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-amber-700">
                      <span>待决策：管理者入口方案确认</span>
                      <AppIcon name="chevron-right" size={15} />
                    </div>
                  )}
                </div>
              );
            })}
        </section>

        {/* 权限与隔离规范提示 */}
        <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded-xl flex items-start gap-2">
          <AppIcon name="info" size={16} className="text-[#0058BE] shrink-0 mt-0.5" />
          <p className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
            总领导 AI 接收项目摘要封装，不合并各项目原始上下文。
          </p>
        </div>

        {/* 汇总全部项目按钮 */}
        <button
          type="button"
          disabled={aggregating}
          onClick={() => void handleAggregate()}
          className="w-full min-h-[46px] rounded-xl bg-[#0058BE] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 shadow-xs cursor-pointer transition-colors"
        >
          {aggregating ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <AppIcon name="ai" size={17} />
          )}
          <span>{aggregating ? '正在汇总项目摘要…' : '汇总项目摘要'}</span>
        </button>
      </div>
    </div>
  );
};
