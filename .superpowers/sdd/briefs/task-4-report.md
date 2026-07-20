# Task 4 Report: P2 — Dashboard, Task list, Task detail/create

**Branch:** `frontend-react-rewrite`  
**Commit:** `16007b2` — `feat(frontend): port dashboard and task list/detail pages`  
**Date:** 2026-07-20  
**STATUS:** PASS

---

## Summary

Ported Vue archive dashboard + task list + task detail/create to React (Zustand + Ant Design + Tailwind). Wired real pages into the router. Core smoke path S2 supported: create → list → detail. `npm run build` passes. Only frontend files committed.

---

## Files created / modified

### Created

| File | Role |
|------|------|
| `frontend/src/stores/task.ts` | Zustand task store (list/detail/CRUD/complete/stats + UTC conversion) |
| `frontend/src/pages/DashboardPage.tsx` | Stats cards, weekly progress ring, upcoming + recent activity |
| `frontend/src/pages/TaskListPage.tsx` | Filters, search, grid of TaskItems, quick detail modal, complete dialog |
| `frontend/src/pages/TaskDetailPage.tsx` | Create (`/tasks/new`) + detail/edit/complete/delete |
| `frontend/src/components/tasks/TaskForm.tsx` | Create/edit form (title, desc, priority, category, due, tags) |
| `frontend/src/components/tasks/TaskItem.tsx` | Card item + menu (edit/complete/restore/delete) |
| `frontend/src/components/tasks/TaskCompleteDialog.tsx` | Completion rate / comment / follow-up modal |

### Modified

| File | Change |
|------|--------|
| `frontend/src/routes/index.tsx` | `dashboard` / `tasks` / `tasks/new` / `tasks/:id` → real pages |

---

## Task store (aligned with archive Pinia)

API used from `api/task.ts`:

- `getTaskList`, `getTodayTasks`, `getTaskDetail`
- `createTask`, `updateTask`, `completeTask`, `uncompleteTask`, `deleteTask`
- `batchCompleteTask`, `batchDeleteTask`, `getTaskStats`

Behavior:

- **UTC helpers:** local → naive UTC on write; naive UTC → local on read (due_date, reminders, timestamps).
- **Labels:** fallback `priority_label` / `status_label` when API omits them.
- **State:** `tasks`, `currentTask`, `loading`, `pagination`, `stats`, `filterParams`.
- **Actions:** fetchTasks (replace filter when params given), fetchTodayTasks, fetchTaskDetail, addTask, editTask, markComplete (message feedback), markUncomplete, removeTask, batch*, fetchStats, clearCurrentTask, resetFilter.
- Sound effects from Vue archive **not** ported (no composable dependency).

---

## Pages / routes

| Path | Page |
|------|------|
| `/dashboard` | DashboardPage — metric cards navigate to filtered `/tasks?...` |
| `/tasks` | TaskListPage — status/priority pills, search debounce, follow-up switch, due range from query, pagination |
| `/tasks/new` | TaskDetailPage create mode → `addTask` → `/tasks` |
| `/tasks/:id` | TaskDetailPage view/edit/complete/delete |

List click opens quick Modal + full detail via “打开完整详情页” / edit.

---

## Build / Test

```text
cd frontend && npm run build
# tsc -b && vite build — SUCCESS
```

Manual S2 (with backend + auth):

1. Login → Dashboard loads stats/tasks (or empty states).
2. 新建任务 → fill title → create → list shows task.
3. Open task → detail page; edit / complete / delete available.

---

## Out of scope / intentional gaps

- Pixel-perfect MD3 styling (functional parity, simplified Tailwind + Ant Design).
- Full `ReminderSetting` / live reminder countdown / channel badges (form omits advanced reminders; complete dialog still has follow-up).
- Vue `TaskDetailDialog` as separate component — list uses Ant Modal + API detail.
- Sound effects, CategoryPicker multi-create UX polish, weekly bar chart from unused archive sections.
- Calendar / settings / projects remain placeholders.

---

## CONCERNS

- Task list applies filters on mount + URL query changes; debounced search may double-fetch once on first paint (acceptable).
- Create form does not yet re-send existing reminder list on edit (reminders left as returned by API until a dedicated reminder editor is ported).
- Large bundle warning from Vite (Ant Design) pre-existing pattern; not introduced as a functional regression.
