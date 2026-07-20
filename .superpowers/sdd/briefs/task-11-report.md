# Task 11 Report — P7 Playwright E2E smoke suite

## STATUS

**DONE_WITH_CONCERNS**

Runnable Playwright suite is committed under `frontend/`. Full S1–S8 green run was **not** completed in this environment: frontend dev server and backend API were not listening on `127.0.0.1:5173` / API host, and no `E2E_USER` / `E2E_PASSWORD` staging credentials were provided.

## COMMITS

- Frontend-only commit: `test(frontend): Playwright smoke e2e suite for gate S1-S8`
  - Files:
    - `frontend/playwright.config.ts` (new)
    - `frontend/e2e/smoke.spec.ts` (new)
    - `frontend/e2e/helpers/auth.ts` (new)
    - `frontend/package.json` (`test:e2e`, `@playwright/test`)
    - `frontend/package-lock.json`
    - `.gitignore` (Playwright artifact dirs)

## What was implemented

| Gate | Test | Notes |
|------|------|--------|
| S1 | `S1: login → dashboard` | Labels「用户名」「密码」; form button「登录」; expects `/dashboard` +「今日工作总览」 |
| S2 | `S2: create task → list → detail` |「新建任务」→ title →「创建任务」→ list shows title |
| S3 | `S3: calendar page loads` | Nav「日历」;「今天」; month grid present |
| S4 | `S4: settings — personal LLM Fake save + SMTP form visible` | SMTP + LLM sections; try Fake +「保存配置」/「测试连通性」 |
| S5+S6 | `S5+S6: projects — outline select + flow tab` | List/detail;「大纲」/「关系图」; soft-skip if no company/projects |
| S7 | `S7: company settings opens` | Nav「公司」→「公司设置」 |
| S8 | `S8: logout → protected URL redirects to login` | `title="退出登录"` then `/dashboard` & `/tasks` → `/login` |

Config:

- `PLAYWRIGHT_BASE_URL` default `http://127.0.0.1:5173`
- `timeout: 90_000`, `retries: 0` (no flaky masking)
- Project: chromium only
- Env credentials: `E2E_USER`, `E2E_PASSWORD`

Script: `npm run test:e2e` → `playwright test`

## How to run

```powershell
# Terminal 1 — backend
cd backend
uvicorn app.main:app --reload

# Terminal 2 — frontend
cd frontend
npm run dev

# Terminal 3 — E2E
cd frontend
npx playwright install chromium   # once per machine
$env:E2E_USER = "<staging-user>"
$env:E2E_PASSWORD = "<staging-password>"
$env:PLAYWRIGHT_BASE_URL = "http://127.0.0.1:5173"
npm run test:e2e
```

Staging:

```powershell
$env:PLAYWRIGHT_BASE_URL = "https://your-staging-host"
$env:E2E_USER = "..."
$env:E2E_PASSWORD = "..."
cd frontend
npm run test:e2e
```

## TEST

| Check | Result |
|-------|--------|
| `npx playwright test --list` | OK — 7 tests in 1 file |
| `npx playwright install chromium` | OK |
| `npx playwright test` (no env / no servers) | Expected fail: missing `E2E_USER`/`E2E_PASSWORD` (clear error from helper) |
| Full green against live backend | **Not run** — services down |

## CONCERNS

1. **Backend + credentials required** for gate-green; suite is intentionally live-API oriented (no mock-only substitute per §6.11).
2. **S5/S6 soft path**: if E2E user has no company/projects, detail outline + Flow assertions are skipped with annotation — still need a seeded tenant for hard S5/S6.
3. **S2 task has no due date** by default — calendar may not show that specific task; S3 only asserts calendar chrome / no crash (spec allows “有任务时可见入口更佳”).
4. **S4 LLM Fake**: depends on backend Fake provider + save API; connectivity test is best-effort.
5. **Ant Design Select** for Provider is less stable than native controls; may need `aria-label` hardening later if flaky on CI.
6. Chromium was installed to the local Playwright browser cache; CI runners must run `npx playwright install chromium` (or `install-deps` on Linux).
