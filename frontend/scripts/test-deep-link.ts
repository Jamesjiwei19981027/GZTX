/**
 * 最小深链：`?view=` / `?taskId=`。
 *
 * 单壳 SPA 没有 Router，视图切换此前完全不进地址栏：刷新回到仪表盘、也没法分享某个任务。
 */
import assert from 'node:assert/strict'
import { isViewMode, readDeepLink } from '../src/utils/deepLink'

let count = 0
function check(actual: unknown, expected: unknown, label: string) {
  assert.deepEqual(actual, expected, label)
  count += 1
}

// 视图白名单：未知值一律忽略，避免 ?view=<script> 之类进状态机
check(isViewMode('kanban'), true, '合法视图')
check(isViewMode('people-axis'), true, '带连字符的视图')
check(isViewMode('nope'), false, '未知视图')
check(isViewMode(''), false, '空串')
check(isViewMode(null), false, 'null')

// 解析（显式传 search，不依赖 window）
check(readDeepLink('?view=kanban'), { view: 'kanban' }, '仅视图')
check(readDeepLink('?taskId=42'), { taskId: '42' }, '仅任务')
check(
  readDeepLink('?view=calendar&taskId=7'),
  { view: 'calendar', taskId: '7' },
  '视图 + 任务',
)
check(readDeepLink('?view=bogus&taskId=7'), { taskId: '7' }, '非法视图被丢弃')
check(readDeepLink(''), {}, '空 search')
check(readDeepLink('?other=1'), {}, '无关参数')
check(readDeepLink('?taskId=%20%20'), {}, '空白 taskId 视为无')
check(readDeepLink('?invite=abc&view=team'), { view: 'team' }, '与邀请参数共存')
check(readDeepLink('?view=ai'), { view: 'reports' }, '旧 AI 入口映射到工作助手')
check(readDeepLink('?view=me-knowledge'), { view: 'knowledge' }, '旧个人知识链接直达知识')

console.log(`deep link: ${count} assertions passed`)
