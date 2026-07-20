# Dev Handoff Patch — 工程拍板（开发必须遵守）

> **状态**：已锁定（2026-07-19）  
> **优先级**：高于子系统计划中的模糊表述；低于主方案「已锁定产品原则」与 `api-contracts-v1` 的 HTTP 形状  
> **读者**：全体后端；前端需读 §3 信封、§8 客户端通道

本文解决审查中发现的「方案有、计划糊」的工程歧义，使开发可无沟通开工。

---

## 0. 一页决策表

| # | 议题 | 锁定结论 |
|---|------|----------|
| 1 | OrgLeader 如何判定 | `company_memberships.is_org_leader=true` **或** 用户为某 `org_units.leader_user_id`；P0 开空项目还允许 `is_super_admin` |
| 2 | 异步 Job | **P0/P1：进程内 APScheduler + 表 `async_jobs`**；不强制 Redis。接口仍返回 `job_id` |
| 3 | 写正式进度唯一入口 | `app.services.progress_service.append_progress`（agent 工具 `pm_write_progress` 只能调它） |
| 4 | HTTP 信封 | 成功/业务失败均尽量 `ResponseData`；`code==200` 成功；业务失败 `code` 用本文错误码表；HTTP 状态见 contracts |
| 5 | 测试床 | `backend/tests/collab/conftest.py` + 内存 SQLite；seed 函数签名固定见 §6 |
| 6 | confirm_token | **P0：进程内 dict + TTL**（`ImportTokenStore`）；多 worker 生产再换 Redis，接口不变 |
| 7 | License | P0：`LICENSE_VERIFY_MODE=hmac`；接口与 payload 字段固定；P2 加 `ed25519` 同函数签名 |
| 8 | 微信禁上传 | `X-Client-Channel: wechat` **或** 路径 `/api/v1/wx/**` 内调用 → 403 `EVIDENCE_WECHAT_FORBIDDEN` |
| 9 | Wiki P0 | 采纳自动写 `project_wiki_entries` + `GET` 列表/详情；手写 CRUD 与搜索 **P0 最小**，向量 **P2** |
| 10 | Delegation | **P1** 表+API；P0 ACL 预留 `actions` 字符串，实现可先 `return False` |
| 11 | 汇报 Report | **P1** 表+manual run；cron 全量 **P2** |
| 12 | 迁移 | P0：`Base.metadata.create_all` + `scripts/migrate_collab_columns.py` 对已有库 ALTER；Alembic **P1 引入** |
| 13 | 依赖注入 | 统一 `CurrentUser` / `DbSession`（`app.core.dependencies`）；collab 扩展 `app.api.deps_collab` |
| 14 | ID 类型 | API JSON 与 ORM：**int**（SQLite/开发一致）；附录 BIGSERIAL 语义对齐为整型自增 |
| 15 | 路由前缀 | 一律 `/api/v1/...`；router 内部 `prefix` 与 `main.include_router` 勿双重叠加（与现网 `tasks` 一致） |

---

## 1. OrgLeader 与开空项目

### 1.1 数据

`company_memberships` 增加列（P0 必须）：

```text
is_org_leader: bool = false
```

含义：公司级「可开空项目 / 组织侧项目管理」角色，**不等于** `is_super_admin`（超管管策略/License/绑定）。

### 1.2 判定函数（唯一实现）

```python
# app/services/acl.py 或 app/services/org_roles.py
async def is_org_leader(db, user_id: int, company_id: int) -> bool:
    m = await get_membership(db, user_id, company_id)
    if not m or m.status != "active":
        return False
    if m.is_super_admin or m.is_org_leader:
        return True
    # 任一活跃部门负责人
    q = await db.execute(
        select(OrgUnit.id).where(
            OrgUnit.company_id == company_id,
            OrgUnit.leader_user_id == user_id,
            OrgUnit.is_active.is_(True),
        ).limit(1)
    )
    return q.scalar_one_or_none() is not None
```

### 1.3 权限

| 动作 | 谁 |
|------|-----|
| `POST /projects` 开空项目 | `is_org_leader` 为真（含超管） |
| `POST /projects/{id}/pm` | 超管 **或** 创建者 `created_by` **或** 现 PM |
| 改 `policy` / license / bindings | 仅 `is_super_admin` |

P0 种子：bootstrap 时第一个 admin：`is_super_admin=true` 且 `is_org_leader=true`。

---

## 2. 异步任务（async_jobs）

### 2.1 表 `async_jobs`

| 列 | 类型 | 说明 |
|----|------|------|
| id | int PK | 即 API `job_id`（字符串化返回也可，契约用 string） |
| company_id | int | |
| job_type | str | `evidence.judge` / `scope.recompute` / `org.sync` / `notify.dispatch` / … |
| status | str | `pending` \| `running` \| `succeeded` \| `failed` |
| payload_json | JSON | |
| result_json | JSON null | |
| error_message | text null | |
| created_at / started_at / finished_at | datetime | |

### 2.2 API

`GET /api/v1/jobs/{job_id}` → 见 contracts。

### 2.3 执行器 P0

```python
# 提交材料后
job = AsyncJob(job_type="evidence.judge", status="pending", payload_json={...})
db.add(job); await db.flush()
# 立即 schedule：
asyncio.create_task(run_evidence_judge(job.id))  # 或 APScheduler date trigger now
return {"package_id": ..., "status": "submitted", "job_id": str(job.id)}
```

**禁止** P0 引入独立 Redis 队列依赖。P2 可换 worker，**job_id 与表结构保留**。

---

## 3. HTTP 信封与错误码

### 3.1 成功

```json
{
  "code": 200,
  "message": "success",
  "data": { }
}
```

HTTP **200**（创建资源也用 200 + data，与现网 tasks 一致；不用 201，除非 contracts 某接口显式写 201）。

### 3.2 业务失败（推荐）

HTTP 状态：

| 场景 | HTTP |
|------|------|
| 未登录 | 401 |
| 无权限 / 功能未开 / license | 403 |
| 资源不存在 | 404 |
| 校验失败 / 状态不允许 | 422 |
| 冲突（配额、重复成员） | 409 |
| 服务器错误 | 500 |

Body 仍用信封：

```json
{
  "code": 40301,
  "message": "非项目成员，无法查看材料",
  "data": null
}
```

或兼容现网部分接口仅 `detail` 字符串的 `HTTPException`——**新 collab 路由禁止只抛无 code 的 detail**；统一：

```python
from fastapi.responses import JSONResponse

def fail(http_status: int, code: int, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=http_status,
        content={"code": code, "message": message, "data": None},
    )
```

### 3.3 稳定业务错误码（code 字段）

| code | HTTP | 含义 |
|------|------|------|
| 200 | 200 | 成功 |
| 40100 | 401 | 未认证 |
| 40300 | 403 | 通用无权限 |
| 40301 | 403 | 非项目成员 |
| 40302 | 403 | 非本公司成员 |
| 40303 | 403 | 需要超管 |
| 40304 | 403 | 需要 OrgLeader |
| 40305 | 403 | 需要 PM |
| 40310 | 403 | `license_required` |
| 40311 | 403 | `service_required`（SaaS 未开通） |
| 40312 | 403 | 功能未开通 feature |
| 40313 | 403 | 公司只读/过期不可写 |
| 40314 | 403 | 在职状态无效 |
| 40320 | 403 | `EVIDENCE_WECHAT_FORBIDDEN` 微信不可交材料 |
| 40321 | 403 | 投影待办不可改状态 |
| 40400 | 404 | 资源不存在 |
| 40900 | 409 | 通用冲突 |
| 40901 | 409 | 配额已满 |
| 40902 | 409 | 自创智能体超过 5 |
| 40903 | 409 | 成员已存在 |
| 42200 | 422 | 校验失败 |
| 42201 | 422 | 材料状态不可编辑 |
| 42202 | 422 | 二次上传须新文件包 |
| 42203 | 422 | 确认令牌无效/过期 |
| 42204 | 422 | 树操作成环 |
| 42210 | 422 | 判定输出无法解析 |
| 50000 | 500 | 内部错误 |

前端判断：**优先 `body.code === 200`**，不要只看 HTTP 200。

---

## 4. 正式进度唯一写入口

```python
# app/services/progress_service.py
async def append_progress(
    db: AsyncSession,
    *,
    company_id: int,
    project_id: int,
    node_id: int,
    event_type: str,       # ProgressEventType
    source: str,           # ProgressSource
    after_json: dict,
    before_json: dict | None = None,
    actor_user_id: int | None = None,
    agent_definition_id: int | None = None,
    evidence_package_id: int | None = None,
    review_case_id: int | None = None,
    reason: str | None = None,
) -> ProgressRecord:
    """
    事务内：
    1) INSERT progress_records
    2) UPDATE tree_nodes.progress_json = after_json + last_record_id
    3) INSERT audit_logs action=progress.write
    4) 可选 enqueue scope.recompute
    5) 可选 progress frequency alert
    禁止任何其他模块直接 UPDATE tree_nodes.progress_json 业务字段。
    """
```

Agent 工具名 `pm_write_progress` → **只**调用本函数。  
禁止：`UPDATE tasks SET status` 当作项目进度。

---

## 5. 客户端通道头

| Header | 值 | 行为 |
|--------|-----|------|
| `Authorization` | `Bearer <access>` | 标准 |
| `X-Client-Channel` | `web` \| `miniprogram` \| `wechat` | 缺省=`web` |

规则：

- `wechat` → 拒绝 `POST /api/v1/evidence/files` 与 multipart 材料文件  
- `wechat` → AgentRuntime `channel="wechat"`，工具授权同附录  
- 小程序正经上传材料时传 `miniprogram` 或 `web`，**不要**传 `wechat`

微信协作入口：`POST /api/v1/wx/collab/chat` 内部强制 `channel=wechat`。

---

## 6. 测试床约定（固定签名）

### 6.1 目录

```
backend/tests/collab/
  conftest.py          # 本包约定的 fixtures
  test_*.py
```

### 6.2 必须提供的 fixtures

```python
# 返回结构锁死，各计划引用同一形状
seed_ids: dict = {
    "company_id": int,
    "project_id": int,
    "root_node_id": int,
    "node_id": int,              # work_item
    "pm_user_id": int,
    "member_user_id": int,
    "outsider_user_id": int,
    "pm_headers": {"Authorization": "Bearer ..."},
    "member_headers": {"Authorization": "Bearer ..."},
    "outsider_headers": {"Authorization": "Bearer ..."},
    "org_leader_headers": {"Authorization": "Bearer ..."},
    "super_admin_headers": {"Authorization": "Bearer ..."},
}
```

### 6.3 DB

- 与现网 `tests/conftest.py` 可并存；collab 建议 **独立 async engine** 或沿用 sync override 但 collab 服务层统一 async——**P0 拍板**：  
  - 若服务已是 async SQLAlchemy：collab 测试用 `pytest-asyncio` + async session。  
  - 若短期复用现网 sync `get_db` override：服务层可先 sync，但 **API 签名仍按 async def 路由**；计划中的 `AsyncSession` 以实现时 `Session` 等价替换，**表结构不变**。  
- **推荐 P0**：新 collab 代码 **async**；`tests/collab/conftest.py` 自建 async SQLite。

### 6.4 登录 token

与现网一致：`create_access_token(data={"sub": user.id})`（注意现网 sub 类型，与 `get_current_user` 一致）。

---

## 7. Import confirm_token

```python
# app/services/import_token_store.py
class ImportTokenStore:
    """P0: 进程内；接口 get/set/delete 便于换 Redis"""
    def set(self, token: str, payload: dict, ttl_sec: int = 600) -> None: ...
    def get(self, token: str) -> dict | None: ...
    def delete(self, token: str) -> None: ...
```

单例 `import_token_store`。多 replica 部署 P1 再换 Redis，**URL 与 body 不变**。

---

## 8. Wiki 范围

| 能力 | 波次 |
|------|------|
| adopted 时插入 `project_wiki_entries`（source=evidence_adopt） | P0 |
| `GET /projects/{id}/wiki` 列表、`GET /wiki/{id}` | P0 |
| PM/NodeOwner `POST/PATCH` 手写 wiki | P0 |
| `wiki_search` 工具关键词 SQL ILIKE | P1 |
| 向量检索 | P2 |
| `personal_wiki_entries` | P1 |

未采纳：`in_wiki=false`，**不得**插入项目 wiki。

---

## 9. Delegation 范围

| 波次 | 内容 |
|------|------|
| P0 | 表可建可不建；`AclService` 对 `delegatee` 分支 `return False` |
| P1 | `delegation_grants` 表 + CRUD API + ACL 读 `actions_json` |
| P2 | 授权模板、过期 job |

---

## 10. 依赖与配置项（settings 新增）

```python
DEPLOY_MODE: str = "single_company"       # single_company | saas
LICENSE_PUBLIC_KEY: str = ""
LICENSE_VERIFY_MODE: str = "hmac"         # hmac | ed25519
INTEGRATION_SECRET_KEY: str = ""          # Fernet 或 urlsafe 32B
COLLAB_OBJECT_ROOT: str = "data/objects"  # 本地存储根
JUDGE_BACKEND: str = "rule"               # rule | llm
DEFAULT_COMPANY_SLUG: str = "default"
```

---

## 11. 模型导出与建表

所有 collab 模型必须在 `app/models/__init__.py` import，保证 `init_db` / `create_all` 建表。

新增文件清单以各子系统计划 File Map 为准；**不得**在 `docs/` 下建可运行代码。

---

## 12. PR 与提交约定

```text
feat(collab-tenant): ...
feat(collab-tree): ...
feat(collab-evidence): ...
feat(collab-agent): ...
feat(collab-web): ...
test(collab): ...
docs(collab): ...
```

每个 PR：

1. 链接 contracts 章节  
2. `pytest tests/collab/...` 输出  
3. 不影响则注明 `tasks` 回归已跑  

---

## 13. 与旧计划条文的覆盖声明

以下旧表述**作废**，以本文为准：

| 旧表述 | 新 |
|--------|-----|
| OrgLeader「MVP 用 super_admin」 | §1 正式 OrgLeader 字段 |
| 伞计划 Redis worker | §2 APScheduler + async_jobs |
| License 仅口嗨生产验签 | §0 + settings；P0 hmac 合法 |
| confirm Redis 或内存 | §7 进程内 store |
| get_db 导入路径混乱 | §0.13 + core.dependencies |

---

## 14. 开发开干最小顺序（单人）

1. models: company (+ is_org_leader) → project → tree → evidence/progress/audit → async_jobs  
2. deps_collab + EntitlementService  
3. projects/nodes API + AclService  
4. ProgressService + evidence submit + rule judge + job  
5. tasks 兼容列  
6. frontend 项目树 + 材料  

对应 task-board：**P0-BE-*** 全列。
