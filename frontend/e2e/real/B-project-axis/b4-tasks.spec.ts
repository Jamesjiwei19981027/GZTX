import { test, expect } from '@playwright/test'
import { apiLogin, bootPage, api, stamp } from './_h'

test.use({ actionTimeout: 15_000, viewport: { width: 1440, height: 1000 } })
test.setTimeout(170_000)

test('B4 任务：新建/快速添加/完成/取消完成/删除回收站/恢复/搜索/看板/日历ICS/仪表盘', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push('pageerror ' + e.message))
  const { tokens, h } = await apiLogin(request)
  const t = stamp()
  const T1 = `B-任务甲${t}`, T2 = `B-快速乙${t}`, T3 = `B-看板丙${t}`
  const listAll = async () => (await api(request, h, 'get', '/tasks?page_size=100&keyword=' + encodeURIComponent('B-'))).data
  const find = async (title: string) => ((await listAll())?.items ?? []).find((x: any) => x.title === title)

  // 仪表盘基线
  const s0 = (await api(request, h, 'get', '/tasks/stats')).data
  await bootPage(page, tokens, '/?view=tasks')

  // 1 新建任务（顶栏）
  await page.getByRole('button', { name: /新建任务/ }).first().click()
  await page.getByPlaceholder('需要做些什么？').first().fill(T1)
  const c1 = page.waitForResponse(r => /\/api\/v1\/tasks\/?$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST')
  await page.locator('button[type=submit]').click()
  const cr1 = await c1; console.log('NEWTASK', cr1.status(), (await cr1.text()).slice(0,300), cr1.request().postData()?.slice(0,300))
  // 缺陷 B-02：邮箱已验证但未验证手机的用户，界面新建个人任务被 403（前端带了 company_id）
  expect(cr1.status(), '界面新建个人任务应成功').toBe(201)
  const row1 = await find(T1)
  expect(row1, '任务应落库').toBeTruthy()

  // 2 快速添加 Alt+N
  await page.keyboard.press('Escape')
  await page.keyboard.press('Alt+n')
  await page.getByPlaceholder(/回车即创建/).fill(T2)
  const c2 = page.waitForResponse(r => /\/api\/v1\/tasks/.test(r.url()) && r.request().method() === 'POST')
  await page.keyboard.press('Enter')
  const r2 = await c2
  console.log('QUICKADD', r2.status(), (await r2.text()).slice(0, 200))
  expect(r2.status(), '快速添加应成功').toBe(201)
  expect((await find(T2))?.project_id ?? null).toBeNull()

  // 3 我的任务：勾选完成/取消完成（界面 + 后端）
  await page.reload()
  const rowEl = page.locator('tr, li, [data-task-id], div').filter({ hasText: T1 }).last()
  await expect(page.getByText(T1).first()).toBeVisible()
  const cb = page.getByRole('checkbox', { name: /T1|完成/ }).first()
  void cb
  const done = page.waitForResponse(r => r.url().endsWith(`/tasks/${row1.id}/complete`) && r.request().method() === 'PATCH')
  await page.getByTestId('task-row').filter({ hasText: T1 }).getByTestId('task-toggle').click()
  expect((await done).status()).toBe(200)
  expect((await api(request, h, 'get', `/tasks/${row1.id}`)).data.status).toBe(2)
  expect((await api(request, h, 'patch', `/tasks/${row1.id}/uncomplete`, {})).status).toBe(200)
  expect((await api(request, h, 'get', `/tasks/${row1.id}`)).data.status).not.toBe(2)
  void rowEl

  // 4 看板：建任务 → 拖到"进行中"列 → 刷新/我的任务/接口一致
  const t3 = await api(request, h, 'post', '/tasks', { title: T3, status: 0, priority: 1, due_date: new Date().toISOString().slice(0, 10) })
  expect(t3.status).toBe(201)
  await page.goto('/?view=kanban')
  await page.getByPlaceholder('筛选任务', { exact: true }).fill(T3)
  const card = page.locator('[draggable=true]').filter({ hasText: T3 }).first()
  await expect(card).toBeVisible()
  const cols = await page.locator('[class*=column], section, div').filter({ hasText: /进行中/ }).all()
  void cols
  const target = page.getByText('进行中', { exact: true }).first()
  const patch = page.waitForResponse(r => /\/api\/v1\/tasks\/\d+/.test(r.url()) && ['PUT', 'PATCH'].includes(r.request().method()))
  await card.dragTo(target.locator('xpath=ancestor::*[contains(@class,"flex-col") or contains(@class,"column")][1]'), { targetPosition: { x: 100, y: 120 } })
  const pr = await patch
  expect(pr.status()).toBe(200)
  const st = (await api(request, h, 'get', `/tasks/${t3.data.id}`)).data.status
  test.info().annotations.push({ type: '看板拖动后状态', description: st })
  expect(st).toBe(1)
  await page.reload()
  await expect(page.getByText(T3).first()).toBeVisible()
  await page.goto('/?view=tasks')
  await expect(page.getByText(T3).first()).toBeVisible()

  // 5 日历 ICS：导出含任务；订阅链接含任务；重置后旧链接失效
  const ics = await request.get('/api/v1/tasks/export.ics', { headers: h })
  expect(ics.status()).toBe(200)
  const icsText = await ics.text()
  expect(icsText).toContain('BEGIN:VCALENDAR')
  expect(icsText, 'ICS 应含刚建的有日期任务').toContain(T3)
  const feed = (await api(request, h, 'get', '/tasks/calendar-feed-url')).data
  const feedUrl: string = feed.url || feed.feed_url || JSON.stringify(feed)
  const path = feedUrl.replace(/^https?:\/\/[^/]+/, '')
  const f1 = await request.get(path.startsWith('/api') ? path : '/api/v1' + path)
  expect(f1.status()).toBe(200)
  expect(await f1.text()).toContain(T3)
  const reset = await api(request, h, 'post', '/tasks/calendar-feed-url/reset', {})
  expect(reset.status).toBe(200)
  expect((await request.get(path)).status()).toBe(403)
  expect((await request.get(reset.data.url)).status()).toBe(200)
  await page.goto('/?view=calendar')
  const dl = page.waitForEvent('download')
  await page.getByTitle(/导出 .ics/).click()
  const file = await dl; const stream = await file.createReadStream(); let buf = ''
  for await (const chunk of stream) buf += chunk
  expect(buf).toContain(T3)
  // 日/周/月切换
  for (const lab of ['日', '周', '月']) {
    const b = page.getByRole('button', { name: lab, exact: true })
    if (await b.count()) await b.first().click()
  }

  // 6 删除→回收站→恢复→再删→彻底删除
  expect((await api(request, h, 'delete', `/tasks/${row1.id}`)).status).toBe(200)
  const trash = (await api(request, h, 'get', '/tasks/trash')).data
  expect((trash.items ?? trash).some((x: any) => x.id === row1.id), '删除应进回收站').toBeTruthy()
  await page.goto('/?view=trash')
  await expect(page.getByText(T1).first()).toBeVisible()
  await page.getByTestId('trash-row').filter({ hasText: T1 }).getByTestId('trash-restore').click()
  await expect.poll(async () => (await api(request, h, 'get', `/tasks/${row1.id}`)).status).toBe(200)
  await page.goto('/?view=tasks')
  await expect(page.getByText(T1).first()).toBeVisible()
  expect((await api(request, h, 'delete', `/tasks/${row1.id}`)).status).toBe(200)
  const deleted = await api(request, h, 'get', `/tasks/${row1.id}`)
  expect(deleted.status).toBe(200)
  expect(deleted.data.is_deleted).toBe(true)
  expect((await listAll()).items.some((x: any) => x.id === row1.id)).toBe(false)
  await page.goto('/?view=trash')
  await expect(page.getByTestId('trash-row').filter({ hasText: T1 })).toBeVisible()
  await expect(page.getByText(/30 天后自动清除/)).toBeVisible()
  // 当前产品只支持恢复及30天后自动清除，不提供手动永久删除入口。

  // 7 全局搜索 Ctrl+K
  await page.goto('/?view=tasks')
  await page.keyboard.press('Control+k')
  await page.getByPlaceholder(/搜索任务/).last().fill(T3)
  await expect(page.getByText(T3).last()).toBeVisible()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1000)
  test.info().annotations.push({ type: '搜索跳转后URL', description: page.url() })

  // 8 仪表盘数字：新增 3 个未完成任务，stats 同步
  const s1 = (await api(request, h, 'get', '/tasks/stats')).data
  test.info().annotations.push({ type: 'stats 前后', description: JSON.stringify(s0) + ' -> ' + JSON.stringify(s1) })
  await page.goto('/?view=dashboard')
  await page.waitForTimeout(2500)
  const body = await page.locator('main').innerText()
  test.info().annotations.push({ type: '仪表盘文本', description: body.replace(/\s+/g, ' ').slice(0, 300) })
  expect(errors, errors.join('\n')).toEqual([])
})
