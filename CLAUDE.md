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
| `frontend/` | Vue3 Web（Productivity Flow / MD3 + Tailwind） |
| `miniprogram/` | 微信小程序 |
| `UI/` | 设计稿参考，非运行代码 |

禁止在文档目录中维护第二套可运行前后端。

## 启动命令

**后端**：`cd backend && uvicorn app.main:app --reload`  
**前端**：`cd frontend && npm run dev`  
**Docker**：`docker-compose -f docker-compose.yml up -d`

## 技术栈

- 后端：FastAPI + SQLAlchemy + SQLite/PostgreSQL + APScheduler
- 前端：Vue3 + Vite + Pinia + Tailwind + Element Plus + TypeScript
- 小程序：微信小程序原生框架

## Web 页面范围（现役）

登录/注册 · 仪表盘 · 任务列表/详情 · 日历 · 设置（含 SMTP / 主题 / 推送）

已移除 Mock 壳页：收件箱 / 看板 / 团队聊天（路由兼容重定向）。
