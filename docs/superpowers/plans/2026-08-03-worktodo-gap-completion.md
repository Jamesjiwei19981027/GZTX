# WorkTodo Gap Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining production Web/App/backend gaps recorded in the Codex handoff while preserving the current React WebView architecture and real API data flow.

> **Execution note (2026-08-03):** Tasks 1–6 have been implemented and verified in the shared workspace. Task 7.1–7.4 were re-run during handoff. The remaining unchecked items are intentionally deferred product scope (external Gmail/IMAP inbox, Web Push subscription authorization, WeChat binding, message attachments/pinned links/true direct messages, and billing/account deletion) or the final git handoff action.

**Architecture:** Keep `frontend/` as the only runnable Web source and `frontend-react-archive/` as a non-runnable reference. Extend the existing FastAPI contracts only where the design requires persisted data; use existing task, notification, project-member, storage, and user APIs wherever possible. The Flutter app remains a thin WebView shell, so Web UI fixes automatically reach Android.

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind; FastAPI + SQLAlchemy + Alembic + SQLite/PostgreSQL; Flutter + webview_flutter; Docker Compose.

---

### Task 1: Restore migration and Flutter test gates

**Files:**
- Modify: `backend/alembic/versions/f6a7b8c9d0e1_shell_channels_presence.py`
- Test: `backend/tests/collab/test_alembic_migration.py`
- Modify: `app/test/widget_test.dart`
- Modify: `app/lib/screens/web_shell_screen.dart`

- [ ] **Step 1: Add a migration regression assertion**

Run the existing empty-database migration test and capture the failure caused by `team_channels` already existing after `a1b2c3d4e5f6` calls `Base.metadata.create_all`.

Run: `cd backend; .\.venv312\Scripts\python.exe -m pytest tests/collab/test_alembic_migration.py::test_alembic_upgrade_empty_sqlite_creates_collab_tables -q`

Expected: FAIL with `sqlite3.OperationalError: table team_channels already exists`.

- [ ] **Step 2: Make the shell migration idempotent against the legacy bootstrap**

Use SQLAlchemy inspector checks before creating each shell table and index. The migration must create missing objects on a clean database, skip objects already created by the legacy metadata bootstrap, and leave `downgrade()` safe for objects that exist.

- [ ] **Step 3: Run the migration regression test**

Run the same pytest command and require PASS.

- [ ] **Step 4: Make WebView construction testable**

Keep production WebView behavior unchanged, but allow the widget test to use a platform-independent loading placeholder when `WebViewPlatform.instance` is unavailable. The test must still verify the app boot gate without requiring an Android/iOS WebView plugin.

- [ ] **Step 5: Run Flutter tests and analysis**

Run: `cd app; flutter test; flutter analyze`

Expected: all tests pass; analysis may report only non-blocking style info.

### Task 2: Connect real user profile and notification preferences

**Files:**
- Modify: `backend/app/api/v1/users.py`
- Modify: `backend/app/schemas/user.py`
- Modify: `frontend/src/api/auth.ts`
- Modify: `frontend/src/api/shell.ts`
- Modify: `frontend/src/components/views/SettingsView.tsx`
- Modify: `frontend/src/App.tsx`
- Test: `backend/tests/test_auth.py`
- Create: `frontend/src/test/settings.integration.test.tsx`

- [ ] **Step 1: Add failing API tests for profile and notification preference persistence**

Cover nickname/avatar updates, notification channel flags, quiet-hours, and weekend mute. Assert the response is persisted and returned by `GET /users/me`.

- [ ] **Step 2: Extend the user update schema with explicit fields**

Accept only `nickname`, `avatar_url`, and a validated `notify_pref` object. Reject unknown notification keys instead of silently accepting UI-only state.

- [ ] **Step 3: Implement the minimal frontend API calls**

Add typed `putCurrentUser` and `getCurrentUser` calls, plus a typed notification preference mapper. Replace localStorage-only notification toggles with a load/save cycle and preserve local state only as an offline presentation fallback.

- [ ] **Step 4: Add the settings notification section**

Render email, browser push, WeChat, quiet-hours, and weekend mute controls. Save through the API, display server errors, and retain the existing theme/language preference behavior.

- [ ] **Step 5: Run backend and frontend focused tests**

Run the new backend tests and `cd frontend; npm run lint; npm run build`.

### Task 3: Complete task creation, categories, tags, and attachments

**Files:**
- Modify: `backend/app/api/v1/tasks.py`
- Modify: `backend/app/schemas/task.py`
- Modify: `frontend/src/api/backend.ts`
- Modify: `frontend/src/components/modals/NewTaskModal.tsx`
- Modify: `frontend/src/components/modals/TaskDetailDrawer.tsx`
- Modify: `frontend/src/App.tsx`
- Test: `backend/tests/test_tasks.py`
- Create: `frontend/src/test/task-create-contract.test.ts`

- [ ] **Step 1: Add failing contract tests**

Verify `category_id`, `tag_ids`, `project_id`, `project_node_id`, `origin`, and `due_date` survive create/update, and verify attachment upload is available after creation.

- [ ] **Step 2: Extend the typed task API and mapper**

Send all supported fields, normalize empty values to `null`/omitted fields, and map category/tag objects into the UI task type.

- [ ] **Step 3: Wire real category/tag loading**

Load `/categories` and `/tags` for the current user, render selections in `NewTaskModal`, and submit `category_id`/`tag_ids`.

- [ ] **Step 4: Add post-create attachment flow**

Create the task first, then upload selected files through the existing attachment endpoint; show partial failure without discarding the created task.

- [ ] **Step 5: Run task tests and build**

Run backend task tests, frontend tests, and `npm run build`.

### Task 4: Implement real calendar and kanban affordances

**Files:**
- Modify: `frontend/src/components/views/CalendarView.tsx`
- Modify: `frontend/src/components/views/KanbanView.tsx`
- Modify: `frontend/src/api/backend.ts`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/components/views/calendarUtils.ts`
- Test: `frontend/src/test/calendarUtils.test.ts`

- [ ] **Step 1: Write date-grid and week/day view tests**

Cover month navigation, ISO date grouping, week boundaries, and timezone-safe due-date rendering.

- [ ] **Step 2: Implement calendar utilities**

Generate the visible month/week/day ranges from the selected date, group tasks by local calendar date, and expose drop targets that return `YYYY-MM-DD`.

- [ ] **Step 3: Replace the fixed demo month**

Add previous/next/today controls, functional month/week/day rendering, and task drag-to-date updates through `updateTask`.

- [ ] **Step 4: Add kanban member/filter header**

Load project members when a project is selected, render avatar overflow, add status/priority/category filters, and display the latest real activity timestamp when available.

- [ ] **Step 5: Run focused frontend tests and build**

Run Vitest/typecheck/build and manually verify `/calendar` and `/kanban` through the running Vite container.

### Task 5: Finish collaboration inbox and messages without fake fallback

**Files:**
- Modify: `frontend/src/components/views/InboxView.tsx`
- Modify: `frontend/src/components/views/MessagesView.tsx`
- Modify: `frontend/src/api/shell.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `backend/app/api/v1/shell.py`
- Modify: `backend/app/schemas/common.py` only if response typing requires it
- Test: `backend/tests/collab/test_shell_api.py`
- Create: `frontend/src/test/shell-contract.test.ts`
- Modify: `docs/UI设计稿-正式前端-后端缺口对照清单_Codex接手.md`

- [ ] **Step 1: Add shell API regression tests**

Cover company-member authorization, default channel creation, message pagination, like idempotency, notification unread filtering, and presence expiry.

- [ ] **Step 2: Make likes idempotent**

Add a user/message like relation or an equivalent unique server-side guard so repeated clicks cannot inflate counts indefinitely.

- [ ] **Step 3: Build the collaboration inbox reading pane**

Use `/notifications/collab` as the product source of truth, add all/unread/needs-reply filters, search, mark-read/mark-all-read, and a detail pane with “转为任务”. Update the handoff document to explicitly mark D3 as collaboration inbox rather than Gmail/IMAP.

- [ ] **Step 4: Build the messages three-pane layout on existing data**

Use channels as the left conversation list, messages as the center pane, and project members/presence plus linked project tasks as the right pane. Keep voice/video and external mail out of scope and state that in the handoff document.

- [ ] **Step 5: Remove demo fallback for authenticated company flows**

Show an actionable empty state when no company/project is available; do not silently inject `TEAM_MEMBERS`, demo messages, or fake projects.

- [ ] **Step 6: Run shell tests and frontend build**

Run focused backend tests, frontend tests, and Docker endpoint checks.

### Task 6: Add security settings and production safeguards

**Files:**
- Modify: `frontend/src/components/views/SettingsView.tsx`
- Modify: `frontend/src/api/auth.ts`
- Modify: `backend/Dockerfile.prod`
- Create: `backend/.dockerignore`
- Create: `frontend/.dockerignore`
- Modify: `backend/Dockerfile.prod`
- Modify: `docker-compose.prod.yml`
- Test: `backend/tests/test_production_guard.py`

- [ ] **Step 1: Add a change-password UI contract test**

Verify the settings form requires current password, validates the new password locally, and calls the existing backend endpoint once.

- [ ] **Step 2: Add the security settings UI**

Render change-password, logout, and account-danger sections only where the backend supports them; do not display fake account deletion or billing actions.

- [ ] **Step 3: Prevent production image secret/data leakage**

Exclude `.env*`, `data/`, database files, caches, `node_modules/`, and `dist/` from build contexts; copy only the application files needed by production images.

- [ ] **Step 4: Prevent duplicate production schedulers**

Disable the scheduler in web workers and document/compose a single scheduler process, or use the existing distributed lock if it is proven safe by tests.

- [ ] **Step 5: Run production config and image checks**

Run `docker compose -f docker-compose.prod.yml config`, production guard tests, and build-context inspection without exposing secrets.

### Task 7: Full verification and handoff

**Files:**
- Modify: `docs/UI设计稿-正式前端-后端缺口对照清单_Codex接手.md`
- Modify: `README.md` and `启动指导文档.md` only where commands/status are stale

- [ ] **Step 1: Run the complete backend suite**

Run `cd backend; .\.venv312\Scripts\python.exe -m pytest -q` and require zero failures.

- [ ] **Step 2: Run complete frontend checks**

Run `cd frontend; npm test` if configured, `npm run lint`, `npm run build`, and the available Playwright smoke tests with the documented test account.

- [ ] **Step 3: Run Flutter checks**

Run `cd app; flutter test; flutter analyze; flutter build apk --debug --dart-define=WEB_BASE_URL=http://10.0.2.2/`.

- [ ] **Step 4: Run Docker smoke checks**

Run `docker compose up -d --build`, verify all services are healthy, call `/api/v1/health`, `/docs`, `/`, and each protected route after login, then inspect recent logs for 5xx errors.

- [ ] **Step 5: Update the handoff checklist and push the implementation**

Mark only evidence-backed rows as complete, commit the implementation, push `app`, and report commit hashes plus any explicitly deferred product capabilities.
