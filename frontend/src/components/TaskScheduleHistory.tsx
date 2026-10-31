import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api/client';

type Change = { id: number; old_due_date: string | null; new_due_date: string | null; created_at: string };
export const TaskScheduleHistory: React.FC<{ taskId: string; revision?: string }> = ({ taskId, revision }) => {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; rows?: Change[]; error?: boolean }>();
  const key = `${taskId}:${revision}:${attempt}`;
  useEffect(() => {
    if (!open) return;
    let active = true;
    apiRequest<{ items: Change[] }>(`/tasks/${taskId}/schedule-history`)
      .then(data => { if (active) setState({ key, rows: data.items }); })
      .catch(() => { if (active) setState({ key, error: true }); });
    return () => { active = false; };
  }, [taskId, key, open]);
  const current = state?.key === key ? state : undefined;
  const format = (value: string | null) => value ? new Date(value).toLocaleString() : '未设置';
  return <div className="text-xs text-slate-500 dark:text-slate-400">
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="min-h-[44px] text-blue-700 dark:text-blue-300">{open ? '收起日程修改记录' : '查看日程修改记录'}</button>
    {open && <div aria-label="日程修改记录" className="max-h-48 overflow-auto space-y-2">
      {!current ? <p role="status">正在加载…</p> : current.error ? <p role="alert">记录加载失败<button type="button" onClick={() => setAttempt(n => n+1)} className="min-h-[44px] px-2 underline">重试</button></p> : !current.rows?.length ? <p>暂无修改记录；历史记录从本功能启用后开始保留。</p> : <>
        <p>首次记录时间：{format(current.rows[0].old_due_date)}</p>
        {current.rows.map(row => <p key={row.id}>{format(row.created_at)}：{format(row.old_due_date)} → {format(row.new_due_date)}</p>)}
        <p>日程调整不会改写已提交的汇报。</p>
      </>}
    </div>}
  </div>;
};
