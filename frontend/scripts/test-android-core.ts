/** Real APK/WebView checks. Requires the disposable axis joint-debug fixture. */
import { chromium, expect, type Locator } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const endpoint = process.env.AXIS_ANDROID_CDP
const projectId = process.env.AXIS_LIVE_PROJECT_ID
if (!endpoint || !projectId) throw new Error('Set AXIS_ANDROID_CDP and AXIS_LIVE_PROJECT_ID')
const browser = await chromium.connectOverCDP(endpoint, { noDefaults: true })
const checks: string[] = []
const out = 'android-acceptance/test-results/core'
await mkdir(out, { recursive: true })
try {
  const page = browser.contexts()[0]?.pages()[0]
  if (!page) throw new Error('No Android WebView')
  page.setDefaultTimeout(15_000)
  const origin = new URL(page.url()).origin
  const adb = 'C:/Users/11580/AppData/Local/Android/Sdk/platform-tools/adb.exe'
  const run = promisify(execFile)
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  const tap = async (target: Locator) => {
    await expect(target).toBeVisible()
    await target.scrollIntoViewIfNeeded()
    await target.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }))
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    // Real touch must wait for the mobile sheet animation / transient toast
    // to stop covering its target; DOM visibility alone is insufficient.
    await expect.poll(() => target.evaluate(el => {
      const box = el.getBoundingClientRect()
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
      return hit === el || (hit !== null && el.contains(hit))
    }), { timeout: 15_000 }).toBe(true)
    const box = await target.boundingBox()
    if (!box) throw new Error('Touch target missing')
    const targets = await (await fetch(`${endpoint}/json/list`)).json() as Array<{ url: string; description: string }>
    const view = JSON.parse(targets.find(t => t.url === page.url())!.description) as { screenX: number; screenY: number }
    const dpr = await page.evaluate(() => devicePixelRatio)
    await run(adb, ['-s', 'emulator-5554', 'shell', 'input', 'tap',
      String(Math.round(view.screenX + (box.x + box.width / 2) * dpr)),
      String(Math.round(view.screenY + (box.y + box.height / 2) * dpr)),
    ])
  }
  const checked = (name: string) => { checks.push(name); console.log(`PASS ${name}`) }
  const nav = page.locator('nav.fixed.bottom-0')
  const more = async (name: string) => {
    await tap(nav.getByRole('button', { name: /更多$/ }))
    await tap(page.getByRole('dialog').getByRole('button', { name: new RegExp(`${name}$`) }))
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  const api = async (path: string) => page.evaluate(async path => {
    const res = await fetch(`/api/v1${path}`, { headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` } })
    if (!res.ok) throw new Error(`${path}: ${res.status}`)
    return (await res.json()).data
  }, path)
  const login = async (username: string) => {
    await page.evaluate(() => { localStorage.removeItem('access_token'); localStorage.removeItem('refresh_token') })
    await page.goto(`${origin}/`)
    await page.getByPlaceholder('用户名 / 邮箱 / 手机号').fill(username)
    await page.locator('input[type=password]').fill(process.env.AXIS_LIVE_PASSWORD || 'axis-debug-2026')
    const response = page.waitForResponse(r => r.url().endsWith('/auth/login') && r.request().method() === 'POST')
    await tap(page.locator('form button[type=submit]'))
    expect((await response).status()).toBe(200)
    await expect(page.getByRole('heading', { name: '欢迎回来' })).toHaveCount(0)
    await expect(nav).toBeVisible()
  }
  const reportPage = async (id = projectId) => {
    await tap(nav.getByRole('button', { name: /人轴$/ }))
    await page.locator('.axis-project-picker select').selectOption(id!)
    await more('统计报告')
    await expect(page.getByTestId('project-ai-report-center')).toContainText('人轴智能体汇报链')
  }
  await login('axis_pm')
  await page.goto(`${origin}/?view=tasks`)
  expect((await api('/users/me')).username).toBe('axis_pm')
  const categories = page.waitForResponse(r => r.url().includes('/categories'))
  await page.reload()
  await categories
  // Personal task completion is tested outside the selected project's
  // read-only linked-task projection.
  await tap(nav.getByRole('button', { name: /人轴$/ }))
  await page.locator('.axis-project-picker select').selectOption('all')
  await tap(nav.getByRole('button', { name: /我的任务$/ }))
  const title = `Android APK任务-${Date.now()}`
  await tap(nav.getByRole('button', { name: 'add', exact: true }))
  await expect(page.getByRole('heading', { name: '创建新任务' })).toBeVisible()
  await page.getByPlaceholder('需要做些什么？').fill(title)
  const created = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/tasks')
  await tap(page.getByRole('button', { name: '创建任务', exact: true }))
  const createdResponse = await created
  expect(createdResponse.status()).toBe(201)
  const task = (await createdResponse.json()).data
  expect(task.id).toBeTruthy()
  expect(task.origin).toBe('personal')
  expect(task.project_id).toBeNull()
  const row = page.getByTestId('task-row').filter({ hasText: title })
  await expect(row).toBeVisible()
  checked('touch create task, persisted by real API')
  await tap(row)
  await expect(page.getByText('任务详情 ID:')).toBeVisible()
  await page.screenshot({ path: `${out}/task-detail.png` })
  await tap(page.getByRole('button', { name: 'close', exact: true }))
  await tap(row.getByTestId('task-toggle'))
  await expect(row.getByText(title)).toHaveClass(/line-through/)
  expect((await api(`/tasks/${task.id}`)).status).toBe(2)
  await tap(row.getByTestId('task-toggle'))
  await expect(row.getByText(title)).not.toHaveClass(/line-through/)
  expect((await api(`/tasks/${task.id}`)).status).toBe(0)
  checked('touch complete/uncomplete matches backend status')
  await tap(row)
  await tap(page.getByTestId('task-delete'))
  await expect(row).toHaveCount(0)
  await more('回收站')
  const trash = page.getByTestId('trash-row').filter({ hasText: title })
  await expect(trash).toBeVisible()
  await tap(trash.getByTestId('trash-restore'))
  await expect(trash).toHaveCount(0)
  await tap(nav.getByRole('button', { name: /我的任务$/ }))
  await expect(row).toBeVisible()
  checked('touch delete, trash and restore round trip')
  await more('日历视图')
  await expect(page.getByText(title).first()).toBeVisible()
  await page.screenshot({ path: `${out}/calendar.png` })
  checked('mobile More menu and calendar display restored task')
  await more('设置')
  await expect(page.getByRole('heading', { name: '个人资料', exact: true })).toBeVisible()
  checked('touch settings entry')

  await reportPage()
  let response = page.waitForResponse(r => r.url().endsWith(`/projects/${projectId}/report-agents/bindings`) && r.request().method() === 'POST')
  await tap(page.getByRole('button', { name: '同步人轴智能体', exact: true }))
  expect((await response).status()).toBe(200)
  checked('PM syncs project-scoped reporting agents')

  await login('axis_member')
  await reportPage()
  response = page.waitForResponse(r => r.url().endsWith('/reports/generate') && r.request().method() === 'POST')
  await tap(page.getByRole('button', { name: '生成 AI 草稿', exact: true }))
  const unavailable = await response
  expect(unavailable.status()).toBe(422)
  const unavailableBody = await unavailable.json()
  expect([42230, 42231]).toContain(unavailableBody.code)
  await expect(page.getByText(unavailableBody.message, { exact: true })).toBeVisible()
  checked('unconfigured AI refuses generation and displays actual reason')
  const summary = `Android汇报验收-${Date.now()}：交互原型待验收，需直属领导确认。`
  await page.locator('textarea').fill(summary)
  response = page.waitForResponse(r => r.url().endsWith(`/projects/${projectId}/agent-reports`) && r.request().method() === 'POST')
  await tap(page.getByRole('button', { name: '提交给直属领导', exact: true }))
  const submittedResponse = await response
  expect(submittedResponse.status()).toBe(200)
  const report = (await submittedResponse.json()).data
  expect(report.parent_user_id).toBe(1)
  await expect(page.getByText(summary, { exact: true })).toBeVisible()
  await page.screenshot({ path: `${out}/member-report.png` })
  checked('member submits editable report to actual direct leader')

  await login('axis_pm')
  await reportPage()
  const inbox = await api('/reports/inbox')
  expect(inbox.items.some((r: { id: number }) => r.id === report.id)).toBe(true)
  response = page.waitForResponse(r => r.url().endsWith(`/reports/inbox/${report.id}/read`) && r.request().method() === 'PUT')
  await tap(page.getByText(summary, { exact: true }))
  expect((await response).status()).toBe(200)
  expect((await api('/reports/inbox')).items.find((r: { id: number }) => r.id === report.id).read).toBe(true)
  checked('direct leader inbox delivery and touch mark-read')
  response = page.waitForResponse(r => r.url().endsWith(`/projects/${projectId}/agent-reports/aggregate`) && r.request().method() === 'POST')
  await tap(page.getByRole('button', { name: '汇总项目汇报', exact: true }))
  expect((await response).status()).toBe(200)
  await expect(page.getByText('项目智能体汇总 · 总领导项目摘要入口', { exact: true })).toBeVisible()
  await page.screenshot({ path: `${out}/leader-aggregate.png` })
  checked('project manager aggregates real submitted report')
  response = page.waitForResponse(r => /\/companies\/\d+\/leadership-reports\/aggregate$/.test(r.url()) && r.request().method() === 'POST')
  await tap(page.getByRole('button', { name: '汇总全部项目', exact: true }))
  expect((await response).status()).toBe(200)
  await expect(page.getByText('最新总领导摘要', { exact: true })).toBeVisible()
  checked('leadership aggregates project envelopes')
  await reportPage('2')
  await expect(page.getByText(summary, { exact: true })).toHaveCount(0)
  expect((await api('/projects/2/agent-reports')).items.some((r: { id: number }) => r.id === report.id)).toBe(false)
  checked('other project excludes submitted report in UI and API')
  expect(errors).toEqual([])
  await writeFile(`${out}/result.json`, JSON.stringify({ status: 'passed', platform: 'Android 15 APK WebView', checks, taskId: task.id, reportId: report.id, unavailableAi: unavailableBody.message }, null, 2))
  console.log(JSON.stringify({ status: 'passed', checks }))
} catch (error) {
  const page = browser.contexts()[0]?.pages()[0]
  if (page) await page.screenshot({ path: `${out}/failure.png` }).catch(() => {})
  await writeFile(`${out}/failure.json`, JSON.stringify({ checks, error: String(error) }, null, 2))
  throw error
} finally {
  await browser.close()
}
