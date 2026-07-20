# Task 0 Report: branch, archive Vue frontend, tag

**Date:** 2026-07-20  
**Branch:** `frontend-react-rewrite`  
**Status:** DONE

## Summary

Completed Task 0 of the Vue → React rewrite: created branch `frontend-react-rewrite` from dirty working tree HEAD on `rollback-frontend-to-613`, moved `frontend/` → `frontend-vue-archive/`, left a React placeholder at `frontend/README.md`, committed **only** frontend archive paths, and tagged `vue-frontend-last` at that commit.

## Steps performed

### Step 1 — Pre-archive baseline (Vue under `frontend/`)

- **Node:** v24.18.0 / **npm:** 11.16.0
- `cd frontend && npm ci && npm run build`
- **Result:** success (`vue-tsc -b && vite build`, ~17s). Warnings only (Rollup PURE comments in `@vueuse/core`, chunk size >500kB, static+dynamic import of `useWebPush`).

### Step 2 — Branch + move

- `git checkout -b frontend-react-rewrite` (from `e54aacc` on dirty tree — OK)
- `git mv frontend frontend-vue-archive` (succeeded)
- Created `frontend/README.md` placeholder: `# React frontend placeholder — see implementation plan`
- Did **not** run `git add -A` (would have swept backend/miniprogram/docs)

### Step 3 — Commit + tag

- Staged only `frontend-vue-archive/**` and `frontend/README.md` (69 paths)
- Confirmed no `node_modules` / `dist` staged
- Confirmed no backend/miniprogram/docs in index
- Commit message: `chore(frontend): archive Vue app to frontend-vue-archive`
- Tag: `vue-frontend-last` → same commit as archive

### Step 4 — Post-archive verify build

- `cd frontend-vue-archive && npm ci && npm run build`
- **Result:** success (~12s). Same non-fatal warnings as baseline.

## Commits / tags

| Ref | SHA |
|-----|-----|
| `frontend-react-rewrite` HEAD | `231b4207f5f71b6ec442b14222385c94c8147f20` |
| tag `vue-frontend-last` | `231b4207f5f71b6ec442b14222385c94c8147f20` |
| Parent (pre-archive HEAD) | `e54aacc5b3bb30a82aa11ceb9134e5f00179f20e` |

**Commit subject:** `chore(frontend): archive Vue app to frontend-vue-archive`  
**Stats:** 69 files changed, 2450 insertions(+), 66 deletions(-)

## What was included in the archive commit

- Full renames of tracked Vue app files: `frontend/*` → `frontend-vue-archive/*`
- Untracked frontend work that lived under the old tree at move time (now tracked under archive), including collab/project UI and prod Docker assets:
  - `frontend-vue-archive/src/api/collab.ts`
  - `frontend-vue-archive/src/types/collab.ts`
  - `frontend-vue-archive/src/composables/useCompanyContext.ts`
  - `frontend-vue-archive/src/components/AgentChatDrawer.vue`
  - `frontend-vue-archive/src/views/CompanySettingsView.vue`
  - `frontend-vue-archive/src/views/ProjectDetailView.vue`
  - `frontend-vue-archive/src/views/ProjectListView.vue`
  - `frontend-vue-archive/Dockerfile.prod`
  - `frontend-vue-archive/nginx.prod.conf`
- Working-tree edits that were already present on modified tracked frontend files (e.g. auth/notifications/router/settings/vite) were folded into the rename (R0xx similarity) so the archive reflects the **last working Vue tree on disk**, not only clean HEAD.

## What was deliberately NOT committed

All remaining dirty/untracked work outside frontend remains unstaged, including but not limited to:

- `backend/**` (models, collab APIs, services, tests, alembic, etc.)
- `miniprogram/**`
- `docker-compose*.yml`, `docs/**`, `.env.example`, `.superpowers/**`, `nginx/**`, `backend/.venv312/`

## Tree after Task 0

| Path | Role |
|------|------|
| `frontend-vue-archive/` | Archived Vue 3 app (behavior reference / buildable) |
| `frontend/README.md` | Placeholder only — React scaffold is Task 1 |
| tag `vue-frontend-last` | Points at archive commit (Vue preserved under `frontend-vue-archive/`) |

## Tests

| Check | Result |
|-------|--------|
| Pre-move `frontend` `npm ci && npm run build` | PASS |
| Post-move `frontend-vue-archive` `npm ci && npm run build` | PASS |
| Staged set limited to frontend paths | PASS (69 files) |
| Tag exists and equals archive commit | PASS |

## Concerns / notes (non-blocking)

1. **Dirty tree policy:** Branch was created with many uncommitted backend/miniprogram/docs changes; only frontend archive paths were committed. Those other changes remain local WIP.
2. **Archive includes WIP frontend diffs:** Because the working tree already had modified/untracked Vue files, the archive commit is not a pure rename of clean `e54aacc` tree content; it captures on-disk Vue state (including collab views). This matches “last buildable Vue” intent and both builds passed.
3. **`frontend/README.md`:** Written via PowerShell `Set-Content`; may carry UTF-8 BOM. Content is correct; BOM is cosmetic.
4. **Not pushed** to remote (per instructions).
5. **Task 1 not started** (no React scaffold).

## Out of scope (confirmed)

- No React/Vite scaffold
- No backend/miniprogram changes
- No remote push
