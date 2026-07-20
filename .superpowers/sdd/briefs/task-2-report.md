# Task 2 Report: P0 — request client + types/API migration

**Branch:** `frontend-react-rewrite`  
**Commit:** `f4cb9ae` — `feat(frontend): port axios request client and API/types from Vue archive`  
**Date:** 2026-07-20  
**STATUS:** PASS

---

## Summary

Ported the Vue archive axios request layer and all shared API/type modules into the React frontend (`frontend/src/api`, `frontend/src/types`). Envelope unpacking, 401 refresh, and error extraction follow **archive** `request.ts` (not the brief’s simplified snippet). No Vue/Element Plus imports. No auth UI. No monorepo-wide `git add -A`.

---

## Files created / modified

### Created — `frontend/src/api/`

| File | Source |
|------|--------|
| `request.ts` | Port of `frontend-vue-archive/src/api/request.ts` (React-adapted) |
| `auth.ts` | Archive copy; `@/types` path |
| `task.ts` | Archive copy |
| `notifications.ts` | Archive copy |
| `collab.ts` | Archive copy |
| `categories.ts` | Archive copy |
| `tags.ts` | Archive copy |
| `reminders.ts` | Archive copy |

### Created — `frontend/src/types/`

| File | Source |
|------|--------|
| `index.ts` | Archive; removed Element Plus `UploadFile` type |
| `collab.ts` | Archive (unchanged content) |

### Modified

| File | Change |
|------|--------|
| `frontend/src/vite-env.d.ts` | Added `ImportMetaEnv.VITE_API_BASE` |

---

## request.ts behavior (archive-aligned)

### Matches archive

| Behavior | Detail |
|----------|--------|
| Token key | `localStorage.access_token` (+ `refresh_token` for refresh flow) |
| Auth header | `Authorization: Bearer ${token}` on every request when token present |
| Envelope | If body has `code`: success only when **`code === 200`** (not `0`); return `data` or `null` if data missing |
| Non-envelope | If no `code` field, return body as-is |
| Business error | `ApiBusinessError(code, message, detail)` on non-200 envelope |
| 401 handling | Single-flight `refreshAccessToken()` via raw `axios.post` to `{base}/auth/refresh`; retry original once with `_retry`; clear tokens + redirect if refresh fails |
| Refresh 401 | Immediate clear + redirect (no loop) |
| `getErrorMessage` | `ApiBusinessError` → message; Axios → `message` then `detail` string/object; Error → message; else fallback (`操作失败`) |

### React adaptations (no Vue deps)

| Archive | React port |
|---------|------------|
| `import router from '@/router'` + `router.push('/login')` | `window.location.assign('/login')` if path does not start with `/login` |
| `ElMessage.error(...)` | Removed (callers use `getErrorMessage` + Ant Design later) |
| Hardcoded `baseURL: '/api/v1'` | `import.meta.env.VITE_API_BASE \|\| '/api/v1'` (same default path) |
| Refresh URL hardcoded `/api/v1/auth/refresh` | `${VITE_API_BASE \|\| '/api/v1'}/auth/refresh` |

### Explicitly NOT from brief snippet

- Brief suggested accepting `code === 0` as success — **not used**; archive only accepts `200`.
- Brief omitted token refresh — **refresh kept** from archive.
- Brief’s simplified `getErrorMessage` order differed — **archive order kept** (`message` before `detail` for HTTP errors).

### Helpers exported

- `ApiBusinessError`
- `getToken` / `setToken`
- `getErrorMessage`
- `request` (default export) with typed `get/post/put/patch/delete/...` returning unwrapped `T`

---

## Types notes

- `types/index.ts`: full domain DTOs (User, Task, Category, Tag, Reminder, SMTP/LLM/Push, pagination, filters, `ApiResponse`).
- Removed archive-only `UploadFile` (Element Plus).
- `types/collab.ts`: company/project/tree/evidence/agent/org DTOs unchanged.

---

## API modules

All modules import `request` from `./request` and types from `@/types` or `@/types/collab`. No `vue`, `element-plus`, or router imports.

Endpoints unchanged from archive (auth, tasks, notifications, collab, categories, tags, reminders).

---

## Build / test

```text
cd frontend && npm run build
# tsc -b && vite build → PASS
# vite v5.4.21, 1564 modules, dist OK
```

Unit test `request.test.ts` deferred (Task 11 / vitest per brief).

---

## Commit

```text
f4cb9ae feat(frontend): port axios request client and API/types from Vue archive
```

Staged only:

- `frontend/src/api/*`
- `frontend/src/types/*`
- `frontend/src/vite-env.d.ts`

Dirty backend/docs/miniprogram tree left unstaged.

---

## Concerns / follow-ups

1. **Toast UX:** Archive showed `ElMessage` on business/HTTP errors; React port is silent. Task 3+ should wire UI toasts via `getErrorMessage`.
2. **Redirect:** Uses full navigation `window.location.assign('/login')` until React Router auth guard exists (Task 3).
3. **No consumers yet:** API modules are not imported by pages/stores until later tasks; tree-shaking keeps build green.
4. **Vitest:** Envelope/refresh unit tests not added this task.
5. **VITE_API_BASE:** Optional env documented via `vite-env.d.ts`; default remains `/api/v1` (Vite proxy already configured in Task 1).

---

## Checklist

- [x] Read archive `request.ts` and match envelope (`code === 200` only)
- [x] Token key `access_token`
- [x] Port types (drop Vue-only types)
- [x] Port all 7 API modules + request
- [x] No vue imports
- [x] `npm run build` PASS
- [x] Commit only under `frontend/src/api`, `frontend/src/types`, `vite-env.d.ts`
- [x] Did not modify `frontend-vue-archive`
- [x] Did not implement auth UI
