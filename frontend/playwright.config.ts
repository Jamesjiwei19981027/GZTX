import { defineConfig, devices } from '@playwright/test'

/**
 * E2E 冒烟套件（S1–S8，对应 docs/superpowers/acceptance/2026-07-20-react-rewrite-gates.md §6.11）。
 *
 * 前置条件（本地或 CI 均需先起好）：
 * 1. 后端 uvicorn（DEBUG=true + sqlite e2e 库 + RATE_LIMIT_ENABLED=false）；
 * 2. python scripts/seed_e2e_user.py 种好 E2E_USER / E2E_PASSWORD 账号；
 * 3. 前端 npm run build 后 vite preview（/api 代理需指向上面的后端，
 *    通过 DEV_API_TARGET 环境变量注入，见 vite.config.ts）。
 *
 * PLAYWRIGHT_BASE_URL 指向 preview 地址；CI 用 5173，本地建议 5174（8010/5173 被 Docker 占用）。
 */
export default defineConfig({
  testDir: './e2e',
  // 用例之间共享同一个种子账号与数据库，禁止并发，避免相互踩数据
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
