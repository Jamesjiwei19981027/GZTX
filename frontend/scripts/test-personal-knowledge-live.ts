/** Full desktop shell and actual API; requires the isolated joint-debug fixture. */
import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const out = 'android-acceptance/test-results/personal-knowledge-web'
await mkdir(out, { recursive: true })
let id: number | undefined
try {
  await page.goto('http://127.0.0.1:5177/')
  await page.getByPlaceholder('用户名 / 邮箱 / 手机号').fill('axis_pm')
  await page.locator('input[type=password]').fill(process.env.AXIS_LIVE_PASSWORD || 'axis-debug-2026')
  await page.locator('form button[type=submit]').click()
  await page.locator('aside').getByRole('button', { name: '知识', exact: true }).click()
  await expect(page).toHaveURL(/view=knowledge/)
  await page.getByLabel('知识空间项目').selectOption('1')
  await page.getByRole('button', { name: '新建条目', exact: true }).click()
  const title = '桌面完整入口验收-' + Date.now()
  await page.getByLabel('标题', { exact: true }).fill(title)
  await page.getByLabel('正文', { exact: true }).fill('真实登录、侧栏导航、保存和刷新验证。')
  const saved = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/personal-knowledge/entries'))
  await page.getByRole('button', { name: '保存条目', exact: true }).click()
  const response = await saved
  expect(response.status()).toBe(200)
  id = (await response.json()).data.id
  await page.reload()
  await expect(page.getByRole('heading', { name: '我的知识空间', exact: true })).toBeVisible()
  await page.getByLabel('知识空间项目').selectOption('1')
  await page.getByRole('button', { name: '打开 ' + title, exact: true }).click()
  await expect(page.getByLabel('正文', { exact: true })).toHaveValue('真实登录、侧栏导航、保存和刷新验证。')
  await page.screenshot({ path: out + '/desktop.png' })
  await writeFile(out + '/result.json', JSON.stringify({ status: 'passed', mockedApi: false, checks: ['真实登录', 'Web侧栏入口', '知识条目真实保存', '深链刷新与读取'] }, null, 2))
  console.log('PASS desktop real login, sidebar navigation, Wiki save and deep-link reload')
} finally {
  if (id) await page.evaluate(async id => {
    const response = await fetch(`/api/v1/projects/1/personal-knowledge/entries/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` } })
    if (!response.ok) throw new Error('Disposable desktop Wiki cleanup failed')
  }, id)
  await browser.close()
}
