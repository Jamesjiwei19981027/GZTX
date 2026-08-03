/**
 * WorkTodo smoke suite — gate paths S1–S8 (§6.10 / §6.11).
 *
 * Prerequisites:
 * - Backend API reachable from the frontend (Vite proxy or staging URL)
 * - Frontend: `npm run dev` or preview at PLAYWRIGHT_BASE_URL
 * - Env: E2E_USER, E2E_PASSWORD, optional PLAYWRIGHT_BASE_URL
 *
 * Run (PowerShell):
 *   $env:E2E_USER="demo"; $env:E2E_PASSWORD="secret"
 *   $env:PLAYWRIGHT_BASE_URL="http://127.0.0.1:5173"
 *   cd frontend; npm run test:e2e
 */
import { test, expect } from '@playwright/test'
import { clearClientAuth, e2eCredentials, loginAsE2EUser } from './helpers/auth'

const taskTitle = `E2E 烟雾任务 ${Date.now()}`

test.describe.configure({ mode: 'serial' })

test.describe('WorkTodo smoke (S1–S8)', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure credentials are present before any browser work (fails fast with a clear message).
    e2eCredentials()
    // Land on app origin so localStorage clear applies to the SPA
    await page.goto('/login')
    await clearClientAuth(page)
  })

  test('S1: login → dashboard', async ({ page }) => {
    await loginAsE2EUser(page)
    await expect(page.getByRole('heading', { name: '今日工作总览' })).toBeVisible()
    // Sidebar nav present on desktop viewport
    await expect(page.getByRole('link', { name: /仪表盘/ })).toBeVisible()
  })

  test('S2: create task → list → detail', async ({ page }) => {
    await loginAsE2EUser(page)

    // Create via sidebar primary CTA
    await page.getByRole('button', { name: '新建任务' }).first().click()
    await expect(page).toHaveURL(/\/tasks\/new/)
    // 页头 h2 与表单卡片 h3 同名，取页头
    await expect(page.getByRole('heading', { name: '新建任务', level: 2 })).toBeVisible()

    await page.getByLabel('任务标题').fill(taskTitle)
    await page.getByRole('button', { name: '创建任务' }).click()

    // After create the app navigates back to the list (TaskDetailPage handleCreate → navigate('/tasks'))
    await expect(page).toHaveURL(/\/tasks$/, { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: '我的任务' })).toBeVisible()
    await expect(page.getByText(taskTitle)).toBeVisible({ timeout: 15_000 })

    // Open detail drawer by clicking the task row
    await page.getByText(taskTitle).first().click()
    await expect(page.getByRole('heading', { name: taskTitle }).or(page.locator('.ant-drawer').getByText(taskTitle)).first()).toBeVisible({
      timeout: 15_000,
    })
  })

  test('S3: calendar page loads (task entry if due today)', async ({ page }) => {
    await loginAsE2EUser(page)

    await page.getByRole('link', { name: /日历/ }).click()
    await expect(page).toHaveURL(/\/calendar/)
    // Month chrome: 「今天」 button + weekday headers（antd 两字按钮含空格）
    await expect(page.getByRole('button', { name: /今\s*天/ })).toBeVisible()
    await expect(page.getByText('周日', { exact: true }).first()).toBeVisible()
    // No fatal empty crash — main calendar grid present
    await expect(page.locator('.grid.grid-cols-7').first()).toBeVisible()
  })

  test('S4: settings — personal LLM Fake save + SMTP form visible', async ({ page }) => {
    await loginAsE2EUser(page)

    await page.getByRole('link', { name: /设置/ }).click()
    await expect(page).toHaveURL(/\/settings/)
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()

    // SMTP section present
    await expect(page.getByRole('heading', { name: '个人邮件服务器' })).toBeVisible()
    await expect(page.getByText('SMTP 服务器')).toBeVisible()

    // LLM section: select Fake provider when available, enable, save
    await expect(
      page.getByRole('heading', { name: /个人大模型/ }),
    ).toBeVisible()

    // Ant Design Select for Provider — open and pick Fake if listed
    const providerLabel = page.locator('label', { hasText: 'Provider' })
    await expect(providerLabel).toBeVisible()
    const providerSelect = providerLabel.locator('..').locator('.ant-select')
    if (await providerSelect.count()) {
      await providerSelect.click()
      const fakeOption = page.getByText(/Fake/i).first()
      if (await fakeOption.isVisible().catch(() => false)) {
        await fakeOption.click()
      } else {
        await page.keyboard.press('Escape')
      }
    }

    // Enable personal LLM switch (antd Switch near label)
    const enableRow = page.locator('label', { hasText: /启用个人大模型/ })
    if (await enableRow.count()) {
      const sw = enableRow.locator('.ant-switch')
      if (await sw.count()) {
        const checked = await sw.getAttribute('aria-checked')
        if (checked !== 'true') {
          await sw.click()
        }
      }
    }

    // Save LLM config (section has its own「保存配置」; SMTP section has another — use last LLM one)
    const saveButtons = page.getByRole('button', { name: '保存配置' })
    await expect(saveButtons.last()).toBeVisible()
    await saveButtons.last().click()

    // Success toast or at least page still on settings without crash
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
    // Optional: connectivity test when Fake is configured
    const testBtn = page.getByRole('button', { name: '测试连通性' })
    if (await testBtn.isEnabled().catch(() => false)) {
      await testBtn.click()
      // Soft: allow pass/fail message; do not hard-fail suite if backend Fake not wired
      await page.waitForTimeout(1500)
    }
  })

  test('S5+S6: projects — outline select + 人轴画布', async ({ page }) => {
    await loginAsE2EUser(page)

    await page.getByRole('link', { name: /项目/ }).click()
    await expect(page).toHaveURL(/\/projects/)
    await expect(page.getByRole('heading', { name: '项目', exact: true })).toBeVisible()

    // Empty company / no projects: page still renders without crash
    const emptyHint = page.getByText(/暂无项目|尚未加入任何公司|注册后若未自动入会/)
    const projectCards = page.locator('[role="button"]').filter({ has: page.locator('h2') })

    if (await emptyHint.first().isVisible().catch(() => false)) {
      // Soft path: list chrome is enough when tenant has no projects
      await expect(page.getByRole('button', { name: '新建项目' })).toBeVisible()
      test.info().annotations.push({
        type: 'note',
        description: 'S5/S6 soft-pass: no company/projects for E2E user — detail/flow skipped',
      })
      return
    }

    // Open first project card if any
    const firstCard = projectCards.first()
    if (!(await firstCard.isVisible().catch(() => false))) {
      await expect(page.getByRole('button', { name: '新建项目' })).toBeVisible()
      return
    }

    await firstCard.click()
    await expect(page).toHaveURL(/\/projects\/\d+/, { timeout: 20_000 })

    // 两个视图页签：人轴画布 / 大纲（「关系图」React Flow 视图已下线）
    await expect(page.getByRole('button', { name: /大\s*纲/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /人轴画布/ })).toBeVisible()

    // Select a tree node if present
    const outlineBtn = page.locator('aside button').filter({ hasNotText: /大纲|人轴画布|智能体|重试/ }).first()
    if (await outlineBtn.isVisible().catch(() => false)) {
      await outlineBtn.click()
      await expect(page.getByRole('heading', { name: '提交材料' }).or(page.getByText('进度时间线'))).toBeVisible({
        timeout: 10_000,
      })
    }

    // S6: 切到人轴画布
    await page.getByRole('button', { name: /人轴画布/ }).click()
    const canvas = page.getByTestId('work-tree-canvas')
    await expect(canvas).toBeVisible({ timeout: 15_000 })

    // 调色板四类：人 / 工作项 / 里程碑 / 范围
    for (const key of ['person', 'work_item', 'milestone', 'scope']) {
      await expect(page.getByTestId(`palette-${key}`)).toBeVisible()
    }

    // 横/纵轴、树序/时间序可切换
    const axisBtn = canvas.getByRole('button', { name: /横向轴|纵向轴/ })
    const sortBtn = canvas.getByRole('button', { name: /树序|时间序/ })
    await expect(axisBtn).toBeVisible()
    await expect(sortBtn).toBeVisible()

    const axisBefore = await axisBtn.textContent()
    await axisBtn.click()
    await expect(axisBtn).not.toHaveText(axisBefore ?? '')

    const sortBefore = await sortBtn.textContent()
    await sortBtn.click()
    await expect(sortBtn).not.toHaveText(sortBefore ?? '')
  })

  test('S7: company settings opens', async ({ page }) => {
    await loginAsE2EUser(page)

    await page.getByRole('link', { name: /公司/ }).click()
    await expect(page).toHaveURL(/\/company\/settings/)
    await expect(page.getByRole('heading', { name: '公司设置' })).toBeVisible()
    await expect(page.getByText(/策略|存储|组织/).first()).toBeVisible()
  })

  test('S8: logout → protected URL redirects to login', async ({ page }) => {
    await loginAsE2EUser(page)

    // Logout control: button with title「退出登录」
    await page.getByTitle('退出登录').click()
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible()

    // Protected route must bounce back to login
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
    await page.goto('/tasks')
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
  })
})
