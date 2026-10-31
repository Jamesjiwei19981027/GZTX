import type { Task } from '../types';

export type TaskWorkspaceScope = 'all' | 'pending' | 'today' | 'overdue';
export function normalizeTaskWorkspaceScope(value?: string): TaskWorkspaceScope {
  return value === 'pending' || value === 'today' || value === 'overdue' ? value : 'all';
}
export function filterTaskWorkspace(tasks: Task[], scope: TaskWorkspaceScope, now = new Date()): Task[] {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return tasks.filter(task => scope === 'all' || task.status !== 'Done' && (
    scope === 'pending' || scope === 'today' && task.dueDate === today ||
    scope === 'overdue' && !!task.dueDate && task.dueDate < today
  ));
}
