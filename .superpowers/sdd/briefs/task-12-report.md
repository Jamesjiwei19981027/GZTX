# Task 12 Report — P7 Docker, docs, gates template, rollback

**Branch:** `frontend-react-rewrite`  
**Date:** 2026-07-20  
**STATUS:** `DONE_WITH_CONCERNS`

---

## Final summary

### STATUS

`DONE_WITH_CONCERNS`

Delivered: React frontend Dockerfiles, stack docs Vue→React, acceptance gates template (§6.1–6.12 + G1–G10 with SHA/digest/soak fields), rollback procedure in deploy guide + gates file. **Production cutover is NOT claimed.**

### COMMITS

| SHA (short) | Message |
|-------------|---------|
| `e3257b3` | `docs(frontend): React stack, docker, gates template, rollback procedure` |
| `fd2281e` | `fix(docker): point prod frontend build at Dockerfile.prod` |

Full SHA (latest): `fd2281e` (run `git rev-parse HEAD` on branch for exact).

**Staged intentionally (no huge backend/collab dump):**

- `frontend/Dockerfile`, `frontend/Dockerfile.prod`, `frontend/nginx.prod.conf`
- `CLAUDE.md`
- `docs/项目逻辑文档.md` (Vue→React true-source spots only)
- `docs/06-部署运维指南.md` (frontend env + compose notes + rollback)
- `docs/superpowers/acceptance/2026-07-20-react-rewrite-gates.md` (**created**)
- `docs/superpowers/plans/2026-07-20-frontend-react-rewrite.md` (Task 12 status note; first add of plan on branch)
- `docs/superpowers/specs/2026-07-20-frontend-react-rewrite-design.md` (status → 实现中; first add on branch)
- `docker-compose.prod.yml` (minimal: frontend `dockerfile: Dockerfile.prod` vs committed Vue-era `Dockerfile`)

**Not committed (left dirty on purpose):** backend collab tree, miniprogram, mixed `docker-compose.yml` collab env rewrite, etc.

### TEST

| Check | Result |
|-------|--------|
| `docker compose -f docker-compose.yml build frontend` | **FAILED** — Docker Desktop engine not running (`npipe:////./pipe/dockerDesktopLinuxEngine` missing) |
| Secret scan on `frontend/dist` | **PASS (no real secrets)** — only form field name `smtp_password` in client code paths (empty-string-not-overwrite pattern), not plaintext credentials / `SECRET_KEY` values |
| G6 rollback drill on staging | **NOT RUN** (no staging exercise this task; steps documented only) |
| §6.12 soak | **NOT STARTED** (P8; not in scope claim) |

### CONCERNS

1. **Docker image not verified in this environment** — daemon down. Dockerfiles committed; rebuild when Desktop is up:
   ```bash
   docker compose -f docker-compose.yml build frontend
   docker compose -f docker-compose.prod.yml build frontend
   ```
2. **G6 rollback drill not executed** — only written in `docs/06-部署运维指南.md` §7.2 and gates template. Staging drill still required before production cutover.
3. **Working tree still dirty** with unrelated backend/miniprogram/collab files — do not assume green tree.
4. **`docker-compose.prod.yml` on disk** may differ from last commit if local collab edits remain unstaged; HEAD frontend service correctly uses `Dockerfile.prod`.
5. **Production cutover: NOT done.** Do not treat this task as G6–G10 complete.

---

## What was implemented

### Step 1 — Docker frontend

Created under `frontend/`:

- `Dockerfile` — Node 20 Alpine, `npm ci`/`install`, Vite dev on `0.0.0.0:5173` (matches `docker-compose.yml`)
- `Dockerfile.prod` — multi-stage: `npm run build` with `VITE_API_BASE_URL=/api/v1` → `nginx:1.27-alpine` serves `dist`
- `nginx.prod.conf` — SPA `try_files`, `/assets/` cache, basic security headers

### Step 2 — Artifact secret check

Scanned `frontend/dist` for `SECRET_KEY`, long `sk-*`, and credential values. Matches were **API field keys** (`smtp_password` property names), not embedded secrets.

### Step 3 — Gates checkbox template

`docs/superpowers/acceptance/2026-07-20-react-rewrite-gates.md`:

- All §6.1–6.12 items as checkboxes  
- S1–S8 table  
- G1–G10 tables  
- Fields: Git SHA, image digest, soak start/end, drill notes  
- Explicit **does not claim production cutover**

### Step 4 — Rollback documentation

- `docs/06-部署运维指南.md` §7.2: build from `frontend-vue-archive/Dockerfile.prod`, tag `vue-frontend-last`, compose image swap  
- Gates file section “回滚步骤” + drill record table  

### Step 5 — Docs Vue → React (surgical)

- `CLAUDE.md` — tech stack, true-source table, npm/docker commands  
- `docs/项目逻辑文档.md` — branch, Web stack, tree, pages, modules  
- `docs/06-部署运维指南.md` — §2.3 frontend React commands; §4.2 notes; rollback  
- Spec status: **实现中** (not “已实现” production-complete)

### Step 6 — Commit

See COMMITS. Prefer narrow stage set; avoided backend mass commit.

---

## Absolute paths (key deliverables)

- `E:\workspace\gongzuotix\frontend\Dockerfile`
- `E:\workspace\gongzuotix\frontend\Dockerfile.prod`
- `E:\workspace\gongzuotix\frontend\nginx.prod.conf`
- `E:\workspace\gongzuotix\CLAUDE.md`
- `E:\workspace\gongzuotix\docs\项目逻辑文档.md`
- `E:\workspace\gongzuotix\docs\06-部署运维指南.md`
- `E:\workspace\gongzuotix\docs\superpowers\acceptance\2026-07-20-react-rewrite-gates.md`
- `E:\workspace\gongzuotix\.superpowers\sdd\briefs\task-12-report.md`
