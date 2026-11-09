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
      <div className="flex flex-col h-full bg-surface dark:bg-surface-container-lowest select-none">
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
    <div className="flex flex-col h-full bg-surface dark:bg-surface-container-lowest select-none">
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
              className={`px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-ink-colors ${
                filterChip === chip
                  ? 'bg-primary text-on-primary shadow-sm dark:shadow-none'
                  : 'bg-surface-container-lowest dark:bg-surface-container-lowest text-on-surface-variant dark:text-outline border border-outline-variant dark:border-outline-variant'
              }`}
            >
              {chip === 'all' ? '全部项目' : chip === 'risk' ? '风险优先' : '待决策'}
            </button>
          ))}
        </div>

        {/* 统计横幅 */}
        <div className="grid grid-cols-3 gap-2 bg-[#edf4ff] dark:bg-surface-container-lowest/60 p-4 rounded-xl border border-primary dark:border-primary text-center">
          <div>
            <b className="text-xl font-medium text-primary dark:text-primary block tabular-nums">
              {projectCount}
            </b>
            <span className="text-xs text-on-surface-variant">项目</span>
          </div>
          <div className="border-x border-primary dark:border-outline-variant">
            <b className="text-xl font-medium text-[#a86412] block tabular-nums">
              {projectCount > 1 ? 2 : 1}
            </b>
            <span className="text-xs text-on-surface-variant">需关注</span>
          </div>
          <div>
            <b className="text-xl font-medium text-on-surface-variant block tabular-nums">1</b>
            <span className="text-xs text-on-surface-variant">待决策</span>
          </div>
        </div>

        {/* 最新跨项目总结卡片 */}
        {report && (
          <section className="space-y-2">
            <h3 className="text-xs font-medium text-on-surface-variant   px-1 tabular-nums">
              组织总汇报摘要
            </h3>
            <div className="p-4 bg-surface-container-lowest dark:bg-surface-container rounded-xl border border-outline-variant/80 dark:border-outline-variant shadow-sm dark:shadow-none text-sm text-on-surface dark:text-outline leading-relaxed whitespace-pre-wrap">
              {report.summary_text}
            </div>
          </section>
        )}

        {/* 项目卡片列表（项目摘要封装） */}
        <section className="space-y-3">
          <h3 className="text-xs font-medium text-on-surface-variant   px-1 tabular-nums">
            项目封装列表
          </h3>

          {projects
            .filter((p) => p.id !== 'all')
            .map((p, idx) => {
              const isFirst = idx === 0;
              return (
                <div
                  key={p.id}
                  className="   border-b border-outline-variant/80 dark:border-outline-variant p-4  space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-on-surface dark:text-outline truncate tabular-nums">
                      {p.name}
                    </h3>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        isFirst
                          ? 'bg-surface-container text-[#a86412] dark:bg-surface-container dark:text-[#d9a35b]'
                          : 'bg-surface-container text-[#2f7d4f] dark:bg-surface-container dark:text-[#6bbf8a]'
                      }`}
                    >
                      {isFirst ? '需关注' : '正常'}
                    </span>
                  </div>

                  <p className="text-xs text-on-surface-variant dark:text-outline leading-relaxed">
                    {isFirst
                      ? '核心链路联调完成，移动端页面正在审核。已完成 17 / 25 项。'
                      : '成员角色切换与项目基础数据验证进行中。'}
                  </p>

                  {/* 进度条 */}
                  <div className="w-full bg-surface-container dark:bg-surface-container-lowest h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-primary h-full rounded-md transition-ink-colors"
                      style={{ width: isFirst ? '68%' : '45%' }}
                    />
                  </div>

                  <p className="text-xs text-outline">
                    项目封装摘要 · 更新于 {new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                  </p>

                  {isFirst && (
                    <div className="pt-2 border-t border-outline-variant dark:border-outline-variant flex items-center justify-between text-xs text-[#a86412]">
                      <span>待决策：管理者入口方案确认</span>
                      <AppIcon name="chevron-right" size={18} />
                    </div>
                  )}
                </div>
              );
            })}
        </section>

        {/* 权限与隔离规范提示 */}
        <div className="p-3 bg-surface-container-lowest dark:bg-surface-container border border-primary dark:border-primary rounded-xl flex items-start gap-2">
          <AppIcon name="info" size={18} className="text-inherit shrink-0 mt-1" />
          <p className="text-xs text-primary dark:text-primary leading-relaxed">
            总领导 AI 接收项目摘要封装，不合并各项目原始上下文。
          </p>
        </div>

        {/* 汇总全部项目按钮 */}
        <button
          type="button"
          disabled={aggregating}
          onClick={() => void handleAggregate()}
          className="w-full min-h-[48px] rounded-lg bg-primary text-on-primary text-sm font-medium flex items-center justify-center gap-2 hover:bg-primary/90 active:bg-primary/90 disabled:opacity-50 shadow-sm dark:shadow-none cursor-pointer transition-ink-colors tabular-nums"
        >
          {aggregating ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <AppIcon name="ai" size={18} />
          )}
          <span>{aggregating ? '正在汇总项目摘要…' : '汇总项目摘要'}</span>
        </button>
      </div>
    </div>
  );
};
