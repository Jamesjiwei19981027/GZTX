# 烂笔头PM / WorkTodo

自托管的工作待办与人轴责任链：**Web + 微信小程序 + Flutter APP** 共用同一套 FastAPI 后端。

中文品牌名 **烂笔头PM**，英文 **WorkTodo**。人轴画布底层用 React Flow 库，产品对外不再使用 Flow 作为名称。

---

## 产品介绍

给领导视角用的待办：主干是人，工作项 / 里程碑 / 范围挂在人下面，终责钉在项目 PM。

- **任务管理**：创建 / 编辑 / 软删除、优先级、分类、标签、子任务清单、完成评价与跟进
- **智能提醒**：网页推送、邮件（可配 SMTP）、微信；提醒邮件可回复指令完成任务
- **多端**：React Web、微信小程序、Flutter APP（REST + JWT）
- **协作**：公司 / 项目、人轴树、指派可见性、频道与私信、收件箱
- **数据自主**：开发默认 SQLite，生产可用 PostgreSQL；不把业务数据交给第三方 SaaS

一页介绍：部署后打开 `/landing/`，源码在 [`landing/index.html`](./landing/index.html)。

远程仓库：[Jamesjiwei19981027/GZTX](https://github.com/Jamesjiwei19981027/GZTX)

---

## 用户指南

### 日常启动（Docker）

```bash
docker compose up -d
```

| 入口 | 地址 |
|------|------|
| Web | http://localhost 或 http://localhost:5173 |
| API 文档 | http://localhost:8010/docs |
| 产品介绍页 | http://localhost/landing/ |
| 小程序 | 微信开发者工具打开 `miniprogram/` |
| APP | 见 [启动指导文档.md](./启动指导文档.md) 与 [app/README.md](./app/README.md) |

本机 Python / npm 直跑仅作临时调试，见启动指导文档「可选」小节。

### 怎么用

1. 注册并验证 **邮箱** 即可管个人任务。
2. 创建公司 / 项目，或通过邀请链接加入。协作写路径还要求 **手机验证**。
3. 人轴：根节点必须是人；事项只能挂在人下面。空画布可一键生成示例轴。
4. 快速添加支持 `#标签` 与 `p0/p1/p2` 优先级。地址栏 `?view=` / `?taskId=` 可分享某个视图或任务。
5. 看板、日历、消息、收件箱走真实后端，不是演示数据。

更细的操作与排错：[启动指导文档.md](./启动指导文档.md)。设计思路：[docs/项目逻辑文档.md](./docs/项目逻辑文档.md)。

### 可选外部服务

未配置时界面会说明原因，不会假装发送成功。

- 浏览器通话：开发可只填 `WEBRTC_STUN_URLS`；生产建议同时配 TURN。媒体始终在浏览器，后端只转发信令。
- 外部 IMAP：设 `IMAP_HOST` 等后，在收件箱「External mail」手动同步。
- SMTP、Web Push VAPID、微信服务号、个人/公司 LLM：通知设置页或 `.env`。

---

## 部署指南

**开发**：`docker compose -f docker-compose.yml up -d`  
**生产**：`cp .env.example .env` 填密钥后 `docker compose -f docker-compose.prod.yml up -d --build`，首次 `exec backend alembic upgrade head`。

完整步骤、备份与健康检查：[docs/06-部署运维指南.md](./docs/06-部署运维指南.md)、[docs/07-collab-production-runbook.md](./docs/07-collab-production-runbook.md)。

### 分支与维护

本仓库是 **monorepo**。`main` 是唯一集成主线；三端各有长期分支，只改自己的目录。

| 分支 | 主要改动 |
|------|----------|
| **`main`** | `backend/`、`nginx/`、`docker-compose*`、共享 `docs/`、landing |
| **`web`** | `frontend/` |
| **`miniprogram`** | `miniprogram/` |
| **`app`** | `app/` |

API、数据库、部署配置只在 **`main`** 合入。客户端分支定期 `git merge main`。发版建议打 tag：`web-v*`、`mp-v*`、`app-v*`。

### 验证命令

```powershell
cd backend
.\.venv312\Scripts\python.exe -m pytest -q
cd ..\frontend
npm run test
npm run lint
npm run build
```

CI：`.github/workflows/ci.yml`（backend / frontend / app）；E2E 为 `.github/workflows/e2e.yml`。

### 技术栈与真源目录

| 层级 | 技术 |
|------|------|
| 后端 | Python + FastAPI + SQLAlchemy + APScheduler |
| 数据库 | SQLite（开发）/ PostgreSQL（生产） |
| Web | React 19 + Vite + Tailwind（`frontend/`） |
| 小程序 | 微信原生框架 |
| APP | Flutter（iOS + Android） |
| 认证 | JWT |

```
gongzuotix/
├── backend/              # FastAPI（唯一后端真源）
├── frontend/             # React Web
├── frontend-vue-archive/ # 历史 Vue（归档）
├── miniprogram/
├── app/
├── landing/              # 一页静态产品介绍
├── nginx/
├── docs/
├── docker-compose.yml
└── README.md
```

`UI/` 是设计稿，不参与构建。接口契约以 `backend/` 与 OpenAPI 为准。

其它文档：[docs/01-需求分析.md](./docs/01-需求分析.md) … [docs/06-部署运维指南.md](./docs/06-部署运维指南.md)、[docs/CURSOR-HANDOFF.md](./docs/CURSOR-HANDOFF.md)。

---

## 许可证（对外口径草案）

**软件本身**：MIT License（见仓库根若补 `LICENSE` 文件则以该文件为准）。允许复制、修改、分发，商业使用需保留版权声明。

**公司 / 协作许可证**：部署后开通多公司或付费档位，走产品自己的 `company_licenses`（HMAC / ed25519，见部署文档）。这是**运行时授权**，与 MIT 开源许可是两件事：

- 你可以按 MIT 使用、改造这份代码；
- 连上官方签发的公司许可证，只表示该实例被授权启用对应协作能力，**不**改变源码许可证，也**不**把客户数据授权给供应商。

此段为对外口径草案，待产品方确认后可再出正式法律文本。

---

## 小程序发布位

正式 AppID、request 合法域名、品牌图标需产品方提供。代码侧占位：

| 项 | 当前位置 | 现状 |
|----|----------|------|
| AppID | `miniprogram/project.config.json` → `appid` | `touristappid`（游客预览） |
| API / Web 域名 | `miniprogram/app.js` → `globalData.baseUrl` / `webUrl` | `https://your-domain.com/api/v1` |
| Tab 图标 | `miniprogram/assets/icons/` | 通用占位图 |

替换步骤见 [miniprogram/README.md](./miniprogram/README.md)。
