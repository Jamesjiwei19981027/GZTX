import assert from 'node:assert/strict'
import { sortCardTasks, summarizeCardTasks, extraRootIds } from '../src/api/mappers'
import type { AxisWorkItem, PeopleAxisNode } from '../src/types'

const item = (
  id: string,
  dueDate: string,
  status: AxisWorkItem['status'] = 'To Do',
  progress = status === 'Done' ? 100 : 0,
): AxisWorkItem => ({
  id, title: id, type: 'task', status, progress, dueDate, evidences: [],
})
const today = new Date('2026-11-03T00:00:00')
const sorted = sortCardTasks([
  item('done', '2026-11-01', 'Done'),
  item('nodate', ''),
  item('future', '2026-11-10'),
  item('today', '2026-11-03'),
  item('overdue-old', '2026-10-01'),
  item('overdue-yesterday', '2026-11-02'),
  item('progress-done', '2026-10-01', 'In Progress', 100),
], today)

assert.deepEqual(
  sorted.map(x => x.id),
  ['overdue-old', 'overdue-yesterday', 'today', 'future', 'nodate', 'progress-done', 'done'],
)

const summary = summarizeCardTasks(sorted, today)
assert.deepEqual(summary.visible.map(x => x.id), ['overdue-old', 'overdue-yesterday'])
assert.equal(summary.total, 7)
assert.equal(summary.hiddenCount, 5)
assert.deepEqual(summary.overdueIds, new Set(['overdue-old', 'overdue-yesterday']))

const empty = summarizeCardTasks([], today)
assert.deepEqual(empty.visible, [])
assert.equal(empty.total, 0)
assert.equal(empty.hiddenCount, 0)
assert.deepEqual(empty.overdueIds, new Set())

const pNode = (id: string, parentId?: string, orderOnAxis = 0): PeopleAxisNode => ({
  id, parentId, person: { id, name: id, role: 'r', avatar: '' }, orderOnAxis, roleTitle: 'r', workItems: [],
})
assert.deepEqual(extraRootIds([pNode('r1', undefined, 0), pNode('r2', undefined, 1), pNode('c1', 'r1', 2)]), ['r2'])
assert.deepEqual(extraRootIds([pNode('r1', undefined, 0)]), [])

// 同截止日期时 id 按数值比较："9" 在 "10" 前
assert.deepEqual(
  sortCardTasks([item('10', '2026-11-10'), item('9', '2026-11-10')], today).map(x => x.id),
  ['9', '10'],
)

console.log('axis card tasks: sorting and summary cases passed')

