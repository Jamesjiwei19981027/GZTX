import { expect, test } from '@playwright/test'

// Opt in only for the dedicated axis joint-debug backend. No model/API stubs.
const projectId = process.env.AXIS_LIVE_PROJECT_ID
test.skip(!projectId, 'Requires the isolated, seeded joint-debug backend')

for (const width of [390, 1280]) {
  test(`real project wiki loads and explains missing model at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 })
    const login = await request.post('/api/v1/auth/login', { data: {
      username: 'axis_pm', password: process.env.AXIS_LIVE_PASSWORD || 'axis-debug-2026',
    } })
    expect(login.ok()).toBeTruthy()
    const { data } = await login.json()
    const headers = { Authorization: `Bearer ${data.access_token}` }
    const catalog = await request.get(`/api/v1/projects/${projectId}/llm-wiki`, { headers })
    expect(catalog.ok()).toBeTruthy()
    const initial = (await catalog.json()).data
    expect(initial.engine).toBe('microsoft/llmwiki')
    expect(initial.materials.some((m: { can_generate: boolean }) => m.can_generate)).toBe(true)
    await page.addInitScript(tokens => {
      localStorage.setItem('access_token', tokens.access_token)
      localStorage.setItem('refresh_token', tokens.refresh_token)
    }, data)
    await page.goto('/?view=people-axis')
    await page.locator('.axis-project-picker select').selectOption(projectId!)
    await page.getByRole('button', { name: '项目知识', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '项目知识', exact: true })
    await expect(dialog.getByRole('heading', { name: /责任树联合调试 · 项目知识/ })).toBeVisible()
    const response = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/llm-wiki/drafts'))
    await dialog.getByRole('button', { name: 'AI 整理为草稿', exact: true }).click()
    expect((await response).status()).toBe(409)
    await expect(dialog.getByRole('alert')).toContainText('配置并启用可用的 LLM 模型')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: test.info().outputPath(`wiki-${width}.png`), fullPage: true })
    const after = await request.get(`/api/v1/projects/${projectId}/llm-wiki`, { headers })
    expect((await after.json()).data.drafts.length).toBe(initial.drafts.length)
  })
}
