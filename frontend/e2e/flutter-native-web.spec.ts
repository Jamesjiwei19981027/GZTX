import { expect, test } from '@playwright/test'

/**
 * Flutter native shell smoke test using the compiled Flutter web target.
 * Set FLUTTER_WEB_URL to the locally served build/web directory; it is
 * intentionally opt-in so the regular Web E2E suite does not need Flutter.
 */
const baseUrl = process.env.FLUTTER_WEB_URL
test.skip(!baseUrl, 'Set FLUTTER_WEB_URL to run the Flutter shell smoke test')

test('Flutter native shell mobile viewport exercises login and navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/auth/')) console.log(`flutter-web request ${request.method()} ${request.url()}`)
  })
  await page.goto(baseUrl!, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3_000)

  // Flutter web renders the native shell to CanvasKit, so there is no DOM
  // button tree. Use the same fixed 390x844 touch coordinates as a phone.
  await page.mouse.click(195, 274)
  await page.keyboard.type('e2e_user')
  await page.mouse.click(195, 341)
  await page.keyboard.type('e2e-password-123')
  await page.waitForTimeout(500)
  const login = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/auth/login') && response.request().method() === 'POST',
  )
  await page.mouse.click(195, 410)
  expect((await login).status()).toBe(200)
  await page.waitForTimeout(1_500)

  const navPoints = [
    { name: '任务', x: 117 },
    { name: '日历', x: 195 },
    { name: '项目', x: 273 },
    { name: '设置', x: 351 },
    { name: '仪表盘', x: 39 },
  ]
  let previous = await page.screenshot()
  for (const item of navPoints) {
    await page.mouse.click(item.x, 810)
    await page.waitForTimeout(500)
    const current = await page.screenshot()
    expect(Buffer.compare(previous, current), `${item.name} 导航点击没有改变 Flutter 画面`).not.toBe(0)
    previous = current
  }
})
