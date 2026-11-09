import React, { useEffect, useState } from 'react';
import { getTaskStats, getTaskTrend, type TaskStatsPeriod } from '../api/shell';
import type { Task } from '../types';

type Result = { trend: Awaited<ReturnType<typeof getTaskTrend>>; stats: Awaited<ReturnType<typeof getTaskStats>> };

/** The installed APP and desktop share the same range, API and chart. */
export const TaskTrendCard: React.FC<{ projectId?: string; tasks: Task[] }> = ({ projectId = 'all', tasks }) => {
  const [period, setPeriod] = useState<TaskStatsPeriod>('week');
  const [expanded, setExpanded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; result?: Result; error?: string }>();
  const key = `${projectId}:${period}:${attempt}`;
  useEffect(() => {
    let active = true;
    Promise.all([getTaskTrend(period, projectId), getTaskStats(period, projectId)])
      .then(([trend, stats]) => { if (active) setLoaded({ key, result: { trend, stats } }); })
      .catch(error => { if (active) setLoaded({ key, error: error instanceof Error ? error.message : '趋势加载失败' }); });
    return () => { active = false; };
  }, [key, period, projectId, tasks]);
  const state = loaded?.key === key ? loaded : undefined;
  const series = state?.result?.trend.series || [];
  const stats = state?.result?.stats;
  const max = Math.max(1, ...series.flatMap(day => [day.created, day.completed]));
  const totals = series.reduce((sum, day) => ({ created: sum.created + day.created, completed: sum.completed + day.completed }), { created: 0, completed: 0 });
  return <section aria-label="任务趋势" className="rounded-[var(--radius-ink-card)] border border-outline-variant bg-surface-container-lowest dark:bg-surface-container p-4 min-w-0 text-on-surface">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-medium tabular-nums">任务趋势</h2>
      <div className="flex gap-1" aria-label="趋势周期">{(['week', 'month', ...(expanded ? ['quarter'] : [])] as TaskStatsPeriod[]).map(value => <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)} className={`min-h-[44px] px-3 text-xs rounded-lg ${period === value ? 'bg-primary-container text-primary font-medium' : 'text-on-surface-variant'}`}>{value === 'week' ? '本周' : value === 'month' ? '本月' : '本季度'}</button>)}</div>
    </div>
    <p className="text-xs text-on-surface-variant">{projectId === 'all' ? '全部可见任务' : '当前项目及个人待办'} · 按每天实际新增与完成统计</p>
    {!state ? <p role="status" className="py-5 text-sm text-on-surface-variant">正在同步趋势…</p> : state.error ? <div role="alert" className="py-3 text-sm text-error">趋势加载失败<button type="button" onClick={() => setAttempt(n => n + 1)} className="min-h-[44px] px-3 underline">重试</button></div> : <>
      <div className="flex gap-4 mt-3 text-xs"><span className="text-primary">完成 {totals.completed}</span><span className="text-on-surface-variant">新增 {totals.created}</span></div>
      <div role="img" aria-label={`新增与完成趋势：${series[0]?.date || ''}至${series.at(-1)?.date || ''}，新增${totals.created}，完成${totals.completed}`} className="mt-3">
        <svg viewBox="0 0 320 112" className="w-full h-28" preserveAspectRatio="none" aria-hidden="true">
          {[0, 1, 2, 3].map((line) => <line key={line} x1="0" x2="320" y1={12 + line * 28} y2={12 + line * 28} stroke="currentColor" className="text-outline-variant" strokeWidth="1" />)}
          {series.length > 1 && <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="3 3"
            className="text-on-surface-variant"
            points={series.map((day, index) => {
              const x = series.length === 1 ? 160 : (index / (series.length - 1)) * 320;
              const y = 100 - (day.created / max) * 88;
              return `${x},${y}`;
            }).join(' ')}
          />}
          {series.map((day, index) => {
            const x = series.length === 1 ? 160 : (index / (series.length - 1)) * 320;
            const y = 100 - (day.completed / max) * 88;
            return <circle key={day.date} cx={x} cy={y} r="2.5" fill="currentColor" className="text-primary" />;
          })}
          {series.length > 1 && <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary"
            points={series.map((day, index) => {
              const x = series.length === 1 ? 160 : (index / (series.length - 1)) * 320;
              const y = 100 - (day.completed / max) * 88;
              return `${x},${y}`;
            }).join(' ')}
          />}
        </svg>
        <div className="flex justify-between mt-1 text-xs text-on-surface-variant"><span>{series[0]?.date.slice(5)}</span><span>{series.at(-1)?.date.slice(5)}</span></div>
      </div>
      {totals.created === 0 && totals.completed === 0 && <p className="mt-2 text-xs text-on-surface-variant">这个周期暂无新增或完成记录</p>}
      {expanded && stats && <div className="mt-3 space-y-2 text-xs text-on-surface-variant">
        <p>本周期新建 {stats.total} 项：待办 {stats.pending} · 进行中 {stats.in_progress} · 已完成 {stats.completed}，其中未完成且逾期 {stats.overdue} 项。</p>
        <p>上方完成数包含以前创建、本周期完成的任务；首页卡片包含所有日期的任务，因此数量可能不同。</p>
        <div className="max-h-48 overflow-auto" tabIndex={0} aria-label="每日趋势明细">{series.map(day => <p key={day.date} className="py-1">{day.date}　新增 {day.created} / 完成 {day.completed}</p>)}</div>
      </div>}
    </>}
    <button type="button" aria-expanded={expanded} onClick={() => { if (expanded && period === 'quarter') setPeriod('week'); setExpanded(!expanded); }} className="min-h-[44px] mt-1 text-xs text-primary">{expanded ? '收起统计详情' : '展开统计详情'}</button>
  </section>;
};
