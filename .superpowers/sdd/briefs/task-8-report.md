# Task 8 Report: P6 — React Flow dual view for project tree

## STATUS

**DONE** — frontend build passes; dual view wired with shared selection.

## What shipped

| Item | Path |
|------|------|
| Deps | `@xyflow/react`, `@dagrejs/dagre` (+ `@types/dagre` dev) in `frontend/package.json` |
| Layout | `frontend/src/utils/treeLayout.ts` — `layoutTree` / `treeToFlow` |
| Flow UI | `frontend/src/components/project/ProjectFlowView.tsx` |
| Dual view | `frontend/src/pages/ProjectDetailPage.tsx` — Tabs **大纲** (default) \| **关系图** |

## Behavior

- Same `selected` + `selectNode` for Outline and Flow; tab switch keeps selection.
- Flow: `ReactFlow` + `Background` + `Controls`, `fitView`, pan/zoom; node shows title · status; click → `onSelect(raw)`.
- Empty tree → empty state (no white screen); load error prop → alert panel; loading → placeholder.
- Dagre `TB` layout (`nodesep: 40`, `ranksep: 60`) for ≥2-level trees.

## COMMITS

```
feat(frontend): React Flow project tree dual view with dagre layout
```

Branch: `frontend-react-rewrite`  
Scope: frontend-only (`package.json`, `package-lock.json`, `ProjectDetailPage.tsx`, `ProjectFlowView.tsx`, `treeLayout.ts`).

## TEST

```text
cd frontend && npm run build
# tsc -b && vite build → success (exit 0)
```

Manual S6 (冒烟): open project with ≥2 depth nodes → 关系图 tab → layout readable → click node → right panel matches outline selection; switch back to 大纲 → same node still selected.

## CONCERNS

1. **Bundle size**: main chunk ~1.3 MB after adding React Flow; consider lazy `import()` of `ProjectFlowView` later.
2. **Default RF nodes**: uses default node + `data.label` styling; custom node type not required for P6 but would improve MD3 polish.
3. **`@types/dagre`**: package uses `@dagrejs/dagre` v3 with own types; `@types/dagre` may be redundant—left as installed per brief.
4. **S6 live API**: not run against staging in this agent turn; only `npm run build` verified.
)
