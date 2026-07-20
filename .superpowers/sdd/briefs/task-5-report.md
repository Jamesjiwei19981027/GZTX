# Task 5 Report — Calendar + Settings (personal SMTP/LLM)

## STATUS

**DONE**

## COMMITS

- `3c35686` — `feat(frontend): calendar and personal settings (SMTP/LLM)`
  - Files (frontend only):
    - `frontend/src/pages/CalendarPage.tsx` (new)
    - `frontend/src/pages/SettingsPage.tsx` (new)
    - `frontend/src/routes/index.tsx` (wire `/calendar`, `/settings`)

## TEST

| Check | Result |
|-------|--------|
| `cd frontend && npm run build` (`tsc -b && vite build`) | **PASS** (exit 0) |
| Routes `/calendar`, `/settings` replace placeholders | Wired in `routes/index.tsx` |
| Empty secret not overwritten | SMTP `smtp_password` / LLM `api_key` only included in payload when non-empty trim |
| has_password / has_api_key placeholders | Password fields show “已保存，留空不修改” when set |

## Implementation notes

### Calendar (`CalendarPage.tsx`)
- Month grid (6×7) with prev/next/today.
- Loads tasks via `useTaskStore.fetchTasks({ due_date_from, due_date_to, page_size: 200 })` for the visible range.
- Tasks grouped by due date day; busy days show title chips + count dot; empty in-month days show faint `event_available` icon.
- Click day → side panel lists that day’s tasks; click task → navigate `/tasks/:id`.
- Simpler than Vue archive (month-only, no week/day/popup batch ops); meets brief requirements.

### Settings (`SettingsPage.tsx`)
- Personal SMTP: host/port/user/from/password; load via `getSmtpConfig` + `getEmailStatus`; save via `updateSmtpConfig`; test via `sendTestEmail`.
- Personal LLM: provider/base_url/model/api_key/temperature/max_tokens + enabled/agent/judge switches; load `getLlmConfig`; save `updateLlmConfig`; test `testLlmConfig`.
- Empty password / api_key omitted from update payload (archive-compatible).
- Provider presets from API when present; fallback list includes Fake.

## CONCERNS

- Calendar is month-only (no week/day views from Vue archive).
- Settings omits profile/theme/sound/notify-pref blocks from full `SettingsView.vue`; only personal SMTP + personal LLM as required by task brief.
- Task fetch `page_size: 200` may truncate if a month has more due tasks than that page size.
- No interactive E2E against live backend in this task; build-only verification.

## Final

**STATUS:** DONE  
**COMMITS:** `3c35686`  
**TEST:** `npm run build` PASS  
**CONCERNS:** Month-only calendar; settings scoped to SMTP/LLM; possible page_size truncation  
