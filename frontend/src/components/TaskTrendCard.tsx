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
  return <section aria-label="任务趋势" className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 min-w-0 text-slate-900 dark:text-slate-100">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">任务趋势</h2>
      <div className="flex gap-1" aria-label="趋势周期">{(['week', 'month', ...(expanded ? ['quarter'] : [])] as TaskStatsPeriod[]).map(value => <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)} className={`min-h-[44px] px-3 text-xs rounded-xl ${period === value ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-semibold' : 'text-slate-500'}`}>{value === 'week' ? '本周' : value === 'month' ? '本月' : '本季度'}</button>)}</div>
    </div>
    <p className="text-xs text-slate-500 dark:text-slate-400">{projectId === 'all' ? '全部可见任务' : '当前项目及个人待办'} · 按每天实际新增与完成统计</p>
    {!state ? <p role="status" className="py-5 text-sm text-slate-500">正在同步趋势…</p> : state.error ? <div role="alert" className="py-3 text-sm text-red-600 dark:text-red-300">趋势加载失败<button type="button" onClick={() => setAttempt(n => n + 1)} className="min-h-[44px] px-3 underline">重试</button></div> : <>
      <div className="flex gap-4 mt-3 text-xs"><span className="text-blue-700 dark:text-blue-300">新增 {totals.created}</span><span className="text-emerald-700 dark:text-emerald-300">完成 {totals.completed}</span></div>
      <div role="img" aria-label={`新增与完成趋势：${series[0]?.date || ''}至${series.at(-1)?.date || ''}，新增${totals.created}，完成${totals.completed}`} className="mt-3">
        <div className="h-24 flex items-end gap-0.5 border-b border-slate-200 dark:border-slate-700">
          {series.map(day => <div key={day.date} title={`${day.date}：新增 ${day.created}，完成 ${day.completed}`} className="flex-1 min-w-0 h-full flex items-end justify-center gap-px">
            <span className="bg-blue-600 rounded-t-sm w-1/2 max-w-4" style={{ height: `${day.created / max * 100}%` }} />
            <span className="bg-emerald-500 rounded-t-sm w-1/2 max-w-4" style={{ height: `${day.completed / max * 100}%` }} />
          </div>)}
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-slate-500"><span>{series[0]?.date.slice(5)}</span><span>{series.at(-1)?.date.slice(5)}</span></div>
      </div>
      {totals.created === 0 && totals.completed === 0 && <p className="mt-2 text-xs text-slate-500">这个周期暂无新增或完成记录</p>}
      {expanded && stats && <div className="mt-3 space-y-2 text-xs text-slate-600 dark:text-slate-300">
        <p>本周期新建 {stats.total} 项：待办 {stats.pending} · 进行中 {stats.in_progress} · 已完成 {stats.completed}，其中未完成且逾期 {stats.overdue} 项。</p>
        <p>上方完成数包含以前创建、本周期完成的任务；首页卡片包含所有日期的任务，因此数量可能不同。</p>
        <div className="max-h-48 overflow-auto" tabIndex={0} aria-label="每日趋势明细">{series.map(day => <p key={day.date} className="py-1">{day.date}　新增 {day.created} / 完成 {day.completed}</p>)}</div>
      </div>}
    </>}
    <button type="button" aria-expanded={expanded} onClick={() => { if (expanded && period === 'quarter') setPeriod('week'); setExpanded(!expanded); }} className="min-h-[44px] mt-1 text-xs text-blue-700 dark:text-blue-300">{expanded ? '收起统计详情' : '展开统计详情'}</button>
  </section>;
};
