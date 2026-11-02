/**
 * S1–S8 冒烟（对应门禁文档 §6.11，现役单壳 SPA：App.tsx activeView 切换视图）。
 *
 * 约定：
 * - 依赖 backend/scripts/seed_e2e_user.py 种好的账号（E2E_USER / E2E_PASSWORD）；
 * - S1 / S8 走真实 UI 登录；其余用例走 API 登录 + localStorage 注入 token 提速；
 * - 每条用例的数据（任务标题）都带时间戳，跑多遍不互相污染；
 * - 中文为默认语言，文案断言以 frontend/src/i18n.ts 为准。
 */
import { test, expect } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'

const E2E_USER = process.env.E2E_USER || 'e2e_user'
const E2E_PASSWORD = process.env.E2E_PASSWORD || 'e2e-password-123'

type Tokens = { access_token: string; refresh_token?: string }

/** 后端信封：{code:200, data:{access_token, refresh_token, user}} */
async function apiLogin(request: APIRequestContext): Promise<Tokens> {
  const res = await request.post('/api/v1/auth/login', {
    data: { username: E2E_USER, password: E2E_PASSWORD },
  })
  expect(res.ok(), `登录接口 HTTP ${res.status()}`).toBeTruthy()
  const body = await res.json()
  expect(body.code).toBe(200)
  return body.data as Tokens
}

/** 本地时区的 YYYY-MM-DD（日历视图按本地日期分组） */
function todayLocal(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** 本地时区的 YYYY-MM-DD，偏移 N 天（S10 用昨天 / 明天） */
function localDateWithOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

async function apiCreateTask(
  request: APIRequestContext,
  token: string,
  title: string,
  dueDate: string = todayLocal(),
): Promise<{ id: number }> {
  const res = await request.post('/api/v1/tasks', {
    headers: { Authorization: `Bearer ${token}` },
    data: { title, priority: 1, status: 0, due_date: dueDate },
  })
  expect(res.ok(), `建任务接口 HTTP ${res.status()}`).toBeTruthy()
  const body = await res.json()
  return body.data as { id: number }
}

/**
 * API 登录 + 注入 token 后进入应用（跳过 UI 登录，加速非登录用例）。
 * 等 /categories 返回后才算 boot 完成：NewTaskModal 的重置 effect 依赖
 * categories，boot 未完成就填表单会在分类加载完成时被清空（真实竞态）。
 */
async function bootLoggedIn(
  page: Page,
  request: APIRequestContext,
  existingTokens?: Tokens,
): Promise<Tokens> {
  const tokens = existingTokens ?? (await apiLogin(request))
  await page.addInitScript(
    ([access, refresh]) => {
      localStorage.setItem('access_token', access)
      if (refresh) localStorage.setItem('refresh_token', refresh)
    },
    [tokens.access_token, tokens.refresh_token ?? ''] as const,
  )
  const categoriesLoaded = page.waitForResponse((res) =>
    res.url().includes('/api/v1/categories'),
  )
  await page.goto('/')
  await expect(sidebar(page).getByRole('button', { name: '工作', exact: true })).toBeVisible()
  await categoriesLoaded
  return tokens
}

/** 桌面侧栏（移动端底栏有同名按钮但被 CSS 隐藏，必须限定作用域） */
function sidebar(page: Page) {
  return page.locator('aside')
}

/**
 * 按旧版页面名进入对应视图。2026-10-31 起桌面侧栏只保留「工作 / 人轴 / 知识 / 消息 / 我的」，
 * 任务列表与回收站收在「工作工具与管理 → 任务管理」，完整日历从工作首页日程卡片进入。
 */
async function openView(page: Page, label: string) {
  const aside = sidebar(page)
  const openTaskManagement = async () => {
    const item = aside.getByRole('button', { name: '任务管理', exact: true })
    if (!(await item.isVisible())) await aside.getByRole('button', { name: /工作工具与管理/ }).click()
    await item.click()
  }
  switch (label) {
    case '我的任务':
      await openTaskManagement()
      await page.getByRole('tablist', { name: '任务视图' }).getByRole('tab', { name: '任务列表' }).click()
      break
    case '回收站':
      await openTaskManagement()
      await page.getByLabel('任务更多操作').click()
      await page.getByRole('button', { name: '回收站', exact: true }).click()
      break
    case '日历视图':
      await aside.getByRole('button', { name: '工作', exact: true }).click()
      await page.getByRole('button', { name: '完整日历', exact: true }).click()
      break
    case '设置':
      await aside.getByRole('button', { name: '我的', exact: true }).click()
      break
    default:
      await aside.getByRole('button', { name: label, exact: true }).click()
  }
}

test('S1 登录：LoginGate 密码登录后进入仪表盘 @prod', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible()
  await page.getByPlaceholder('用户名 / 邮箱 / 手机号').fill(E2E_USER)
  await page.locator('input[type="password"]').fill(E2E_PASSWORD)
  await page.locator('form button[type="submit"]').click()
  await expect(sidebar(page).getByRole('button', { name: '工作', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toHaveCount(0)
})

test('S2 建任务：新建任务 → 我的任务可见 → 打开详情抽屉 @prod', async ({ page, request }) => {
  await bootLoggedIn(page, request)
  const title = `E2E任务S2-${Date.now()}`

  await page.locator('header').getByRole('button', { name: '新建任务' }).click()
  await expect(page.getByRole('heading', { name: '创建新任务' })).toBeVisible()
  await page.getByPlaceholder('需要做些什么？').fill(title)
  await expect(page.getByPlaceholder('需要做些什么？')).toHaveValue(title)
  await page.getByRole('button', { name: '创建任务' }).click()
  await expect(page.getByRole('heading', { name: '创建新任务' })).toHaveCount(0)

  await openView(page, '我的任务')
  const row = page.getByTestId('task-row').filter({ hasText: title })
  await expect(row).toBeVisible()

  await row.click()
  await expect(page.getByText('任务详情 ID:')).toBeVisible()
})

test('S3 日历：切日历视图，今天能看到任务 @prod', async ({ page, request }) => {
  const tokens = await apiLogin(request)
  const title = `E2E日历S3-${Date.now()}`
  await apiCreateTask(request, tokens.access_token, title)
  await bootLoggedIn(page, request, tokens)

  await openView(page, '日历视图')
  // 标题可能同时出现在月格、右侧当日任务列表和时间轴，取第一个可见即可
  await expect(page.getByText(title).first()).toBeVisible()
})

test('S4 设置：修改昵称可保存并回显 @prod', async ({ page, request }) => {
  const tokens = await bootLoggedIn(page, request)
  await openView(page, '设置')
  await expect(page.getByRole('heading', { name: '个人资料' })).toBeVisible()

  const newName = `E2E用户${Date.now() % 100000}`
  // 限定 main 作用域：Navbar 的全局搜索框也是 input[type="text"]
  const nameInput = page.locator('main input[type="text"]:not([readonly])').first()
  await nameInput.fill(newName)
  await page.getByRole('button', { name: '更新资料' }).click()
  await expect(page.getByText('修改已保存！')).toBeVisible()
  await expect(page.getByRole('heading', { name: newName })).toBeVisible()

  // 复原昵称，避免多次运行后账号信息漂移
  const res = await request.put('/api/v1/users/me', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    data: { nickname: 'E2E 用户' },
  })
  expect(res.ok()).toBeTruthy()
})

test('S5 全局搜索：Ctrl+K 命中任务并回车打开详情 @prod', async ({ page, request }) => {
  const tokens = await apiLogin(request)
  const title = `E2E搜索S5-${Date.now()}`
  await apiCreateTask(request, tokens.access_token, title)
  await bootLoggedIn(page, request, tokens)

  await page.keyboard.press('Control+k')
  const searchInput = page.getByPlaceholder('搜索任务 / 项目 / 知识…')
  await expect(searchInput).toBeVisible()
  await searchInput.fill(title)
  // 首页日程卡片里也有同名任务按钮（名称带时刻前缀），精确匹配搜索结果
  await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.getByText('任务详情 ID:')).toBeVisible()
  await expect(page.getByText(title).first()).toBeVisible()
})

test('S6 完成任务：勾选后状态局部更新为已完成 @prod', async ({ page, request }) => {
  const tokens = await apiLogin(request)
  const title = `E2E完成S6-${Date.now()}`
  const created = await apiCreateTask(request, tokens.access_token, title)
  await bootLoggedIn(page, request, tokens)

  await openView(page, '我的任务')
  const row = page.getByTestId('task-row').filter({ hasText: title })
  await expect(row).toBeVisible()
  await row.getByTestId('task-toggle').click()

  // 局部更新：标题划线（无整页刷新）
  await expect(row.getByText(title)).toHaveClass(/line-through/)

  // 服务端状态确实是已完成（status=2）
  const res = await request.get(`/api/v1/tasks/${created.id}`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body.data.status).toBe(2)

  // 取消完成：局部替换后标题等字段不能丢（回归：uncomplete 曾只返回部分载荷）
  await row.getByTestId('task-toggle').click()
  await expect(row.getByText(title)).toBeVisible()
  await expect(row.getByText(title)).not.toHaveClass(/line-through/)
  const res2 = await request.get(`/api/v1/tasks/${created.id}`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  expect((await res2.json()).data.status).toBe(0)
})

test('S7 401 续期：access_token 失效后 API 操作无感恢复 @prod', async ({ page, request }) => {
  await bootLoggedIn(page, request)

  const garbage = 'expired.invalid.token'
  await page.evaluate((bad) => localStorage.setItem('access_token', bad), garbage)

  // 触发一次真实 API 链路（fetchMe 等）：用户菜单 → 重新同步数据
  await page.getByTestId('user-menu-button').click()
  await page.getByRole('button', { name: '重新同步数据' }).click()

  // 同步完成后：仍在应用内、无错误横幅、access_token 已被 /auth/refresh 换新
  await expect(page.getByText('正在从后端同步…')).toHaveCount(0)
  await expect(page.getByText('后端同步提示')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toHaveCount(0)
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('access_token')))
    .not.toBe(garbage)
})

test('S8 登出：回到 LoginGate，刷新后仍是未登录态 @prod', async ({ page }) => {
  // 走真实 UI 登录（不用 addInitScript，否则刷新会重新注入 token）
  await page.goto('/')
  await page.getByPlaceholder('用户名 / 邮箱 / 手机号').fill(E2E_USER)
  await page.locator('input[type="password"]').fill(E2E_PASSWORD)
  await page.locator('form button[type="submit"]').click()
  await expect(sidebar(page).getByRole('button', { name: '工作', exact: true })).toBeVisible()

  await page.getByTestId('user-menu-button').click()
  await page.getByRole('button', { name: '退出登录' }).click()
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible()
  await expect(sidebar(page)).toHaveCount(0)
})

test('S9 回收站：删除任务 → 回收站可见 → 恢复 → 列表回来 @prod', async ({ page, request }) => {
  const tokens = await apiLogin(request)
  const title = `E2E回收S9-${Date.now()}`
  await apiCreateTask(request, tokens.access_token, title)
  await bootLoggedIn(page, request, tokens)

  // 在任务详情抽屉里软删（无阻塞确认，删除后弹撤销 toast）
  await openView(page, '我的任务')
  const row = page.getByTestId('task-row').filter({ hasText: title })
  await expect(row).toBeVisible()
  await row.click()
  await expect(page.getByText('任务详情 ID:')).toBeVisible()
  await page.getByTestId('task-delete').click()
  await expect(row).toHaveCount(0)

  await openView(page, '回收站')
  const trashRow = page.getByTestId('trash-row').filter({ hasText: title })
  await expect(trashRow).toBeVisible()
  await trashRow.getByTestId('trash-restore').click()
  await expect(trashRow).toHaveCount(0)

  // 回到我的任务：任务已恢复
  await openView(page, '我的任务')
  await expect(page.getByTestId('task-row').filter({ hasText: title })).toBeVisible()
})

test('S10 逾期顺延：昨天到期任务 → 逾期组「全部顺延→明天」→ 日期变明天 @prod', async ({ page, request }) => {
  const tokens = await apiLogin(request)
  const title = `E2E逾期S10-${Date.now()}`
  await apiCreateTask(request, tokens.access_token, title, localDateWithOffset(-1))
  await bootLoggedIn(page, request, tokens)

  await openView(page, '我的任务')
  const overdueGroup = page.getByTestId('overdue-group')
  await expect(
    overdueGroup.getByTestId('task-row').filter({ hasText: title }),
  ).toBeVisible()

  await page.getByTestId('overdue-reschedule-trigger').click()
  await page.getByTestId('overdue-reschedule-tomorrow').click()

  // 顺延成功后任务移出逾期组，行内日期变为明天
  const row = page.getByTestId('task-row').filter({ hasText: title })
  await expect(row).toBeVisible()
  await expect(row).toContainText(localDateWithOffset(1))
  await expect(
    overdueGroup.getByTestId('task-row').filter({ hasText: title }),
  ).toHaveCount(0)
})
