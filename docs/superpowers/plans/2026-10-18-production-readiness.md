# Production Readiness Audit Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:verification-before-completion before claiming any gate passes.

**Goal:** 深度审计当前项目的前后端、Android、部署、数据库、权限与依赖，修复上线阻断项，并留下可复现的上线证据。

**Architecture:** 先只读盘点运行边界与配置，再执行后端、前端、Android、数据库迁移和容器级验证。所有需要写入数据库的验证仅使用独立联调数据库或临时复制库；生产密钥、真实数据和未授权外部服务不参与测试。

**Tech Stack:** FastAPI/Python、Alembic、SQLite/PostgreSQL、React/Vite/TypeScript、Playwright、Flutter WebView、Docker Compose、nginx。

**Spec:** 当前用户需求“深度查看当前项目的所有功能逻辑，然后确保其可以上线”。

## Global Constraints

- 保留现有责任树与项目 LLM Wiki 改动，不回滚无关未提交文件。
- 只使用 `backend/data/axis_joint_debug_20261018.db` 或其临时副本做联调验证。
- 不在输出中暴露密钥、完整环境变量、真实令牌或生产数据。
- 真实 LLM 未配置时只验证流程、权限、索引与引用校验，不声称生成质量已通过。

---

### Task 1: 建立项目运行边界清单

**Files:**
- Inspect: `backend/`, `frontend/`, `app/`, `docker-compose*.yml`, `*.env*`, `Dockerfile*`, migrations and startup scripts.
- Create/modify: this plan document only if new blockers or evidence paths are found.

- [ ] Map service entrypoints, ports, health checks, database URLs, upload paths, scheduler/extractor dependencies, frontend proxying, and Android URL injection.
- [ ] Record each production-sensitive setting without printing secret values.

### Task 2: 全量静态与单元验证

**Files:**
- Test: existing backend test suite, frontend lint/build/tests, Flutter analyze/test/build.

- [ ] Run the complete backend test suite and capture failures.
- [ ] Run frontend typecheck/lint, production build, and all configured browser tests.
- [ ] Run Flutter analyze, test, debug build, and release build checks.

### Task 3: 数据库与权限门禁

**Files:**
- Inspect: `backend/alembic/`, `backend/app/api/`, `backend/app/services/`, auth and ACL tests.

- [ ] Validate Alembic heads and `upgrade head` on an isolated temporary database.
- [ ] Exercise outsider/member/project-manager/admin access, node-level material submission permissions, private Wiki draft isolation, and cross-project isolation.

### Task 4: 容器与生产配置门禁

**Files:**
- Inspect/verify: `backend/Dockerfile.prod`, `docker-compose.prod.yml`, `frontend/nginx.prod.conf`, image contents.

- [ ] Build production images using the documented local proxy only when needed.
- [ ] Start an isolated production-like stack or equivalent containers with temporary data.
- [ ] Verify health endpoint, API proxy, static frontend, CORS policy, upload handling, and absence of `.env`, test databases, and temporary files in images.

### Task 5: Android release门禁

**Files:**
- Inspect/modify if needed: `app/android/app/build.gradle.kts`, `AndroidManifest.xml`, `app/lib/config/api_config.dart`, WebView shell.

- [ ] Confirm release signing is configured or explicitly mark it as a release blocker requiring a keystore.
- [ ] Confirm production builds use HTTPS domain values and no cleartext exception.
- [ ] Run Android WebView smoke/regression against the latest frontend; separate test harness touch failures from product failures.

### Task 6: 修复阻断项并复验

- [ ] Fix only reproducible blockers found in Tasks 1–5.
- [ ] Re-run the exact failed checks and the affected regression tests.
- [ ] Update this plan with evidence, remaining operator inputs, and a go/no-go decision.

