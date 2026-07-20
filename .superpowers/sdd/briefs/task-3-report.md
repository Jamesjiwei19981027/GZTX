# Task 3 Report: P0/P1 — Auth store, router, Layout, login/register

**Branch:** `frontend-react-rewrite`  
**Commit:** `d897d9f` — `feat(frontend): auth store, router guards, layout, login/register`  
**Date:** 2026-07-20  
**STATUS:** PASS

---

## Summary

Implemented Zustand auth store, React Router guards + full path table (placeholders for non-auth pages), SidebarLayout with Outlet/nav, and LoginPage with register mode. Wired `App.tsx` via `RouterProvider`. `npm run build` passes. Only frontend files committed.

---

## Files created / modified

### Created

| File | Role |
|------|------|
| `frontend/src/stores/auth.ts` | Zustand auth: login / register / logout / fetchCurrentUser |
| `frontend/src/routes/RequireAuth.tsx` | Token gate → `/login` |
| `frontend/src/routes/index.tsx` | `createBrowserRouter` path table |
| `frontend/src/layouts/SidebarLayout.tsx` | Sidebar + `<Outlet />` |
| `frontend/src/pages/LoginPage.tsx` | Login + register (Ant Design Form) |

### Modified

| File | Change |
|------|--------|
| `frontend/src/App.tsx` | `RouterProvider` + `router` |
| `frontend/index.html` | Title + Inter / Material Symbols fonts |

---

## Auth store (aligned with API + archive)

- **Token:** `getToken` / `setToken` on `localStorage.access_token`; also stores `refresh_token` from `AuthResponse` (needed by request interceptor refresh).
- **API:** uses `login`, `register`, `getCurrentUser` (not brief’s `getMe`), `logout` from `@/api/auth`.
- **login(username, password):** posts credentials → apply tokens + set `user` from response.
- **register(payload):** register → apply tokens/user → `company_join` message via Ant Design `message` (archive joinMessage rules).
- **logout():** best-effort API logout → clear tokens + state.
- **fetchCurrentUser():** `getCurrentUser` or clear auth on failure.
- Layout loads user on mount if token present and `user` null.

---

## Router

| Path | Element |
|------|---------|
| `/login` | `LoginPage` |
| `/register` | `LoginPage register` |
| `/` | `RequireAuth` → `SidebarLayout` |
| index | → `/dashboard` |
| `dashboard` / `tasks` / `tasks/new` / `tasks/:id` / `calendar` / `settings` / `projects` / `projects/:id` / `company/settings` | Placeholders |
| `inbox` / `kanban` / `chat` | Archive-compatible redirects |

`RequireAuth`: no token → `<Navigate to="/login" replace state.from />`.

---

## LoginPage

- Ant Design forms, Chinese labels.
- Login: username/password validation; success → navigate dashboard (or `state.from`).
- Register: username/email/password/confirm; nickname = username; success → dashboard (company_join tip from store).
- Mode switch via `/login` ↔ `/register`.
- Existing token on page load → redirect dashboard.

---

## SidebarLayout

- Nav: 仪表盘 / 我的任务 / 项目 / 日历; bottom: 公司 / 设置.
- 新建任务 → `/tasks/new`; logout → store.logout + `/login`.
- Active styles via `nav-link` / `active` classes.
- Mobile FAB for new task.

---

## Build / Test

```text
cd frontend && npm run build
# tsc -b && vite build — SUCCESS
```

Manual expected (with backend): no token on `/dashboard` → `/login`; login success → dashboard placeholders.

---

## Out of scope (Task 4+)

- Real dashboard/tasks/calendar/settings/projects pages (placeholders only).
- Company context / Web Push / ensureCompanyContext from Vue archive.
- Social login buttons are visual only.

---

## CONCERNS

- Material Symbols / Inter loaded from Google Fonts (archive used local `public/fonts`); offline build still works, icons need network at runtime.
- Auth store keeps `loading` / `lastCompanyJoin` beyond brief minimal interface for UX parity with archive.
- Register auto-login uses tokens from register response (archive behavior), not a separate login call.
