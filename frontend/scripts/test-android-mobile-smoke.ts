/** Real Android WebView smoke checks for the mobile shell and report entry. */
import { chromium, expect, type Locator } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const endpoint = process.env.AXIS_ANDROID_CDP
if (!endpoint) throw new Error('Set AXIS_ANDROID_CDP')
const browser = await chromium.connectOverCDP(endpoint, { noDefaults: true })
const page = browser.contexts()[0]?.pages()[0]
if (!page) throw new Error('No Android WebView page found')
page.setDefaultTimeout(15_000)
const origin = new URL(page.url()).origin
const adb = 'C:/Users/11580/AppData/Local/Android/Sdk/platform-tools/adb.exe'
const run = promisify(execFile)
const checks: string[] = []
const out = 'android-acceptance/test-results/mobile-smoke'
await mkdir(out, { recursive: true })

const tap = async (target: Locator) => {
  await expect(target).toBeVisible()
  await target.scrollIntoViewIfNeeded()
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const box = await target.boundingBox()
  if (!box) throw new Error('Touch target has no bounds')
  const list = await (await fetch(`${endpoint}/json/list`)).json() as Array<{ url: string; description: string }>
  const view = JSON.parse(list.find(item => item.url === page.url())!.description) as { screenX: number; screenY: number }
  const dpr = await page.evaluate(() => devicePixelRatio)
  await run(adb, ['-s', 'emulator-5554', 'shell', 'input', 'tap',
    String(Math.round(view.screenX + (box.x + box.width / 2) * dpr)),
    String(Math.round(view.screenY + (box.y + box.height / 2) * dpr)),
  ])
}

const login = async (username: string) => {
  await page.evaluate(() => localStorage.clear())
  await page.goto(`${origin}/`)
  await page.getByPlaceholder('用户名 / 邮箱 / 手机号').fill(username)
  await page.locator('input[type=password]').fill('axis-debug-2026')
  const response = page.waitForResponse(r => r.url().endsWith('/auth/login') && r.request().method() === 'POST')
  await tap(page.locator('form button[type=submit]'))
  expect((await response).status()).toBe(200)
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toHaveCount(0)
}

const chooseProject = async () => {
  await tap(page.getByRole('tab', { name: '人轴', exact: true }))
  const picker = page.locator('.axis-project-picker select, .mobile-axis-project-picker select')
  await expect(picker).toBeVisible()
  await picker.selectOption('1')
  await expect(picker).toHaveValue('1')
}

try {
  await login('axis_pm')
  await chooseProject()
  await tap(page.getByRole('button', { name: '项目全貌', exact: true }))
  await expect(page.getByText('林悦', { exact: true })).toBeVisible()
  await expect(page.getByText('陈宇', { exact: true })).toBeVisible()
  await tap(page.getByText('林悦', { exact: true }).last())
  await expect(page.getByText('责任节点预览', { exact: true })).toBeVisible()
  await tap(page.getByRole('button', { name: '查看完整责任详情', exact: true }))
  await expect(page.getByRole('dialog', { name: /林悦.*责任详情/ })).toContainText('林悦')
  await tap(page.getByRole('button', { name: '关闭', exact: true }))
  checks.push('Android touch: project axis overview, node preview and detail')

  await tap(page.getByRole('tab', { name: '工作', exact: true }))
  await tap(page.getByRole('button', { name: '查看汇报', exact: true }))
  await expect(page.getByText('AI 汇报与助手', { exact: true })).toBeVisible()
  await tap(page.getByText('整理本周汇报', { exact: true }))
  await expect(page.getByRole('heading', { name: '编辑我的 AI 汇报', exact: true })).toBeVisible()
  await tap(page.getByRole('button', { name: '返回', exact: true }))
  checks.push('Android touch: project-scoped AI report editor entry')

  // Bind the project and manager agents once as the PM. This is setup for the
  // member submission flow; the subsequent submission and status are still
  // exercised through real Android touch input.
  const bindingStatus = await page.evaluate(async () => {
    const response = await fetch('/api/v1/projects/1/report-agents/bindings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
    })
    return response.status
  })
  expect(bindingStatus).toBe(200)
  checks.push('project-scoped reporting agents bound for acceptance fixture')

  await login('axis_member')
  await chooseProject()
  await tap(page.getByRole('tab', { name: '工作', exact: true }))
  await tap(page.getByRole('button', { name: '查看汇报', exact: true }))
  await tap(page.getByText('整理本周汇报', { exact: true }))
  const summary = `Android 移动壳汇报 ${Date.now()}：交互原型待直属领导确认。`
  await page.locator('textarea').first().fill(summary)
  const submitted = page.waitForResponse(r => r.url().endsWith('/projects/1/agent-reports') && r.request().method() === 'POST')
  await tap(page.getByRole('button', { name: '确认提交', exact: true }))
  expect((await submitted).status()).toBe(200)
  await expect(page.getByText('已送达直属领导', { exact: true })).toBeVisible()
  checks.push('Android touch: member submits report to direct leader')

  await login('axis_pm')
  await chooseProject()
  await tap(page.getByRole('tab', { name: '工作', exact: true }))
  await tap(page.getByRole('button', { name: '查看汇报', exact: true }))
  await tap(page.getByText('下属汇报收件箱', { exact: true }))
  await tap(page.getByText(summary.slice(0, 24), { exact: false }).first())
  await expect(page.getByRole('heading', { name: '汇报详情与版本', exact: true })).toBeVisible()
  await tap(page.getByRole('button', { name: '列表', exact: true }))
  await tap(page.getByRole('button', { name: '汇总项目汇报', exact: true }))
  await expect(page.getByRole('heading', { name: '项目汇总与发布', exact: true })).toBeVisible()
  checks.push('Android touch: manager inbox reads report and aggregates project summary')

  await page.screenshot({ path: `${out}/android-mobile-smoke.png` })
  await writeFile(`${out}/result.json`, JSON.stringify({ status: 'passed', platform: 'Android 15 APK WebView', checks }, null, 2))
  console.log(JSON.stringify({ status: 'passed', checks, viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })) }))
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {})
  await writeFile(`${out}/failure.json`, JSON.stringify({ checks, error: String(error) }, null, 2))
  throw error
} finally {
  await browser.close()
}
