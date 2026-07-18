# 工作待办提醒系统 (WorkTodo / 烂笔头 PM)

自托管的待办事项管理系统：Web + 微信小程序共用同一套 FastAPI 后端。

---

## 核心能力

- **任务管理**：创建/编辑/软删除、优先级、分类、标签、完成评价与跟进
- **智能提醒**：网页推送、邮件提醒（可配置 SMTP）、提醒时间与通知渠道
- **邮件闭环**：提醒邮件 → 用户回复指令 → 后端 IMAP 解析并更新任务
- **多端访问**：Vue3 Web + 微信小程序（REST + JWT）
- **数据自主**：自托管，开发默认 SQLite，生产可用 PostgreSQL

---

## 文档

| 文档 | 说明 |
|------|------|
| [docs/项目逻辑文档.md](./docs/项目逻辑文档.md) | **项目思路与目录真源**（优先阅读） |
| [docs/01-需求分析.md](./docs/01-需求分析.md) | 功能需求与场景 |
| [docs/02-技术架构设计.md](./docs/02-技术架构设计.md) | 架构与技术选型 |
| [docs/03-数据库设计.md](./docs/03-数据库设计.md) | 数据模型 |
| [docs/04-API接口设计.md](./docs/04-API接口设计.md) | API 设计（以代码为准） |
| [docs/05-开发计划与里程碑.md](./docs/05-开发计划与里程碑.md) | 里程碑 |
| [docs/06-部署运维指南.md](./docs/06-部署运维指南.md) | 部署运维 |
| [docs/superpowers/](./docs/superpowers/) | 邮件回复 / 跟进专题 |

---

## 快速开始

```bash
# 后端
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# 前端（另开终端）
cd frontend
npm install
npm run dev

# 或 Docker
docker-compose -f docker-compose.yml up -d
```

- API 文档：http://localhost:8000/docs  
- Web 开发：http://localhost:5173  
- 小程序：用微信开发者工具打开 `miniprogram/`（需配置 `app.js` 中的 `baseUrl`）

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Python + FastAPI + SQLAlchemy + APScheduler |
| 数据库 | SQLite（开发）/ PostgreSQL（生产） |
| 前端 | Vue 3 + Vite + Pinia + Tailwind + Element Plus |
| 小程序 | 微信原生框架 |
| 认证 | JWT |

---

## 项目结构（真源）

```
gongzuotix/
├── backend/           # FastAPI 后端（唯一后端真源）
├── frontend/          # Vue3 Web（唯一前端真源）
├── miniprogram/       # 微信小程序
├── nginx/             # 反向代理
├── data/              # 运行时数据（gitignore）
├── scripts/           # 备份与健康检查
├── docs/              # 文档（不含可运行副本）
├── UI/                # 设计稿参考（非运行代码）
├── docker-compose.yml
└── README.md
```

**注意：**

- 只维护根目录下的 `backend/`、`frontend/`、`miniprogram/`。
- `UI/` 仅为设计规范与静态稿，不参与构建。
- 历史鸡肋 MVP 快照已移除，请勿再从文档目录恢复第二套前端。

---

## 许可证

MIT License
