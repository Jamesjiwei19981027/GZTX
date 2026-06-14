# 工作待办提醒系统 (WorkTodo)

> 一个支持双端同步的每日工作待办事项管理程序，包含 Web 端、桌面端和微信小程序。

---

## 项目简介

本项目是一个自托管的待办事项管理系统，旨在帮助用户高效管理每日工作任务，并通过多种方式及时提醒，确保重要事项不遗漏。

### 核心特点

- **双端同步**：Web 端 + 微信小程序，数据实时同步
- **智能提醒**：支持多种提醒方式（桌面通知、微信订阅消息、邮件）
- **重复任务**：支持按日/周/月/年设置重复任务
- **离线可用**：PWA 技术支持离线查看和编辑
- **数据自主**：自托管后端，数据完全由自己掌控
- **轻量高效**：基于现代技术栈，快速响应

---

## 文档索引

| 文档 | 说明 |
|------|------|
| [01-需求分析.md](./docs/01-需求分析.md) | 功能需求、用户场景、竞品分析 |
| [02-技术架构设计.md](./docs/02-技术架构设计.md) | 整体架构、技术选型、部署方案 |
| [03-数据库设计.md](./docs/03-数据库设计.md) | 数据模型、表结构、关系设计 |
| [04-API接口设计.md](./docs/04-API接口设计.md) | RESTful API 定义、认证授权 |
| [05-开发计划与里程碑.md](./docs/05-开发计划与里程碑.md) | 开发阶段、任务分解、时间安排 |
| [06-部署运维指南.md](./docs/06-部署运维指南.md) | 环境搭建、部署流程、运维监控 |

---

## 快速开始

```bash
# 克隆项目
git clone <repository-url>
cd worktodo

# 启动后端
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# 启动前端
cd ../frontend
npm install
npm run dev

# 启动小程序
cd ../miniprogram
# 使用微信开发者工具打开
```

---

## 技术栈概览

| 层级 | 技术 |
|------|------|
| 后端 | Python 3.11 + FastAPI + SQLAlchemy |
| 数据库 | SQLite（开发）/ PostgreSQL（生产） |
| 前端 Web | Vue 3 + Vite + Pinia + Element Plus |
| 小程序 | 微信小程序原生框架 |
| 任务调度 | APScheduler |
| 认证 | JWT (JSON Web Token) |

---

## 项目结构

```
worktodo/
├── backend/              # FastAPI 后端
│   ├── app/
│   │   ├── api/          # API 路由
│   │   ├── core/         # 核心配置
│   │   ├── models/       # 数据库模型
│   │   ├── schemas/      # Pydantic 数据模型
│   │   ├── services/     # 业务逻辑
│   │   └── utils/        # 工具函数
│   ├── alembic/          # 数据库迁移
│   └── tests/            # 单元测试
├── frontend/             # Vue3 Web 前端
│   ├── src/
│   │   ├── api/          # API 请求封装
│   │   ├── components/   # 公共组件
│   │   ├── views/        # 页面视图
│   │   ├── stores/       # Pinia 状态管理
│   │   └── utils/        # 工具函数
│   └── public/
├── miniprogram/          # 微信小程序
│   ├── pages/            # 页面
│   ├── components/       # 组件
│   └── utils/            # 工具函数
├── docs/                 # 项目文档
└── docker-compose.yml    # Docker 部署配置
```

---

## 许可证

MIT License
