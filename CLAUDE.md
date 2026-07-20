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

## 启动命令

**后端**：`cd backend && uvicorn app.main:app --reload`  
**前端**：`cd frontend && npm install && npm run dev`  
**前端构建**：`cd frontend && npm run build`  
**前端单测 / E2E**：`cd frontend && npm test` · `cd frontend && npm run test:e2e`  
**Docker（开发）**：`docker compose -f docker-compose.yml up -d`  
**Docker（生产前端镜像）**：`docker compose -f docker-compose.prod.yml build frontend`

## 技术栈

- 后端：FastAPI + SQLAlchemy + SQLite/PostgreSQL + APScheduler
- 前端：React 18 + TypeScript + Vite + React Router + Zustand + Tailwind + Ant Design + @xyflow/react
- 小程序：微信小程序原生框架
- 对照归档：`frontend-vue-archive/`（Vue3 + Pinia + Element Plus；tag `vue-frontend-last`）

## Web 页面范围（现役）

登录/注册 · 仪表盘 · 任务列表/详情 · 日历 · 设置（含 SMTP / LLM / 主题 / 推送） · 项目列表/详情（大纲树 + React Flow） · 公司设置

已移除 Mock 壳页：收件箱 / 看板 / 团队聊天（路由兼容重定向）。

**生产切流说明**：React 重写门禁与 soak 见 `docs/superpowers/acceptance/2026-07-20-react-rewrite-gates.md`；**未完成 G6–G10 前不得声称生产已切 React**。
