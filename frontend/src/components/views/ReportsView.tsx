import React, { useEffect, useState } from 'react';
import { Task, Language } from '../../types';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { getTaskStats, getTaskTrend } from '../../api/shell';

interface ReportsViewProps {
  tasks: Task[];
  lang: Language;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ tasks, lang }) => {
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'quarter'>('month');
  const [trendData, setTrendData] = useState<{ name: string; created: number; completed: number }[]>([]);
  const [serverStats, setServerStats] = useState<{ total: number; completed: number; pending: number; in_progress: number; overdue: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await getTaskTrend(timeRange);
        if (cancelled) return;
        setTrendData(
          (res.series || []).map((s) => ({
            name: s.date.slice(5),
            created: s.created,
            completed: s.completed,
          })),
        );
      } catch {
        // 回退：按任务 created/completed 本地聚合
        const days = timeRange === 'week' ? 7 : 30;
        const buckets: Record<string, { created: number; completed: number }> = {};
        const now = new Date();
        for (let i = days - 1; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          const key = d.toISOString().slice(5, 10);
          buckets[key] = { created: 0, completed: 0 };
        }
        tasks.forEach((t) => {
          if (t.completedAt) {
            const k = t.completedAt.slice(5, 10);
            if (buckets[k]) buckets[k].completed += 1;
          }
        });
        if (!cancelled) {
          setTrendData(
            Object.entries(buckets).map(([name, v]) => ({ name, ...v })),
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [timeRange, tasks]);

  useEffect(() => {
    let cancelled = false;
    void getTaskStats(timeRange === 'week' ? 'week' : timeRange === 'quarter' ? 'month' : 'month')
      .then((stats) => { if (!cancelled) setServerStats(stats); })
      .catch(() => { if (!cancelled) setServerStats(null); });
    return () => { cancelled = true; };
  }, [timeRange]);

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

  // Category distribution for PieChart
  const categories = ['Work', 'Health', 'Personal', 'Shopping', 'Documentation'] as const;
  const categoryColors: Record<string, string> = {
    Work: '#0058be',
    Health: '#006c49',
    Personal: '#b58300',
    Shopping: '#00639b',
    Documentation: '#93000a',
  };

  const pieData = categories
    .map((cat) => {
      const count = tasks.filter((t) => t.category === cat).length;
      return {
        name:
          lang === 'zh'
            ? cat === 'Work'
              ? '工作研发'
              : cat === 'Health'
              ? '运动健康'
              : cat === 'Personal'
              ? '个人事务'
              : cat === 'Shopping'
              ? '采购清单'
              : '文档资料'
            : cat,
        value: count,
        color: categoryColors[cat],
      };
    })
    .filter((d) => d.value > 0);

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

  return (
    <div className="space-y-8 animate-in pb-12">
      {/* Header & Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-container-low p-6 rounded-3xl border border-outline-variant/30 shadow-xs">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-3xl">analytics</span>
            {lang === 'zh' ? '全景数据与效率统计报告' : 'Productivity & Analytics Reports'}
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {lang === 'zh'
              ? '实时监控团队任务流转周期、工时负载与项目健康度指标'
              : 'Real-time monitoring of cycle times, workload distribution, and project health metrics.'}
          </p>
        </div>

        <div className="flex items-center bg-surface-container-highest p-1 rounded-2xl border border-outline-variant/40 self-start sm:self-auto">
          {(['week', 'month', 'quarter'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                timeRange === range
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {range === 'week'
                ? lang === 'zh'
                  ? '近7天'
                  : '7 Days'
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

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface-container-lowest p-6 rounded-3xl border border-outline-variant/30 shadow-xs relative overflow-hidden group hover:border-primary/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              {lang === 'zh' ? '总任务体量' : 'Total Tasks'}
            </span>
            <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <span className="material-symbols-outlined">dataset</span>
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-on-surface">{totalTasks}</span>
            <span className="text-xs text-on-surface-variant">
              {lang === 'zh' ? '统计周期内' : 'in period'}
            </span>
          </div>
          <div className="mt-3 w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden">
            <div className="bg-primary h-full rounded-full" style={{ width: '100%' }} />
          </div>
        </div>

        <div className="bg-surface-container-lowest p-6 rounded-3xl border border-outline-variant/30 shadow-xs relative overflow-hidden group hover:border-primary/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              {lang === 'zh' ? '全局交付率' : 'Completion Rate'}
            </span>
            <div className="w-10 h-10 rounded-2xl bg-tertiary/10 text-tertiary flex items-center justify-center">
              <span className="material-symbols-outlined">task_alt</span>
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-on-surface">{completionRate}%</span>
            <span className="text-xs text-on-surface-variant">
              ({completedTasks} / {totalTasks} {lang === 'zh' ? '项完成' : 'done'})
            </span>
          </div>
          <div className="mt-3 w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-tertiary h-full rounded-full transition-all duration-500"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>

        <div className="bg-surface-container-lowest p-6 rounded-3xl border border-outline-variant/30 shadow-xs relative overflow-hidden group hover:border-primary/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              {lang === 'zh' ? '执行中待办' : 'In Progress'}
            </span>
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <span className="material-symbols-outlined">pending_actions</span>
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-on-surface">{inProgressTasks}</span>
            <span className="text-xs text-on-surface-variant">
              + {todoTasks} {lang === 'zh' ? '项待启动' : 'to do'}
            </span>
          </div>
          <div className="mt-3 w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-amber-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${(inProgressTasks / (totalTasks || 1)) * 100}%` }}
            />
          </div>
        </div>

        <div className="bg-surface-container-lowest p-6 rounded-3xl border border-outline-variant/30 shadow-xs relative overflow-hidden group hover:border-primary/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              {lang === 'zh' ? '逾期任务' : 'Overdue Tasks'}
            </span>
            <div className="w-10 h-10 rounded-2xl bg-error/10 text-error flex items-center justify-center">
              <span className="material-symbols-outlined">warning</span>
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-error">{overdueTasks}</span>
            <span className="text-xs font-semibold text-error/80">
              {lang === 'zh' ? '需要优先处理' : 'Needs attention'}
            </span>
          </div>
          <div className="mt-3 w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-error h-full rounded-full transition-all duration-500"
              style={{ width: `${(overdueTasks / (totalTasks || 1)) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Area Chart - Two Columns */}
        <div className="lg:col-span-2 bg-surface-container-lowest p-6 rounded-3xl border border-outline-variant/30 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">show_chart</span>
                {lang === 'zh' ? '任务创生与交付燃尽趋势 (Burndown Trend)' : 'Task Creation vs Completion Trend'}
              </h3>
              <span className="text-xs px-3 py-1 rounded-full bg-primary/10 text-primary font-semibold">
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
                <defs>
                  <linearGradient id="colorCreated" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0058be" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#0058be" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00639b" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#00639b" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#79747e" fontSize={12} tickLine={false} />
                <YAxis stroke="#79747e" fontSize={12} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-surface-container-highest-val)',
                    borderRadius: '16px',
                    border: '1px solid var(--color-outline-variant-val)',
                    color: 'var(--color-on-surface-val)',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                  }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }} />
                <Area
                  type="monotone"
                  dataKey="created"
                  name={lang === 'zh' ? '新增创建需求' : 'Created Tasks'}
                  stroke="#0058be"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorCreated)"
                />
                <Area
                  type="monotone"
                  dataKey="completed"
                  name={lang === 'zh' ? '完成闭环验收' : 'Completed Tasks'}
                  stroke="#00639b"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorCompleted)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Distribution Pie Chart */}
        <div className="bg-surface-container-lowest p-6 rounded-3xl border border-outline-variant/30 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-on-surface flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-tertiary">pie_chart</span>
              {lang === 'zh' ? '领域分类权重' : 'Category Distribution'}
            </h3>
            <p className="text-xs text-on-surface-variant mb-4">
              {lang === 'zh' ? '工作与生活各大模块任务分布比例' : 'Task count breakdown across active categories.'}
            </p>
          </div>

          <div className="h-60 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-surface-container-highest-val)',
                    borderRadius: '12px',
                    border: 'none',
                    color: 'var(--color-on-surface-val)',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-2 mt-4">
            {pieData.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="font-medium text-on-surface">{item.name}</span>
                </div>
                <span className="font-bold text-on-surface-variant">
                  {item.value} {lang === 'zh' ? '项' : 'items'} ({Math.round((item.value / (totalTasks || 1)) * 100)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Team Workload Bar Chart */}
      <div className="bg-surface-container-lowest p-6 rounded-3xl border border-outline-variant/30 shadow-xs">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">groups</span>
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
              <XAxis dataKey="name" stroke="#79747e" fontSize={12} tickLine={false} />
              <YAxis stroke="#79747e" fontSize={12} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-surface-container-highest-val)',
                  borderRadius: '16px',
                  border: '1px solid var(--color-outline-variant-val)',
                  color: 'var(--color-on-surface-val)',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              <Bar dataKey="待办执行" name={lang === 'zh' ? '执行中待办' : 'Active Tasks'} stackId="a" fill="#0058be" radius={[0, 0, 4, 4]} />
              <Bar dataKey="已完成" name={lang === 'zh' ? '已完成归档' : 'Completed'} stackId="a" fill="#00639b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
