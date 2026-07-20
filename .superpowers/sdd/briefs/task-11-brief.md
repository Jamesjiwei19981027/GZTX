## Task 11: P7 鈥?Playwright E2E锛埪?.11锛?
**Files:**
- Create: `frontend/playwright.config.ts`, `frontend/e2e/smoke.spec.ts`, `frontend/e2e/helpers/auth.ts`
- Script: `test:e2e`

- [ ] **Step 1: 瀹夎**

```bash
cd frontend
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: 閰嶇疆**

```typescript
// frontend/playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173'

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  retries: 0,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
```

- [ ] **Step 3: 鐢ㄤ緥瑕嗙洊 S1鈥揝8 绛変环璺緞**

浣跨敤鐜鍙橀噺锛?
- `E2E_USER` / `E2E_PASSWORD`锛坰taging 棰勭疆璐﹀彿锛?- 鎴?setup 閲岃皟鐢ㄦ敞鍐?API锛堣嫢寮€鏀炬敞鍐岋級

```typescript
// e2e/smoke.spec.ts 缁撴瀯绀轰緥
import { test, expect } from '@playwright/test'

test.describe('WorkTodo smoke', () => {
  test('login to dashboard', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/鐢ㄦ埛|璐﹀彿|鐢ㄦ埛鍚?i).fill(process.env.E2E_USER!)
    await page.getByLabel(/瀵嗙爜/i).fill(process.env.E2E_PASSWORD!)
    await page.getByRole('button', { name: /鐧诲綍/i }).click()
    await expect(page).toHaveURL(/dashboard/)
  })
  // ... 鍒涘缓浠诲姟銆佹棩鍘嗐€佽缃?LLM Fake銆侀」鐩ぇ绾?Flow銆佺櫥鍑?})
```

閫夋嫨鍣ㄤ互鏈€缁?UI 鐨?`aria-label` / 涓枃鎸夐挳涓哄噯锛涘疄鐜伴〉闈㈡椂涓?E2E 绋冲畾鍔犲彲璁块棶鍚嶃€?
- [ ] **Step 4: 鏈湴瀵?dev 鎴?preview 璺戦€?*

```bash
# 鍚庣 + frontend build preview 鎴?dev
set PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173
cd frontend && npx playwright test
```

Expected: 鍏ㄧ豢锛涘け璐ヤ笉寰楅潬 retries 鎺╃洊 flaky銆?
- [ ] **Step 5: Commit**

```bash
git commit -am "test(frontend): Playwright smoke e2e suite for gate S1-S8"
```

---

