# 工作待办提醒系统 (WorkTodo)

自托管的待办事项管理系统，支持 Web 端和微信小程序双端同步。

## 项目文档

所有开发指导文档位于 `docs/` 目录：
- `01-需求分析.md` - 功能需求、用户场景、竞品分析
- `02-技术架构设计.md` - 技术选型、目录结构
- `03-数据库设计.md` - 数据模型、表结构
- `04-API接口设计.md` - 所有API端点定义
- `05-开发计划与里程碑.md` - 开发阶段和任务分解
- `06-部署运维指南.md` - 部署和运维

## 当前阶段

正在执行 Phase 0-3 的并行开发：
- 后端智能体：Phase 0 (项目骨架) + Phase 1 (后端MVP)
- 前端智能体：Phase 0 (项目骨架) + Phase 2 (前端MVP)
- 小程序智能体：Phase 0 (项目骨架) + Phase 3 (小程序MVP)

## 启动命令

**后端**：CD backend && uvicorn app.main:app --reload
**前端**：CD frontend && npm run dev
**Docker**：docker-compose -f docker-compose.yml up -d

## 技术栈

- 后端：FastAPI + SQLAlchemy + SQLite/PostgreSQL
- 前端：Vue3 + Vite + Element Plus + TypeScript
- 小程序：微信小程序原生框架