import assert from 'node:assert/strict'
import { sortCardTasks, summarizeCardTasks, extraRootIds, cardTaskChip, cardOverdueCount } from '../src/api/mappers'
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

// cardTaskChip: 逾期 1 天/2 天、今天、未来、无日期、已完成
assert.deepEqual(cardTaskChip(item('o1', '2026-11-02'), today), { text: '逾期 1 天', tone: 'over' })
assert.deepEqual(cardTaskChip(item('o1', '2026-11-02'), today, 'en'), { text: 'Overdue 1 d', tone: 'over' })
assert.deepEqual(cardTaskChip(item('o2', '2026-11-01'), today), { text: '逾期 2 天', tone: 'over' })
assert.deepEqual(cardTaskChip(item('o2', '2026-11-01'), today, 'en'), { text: 'Overdue 2 d', tone: 'over' })
assert.deepEqual(cardTaskChip(item('t0', '2026-11-03'), today), { text: '今天', tone: 'today' })
assert.deepEqual(cardTaskChip(item('t0', '2026-11-03'), today, 'en'), { text: 'Today', tone: 'today' })
assert.deepEqual(cardTaskChip(item('f1', '2026-11-10'), today), { text: '11/10', tone: 'normal' })
assert.deepEqual(cardTaskChip(item('nd', ''), today), { text: '无日期', tone: 'none' })
assert.deepEqual(cardTaskChip(item('nd', ''), today, 'en'), { text: 'No date', tone: 'none' })
assert.deepEqual(cardTaskChip(item('dn', '2026-11-01', 'Done'), today), { text: '已完成', tone: 'done' })
assert.deepEqual(cardTaskChip(item('dn', '2026-11-01', 'Done'), today, 'en'), { text: 'Done', tone: 'done' })

// cardOverdueCount
assert.equal(cardOverdueCount(sorted, today), 2)
assert.equal(cardOverdueCount([], today), 0)
assert.equal(cardOverdueCount([item('done', '2026-10-01', 'Done')], today), 0)

console.log('axis card tasks: sorting and summary cases passed')

