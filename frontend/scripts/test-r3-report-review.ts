import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

Object.assign(globalThis, { localStorage: { getItem: () => null } })
let sent: { url: string; body: unknown; method?: string } | null = null
globalThis.fetch = async (url, init) => {
  sent = { url: String(url), body: JSON.parse(String(init?.body)), method: init?.method }
  return new Response(JSON.stringify({ code: 200, data: { id: 12, review: { decision: 'returned', comment: '补充材料' } } }))
}
const { reviewReport } = await import('../src/api/reports')
const result = await reviewReport(12, 'returned', ' 补充材料 ')
assert.deepEqual(sent, { url: '/api/v1/reports/12/review', method: 'POST', body: { decision: 'returned', comment: '补充材料' } })
assert.equal(result.review?.comment, '补充材料')
for (const file of ['src/components/views/ReportsView.tsx', 'src/mobile/features/reports/ReportDetailScreen.tsx']) {
  assert.match(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), /<ReportReviewPanel/)
}
console.log('R3 网页与手机汇报核验：接口及共用入口通过')
