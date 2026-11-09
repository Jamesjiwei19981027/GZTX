import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Project, Task } from '../types';
import { getProjectTree, type BackendTreeNode } from '../api/backend';

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const parseDay = (value: string) => new Date(`${value}T12:00:00`);
type ProgressSummary = { percent: number; total: number; completed: number; overdue: number; next?: string };

function summarize(nodes: BackendTreeNode[]): ProgressSummary {
  const items: BackendTreeNode[] = [];
  const walk = (nodes: BackendTreeNode[]) => nodes.forEach(node => {
    if (node.node_type_key === 'work_item' || node.node_type_key === 'milestone') items.push(node);
    walk(node.children || []);
  });
  walk(nodes);
  const percent = (node: BackendTreeNode) => ['done','completed','reached'].includes(node.progress_json?.status || '')
    ? 100 : Math.max(0,Math.min(100,Number(node.progress_json?.percent) || 0));
  const pending = items.filter(node => percent(node) < 100);
  const deadline = (node: BackendTreeNode) => node.due_at || node.milestone_at;
  const upcoming = pending.filter(deadline).sort((a,b) => String(deadline(a)).localeCompare(String(deadline(b))));
  return {
    total: items.length, completed: items.length-pending.length,
    percent: items.length ? Math.round(items.reduce((sum,node)=>sum+percent(node),0)/items.length) : 0,
    overdue: pending.filter(node => deadline(node) && new Date(deadline(node)!).getTime() < Date.now()).length,
    next: upcoming[0]?.title,
  };
}

export const WorkbenchOverview: React.FC<{
  tasks: Task[]; projects: Project[]; currentProject: Project;
  onSelectTask: (task: Task) => void; onOpenCalendar?: () => void;
  onEditScheduledTask?: (task: Task) => void;
  onOpenNewTaskWithDate?: (date: string) => void;
  onOpenProject?: (project: Project) => void;
}> = ({ tasks, projects, currentProject, onSelectTask, onOpenCalendar, onOpenProject, onEditScheduledTask, onOpenNewTaskWithDate }) => {
  const today = dateKey(new Date());
  const [selected, setSelected] = useState(today);
  const [displayMonth, setDisplayMonth] = useState(today.slice(0, 7));
  const lastTap = useRef<{ day: string; at: number } | null>(null);
  const [summaries, setSummaries] = useState<Record<string, ProgressSummary>>({});
  const [failed, setFailed] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const projectIds = JSON.stringify((currentProject.id === 'all' ? projects : [currentProject])
    .filter(project => Number(project.id) > 0).map(project => String(project.id)));
  const visibleProjects = (currentProject.id === 'all' ? projects : [currentProject]).filter(p => Number(p.id) > 0);
  useEffect(() => {
    let active = true;
    const ids: string[] = JSON.parse(projectIds);
    setSummaries({}); setFailed([]); setLoading(true);
    Promise.allSettled(ids.map(async id => ({ id, summary: summarize((await getProjectTree(Number(id))).nodes) })))
      .then(results => {
        if (!active) return;
        const next: Record<string, ProgressSummary> = {}, errors: string[] = [];
        results.forEach((result,i) => {
          if (result.status === 'fulfilled') next[result.value.id] = result.value.summary;
          else errors.push(ids[i]);
        });
        setSummaries(next); setFailed(errors); setLoading(false);
      });
    return () => { active = false; };
  }, [projectIds, attempt]);
  const days = useMemo(() => {
    const start = parseDay(`${displayMonth}-01`);
    start.setDate(1);
    const end = new Date(start.getFullYear(), start.getMonth()+1, 0);
    const length = Math.ceil(((start.getDay()+6)%7 + end.getDate())/7)*7;
    start.setDate(start.getDate()-(start.getDay()+6)%7);
    return Array.from({length},(_,i)=>{const day=new Date(start);day.setDate(start.getDate()+i);return dateKey(day);});
  }, [displayMonth]);
  const scheduledTasks = tasks.filter(task => task.dueDate === selected)
    .sort((a,b)=>(a.dueTime || '23:59').localeCompare(b.dueTime || '23:59'));
  const selectDay = (day: string) => {
    const previous = lastTap.current;
    const at = performance.now();
    setSelected(day);
    if (previous?.day === day && at - previous.at < 400) {
      lastTap.current = null;
      onOpenNewTaskWithDate?.(day);
    } else lastTap.current = { day, at };
  };
  const moveMonth = (delta: number) => { const day=parseDay(`${displayMonth}-01`);day.setMonth(day.getMonth()+delta);setDisplayMonth(dateKey(day).slice(0,7));setSelected(dateKey(day));lastTap.current=null; };
  return <div className="flex flex-col gap-4">
    <section aria-label="首页日程日历" className="rounded-[var(--radius-ink-card)] border border-outline-variant bg-surface-container-lowest dark:bg-surface-container p-4 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-base font-medium text-on-surface tabular-nums">日程日历</h2>
        <div className="flex items-center gap-1 text-xs text-primary">
          <button type="button" className="min-h-[44px] px-2" onClick={()=>{setSelected(today);setDisplayMonth(today.slice(0,7));lastTap.current=null;}}>今天</button>
          {onOpenCalendar && <button type="button" className="min-h-[44px] px-2" onClick={onOpenCalendar}>完整日历</button>}
        </div>
      </div>
      <div className="flex items-center justify-between mb-2 text-sm text-on-surface">
        <button type="button" aria-label="上个月" className="min-h-[44px] min-w-[44px] rounded-lg" onClick={()=>moveMonth(-1)}>‹</button>
        <span>{parseDay(`${displayMonth}-01`).getFullYear()}年{parseDay(`${displayMonth}-01`).getMonth()+1}月</span>
        <button type="button" aria-label="下个月" className="min-h-[44px] min-w-[44px] rounded-lg" onClick={()=>moveMonth(1)}>›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1" aria-hidden="true">{['一','二','三','四','五','六','日'].map(label=><span key={label} className="text-center text-xs text-on-surface-variant py-2">{label}</span>)}</div>
      <div className="grid grid-cols-7 gap-1" data-testid="home-month-calendar">
        {days.map(day=> <button key={day} type="button" aria-label={day} aria-pressed={day===selected}
          onClick={()=>selectDay(day)} style={{touchAction:'manipulation'}} className={`min-h-[48px] min-w-0 rounded-[var(--radius-ink-control)] flex flex-col items-center justify-center gap-1 text-xs ${day===selected ? 'bg-primary text-on-primary' : day.slice(0,7)===displayMonth ? 'text-on-surface bg-surface-container-low' : 'text-on-surface-variant'}`}>
          <span className="text-sm font-medium tabular-nums">{parseDay(day).getDate()}</span>
          <span className={`h-1 w-1 rounded-full ${tasks.some(task=>task.dueDate===day) ? day===selected ? 'bg-on-primary' : 'bg-primary' : 'bg-transparent'}`} />
        </button>)}
      </div>
      <div className="mt-3 space-y-1 text-sm" aria-live="polite">
        <div className="flex items-center justify-between gap-2"><p className="text-xs text-on-surface-variant">{selected} · {scheduledTasks.length} 项安排</p>
          {onOpenNewTaskWithDate && <button type="button" onClick={()=>onOpenNewTaskWithDate(selected)} className="min-h-[44px] text-xs text-primary">添加当天日程</button>}</div>
        <p className="text-xs text-on-surface-variant">单击日期查看，双击新增日程；点击时间或任务修改，过去日期也可补录</p>
        {!scheduledTasks.length ? <p className="text-on-surface-variant py-2">当天暂无日程</p> : scheduledTasks.map(task=><button
          type="button" key={task.id} onClick={()=>(onEditScheduledTask || onSelectTask)(task)} className="w-full min-h-[44px] text-left flex items-center gap-3 rounded-lg px-2 hover:bg-surface-container-low text-on-surface">
          <span className="text-primary text-xs shrink-0">{task.dueTime || '全天'}</span>
          <span className={`truncate flex-1 ${task.status==='Done' ? 'ink-done' : ''}`}>{task.title}</span>
          {task.status==='Done' && <span className="text-xs text-secondary">已完成</span>}
        </button>)}
      </div>
    </section>
    <section aria-label="项目进度简介" className="rounded-[var(--radius-ink-card)] border border-outline-variant bg-surface-container-lowest dark:bg-surface-container p-4 min-w-0">
      <h2 className="text-base font-medium text-on-surface tabular-nums">项目进度简介</h2>
      <p className="text-xs text-on-surface-variant mt-1 mb-3">根据项目人轴事项与里程碑的正式进度汇总</p>
      {loading && <p role="status" className="text-sm text-on-surface-variant">正在同步项目进度…</p>}
      {!loading && !visibleProjects.length && <p className="text-sm text-on-surface-variant">暂无可见项目</p>}
      <div className="space-y-4">
        {visibleProjects.map(project=>{
          const summary=summaries[project.id];
          return <article key={project.id} className="space-y-2 text-on-surface">
            <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-medium truncate tabular-nums">{project.name}</h3>
              {summary && <span className="text-sm font-medium text-primary tabular-nums">{summary.total ? `${summary.percent}%` : '暂无事项'}</span>}
            </div>
            {summary && <>
              <div role="progressbar" aria-label={`${project.name}进度`} aria-valuenow={summary.percent} aria-valuemin={0} aria-valuemax={100} className="h-2 rounded-full bg-surface-container overflow-hidden"><div className="h-full rounded-md bg-primary " style={{width:`${summary.percent}%`}} /></div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-on-surface-variant"><span>已完成 {summary.completed} / {summary.total} 项</span>
                <span className={summary.overdue ? 'text-error' : ''}>逾期 {summary.overdue} 项</span></div>
              {summary.next && <p className="text-xs text-on-surface-variant">待推进：{summary.next}</p>}
              {onOpenProject && <button type="button" onClick={()=>onOpenProject(project)} className="min-h-[44px] text-xs text-primary">查看项目详情</button>}
            </>}
            {failed.includes(project.id) && <button type="button" onClick={()=>setAttempt(value=>value+1)} className="min-h-[44px] text-sm text-error">进度加载失败，点击重试</button>}
          </article>;
        })}
      </div>
    </section>
  </div>;
};
