# Remix UI — 本地联调

1. 确保 Docker 后端已起：`http://127.0.0.1:8010/docs`  
   - 开发库会 `create_all` 建 `team_channels` / `user_presence`  
   - 或执行：`alembic upgrade head`（含 `f6a7b8c9d0e1`）
2. 在本目录：
```bash
npm install
npm run dev
```
3. 打开 http://127.0.0.1:3000 ，用后端账号登录  
4. Vite 已把 `/api` 代理到 `8010`  
5. **具体项目**下可用：人轴写回、布局、终责偏移、审计、团队邀请、消息频道、活动流  
6. 「全盘概览」：跨项目任务列表；人轴/团队需切到具体项目  
7. 缺口与边界见 [BACKEND_GAP.md](./BACKEND_GAP.md)

可选环境变量（`.env.local`）：
```
VITE_API_BASE=/api/v1
```
