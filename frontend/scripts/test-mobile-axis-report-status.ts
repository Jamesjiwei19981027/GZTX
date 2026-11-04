import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { latestReportByUser, reportStatusLabel, reportStatusTone, type AgentReport } from '../src/api/reports'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const mockReports: AgentReport[] = [
  {
    id: 1,
    binding_id: 101,
    author_user_id: 10,
    status: 'draft',
    summary_text: '草稿',
    source_count: 3,
    created_at: '2026-11-01T08:00:00Z',
  },
  {
    id: 2,
    binding_id: 102,
    author_user_id: 20,
    status: 'submitted',
    summary_text: '昨日汇报',
    submitted_at: '2026-11-02T10:00:00Z',
  },
  {
    id: 3,
    binding_id: 102,
    author_user_id: 20,
    status: 'submitted',
    summary_text: '今日最新汇报',
    submitted_at: '2026-11-03T14:30:00Z',
  },
  {
    id: 4,
    binding_id: 103,
    author_user_id: 30,
    status: 'draft',
    summary_text: '无来源数的草稿',
    sources: [{ source_type: 'task', source_id: 1 }, { source_type: 'commit', source_id: 2 }],
    created_at: '2026-11-03T09:00:00Z',
  },
]

// 1. latestReportByUser
assert.equal(latestReportByUser(mockReports, 999), null)
assert.equal(latestReportByUser(mockReports, null), null)

const user10 = latestReportByUser(mockReports, 10)
assert.equal(user10?.id, 1)

const user20 = latestReportByUser(mockReports, '20')
assert.equal(user20?.id, 3)

const user30 = latestReportByUser(mockReports, 30)
assert.equal(user30?.id, 4)

// 2. reportStatusLabel
assert.equal(reportStatusLabel(null), '暂无汇报')
assert.equal(reportStatusLabel(undefined), '暂无汇报')

assert.equal(reportStatusLabel(user10), '草稿待提交 · 3 条来源')
assert.equal(reportStatusLabel(user30), '草稿待提交 · 2 条来源')

const submittedLabel = reportStatusLabel(user20)
assert.match(submittedLabel, /^\d{2}-\d{2} \d{2}:\d{2} 已提交$/)

// 2b. reportStatusTone：已提交绿色对勾，草稿蓝色文件，暂无汇报灰色无图标
const toneNone = reportStatusTone(null)
assert.equal(toneNone.kind, 'none')
assert.equal(toneNone.iconName, null)
assert.match(toneNone.textClass, /slate/)
assert.doesNotMatch(toneNone.textClass, /emerald|green/)
const toneDraft = reportStatusTone(user10)
assert.equal(toneDraft.kind, 'draft')
assert.equal(toneDraft.iconName, 'file')
assert.match(toneDraft.textClass, /blue/)
const toneSubmitted = reportStatusTone(user20)
assert.equal(toneSubmitted.kind, 'submitted')
assert.equal(toneSubmitted.iconName, 'check-circle')
assert.match(toneSubmitted.textClass, /emerald/)

// 3. 源码断言确认 MobileAxisScreens.tsx 里不再含「14:30」「4 条来源」「70%」字样
const screensFilePath = path.resolve(__dirname, '../src/mobile/features/people-axis/MobileAxisScreens.tsx')
const screensSource = fs.readFileSync(screensFilePath, 'utf-8')

assert.equal(screensSource.includes('14:30'), false, 'MobileAxisScreens.tsx 不应再包含 14:30')
assert.equal(screensSource.includes('4 条来源'), false, 'MobileAxisScreens.tsx 不应再包含 4 条来源')
assert.equal(screensSource.includes('70%'), false, 'MobileAxisScreens.tsx 不应再包含 70%')

console.log('Mobile axis report status and source assertions PASSED')
