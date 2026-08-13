# 工作待办提醒系统 (WorkTodo)

自托管的待办事项管理系统，支持 Web 端和微信小程序双端同步。

## 项目文档

开发指导文档位于 `docs/`：

- `项目逻辑文档.md` — **优先阅读**：项目思路、真源目录、UI 现状
- `01-需求分析.md` … `06-部署运维指南.md` — 设计文档
- `superpowers/` — 邮件回复 / 跟进专题

## 真源目录（唯一可运行代码）

| 目录 | 说明 |
|------|------|
| `backend/` | FastAPI 后端 |
| `frontend/` | React 18 Web（Vite + Ant Design + Tailwind；现役真源） |
| `frontend-vue-archive/` | 归档 Vue3（回滚对照，非现役） |
| `miniprogram/` | 微信小程序 |
| `UI/` | 设计稿参考，非运行代码 |

禁止在文档目录中维护第二套可运行前后端。

## 分支模型（三端三分支）

`main` 是唯一集成主线；三端各有一个长期维护分支，只改自己的目录，完成后合回 `main`，
再由 `main` 快进同步到其余端分支，保持三分支同源不漂移。

| 分支 | 维护范围（目录） |
|------|------|
| `web` | `frontend/` |
| `app` | `app/` |
| `miniprogram` | `miniprogram/` |

- **后端 `backend/`、compose、CI、文档等共用代码**：直接在 `main` 上改（或临时
  feature 分支合回 `main`），不要塞进某个端分支顺手带走。
- **跨端联动改动**（如后端接口 + 三端适配）：以 `main` 为基准开临时分支，合回
  `main` 后各端分支同步。
- 端分支落后 `main` 时先 `git merge main`（应可快进）再继续开发；禁止在端分支上
  改其他端的目录。
- 历史遗留：`frontend-react-rewrite` 为已完成的重写分支，仅作追溯，不再更新。

联调与正式部署一律走 Docker Compose（见 `启动指导文档.md`）；下列裸进程命令仅用于
单模块调试。

**Docker（开发）**：`docker compose -f docker-compose.yml up -d`  
**Docker（生产）**：`docker compose -f docker-compose.prod.yml up -d`

裸进程调试：

**后端**：`cd backend && uvicorn app.main:app --reload`
> `DEBUG` 默认 **false**，此时启动会做生产密钥门禁（弱密钥/占位符一律拒绝启动）。
> 本地调试请先 `cp backend/.env.example backend/.env`（其中 `DEBUG=true`）。

**前端**：`cd frontend && npm install && npm run dev`  
**前端构建**：`cd frontend && npm run build`

## 测试与门禁

| 范围 | 命令 |
|------|------|
| 后端 | `cd backend && pip install -r requirements-dev.txt && pytest -q` |
| 前端单测 | `cd frontend && npm test` |
| 前端类型 | `cd frontend && npm run typecheck` |
| APP | `cd app && flutter analyze && flutter test` |
| E2E | `cd frontend && npm run test:e2e`（需先起后端+前端并配 `E2E_USER`/`E2E_PASSWORD`） |

CI 见 `.github/workflows/ci.yml`（backend / frontend / app 三个 job，按路径触发）；
E2E 单独放 `.github/workflows/e2e.yml`，手动或每日定时触发。

## 技术栈

- 后端：FastAPI + SQLAlchemy + SQLite/PostgreSQL + APScheduler
- RAG 知识检索已实现：材料正文抽取（`evidence_file_texts`）+ 知识切块检索
  （`knowledge_chunks`，PG tsvector / SQLite FTS5 + jieba 分词）+ 可选抽取 worker
  （`backend/Dockerfile.extractor`，compose profile `extraction`）。
  `EXTRACTION_MODE` 默认 **off**（行为与未引入前一致）；设计文档见
  `docs/superpowers/specs/2026-08-12-rag-knowledge-retrieval-design.md`
- 前端：React 18 + TypeScript + Vite + React Router + Zustand + Tailwind + Ant Design
- APP：Flutter（Android 为主，`app/`）
- 小程序：微信小程序原生框架
- 对照归档：`frontend-vue-archive/`（Vue3 + Pinia + Element Plus；tag `vue-frontend-last`）

## Web 页面范围（现役）

登录/注册 · 仪表盘 · 任务列表/详情 · 日历 · 设置（含 SMTP / LLM / 主题 / 推送） · 项目列表/详情（人轴画布 + 大纲树） · 公司设置

> 项目详情的「关系图」（@xyflow/react）视图已下线，现为「人轴画布 / 大纲」两个页签。

已移除 Mock 壳页：收件箱 / 看板 / 团队聊天（路由兼容重定向）。

**生产切流说明**：React 重写门禁与 soak 见 `docs/superpowers/acceptance/2026-07-20-react-rewrite-gates.md`；**未完成 G6–G10 前不得声称生产已切 React**。

## 工作树产品规则（已锁定，服务端强制）

核心 POV 是**领导视角的人轴**：主干是人，工作项/里程碑/范围挂在人下面。

- **主干只排 person**：根节点（`parent_id=null`）必须是「人」
- **事项只能落到人身上**：`work_item` / `milestone` / `scope` 的父节点必须是 person
- **人挂人 = 下级人员**
- **终责** = 项目 PM（`pm_user_id` / `final_owner_user_id`），卡片钉在轴终点
- **终责轴向位置**：`projects.final_owner_along_delta`，仅项目 PM / `created_by` 可改
  （`PUT /projects/{id}/final-owner-position`）
- 时间刻度画在主干上；横/纵轴、树序/时间序可切换

实现位置：

- 后端强制：`backend/app/services/tree_service.py` 的 `assert_shape` /
  `assert_type_change_allowed`（`ENFORCE_WORK_TREE_SHAPE=false` 可为存量数据临时关闭）
- Web：`frontend/src/components/workTree/dropRules.ts`
- APP：`app/lib/work_tree/work_tree_canvas.dart`

> 三端客户端拦截只是体验优化，**规则以后端为准**；新增写路径必须走 `TreeService`，
> 不要绕过形态校验直接写 `TreeNode`。
