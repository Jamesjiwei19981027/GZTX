import React from 'react';
import type { Language } from '../types';
import type { TaskWorkspaceScope } from '../utils/taskWorkspace';

/** One task area with board/list presentations and infrequent recovery tools. */
export function TaskWorkspaceToolbar({ view, scope, onViewChange, onScopeChange, onOpenTrash, lang = 'zh' }: {
  view: 'kanban' | 'tasks'; scope: TaskWorkspaceScope;
  onViewChange: (view: 'kanban' | 'tasks') => void;
  onScopeChange: (scope: TaskWorkspaceScope) => void;
  onOpenTrash: () => void; lang?: Language;
}) {
  return <div className="shrink-0 flex flex-wrap items-center gap-2 p-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
    <div role="tablist" aria-label="任务视图" className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
      {([{ id: 'kanban', label: lang === 'zh' ? '任务看板' : 'Board' }, { id: 'tasks', label: lang === 'zh' ? '任务列表' : 'List' }] as const).map(item =>
        <button key={item.id} type="button" role="tab" aria-selected={view === item.id} onClick={() => onViewChange(item.id)}
          className={`min-h-[40px] px-3 rounded-lg text-sm font-medium ${view === item.id ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs' : 'text-slate-500 dark:text-slate-400'}`}>{item.label}</button>)}
    </div>
    <select aria-label="任务范围" value={scope} onChange={event => onScopeChange(event.target.value as TaskWorkspaceScope)}
      className="min-h-[44px] min-w-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-2 text-xs text-slate-700 dark:text-slate-200">
      <option value="all">{lang === 'zh' ? '全部任务' : 'All tasks'}</option>
      <option value="pending">{lang === 'zh' ? '未完成' : 'Pending'}</option>
      <option value="today">{lang === 'zh' ? '今日到期' : 'Due today'}</option>
      <option value="overdue">{lang === 'zh' ? '已逾期' : 'Overdue'}</option>
    </select>
    <details className="relative ml-auto">
      <summary aria-label="任务更多操作" className="list-none cursor-pointer min-h-[44px] px-2 flex items-center justify-center text-sm text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">{lang === 'zh' ? '更多' : 'More'}</summary>
      <div className="absolute right-0 top-full z-40 min-w-[150px] p-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
        <button type="button" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onOpenTrash(); }}
          className="min-h-[44px] w-full text-left px-3 text-sm text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">{lang === 'zh' ? '回收站' : 'Recycle bin'}</button>
      </div>
    </details>
  </div>;
}
