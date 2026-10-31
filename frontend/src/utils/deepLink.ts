import type { ViewMode } from '../types'

/**
 * 最小深链：`?view=` / `?taskId=` 进 history，刷新保持、可分享。
 *
 * 单壳 SPA 没有 React Router，视图切换此前完全不进地址栏：刷新回到仪表盘，
 * 也没法把「某个任务」发给同事。
 */

const VIEW_MODES: ViewMode[] = [
  'dashboard',
  'tasks',
  'kanban',
  'calendar',
  'reports',
  'team',
  'messages',
  'inbox',
  'people-axis',
  'knowledge',
  'notifications',
  'settings',
  'trash',
]

export function isViewMode(value: string | null | undefined): value is ViewMode {
  return !!value && (VIEW_MODES as string[]).includes(value)
}

export type DeepLinkState = { view?: ViewMode; taskId?: string }

/** 读当前地址栏里的深链参数 */
export function readDeepLink(search?: string): DeepLinkState {
  if (typeof window === 'undefined' && search === undefined) return {}
  const params = new URLSearchParams(search ?? window.location.search)
  const rawView = params.get('view')
  const view = rawView === 'ai' ? 'reports' : rawView === 'me-knowledge' ? 'knowledge' : rawView
  const taskId = params.get('taskId')?.trim()
  return {
    ...(isViewMode(view) ? { view } : {}),
    ...(taskId ? { taskId } : {}),
  }
}

/**
 * 把当前视图/任务写进地址栏。
 *
 * `push=false`（默认）用 replaceState，避免每次切视图都塞一条 history；
 * 打开任务详情用 push，浏览器返回键就能关掉抽屉。
 */
export function writeDeepLink(state: DeepLinkState, push = false): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  const params = url.searchParams

  if (state.view && state.view !== 'dashboard') params.set('view', state.view)
  else params.delete('view')

  if (state.taskId) params.set('taskId', state.taskId)
  else params.delete('taskId')

  const next = `${url.pathname}${params.toString() ? `?${params}` : ''}${url.hash}`
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (next === current) return
  if (push) window.history.pushState({}, '', next || '/')
  else window.history.replaceState({}, '', next || '/')
}

/** 分享用绝对链接 */
export function deepLinkUrl(state: DeepLinkState): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const params = new URLSearchParams()
  if (state.view && state.view !== 'dashboard') params.set('view', state.view)
  if (state.taskId) params.set('taskId', state.taskId)
  return `${origin}/${params.toString() ? `?${params}` : ''}`
}
