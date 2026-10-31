import React, { useEffect, useState, useMemo } from 'react';
import { getTaskStats, getTaskTrend } from '../../../api/shell';
import { Task, Language, TeamMember } from '../../../types';
import { AppIcon } from '../../ui/AppIcon';
import { MobileListGroup, MobileListItem } from '../../ui/MobileList';
import { MobileLoadingState } from '../../ui/MobileState';

export interface MobileStatisticsScreenProps {
  tasks: Task[];
  projectId?: string;
  members?: TeamMember[];
  onBack?: () => void;
  lang?: Language;
}

type Period = 'week' | 'month' | 'quarter';

export const MobileStatisticsScreen: React.FC<MobileStatisticsScreenProps> = ({
  tasks,
  projectId,
  members = [],
  onBack,
  lang = 'zh',
}) => {
  const [period, setPeriod] = useState<Period>('week');
  const [stats, setStats] = useState<{
    total: number;
    completed: number;
    pending: number;
    in_progress: number;
    overdue: number;
  } | null>(null);
  const [trend, setTrend] = useState<{ date: string; created: number; completed: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const fetchStats = async () => {
      setLoading(true);
      setStats(null); setTrend([]); setError(false);
      try {
        const [statsData, trendData] = await Promise.all([
          getTaskStats(period, projectId),
          getTaskTrend(period, projectId),
        ]);
        if (active) {
          setStats(statsData);
          setTrend(trendData.series || []);
        }
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchStats();
    return () => {
      active = false;
    };
  }, [period, tasks, projectId, attempt]);

  // 团队负载分布（基于当前可见任务与成员）
  const memberLoads = useMemo(() => {
    const counts: Record<string, { member: TeamMember; count: number; completed: number }> = {};
    members.forEach((m) => {
      counts[m.id] = { member: m, count: 0, completed: 0 };
    });

    tasks.forEach((t) => {
      const assignees = t.assignees || (t.assignee ? [t.assignee] : []);
      assignees.forEach((a) => {
        if (!counts[a.id]) {
          counts[a.id] = { member: a, count: 0, completed: 0 };
        }
        counts[a.id].count += 1;
        if (t.status === 'Done') {
          counts[a.id].completed += 1;
        }
      });
    });

    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [tasks, members]);

  const maxTrendValue = useMemo(() => {
    return Math.max(1, ...trend.map((t) => Math.max(t.created, t.completed)));
  }, [trend]);

  return (
    <div className="flex flex-col h-full bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <header className="h-14 px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center -ml-2 text-slate-500"
            aria-label="返回"
          >
            <AppIcon name="back" size={20} />
          </button>
        )}
        <h1 className="text-base font-semibold">工作统计报表</h1>
        <div className="w-10" />
      </header>

      {/* 时间周期切换器 */}
      <div className="px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex justify-center">
        <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-full max-w-xs">
          {(['week', 'month', 'quarter'] as const).map((p) => {
            const label = p === 'week' ? '本周' : p === 'month' ? '本月' : '本季度';
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`flex-1 min-h-[36px] rounded-lg text-xs font-semibold transition-all ${
                  period === p
                    ? 'bg-white dark:bg-slate-700 text-[#0058BE] shadow-xs'
                    : 'text-slate-500'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {error ? <div role="alert" className="p-4 text-sm text-red-600">统计加载失败，请重试。<button type="button" onClick={() => setAttempt(n => n+1)} className="min-h-[44px] px-3 underline">重试</button></div> : loading ? (
          <MobileLoadingState message="计算统计指标中…" />
        ) : (
          <>
            {/* 核心指标统计卡片 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
                <span className="text-xs text-slate-500">事项总数</span>
                <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  {stats?.total ?? tasks.length}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">当前范围统计</div>
              </div>

              <div className="p-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
                <span className="text-xs text-green-600">已完成事项</span>
                <div className="text-2xl font-bold text-green-600 mt-1">
                  {stats?.completed ?? 0}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  达成率{' '}
                  {stats && stats.total > 0
                    ? Math.round((stats.completed / stats.total) * 100)
                    : 0}
                  %
                </div>
              </div>

              <div className="p-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
                <span className="text-xs text-blue-600">进行中事项</span>
                <div className="text-2xl font-bold text-blue-600 mt-1">
                  {stats?.in_progress ?? 0}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">推进中</div>
              </div>

              <div className="p-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
                <span className="text-xs text-red-500">逾期未结</span>
                <div className="text-2xl font-bold text-red-500 mt-1">
                  {stats?.overdue ?? 0}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">需重点督促</div>
              </div>
            </div>

            {/* 纵向排列 1：状态分布比例条与说明 */}
            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
              <h3 className="text-sm font-semibold">状态分布 (Status Distribution)</h3>

              {stats && stats.total > 0 ? (
                <>
                  <div className="h-4 w-full rounded-full bg-slate-100 dark:bg-slate-800 flex overflow-hidden">
                    <div
                      style={{ width: `${(stats.completed / stats.total) * 100}%` }}
                      className="bg-green-500 transition-all duration-300"
                      title="已完成"
                    />
                    <div
                      style={{ width: `${(stats.in_progress / stats.total) * 100}%` }}
                      className="bg-blue-500 transition-all duration-300"
                      title="进行中"
                    />
                    <div
                      style={{ width: `${(stats.pending / stats.total) * 100}%` }}
                      className="bg-slate-400 transition-all duration-300"
                      title="待办"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                      <span className="text-slate-600 dark:text-slate-300">
                        已完成: {stats.completed} ({Math.round((stats.completed / stats.total) * 100)}%)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      <span className="text-slate-600 dark:text-slate-300">
                        进行中: {stats.in_progress}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                      <span className="text-slate-600 dark:text-slate-300">
                        待办: {stats.pending}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                      <span className="text-slate-600 dark:text-slate-300">
                        其中逾期: {stats.overdue}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-4 text-center text-xs text-slate-400">暂无事项数据</div>
              )}
            </div>

            {/* 纵向排列 2：任务动态趋势柱状图 */}
            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">新增与完成趋势 (Trend)</h3>
                <div className="flex items-center gap-3 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#0058BE]" />
                    <span className="text-slate-500">新增</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-slate-500">完成</span>
                  </div>
                </div>
              </div>

              {trend.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">暂无趋势采样</div>
              ) : (
                <div className="space-y-2.5 pt-2">
                  {trend.map((item, idx) => (
                    <div key={idx} className="flex flex-col gap-1 text-xs">
                      <div className="flex justify-between text-[11px] text-slate-500">
                        <span>{item.date}</span>
                        <span>
                          + {item.created} 新增 / ✓ {item.completed} 完成
                        </span>
                      </div>
                      <div className="flex gap-1 h-3 rounded-md bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          style={{ width: `${(item.created / maxTrendValue) * 100}%` }}
                          className="bg-[#0058BE] rounded-r-sm"
                        />
                      </div>
                      <div className="flex gap-1 h-3 rounded-md bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          style={{ width: `${(item.completed / maxTrendValue) * 100}%` }}
                          className="bg-green-500 rounded-r-sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 纵向排列 3：团队成员负载排行 */}
            <MobileListGroup title="团队成员事项负载 (Workload)">
              {memberLoads.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">暂无团队人员事项</div>
              ) : (
                memberLoads.map(({ member, count, completed }) => {
                  const rate = count > 0 ? Math.round((completed / count) * 100) : 0;
                  return (
                    <MobileListItem
                      key={member.id}
                      leading={
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-slate-300">
                          {member.name.slice(0, 1)}
                        </div>
                      }
                      title={member.name}
                      subtitle={`已承接 ${count} 项 · 完成 ${completed} 项 (${rate}%)`}
                      trailing={
                        <div className="w-16 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            style={{ width: `${rate}%` }}
                            className="h-full bg-[#0058BE] rounded-full"
                          />
                        </div>
                      }
                      showChevron={false}
                    />
                  );
                })
              )}
            </MobileListGroup>
          </>
        )}
      </div>
    </div>
  );
};
