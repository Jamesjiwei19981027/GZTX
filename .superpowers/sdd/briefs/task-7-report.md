# Task 7 Report: P5 — CompanySettings

## STATUS

**DONE**

- Created `frontend/src/pages/CompanySettingsPage.tsx` ported from `frontend-vue-archive/src/views/CompanySettingsView.vue`
- Wired `/company/settings` to real page (removed Placeholder)
- Reused `useCompanyContext` (Task 6) for company list / persist / ensure
- Write failures (non-admin / 403): `message.error(getErrorMessage(...))` — no silent fail
- Secrets: empty password / api_key not sent (leave blank = no overwrite); never displays plaintext from API

## COMMITS

- `07299b7` — `feat(frontend): company settings SMTP/LLM`
  - `frontend/src/pages/CompanySettingsPage.tsx` (new)
  - `frontend/src/routes/index.tsx` (route wire)

Frontend-only commit (no backend / miniprogram).

## TEST

| Check | Result |
|-------|--------|
| `cd frontend && npm run build` (`tsc -b && vite build`) | **PASS** |
| Route `/company/settings` | Bound to `CompanySettingsPage` |
| API surface | `get/put/test` company SMTP & LLM; login methods; bindings; integrations; org tree — via `api/collab.ts` |
| S7 (runtime admin save / 403 message) | **Not exercised against live backend in this task** (build-only smoke). UI paths call `getErrorMessage` on all write/test failures. |

## CONCERNS

1. **S7 live smoke** needs authenticated session with/without super-admin to confirm 403 message text from backend; not run here.
2. `load` depends on `activeProvider` for integration form reset; switching company mid-edit is fine via `onCompanyChange`, but concurrent edits while loading could briefly race (same as Vue archive pattern).
3. Integration secret fields use placeholder `********` when configured; client still sends form values on save (backend expected to ignore placeholder / empty secrets — same contract as Vue).
4. Company SMTP/LLM are separate from personal `/settings` (Task 5); priority text documents personal → company → env, matching archive copy.
