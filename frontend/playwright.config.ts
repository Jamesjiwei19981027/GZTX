import { defineConfig, devices } from '@playwright/test'

/**
 * E2E 用例分为两组：
 * - 开发组：内联 harness 直接 import `/src/...` 或其他 Vite 开发模块。
 *   用 `npx vite --port 5174 --strictPort` 启动后端配套的开发服务器，再运行 `npx playwright test`。
 * - 生产组：标记了 `@prod`、不直接加载源码模块的用例。先 `npm run build`，
 *   再用 `npx vite preview` 提供产物，最后运行 `npm run test:e2e:prod`。
 *
 * 两组都需要先启动后端并按工作流准备 E2E 账号；PLAYWRIGHT_BASE_URL 可覆盖默认地址。
 */
export default defineConfig({
  testDir: './e2e',
  // 用例之间共享同一套种子账号与数据库，禁止并发，避免相互污染数据。
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'zh-CN',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
