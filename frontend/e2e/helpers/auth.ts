import { expect, type Page } from '@playwright/test'

/** Staging / local credentials — set via env before running the suite. */
export function e2eCredentials(): { username: string; password: string } {
  const username = process.env.E2E_USER?.trim()
  const password = process.env.E2E_PASSWORD?.trim()
  if (!username || !password) {
    throw new Error(
      'E2E_USER and E2E_PASSWORD must be set (staging pre-seeded account). Example (PowerShell):\n' +
        '  $env:E2E_USER="demo"; $env:E2E_PASSWORD="secret"; $env:PLAYWRIGHT_BASE_URL="http://127.0.0.1:5173"; npm run test:e2e',
    )
  }
  return { username, password }
}

/**
 * Login via LoginPage labels:
 * - Form.Item label「用户名」「密码」
 * - form submit button「登录」(not the tab toggle also named 登录)
 */
export async function loginAsE2EUser(page: Page): Promise<void> {
  const { username, password } = e2eCredentials()

  await page.goto('/login')
  await clearClientAuth(page)
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible()

  // Ant Design Form.Item associates labels with inputs
  await page.getByLabel('用户名').fill(username)
  await page.getByLabel('密码', { exact: true }).fill(password)
  // Prefer form submit over the tab toggle button also named「登录」
  await page.locator('form').getByRole('button', { name: '登录' }).click()

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: '今日工作总览' })).toBeVisible({
    timeout: 30_000,
  })
}

/** Clear client auth storage so the next visit is unauthenticated. Page must be on app origin. */
export async function clearClientAuth(page: Page): Promise<void> {
  await page.evaluate(() => {
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      /* ignore */
    }
  })
}
