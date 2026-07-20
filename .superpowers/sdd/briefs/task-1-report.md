# Task 1 Report: P0 — Vite React scaffold + Tailwind + Ant Design

**Status:** DONE  
**Date:** 2026-07-20  
**Branch:** `frontend-react-rewrite`  
**Commit:** `cae321a7a3ac40f697ef258c4a1974f482e6b2e6`  
**Message:** `feat(frontend): scaffold Vite React + Tailwind + Ant Design`

---

## Summary

Replaced the `frontend/` placeholder (`README.md` only) with a runnable Vite + React + TypeScript shell, wired for Tailwind CSS v3, Ant Design (zh_CN), path alias `@`, and dev proxy `/api` → `http://127.0.0.1:8000`. MD3 design tokens and utility classes were ported from `frontend-vue-archive/src/assets/main.css` (and matching Tailwind theme extensions). `npm run build` succeeds with zero errors.

---

## What was done

### 1. Scaffold

- Used `create-vite@5` React-TS template (initially landed at repo root due to interactive CLI / cwd quirks; files were moved into `frontend/` and root was cleaned — no root `package.json` / `node_modules` left behind).
- Package name set to `worktodo-frontend`.
- Removed unused template assets: `src/App.css`, `src/index.css`, `src/assets/react.svg`.
- Placeholder `frontend/README.md` removed as part of the scaffold commit.

### 2. Dependencies

**Runtime:**

| Package | Role |
|---------|------|
| `react`, `react-dom` | UI runtime |
| `react-router-dom` | Routing (installed; not used in shell yet) |
| `zustand` | State (installed; not used in shell yet) |
| `axios` | HTTP (installed; not used in shell yet) |
| `antd`, `@ant-design/icons` | Component library |
| `dayjs` | Dates (antd peer / future use) |

**Dev:**

| Package | Role |
|---------|------|
| `vite`, `@vitejs/plugin-react` | Build |
| `typescript`, `@types/*` | TS |
| `tailwindcss@3`, `postcss`, `autoprefixer` | CSS pipeline |
| `@types/node` | `path` in `vite.config.ts` |
| `eslint` stack | Lint (from template) |

### 3. Vite config

**File:** `frontend/vite.config.ts`

- Plugin: `@vitejs/plugin-react`
- Alias: `@` → `src/`
- Dev server: port `5173`
- Proxy: `/api` → `http://127.0.0.1:8000` (`changeOrigin: true`)

### 4. TypeScript paths

**File:** `frontend/tsconfig.app.json`

- `baseUrl: "."`
- `paths`: `@/*` → `src/*`

### 5. Tailwind + design tokens

**Files:**

- `frontend/tailwind.config.js` — content scan for `index.html` + `src/**/*.{js,ts,jsx,tsx}`; `darkMode: 'class'`; full MD3 color/spacing/type/shadow extend ported from Vue archive
- `frontend/postcss.config.js` — `tailwindcss` + `autoprefixer`
- `frontend/src/assets/main.css` — `@tailwind` directives + CSS variables (light/dark + accent variants green/amber/red) + base/components layers

**Adaptations from Vue archive CSS:**

- Dropped Element Plus-specific overrides (`--el-*`, `.el-button--primary`, etc.)
- `#app` → `#root` for React mount
- Kept component utilities (`.ds-card`, `.nav-link`, `.btn-primary`, etc.) for later UI parity

### 6. Entry + shell

**`frontend/src/main.tsx`**

- `ConfigProvider` with `antd/locale/zh_CN`
- Imports `./assets/main.css`

**`frontend/src/App.tsx`**

```tsx
export default function App() {
  return <div className="p-8 font-sans">WorkTodo React shell</div>
}
```

**`frontend/index.html`**

- `lang="zh-CN"`, title `WorkTodo`, root mount `#root`

---

## Files in commit (16 paths)

| Path | Action |
|------|--------|
| `frontend/README.md` | deleted (placeholder) |
| `frontend/package.json` | added |
| `frontend/package-lock.json` | added |
| `frontend/vite.config.ts` | added |
| `frontend/tsconfig.json` | added |
| `frontend/tsconfig.app.json` | added |
| `frontend/tsconfig.node.json` | added |
| `frontend/eslint.config.js` | added |
| `frontend/index.html` | added |
| `frontend/postcss.config.js` | added |
| `frontend/tailwind.config.js` | added |
| `frontend/public/vite.svg` | added |
| `frontend/src/main.tsx` | added |
| `frontend/src/App.tsx` | added |
| `frontend/src/assets/main.css` | added |
| `frontend/src/vite-env.d.ts` | added |

**Not committed (by design):** `node_modules/`, `dist/` (gitignored), backend/miniprogram/docs dirty tree, archive.

---

## Verification

```text
cd frontend
npm run build
```

**Result:** PASS

```text
> worktodo-frontend@0.0.0 build
> tsc -b && vite build

vite v5.4.21 building for production...
✓ 1564 modules transformed.
dist/index.html                   0.46 kB │ gzip:  0.30 kB
dist/assets/index-CA0uslIS.css   10.04 kB │ gzip:  2.44 kB
dist/assets/index-COfLVR77.js   236.77 kB │ gzip: 82.47 kB
✓ built in 7.69s
```

No TypeScript or Vite errors.

---

## Constraints honored

| Constraint | Result |
|------------|--------|
| Branch `frontend-react-rewrite` | yes |
| Only `frontend/` React scaffold committed | yes (`git add frontend/` only) |
| Do not modify `frontend-vue-archive/` (except read tokens) | yes (read-only) |
| No Task 2 API layer | yes |
| No push | yes |
| No whole-monorepo `git add -A` | yes |

---

## Concerns / notes

1. **npm audit:** install reports 2 vulnerabilities (1 moderate, 1 high) in the dependency tree (template/esbuild-related tooling). Not fixed with `--force` to avoid breaking scaffold; can revisit later.
2. **create-vite CLI on Windows:** non-empty dir + PowerShell piping was unreliable; final layout matches the intended Vite React-TS tree under `frontend/`.
3. **Installed but unused:** `react-router-dom`, `zustand`, `axios`, `@ant-design/icons`, `dayjs` are present for subsequent tasks; shell does not import them yet (avoids unused-import TS failures).
4. **Ant Design bundle size:** production JS ~237 kB (antd tree-shaken to locale/ConfigProvider only so far); full UI will grow as components are added.

---

## How to run locally

```powershell
cd E:\workspace\gongzuotix\frontend
npm install   # if needed
npm run dev   # http://localhost:5173
npm run build
```

Backend for `/api` proxy (optional for shell): `cd backend && uvicorn app.main:app --reload` on port 8000.

---

## Out of scope (next tasks)

- API client / `access_token` auth
- Router, layouts, real pages
- Docker frontend image updates (Task 12)
- Chinese copy for product UI
