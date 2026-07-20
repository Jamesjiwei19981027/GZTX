# Personal Tasks Compat · Migration Runbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.  
> **Task board ID:** `P0-BE-04`  
> **HTTP 真源:** [`2026-07-19-api-contracts-v1.md`](./2026-07-19-api-contracts-v1.md) **§15**  
> **工程拍板:** handoff §7 ImportTokenStore（P0 进程内）· §12 迁移

**Goal:** 个人 `tasks` 表兼容扩展、默认 origin=personal、可选投影链接、个人任务导入项目树的安全工具，以及部署升级 Runbook（附录 K），保证旧客户端只打 `/tasks` 不受影响。

**Architecture:** 加列不改语义；`origin=project_link` 的任务只读投影正式进度；导入 API 需二次确认 token；迁移脚本可 up/down；禁止用 `tasks.status` 写正式进度的服务层断言。

**Tech Stack:** SQLAlchemy · `create_all` + ALTER 脚本（P0）· FastAPI · pytest（Alembic 为 P2-04）

## Global Constraints

- Spec: 主方案 §2.1、§4.3、§9；附录 §A、§C.22、§K  
- **HTTP/DTO:** contracts §15；错误 `42203` / `40321`  
- `/tasks` 永久保留  
- 导入需二次确认；token 存 `ImportTokenStore`（非口头「Redis 或内存」二选一）  
- 不创建默认项目  
- 中文提示

**Prerequisites:** project-tree-acl（导入目标节点）；tenant 可选 bootstrap

---

## File Map

```
backend/app/models/task.py              # 新列
backend/app/schemas/task.py             # 响应可选字段
backend/app/services/task_service.py    # 投影只读守卫
backend/app/services/import_personal.py
backend/app/api/v1/projects.py          # import endpoint
backend/scripts/migrate_collab_k.py     # runbook 脚本
backend/tests/collab/test_task_compat.py
backend/tests/collab/test_import_personal.py
docs/superpowers/plans/ 或 docs/ 升级说明片段（本 plan 内 Runbook 节）
```

---

### Task 1: tasks 表增量列

**Files:**
- Modify: `backend/app/models/task.py`
- Modify: `backend/app/schemas/task.py`（若有 TaskOut）
- Test: `backend/tests/collab/test_task_compat.py`

**Interfaces:** 列 `origin`, `company_id`, `project_id`, `project_node_id`, `linked_readonly`

- [ ] **Step 1: Failing test — 模型有列**

```python
def test_task_has_collab_columns():
    from app.models.task import Task
    assert hasattr(Task, "origin")
    assert hasattr(Task, "project_node_id")
    assert hasattr(Task, "linked_readonly")
```

- [ ] **Step 2: 在 Task 模型增加**

```python
# 个人/协作兼容字段（附录 C.22）
origin = Column(String(32), nullable=False, default="personal")  # personal | project_link
company_id = Column(Integer, nullable=True, index=True)
project_id = Column(Integer, nullable=True, index=True)
project_node_id = Column(Integer, nullable=True, index=True)
linked_readonly = Column(Boolean, default=True, nullable=False)
```

- [ ] **Step 3: SQLite/Postgres 兼容** — 若用 `create_all` 开发库可重建；生产提供 ALTER：

```sql
ALTER TABLE tasks ADD COLUMN origin VARCHAR(32) NOT NULL DEFAULT 'personal';
ALTER TABLE tasks ADD COLUMN company_id INTEGER;
ALTER TABLE tasks ADD COLUMN project_id INTEGER;
ALTER TABLE tasks ADD COLUMN project_node_id INTEGER;
ALTER TABLE tasks ADD COLUMN linked_readonly BOOLEAN NOT NULL DEFAULT TRUE;
```

- [ ] **Step 4: 现有创建任务 API 不传 origin → 默认 personal**  

```python
@pytest.mark.asyncio
async def test_create_task_defaults_personal(async_client, auth_headers):
    r = await async_client.post("/api/v1/tasks", json={...existing fields...}, headers=auth_headers)
    # 若响应含 origin
    data = r.json()["data"]
    assert data.get("origin", "personal") == "personal"
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(tasks): collab compat columns origin and project link"
```

---

### Task 2: 投影只读守卫

**Files:**
- Modify: `backend/app/services/task_service.py`（或更新 status 的路径）
- Test: `test_task_compat.py`

- [ ] **Step 1: Test**

```python
@pytest.mark.asyncio
async def test_cannot_complete_project_link_as_formal_progress(db, linked_task):
    """origin=project_link 且 linked_readonly → 禁止 status 改为完成作为「项目完工」语义；
    允许个人备注类字段视产品：默认拒绝 status 变更。"""
    from app.services.task_service import update_task_status
    import pytest
    with pytest.raises(PermissionError):
        await update_task_status(db, linked_task.id, status=2, user_id=linked_task.user_id)
```

- [ ] **Step 2: 实现**

```python
if task.origin == "project_link" and task.linked_readonly:
    if status_changing:
        raise PermissionError("项目投影待办不可直接改状态冒充正式进度，请走材料/说明更新")
```

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(tasks): block status change on readonly project links"
```

---

### Task 3: 导入个人任务到项目树

**Files:**
- Create: `backend/app/services/import_personal.py`
- Modify: `backend/app/api/v1/projects.py`
- Test: `backend/tests/collab/test_import_personal.py`

**Interfaces:**
```
POST /api/v1/projects/{id}/import-personal-tasks
body: {
  "task_ids": [1,2,3],
  "parent_node_id": 10,
  "mapping": {"node_type_key": "work_item"},
  "confirm_token": "<from preview>"
}
POST /api/v1/projects/{id}/import-personal-tasks/preview
body: { "task_ids": [1,2,3], "parent_node_id": 10 }
→ { confirm_token, preview: [{task_id, title, will_create_node_title}] }
```

- [ ] **Step 1: Tests**

```python
@pytest.mark.asyncio
async def test_import_requires_confirm_token(async_client, seed, personal_tasks):
    r = await async_client.post(
        f"/api/v1/projects/{seed.project_id}/import-personal-tasks",
        json={
            "task_ids": [personal_tasks[0].id],
            "parent_node_id": seed.root_id,
            "mapping": {"node_type_key": "work_item"},
        },
        headers=seed.pm_headers,
    )
    assert r.status_code == 422 or r.json()["code"] != 200

@pytest.mark.asyncio
async def test_import_with_preview_token(async_client, seed, personal_tasks):
    prev = await async_client.post(
        f"/api/v1/projects/{seed.project_id}/import-personal-tasks/preview",
        json={"task_ids": [personal_tasks[0].id], "parent_node_id": seed.root_id},
        headers=seed.pm_headers,
    )
    token = prev.json()["data"]["confirm_token"]
    r = await async_client.post(
        f"/api/v1/projects/{seed.project_id}/import-personal-tasks",
        json={
            "task_ids": [personal_tasks[0].id],
            "parent_node_id": seed.root_id,
            "mapping": {"node_type_key": "work_item"},
            "confirm_token": token,
        },
        headers=seed.pm_headers,
    )
    assert r.json()["code"] == 200
    # 新建 tree_node；可选把 task.origin 改为 project_link
```

- [ ] **Step 2: preview token** — `secrets.token_urlsafe(16)` + `ImportTokenStore.set(token, payload, ttl_sec=600)`（handoff §7；进程内实现，接口可换 Redis）  

```python
async def preview_import(...):
    token = secrets.token_urlsafe(16)
    cache.set(token, {"task_ids": task_ids, "parent_node_id": parent_node_id, "user_id": user_id}, ex=600)
    return {"confirm_token": token, "preview": [...]}

async def execute_import(..., confirm_token):
    data = cache.get(confirm_token)
    if not data or data["task_ids"] != task_ids:
        raise HTTPException(400, detail="确认令牌无效或已过期，请重新预览")
    # PM acl tree.edit
    for tid in task_ids:
        task = get_task(tid)
        if task.user_id != user_id and not is_pm:
            # 仅允许导入自己的待办，或 PM 导入成员的需额外授权——默认仅本人
            raise HTTPException(403, detail="只能导入自己的个人待办")
        node = await tree_service.create_node(..., title=task.title, ...)
        task.origin = "project_link"
        task.project_id = project_id
        task.project_node_id = node.id
        task.company_id = company_id
        task.linked_readonly = True
```

- [ ] **Step 3: 不删除原 task 行**  
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(import): personal tasks to project tree with confirm token"
```

---

### Task 4: Bootstrap 与附录 K 脚本

**Files:**
- Create: `backend/scripts/migrate_collab_k.py`
- Create: `docs/升级-团队协作Runbook.md`（简短操作说明，供运维）

- [ ] **Step 1: 脚本步骤（可打印 dry-run）**

```python
"""
附录 K 数据迁移 Runbook 实现：
1. 确保 companies 默认行（single_company + 可选 license）
2. 可选：users → company_memberships
3. tasks 列已存在（Task1）
4. 不创建默认项目
5. 打印下一步：调用 import API
"""
```

```python
# migrate_collab_k.py 核心
async def main(dry_run: bool = True):
    # 1 company
    # 2 memberships for all users if --link-users
    # 3 verify tasks columns
    # 4 assert project count unchanged unless --noop
    print("Done. No default project created.")
```

- [ ] **Step 2: docs 写明回滚**

```markdown
## 回滚
- down：删除新业务表（projects/tree/...）需备份后执行
- tasks 新列可保留
- 关闭 feature project_tree entitlement
```

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(migrate): collab runbook script and upgrade doc"
```

---

### Task 5: 回归 — 旧 tasks 路径

- [ ] **Step 1: 跑现有 tasks 相关测试全绿**

```
cd backend
pytest tests/ -k "task" -v --ignore=tests/collab
pytest tests/collab/test_task_compat.py tests/collab/test_import_personal.py -v
```

- [ ] **Step 2: 确认登录后个人列表与协作前一致**  
- [ ] **Step 3: 修复断裂后 commit**

---

## Runbook（运维摘要，附录 K）

1. 部署新版本后端（含新表与 tasks 列）。  
2. `python -m scripts.migrate_collab_k --link-users`（saas 可跳过 link）。  
3. single_company：上传 License → company status=active。  
4. OrgLeader/超管创建空项目 → 指定 PM → 建树。  
5. 用户自愿「导入个人待办」preview → confirm。  
6. 验证：旧 App 仅 `/tasks` 仍可用；项目进度仅树+账本。

回滚：关 feature；新表可留空；勿删 progress_records 若已有生产数据。

---

## Spec Coverage

| 需求 | Task |
|------|------|
| tasks 兼容列 | 1 |
| 禁止冒充正式进度 | 2 |
| 导入+二次确认 | 3 |
| 附录 K / 无默认项目 | 4 |
| 旧客户端无感 | 5 |

**Handoff:** 伞计划 Definition of Done；执行脊梁 E2E-01～04。
