# Task 6 Report: P4 — Project list / detail outline tree / evidence / Agent

## STATUS

**DONE**

## COMMITS

- `44e751c` — `feat(frontend): project list/detail outline tree, evidence, agent chat`
  - Branch: `frontend-react-rewrite`
  - Frontend-only (7 files)

## Files

| Path | Role |
|------|------|
| `frontend/src/hooks/useCompanyContext.ts` | Company list + `localStorage` `company_id` (archive parity) |
| `frontend/src/pages/ProjectListPage.tsx` | Project list, company switcher, create project |
| `frontend/src/pages/ProjectDetailPage.tsx` | Project detail: tree + evidence + agent |
| `frontend/src/components/project/OutlineTree.tsx` | Recursive outline tree (not React Flow) |
| `frontend/src/components/project/EvidencePanel.tsx` | Submit evidence, upload files, timeline + packages |
| `frontend/src/components/project/AgentChatDrawer.tsx` | Side drawer chat via `agentChat` |
| `frontend/src/routes/index.tsx` | `/projects`, `/projects/:id` wired |

## Behavior (vs Vue archive)

1. **ProjectList** — `listProjects` / `createProject` with `useCompanyContext`; click → `/projects/:id`.
2. **OutlineTree** — nested `TreeNodeDTO[]` from `getProjectTree(id, 'nested')`; select loads `getNodeProgress` + `listNodeEvidence`; create node via `createNode` (`work_item`).
3. **Evidence** — `uploadEvidenceFile` + `submitEvidence`; progress timeline + evidence packages list.
4. **AgentChatDrawer** — open/close, `agentChat` with optional `[node:id]` prefix; system hint on open.
5. **Error project id** — invalid/failed load: `message.error`, error panel with retry, **no white screen**.
6. **React Flow** — intentionally **not** used (Task 8); outline only.

## TEST

```text
cd frontend && npm run build
# tsc -b && vite build → success (exit 0)
```

Manual checks recommended (API + auth):

- [ ] `/projects` shows company selector + list when licensed
- [ ] Create project navigates to detail
- [ ] Tree select loads evidence/progress
- [ ] Invalid `/projects/999999` or `/projects/abc` shows error toast, no crash
- [ ] Agent drawer send uses `/agents/chat`

## CONCERNS

1. **Company context module state** — `useCompanyContext` uses module-level store + `useSyncExternalStore` (not Zustand). Fine for S5; Settings/Company pages (later tasks) should reuse the same helpers (`setCompanyId`, `ensureCompanyContext`).
2. **Auto-select after tree reload** — `loadAll` keeps current selection if present; evidence submit refreshes tree via `loadAll` without clearing selection (ref-based). Edge case: deleted selected node after concurrent edit not handled.
3. **Agent messages** — drawer does not clear history on node change while open (matches Vue archive).
4. **No e2e** — only production build verified; collab APIs need backend running.
5. **`company/settings`** still placeholder — list links there when user has no company.
6. **noUnusedLocals** — build clean; `EvidencePanel` does not re-export unused symbols.

## Out of scope

- React Flow canvas (Task 8)
- Company settings page
- Miniprogram
