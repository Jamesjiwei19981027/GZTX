# 工作待办提醒系统 (WorkTodo / 烂笔头 PM)

自托管的待办事项管理系统：**Web + 微信小程序 + Flutter APP** 共用同一套 FastAPI 后端。

---

## 核心能力

- **任务管理**：创建/编辑/软删除、优先级、分类、标签、完成评价与跟进
- **智能提醒**：网页推送、邮件提醒（可配置 SMTP）、提醒时间与通知渠道
- **邮件闭环**：提醒邮件 → 用户回复指令 → 后端 IMAP 解析并更新任务
- **多端访问**：React Web + 微信小程序 + Flutter APP（REST + JWT）
- **协作与智能体**：项目树、证据进度、个人/协作智能体（见 `docs/`）
- **数据自主**：自托管，开发默认 SQLite，生产可用 PostgreSQL

---

## 分支与维护

本仓库为 **monorepo**，采用四条长期分支；各分支保留全目录，但 **PR 应只改本端主要目录**。

| 分支 | 主要改动 | 接口 / 后端变更 |
|------|----------|-----------------|
| **`main`** | `backend/`、`nginx/`、`docker-compose*`、共享 `docs/` | **唯一合入点** |
| **`web`** | `frontend/`（React + Vite） | 从 `main` 合入后端后适配 |
| **`miniprogram`** | `miniprogram/` | 同上 |
| **`app`** | `app/`（Flutter，iOS + Android） | 同上 |

**协作规则**

1. API、数据库、部署配置 → 只在 **`main`** 提 PR 并合入。
2. 客户端分支定期 `git merge main`，再在本端目录适配。
3. 发版建议打 tag：`web-v*`、`mp-v*`、`app-v*`（后端随 `main` 或独立 `backend-v*`）。

远程仓库：[Jamesjiwei19981027/GZTX](https://github.com/Jamesjiwei19981027/GZTX)

---

## 文档

| 文档 | 说明 |
|------|------|
| [启动指导文档.md](./启动指导文档.md) | **本机如何启动后端 / Web / APP 与排错**（日常自用） |
| [docs/项目逻辑文档.md](./docs/项目逻辑文档.md) | **项目思路与目录真源**（优先阅读） |
| [docs/CURSOR-HANDOFF.md](./docs/CURSOR-HANDOFF.md) | 接手与门禁 |
| [docs/01-需求分析.md](./docs/01-需求分析.md) | 功能需求与场景 |
| [docs/02-技术架构设计.md](./docs/02-技术架构设计.md) | 架构与技术选型 |
| [docs/03-数据库设计.md](./docs/03-数据库设计.md) | 数据模型 |
| [docs/04-API接口设计.md](./docs/04-API接口设计.md) | API 设计（以代码为准） |
| [docs/05-开发计划与里程碑.md](./docs/05-开发计划与里程碑.md) | 里程碑 |
| [docs/06-部署运维指南.md](./docs/06-部署运维指南.md) | 部署运维 |
| [app/README.md](./app/README.md) | Flutter APP 开发与 bootstrap |

---

## 快速开始

**日常与联调一律 Docker**（不要用本机 venv / uvicorn 当默认启动）：

```bash
cd E:\workspace\gongzuotix   # 或你的仓库根目录
docker compose up -d
```

- API 文档：http://localhost:8010/docs  
- Web：http://localhost 或 http://localhost:5173  
- 小程序：微信开发者工具打开 `miniprogram/`（配置 `app.js` 中 `baseUrl`）  
- APP：见 [启动指导文档.md](./启动指导文档.md) 与 [app/README.md](./app/README.md)（Flutter 连 Docker 的 `8010`）

本机 Python/npm 直跑仅作临时调试，见启动指导文档「可选」小节。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Python + FastAPI + SQLAlchemy + APScheduler |
| 数据库 | SQLite（开发）/ PostgreSQL（生产） |
| Web | React 18 + Vite + TypeScript + Ant Design + Tailwind |
| 小程序 | 微信原生框架 |
| APP | Flutter（iOS + Android） |
| 认证 | JWT |

---

## 项目结构（真源）

```
gongzuotix/
├── backend/              # FastAPI 后端（唯一后端真源）
├── frontend/             # React Web
├── miniprogram/          # 微信小程序
├── app/                  # Flutter APP（iOS / Android）
├── frontend-vue-archive/ # 历史 Vue 前端（归档，非运行真源）
├── nginx/                # 反向代理
├── docs/                 # 文档
├── scripts/              # 运维脚本
├── docker-compose.yml
└── README.md
```

**注意：**

- 运行时代码真源：`backend/`、`frontend/`、`miniprogram/`、`app/`。
- `UI/` 为设计稿参考，不参与构建。
- 接口契约以 `backend/` 与 OpenAPI 为准。

---

## 许可证

MIT License

