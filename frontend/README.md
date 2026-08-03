# WorkTodo Web（正式前端）

本目录为 **Docker / Nginx 正式 Web 真源**（原 Stitch Remix UI，已从 `remix-flow---productivity-&-task-management/` 迁入）。

旧 React 站归档在 `frontend-react-archive/`，仅供对照，不再被 `docker-compose.yml` 引用。

## 本地

```bash
# 推荐：仓库根
docker compose up -d --build frontend

# 或本机
npm install
npm run dev   # http://127.0.0.1:5173 ，/api 代理到 8010
```

- API：`VITE_API_BASE=/api/v1`（默认）
- Docker 内代理：`VITE_PROXY_TARGET=http://backend:8000`
