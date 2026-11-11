import { test, expect } from '@playwright/test'
import { apiLogin, bootPage, readState, SHOT } from './_h'
test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, locale: 'zh-CN' })
test('D80 工作台 > 展开统计详情：显示每日明细、切换季度、可收起', async ({ page, request }) => {
  const st = readState(), m = await apiLogin(request, st.member.username, st.member.password)
  await bootPage(page, m.tokens)
  await page.getByRole('tab', { name: '工作' }).waitFor()
  const card = page.getByRole('region', { name: '任务趋势', exact: true })
  const expand = card.getByRole('button', { name: '展开统计详情' })
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  await expand.click()
  await expect(card.getByLabel('每日趋势明细')).toBeVisible()
  await expect(card.getByRole('button', { name: '收起统计详情' })).toHaveAttribute('aria-expanded', 'true')
  const stats = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/tasks/stats' && r.url().includes('period=quarter'))
  const trend = page.waitForResponse(r => r.url().includes('/tasks/stats/trend') && r.url().includes('period=quarter'))
  await card.getByRole('button', { name: '本季度', exact: true }).click()
  const sr = await stats, tr = await trend
  expect(sr.status()).toBe(200); expect(tr.status()).toBe(200)
  const data = (await sr.json()).data
  await expect(card).toContainText(`本周期新建 ${data.total} 项：待办 ${data.pending} · 进行中 ${data.in_progress} · 已完成 ${data.completed}`)
  await expect(card.getByRole('button', { name: '本季度' })).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: SHOT + 'd80-stats.png' })
  await card.getByRole('button', { name: '收起统计详情' }).click()
  await expect(card.getByLabel('每日趋势明细')).toHaveCount(0)
  await expect(card.getByRole('button', { name: '展开统计详情' })).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('tab', { name: '工作' })).toHaveAttribute('aria-selected', 'true')
  console.log('STATS quarter', sr.status(), 'TREND quarter', tr.status(), '已核对数据及展开/收起')
})
