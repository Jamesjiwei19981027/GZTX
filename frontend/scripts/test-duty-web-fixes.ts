import assert from 'node:assert/strict'
import { supervisorReportStatus, reportStatusLabel, reportStatusTone, type AgentReport } from '../src/api/reports'
import { isWorkItemOverdue, getWorkItemOverdueDays, cardOverdueCount } from '../src/api/mappers'
import type { AxisWorkItem } from '../src/types'

console.log('--- Testing supervisorReportStatus (4 labels) ---')

// 1. 无汇报 -> 暂无汇报
const statusNoReport = supervisorReportStatus([], 10, [20])
assert.equal(statusNoReport.label, '暂无汇报')
assert.equal(statusNoReport.tone.kind, 'none')
assert.equal(statusNoReport.tone.iconName, null)
assert.match(statusNoReport.tone.textClass, /slate/)

// 2. 草稿 -> 沿用 reportStatusLabel (草稿待提交 · N 条来源)
const draftReports: AgentReport[] = [
  {
    id: 1,
    binding_id: 101,
    author_user_id: 10,
    parent_user_id: 20,
    status: 'draft',
    summary_text: '草稿',
    source_count: 2,
    created_at: '2026-11-05T08:00:00Z',
  },
]
const statusDraft = supervisorReportStatus(draftReports, 10, [20])
assert.equal(statusDraft.label, '草稿待提交 · 2 条来源')
assert.equal(statusDraft.tone.kind, 'draft')
assert.equal(statusDraft.tone.iconName, 'file')
assert.match(statusDraft.tone.textClass, /blue/)

// 3. 已提交且未读 -> 已提交 · 领导未读
const submittedUnreadReports: AgentReport[] = [
  {
    id: 2,
    binding_id: 101,
    author_user_id: 10,
    parent_user_id: 20,
    status: 'submitted',
    read: false,
    summary_text: '最新工作汇报',
    submitted_at: '2026-11-05T18:00:00Z',
  },
]
const statusSubmittedUnread = supervisorReportStatus(submittedUnreadReports, 10, [20])
assert.equal(statusSubmittedUnread.label, '已提交 · 领导未读')
assert.equal(statusSubmittedUnread.tone.kind, 'submitted')
assert.equal(statusSubmittedUnread.tone.iconName, 'check-circle')
assert.match(statusSubmittedUnread.tone.textClass, /emerald/)

// 4. 已提交且领导已读 -> 领导已读
const submittedReadReports: AgentReport[] = [
  {
    id: 3,
    binding_id: 101,
    author_user_id: 10,
    parent_user_id: 20,
    status: 'submitted',
    read: true,
    summary_text: '已审批汇报',
    submitted_at: '2026-11-05T19:00:00Z',
  },
]
const statusSubmittedRead = supervisorReportStatus(submittedReadReports, 10, [20])
assert.equal(statusSubmittedRead.label, '领导已读')
assert.equal(statusSubmittedRead.tone.kind, 'submitted')
assert.equal(statusSubmittedRead.tone.iconName, 'check-circle')
assert.match(statusSubmittedRead.tone.textClass, /emerald/)

// 额外检查：parent_user_id 为空也算该领导
const nullParentReports: AgentReport[] = [
  {
    id: 4,
    binding_id: 101,
    author_user_id: 10,
    parent_user_id: null,
    status: 'submitted',
    read: true,
    summary_text: '顶级汇报',
    submitted_at: '2026-11-05T20:00:00Z',
  },
]
const statusNullParent = supervisorReportStatus(nullParentReports, 10, [20])
assert.equal(statusNullParent.label, '领导已读')

console.log('✓ supervisorReportStatus passed all 4 cases and null parent handling')

console.log('--- Testing isWorkItemOverdue (completed, not due, overdue, no due date) ---')

const fixedToday = new Date(2026, 10, 6) // 2026-11-06

// 1. 已完成 (status: 'Done'，虽然 dueDate 是过去日期)
const itemDone: AxisWorkItem = {
  id: 'item-1',
  title: '已完成事项',
  type: 'task',
  status: 'Done',
  progress: 100,
  dueDate: '2026-11-01',
  evidences: [],
}
assert.equal(isWorkItemOverdue(itemDone, fixedToday), false, '已完成事项不应判定为逾期')
assert.equal(getWorkItemOverdueDays(itemDone, fixedToday), 0)

// 2. 未到期 (status: 'In Progress'，dueDate 为未来或今天)
const itemNotDue: AxisWorkItem = {
  id: 'item-2',
  title: '未来事项',
  type: 'task',
  status: 'In Progress',
  progress: 40,
  dueDate: '2026-11-10',
  evidences: [],
}
assert.equal(isWorkItemOverdue(itemNotDue, fixedToday), false, '未到期事项不应判定为逾期')
assert.equal(getWorkItemOverdueDays(itemNotDue, fixedToday), 0)

// 3. 已逾期 (status: 'In Progress'，dueDate 早于今天)
const itemOverdue: AxisWorkItem = {
  id: 'item-3',
  title: '逾期事项',
  type: 'task',
  status: 'In Progress',
  progress: 20,
  dueDate: '2026-11-01',
  evidences: [],
}
assert.equal(isWorkItemOverdue(itemOverdue, fixedToday), true, '过期且未完成事项必须判定为逾期')
assert.equal(getWorkItemOverdueDays(itemOverdue, fixedToday), 5, '逾期天数应为 5 天')

// 4. 无截止日期 (dueDate 为空)
const itemNoDueDate: AxisWorkItem = {
  id: 'item-4',
  title: '无截止日期事项',
  type: 'task',
  status: 'In Progress',
  progress: 10,
  dueDate: '',
  evidences: [],
}
assert.equal(isWorkItemOverdue(itemNoDueDate, fixedToday), false, '无截止日期事项不应判定为逾期')
assert.equal(getWorkItemOverdueDays(itemNoDueDate, fixedToday), 0)

// 5. cardOverdueCount 验证
assert.equal(cardOverdueCount([itemDone, itemNotDue, itemOverdue, itemNoDueDate], fixedToday), 1)

console.log('✓ isWorkItemOverdue passed all 4 cases and overdue days calculation')
console.log('ALL DUTY WEB FIXES UNIT TESTS PASSED!')
