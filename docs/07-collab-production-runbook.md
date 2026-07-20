# 团队协作（Collab）生产上线 Runbook

> 目标：空机 → 可对外服务的 **生产候选** 部署（单公司 / 自托管）。  
> 非目标：真 WeCom/OIDC 深度联调、Redis 队列、Wiki 向量、完整汇报 cron、渗透测试、小程序上架。

---

## 1. 前置条件

| 项 | 要求 |
|----|------|
| Python | 3.11+（推荐 3.12） |
| Node.js | 18+（前端构建） |
| 数据库 | SQLite（小团队）或 PostgreSQL 14+（推荐生产） |
| 磁盘 | `data/`、`data/uploads`、`data/objects` 可写 |
| 依赖 | `backend/requirements.txt`（含 `alembic`、`cryptography`） |

---

## 2. 环境变量（必填 / 生产）

复制 `backend/.env.example` → `backend/.env`，生产至少设置：

| 变量 | 生产建议 | 说明 |
|------|----------|------|
| `DEBUG` | `false` | 关闭调试 |
| `SECRET_KEY` | 随机 ≥32 字节 | JWT；**禁止**使用示例默认值 |
| `DATABASE_URL` | `postgresql+asyncpg://...` 或 SQLite 路径 | Alembic 会自动去掉 async 驱动前缀 |
| `APP_URL` | 对外 HTTPS 域名 | 邮件链接等 |
| `CORS_ORIGINS` | JSON 数组，仅信任前端源 | 例 `["https://app.example.com"]` |
| `LICENSE_VERIFY_MODE` | **`ed25519`** | 生产；开发可 `hmac` |
| `LICENSE_PUBLIC_KEY` | urlsafe-b64 公钥 | ed25519 裸 32 字节公钥 |
| `LICENSE_PRIVATE_KEY` | **仅签发机** | 勿打进应用镜像 |
| `INTEGRATION_SECRET_KEY` | 随机 32+ 字节 | 集成凭证 Fernet；缺省会派生自 `SECRET_KEY` |
| `COLLAB_OBJECT_ROOT` | 持久卷路径 | 证据对象存储根目录 |
| `DEPLOY_MODE` | `single_company` | 或 `saas` |
| `JUDGE_BACKEND` | `rule`（默认）或 `llm` | LLM 需另配模型绑定 |
| `AUTO_CREATE_SCHEMA` | **`false`** | 生产仅用 Alembic；开发可 true |
| `ALLOW_FAKE_SSO` | **`false`** | 生产禁止 FakeOIDC `fake:` code |
| SMTP / IMAP / VAPID / WX_* | 按需 | 通知与小程序 |

启动时若 `DEBUG=false`，弱 `SECRET_KEY` / 默认 License 密钥 / 非 ed25519 会**硬失败**。

### 2.1 生成 ed25519 密钥对

在**离线签发环境**（非业务进程）执行：

```bash
cd backend
python -c "
from app.services.license_verify import generate_ed25519_keypair
priv, pub = generate_ed25519_keypair()
print('LICENSE_PRIVATE_KEY=' + priv)
print('LICENSE_PUBLIC_KEY=' + pub)
"
```

- 将 **公钥** 写入运行环境 `LICENSE_PUBLIC_KEY`，并设 `LICENSE_VERIFY_MODE=ed25519`。  
- **私钥** 仅存于密钥库 / 运维签发脚本，轮换时先部署新公钥再换签。

### 2.2 签发 License（示例）

```python
import json
from datetime import datetime, timedelta, timezone
from app.services.license_verify import sign_license_ed25519

payload = {
    "company_slug": "default",
    "features": {"project_tree": True, "agents": True, "org_sync": True},
    "quotas": {"max_users": 100, "max_projects": 50},
    "valid_to": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
}
raw = json.dumps(payload, sort_keys=True)
sig = sign_license_ed25519(raw, "<LICENSE_PRIVATE_KEY>")
# 管理端/API：提交 raw + sig 解锁公司
print(raw)
print(sig)
```

开发环境可用 `LICENSE_VERIFY_MODE=hmac`，`LICENSE_PUBLIC_KEY` 为共享密钥，`sign_license_dev` 签名。

---

## 3. 数据库迁移（生产路径）

**禁止**仅依赖运行时 `create_all` 作为唯一上线路径。生产使用 Alembic：

```bash
cd backend
# DATABASE_URL 可与应用相同（async URL 亦可，env.py 会规范化）
export DATABASE_URL="postgresql+asyncpg://user:pass@db:5432/worktodo"   # Linux
# Windows PowerShell: $env:DATABASE_URL = "..."

alembic upgrade head
# 当前 head: a1b2c3d4e5f6（含 collab 全表 + tasks 兼容列）
```

验证：

```bash
alembic current
# 期望: a1b2c3d4e5f6
```

空库从 `001` 链式升至 `a1b2c3d4e5f6` 会创建个人任务表与协作表（companies / projects / tree_nodes / evidence / progress / agents / notify / delegation / reports 等）。

已有个人库：同一 revision 幂等 `create_all(checkfirst)` + `tasks` 列 `origin/company_id/project_id/project_node_id/linked_readonly`。

回滚（谨慎）：`alembic downgrade 6858064f5e4b` 会删除 collab 表，不删核心个人表。

---

## 4. 启动与健康检查

```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2   # 生产 workers 按 CPU 调整；SQLite 建议 1 worker
```

健康检查：

```bash
curl -sS http://127.0.0.1:8000/api/v1/health
# {"code":200,"message":"success","data":{"status":"healthy","version":"...","timestamp":"..."}}
```

前端：

```bash
cd frontend
npm ci
npm run build
# 将 dist/ 交给 Nginx/CDN；API 反代到后端 /api
```

---

## 5. 备份与恢复

| 资产 | 建议 |
|------|------|
| 数据库 | PostgreSQL：日备 + WAL；SQLite：停写或热拷 `worktodo.db` |
| `COLLAB_OBJECT_ROOT` | 与 DB 同频备份（证据对象） |
| `UPLOAD_DIR` | 任务附件 |
| 密钥 | `SECRET_KEY` / License 私钥 / `INTEGRATION_SECRET_KEY` 仅密钥管理系统 |

恢复顺序：还原 DB → 还原对象目录 → `alembic current` 确认 revision → 启动 → health。

---

## 6. 集成桩与已知边界（生产候选）

| 能力 | 状态 |
|------|------|
| License hmac / ed25519 | 已实现；生产用 ed25519 |
| 存储 / ASR 路由 | 本地 / 桩驱动可切换；对象根 `COLLAB_OBJECT_ROOT` |
| 通知 | in_app + email 桩 / SMTP 实发按配置 |
| 组织同步 / SSO | **禁止 SSO 自动入会**；仅已邀请成员；FakeOIDC 仅 DEBUG |
| 企微/OIDC 配置 | **公司设置前端可配**（域名/回调/密钥加密入库）；无资质时可后填，无需改代码 |
| 智能体 | 工具链需会话 user/company/project ACL；rule/LLM judge 可配置 |
| 证据上传 | 必填 `company_id` + 成员 ACL + `MAX_UPLOAD_SIZE`；不回传 storage_key |
| 委托 | actions 白名单，禁止 `*` |
| Alembic | head `a1b2c3d4e5f6`：首版 collab 用 create_all 建表 + 幂等列；后续须显式 revision |
| Redis 队列 | 非目标；进程内 job 可接受小规模 |
| 小程序上架审核材料 | 非本 runbook 范围 |

---

## 7. 上线检查清单

- [ ] 生产 `.env`：无示例 `SECRET_KEY` / 无调试默认 License 密钥  
- [ ] `LICENSE_VERIFY_MODE=ed25519` 且公钥正确  
- [ ] `alembic upgrade head` → `a1b2c3d4e5f6`  
- [ ] `GET /api/v1/health` → `healthy`  
- [ ] 前端 `npm run build` 成功并完成反代  
- [ ] CORS / HTTPS / 反向代理超时与上传体大小  
- [ ] 备份任务与对象卷挂载  
- [ ] 回归：`pytest tests/collab tests/test_tasks.py tests/test_auth.py`（发布前 CI）

---

## 8. 故障速查

| 现象 | 处理 |
|------|------|
| license 签名无效 | 核对 mode、公钥、payload 是否 `sort_keys` 与签发一致 |
| 缺表 / 缺列 | `alembic upgrade head`；勿混用过期 create_all  alone |
| 证据上传失败 | 检查 `COLLAB_OBJECT_ROOT` 权限与磁盘 |
| 多 worker + SQLite 锁 | 改 PostgreSQL 或单 worker |
| CORS 失败 | 调整 `CORS_ORIGINS` 与前端源一致 |

---

## 9. 相关代码

- 迁移：`backend/alembic/versions/a1b2c3d4e5f6_collab_full_schema.py`  
- 验签：`backend/app/services/license_verify.py`  
- 配置：`backend/app/core/config.py`  
- 健康：`GET /api/v1/health`  
