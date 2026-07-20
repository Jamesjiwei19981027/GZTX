# WorkTodo 前端

Vue 3 + Vite + Pinia + Tailwind（MD3 Design Tokens）+ Element Plus。

## 开发

```bash
npm install
npm run dev
```

默认代理 API 到后端 `/api/v1`（见 `vite.config.ts` 与 compose 环境变量 `VITE_API_BASE_URL`）。

## 页面

| 路由 | 说明 |
|------|------|
| `/login` `/register` | 登录注册 |
| `/dashboard` | 仪表盘（默认首页） |
| `/tasks` | 任务列表 |
| `/tasks/new` `/tasks/:id` | 新建 / 详情 |
| `/calendar` | 日历 |
| `/settings` | 设置（SMTP、主题、推送等） |

## 说明

- 设计体系对齐 `UI/stitch_smart_task_manager/productivity_flow/DESIGN.md`
- 已移除 Mock 页：收件箱 / 看板 / 聊天
- 这是仓库中**唯一** Web 前端真源
