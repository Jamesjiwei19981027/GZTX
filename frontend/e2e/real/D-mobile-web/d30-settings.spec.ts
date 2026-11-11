import { test, expect } from '@playwright/test'
import { api, apiLogin, bootPage, readState, SHOT, MAILPIT } from './_h'

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, locale: 'zh-CN' })

async function loginMember(page: any, request: any, admin = false) {
  const st = readState()
  const m = admin ? await apiLogin(request) : await apiLogin(request, st.member.username, st.member.password)
  const errors: string[] = []
  page.on('pageerror', (e: Error) => errors.push(e.message))
  await bootPage(page, m.tokens)
  await page.getByRole('tab', { name: '工作' }).waitFor()
  await page.waitForTimeout(1200)
  return { st, m, errors }
}
const openMe = async (page: any, row?: string) => {
  await page.getByRole('tab', { name: '我的' }).click()
  if (row) await page.getByText(row, { exact: true }).first().click()
  await page.waitForTimeout(500)
}
const me = async (request: any, h: any) => (await api(request, h, 'get', '/users/me')).data

test('D30-1 我的 > 个人资料：改昵称 → 落库到 /users/me，并回显到“我的”页', async ({ page, request }) => {
  const { m } = await loginMember(page, request)
  await openMe(page, '个人资料')
  const nick = `D-昵称${Date.now().toString(36).slice(-4)}`
  await page.getByPlaceholder('请输入您的姓名').fill(nick)
  const resp = page.waitForResponse(r => r.url().includes('/users/me') && r.request().method() === 'PUT')
  await page.getByRole('button', { name: '保存修改' }).click()
  expect((await resp).status()).toBe(200)
  await expect(page.getByText('个人资料已保存')).toBeVisible()
  expect((await me(request, m.h)).nickname).toBe(nick)
  await page.getByRole('button', { name: '返回' }).click()
  await expect(page.getByText(nick).first()).toBeVisible()
})

test('D30-2 我的 > 外观：切到深色 → html.dark 生效并落库到个人偏好', async ({ page, request }) => {
  const { m } = await loginMember(page, request)
  await openMe(page, '外观')
  await page.getByText('深色模式', { exact: false }).first().click()
  await page.waitForTimeout(1500)
  expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true)
  const u = await me(request, m.h)
  console.log('UI PREFS', JSON.stringify(u.notify_pref?.ui))
  expect(u.notify_pref?.ui?.theme_mode).toBe('dark')
  // 复原
  await page.getByText('浅色模式', { exact: false }).first().click()
  await page.waitForTimeout(1200)
  expect((await me(request, m.h)).notify_pref?.ui?.theme_mode).toBe('light')
})

test('D30-3 我的 > 任务默认值：设为高优先级 → 落库；新建任务弹层默认选中高优先级', async ({ page, request }) => {
  const { m } = await loginMember(page, request)
  await openMe(page, '任务默认值')
  await page.getByText('高优先级').first().click()
  await page.getByRole('button', { name: '保存任务默认配置' }).click()
  await page.waitForTimeout(2200) // 1.2s 后自动返回
  const u = await me(request, m.h)
  console.log('TASK DEFAULT', JSON.stringify(u.notify_pref?.ui))
  expect(u.notify_pref?.ui?.task_default_priority).toBe(2)
  await page.getByRole('tab', { name: '工作' }).click()
  await page.getByRole('button', { name: '新建任务' }).click()
  await expect(page.locator('select').filter({ hasText: '高优先级' }).first()).toHaveValue('High')
})

test('D30-4 我的 > 通知与免打扰：关“邮件通知”→ 应落库到 notify_pref.channels.email', async ({ page, request }) => {
  const { m } = await loginMember(page, request)
  expect((await api(request, m.h, 'put', '/users/me', { notify_pref: { channels: { email: { enabled: true } } } })).status).toBe(200)
  await page.reload()
  await openMe(page, '通知与免打扰')
  const boxes = page.locator('input[type="checkbox"]')
  await expect(boxes.first()).toBeChecked()
  const saved = page.waitForResponse(r => r.url().endsWith('/users/me') && r.request().method() === 'PUT')
  await boxes.first().uncheck()
  expect((await saved).status()).toBe(200)
  await page.waitForTimeout(2500)
  const after = (await me(request, m.h)).notify_pref
  console.log('CHANNELS after', JSON.stringify(after?.channels?.email))
  expect(after?.channels?.email?.enabled).toBe(false)
  await page.reload()
  await openMe(page, '通知与免打扰')
  await expect(page.locator('input[type=checkbox]').first()).not.toBeChecked()
})

test('D30-5 我的 > 通知与免打扰 > 测试邮件发送：点后提示成功，且 mailpit 真收到邮件', async ({ page, request }) => {
  const { st } = await loginMember(page, request)
  await openMe(page, '通知与免打扰')
  const t0 = Date.now() - 2000
  await page.getByRole('button', { name: '测试邮件发送' }).click()
  await expect(page.getByText('测试通知已成功推送到 email 渠道')).toBeVisible({ timeout: 15000 })
  let got = false
  for (let i = 0; i < 12 && !got; i++) {
    const j = await (await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:' + st.member.email)}`)).json()
    got = (j.messages || []).some((x: any) => new Date(x.Created).getTime() >= t0 && /^WorkTodo - /.test(x.Subject))
    if (!got) await page.waitForTimeout(700)
  }
  expect(got, 'mailpit 应收到“通知测试”邮件').toBe(true)
})
