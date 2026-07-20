# Task 10 Report: P7 — Vitest unit tests

## STATUS

**DONE**

## COMMITS

| Hash | Message |
|------|---------|
| `2b618cfa46c31aea8dd4115fa010e2824b37953a` | `test(frontend): vitest for request helpers and auth guard` |

**Branch:** `frontend-react-rewrite`  
**Scope:** frontend-only (`frontend/package.json`, `frontend/package-lock.json`, `frontend/vitest.config.ts`, `frontend/src/test/*`)

## TEST

Commands (from `frontend/`):

```text
npm test          → 3 files, 9 tests passed
npm run typecheck → tsc -b --noEmit OK
npm run build     → tsc -b && vite build OK
```

### Coverage added

| File | What |
|------|------|
| `src/test/setup.ts` | `@testing-library/jest-dom` + RTL `cleanup` after each test |
| `src/test/request.test.ts` | `setToken`/`getToken`; `getErrorMessage` for AxiosError detail.message, ApiBusinessError, fallback |
| `src/test/auth.store.test.ts` | `selectNickname`; `logout` clears token/user; `fetchCurrentUser` without token |
| `src/test/RequireAuth.test.tsx` | no token → Navigate to `/login`; with token → children |

### Scripts / config

- `package.json`: `test` = `vitest run`, `test:watch` = `vitest`, `typecheck` = `tsc -b --noEmit`
- `vitest.config.ts`: jsdom, `@` alias, setup file
- DevDeps: vitest, jsdom, @testing-library/react, @testing-library/jest-dom (+ @types/jsdom)

## CONCERNS

1. **`getErrorMessage` vs plan snippet:** Plan used a plain `{ response: { data: { detail: { message } } } }` object. Actual implementation only extracts AxiosError via `axios.isAxiosError` / `ApiBusinessError`. Tests construct a real `axios.AxiosError` so they match production behavior.
2. **Vitest 4 + Vite 5:** Install resolved vitest **v4.1.10**, which emits esbuild/oxc deprecation warnings with `@vitejs/plugin-react` under Vite 5. Tests still pass; consider aligning vitest/vite major versions later if noise becomes an issue.
3. **RTL auto-cleanup:** Not automatic with current setup; global `afterEach(cleanup)` in `setup.ts` is required (first RequireAuth multi-render failure without it).
4. **typecheck includes tests:** `tsconfig.app.json` includes all of `src/`, so test files are typechecked by `tsc -b`. Unused imports in tests fail CI-style typecheck (`noUnusedLocals`).
