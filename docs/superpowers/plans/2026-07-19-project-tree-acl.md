# Project Tree · Members · Path ACL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.  
> **Task board ID:** `P0-BE-02`  
> **HTTP 真源:** [`2026-07-19-api-contracts-v1.md`](./2026-07-19-api-contracts-v1.md) **§2–3**  
> **工程拍板:** [`2026-07-19-dev-handoff-patch.md`](./2026-07-19-dev-handoff-patch.md) §1 OrgLeader

**Goal:** 实现空项目创建、PM 指定、成员拉取/邀请/退出、一项目一树 CRUD（含 path 物化与环检测）、节点指派与基于角色+path 的 ACL，供证据脊梁与 Agent 鉴权调用。

**Architecture:** `projects` 挂 `company_id`；`tree_nodes.path` 形如 `/1/4/9/`；`AclService.can(user, action, resource)` 实现附录 E；结构变更不删 `progress_records`（软删节点）。**OrgLeader**（`is_org_leader` / 部门负责人 / 超管，见 handoff）可开空项目（无 PM）；PM 建树与拉人。

**Tech Stack:** FastAPI · SQLAlchemy 2 · pytest · 依赖 tenant 计划的 Company/Membership/deps_collab

## Global Constraints

- Spec: 主方案 §2.1、§4、§5.1、§7  
- **HTTP/DTO:** api-contracts-v1 §2–3  
- Contracts DB: 附录 §B.2、§C.5–C.10、§D.4、§E  
- 一项目一树：`GET .../tree` 返回森林（允许多根 sibling，同属一项目）  
- 正式进度**不**在本计划写；只维护 `progress_json` 默认快照；**禁止** PATCH body 带 progress_json  
- 开空项目 Auth：`require_org_leader`（**不是**「仅 super_admin」）  
- 中文错误；真源 `backend/`  
- seed fixture 形状锁死 handoff §6

**Prerequisites:** `2026-07-19-tenant-entitlement-policy.md` Tasks 1–4（含 `is_org_leader` + `require_org_leader`）

---

## File Map

```
backend/app/models/project.py       # Project, ProjectMember, ProjectInvitation
backend/app/models/tree.py          # NodeType, TreeNode, NodeAssignment
backend/app/services/acl.py
backend/app/services/tree_service.py
backend/app/services/project_service.py
backend/app/schemas/project.py
backend/app/schemas/tree.py
backend/app/api/v1/projects.py
backend/app/api/v1/nodes.py
backend/tests/collab/test_projects.py
backend/tests/collab/test_tree_acl.py
```

---

### Task 1: Project / Member / Invitation 模型

**Files:**
- Create: `backend/app/models/project.py`
- Modify: `backend/app/models/__init__.py`
- Test: `backend/tests/collab/test_project_models.py`

**Interfaces:**
- Produces: `Project`, `ProjectMember`, `ProjectInvitation`

- [ ] **Step 1: Failing test**

```python
def test_project_models():
    from app.models.project import Project, ProjectMember, ProjectInvitation
    assert Project.__tablename__ == "projects"
    assert ProjectMember.__tablename__ == "project_members"
```

- [ ] **Step 2: Implement**

```python
# backend/app/models/project.py
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.sql import func
from app.db.base import Base

class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    status = Column(String(32), nullable=False, default="draft")  # draft|active|archived
    pm_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    archive_policy_json = Column(JSON, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    archived_at = Column(DateTime(timezone=True), nullable=True)

class ProjectMember(Base):
    __tablename__ = "project_members"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    role = Column(String(32), nullable=False, default="member")  # pm|member
    joined_at = Column(DateTime(timezone=True), server_default=func.now())
    left_at = Column(DateTime(timezone=True), nullable=True)
    # 活跃唯一在应用层保证：insert 前查 left_at IS NULL

class ProjectInvitation(Base):
    __tablename__ = "project_invitations"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    invitee_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    invitee_email = Column(String(200), nullable=True)
    token = Column(String(64), unique=True, nullable=False)
    status = Column(String(32), nullable=False, default="pending")
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 3: Export; test pass; commit**

```bash
git commit -m "feat(project): project member invitation models"
```

---

### Task 2: NodeType / TreeNode / NodeAssignment 模型

**Files:**
- Create: `backend/app/models/tree.py`
- Test: `backend/tests/collab/test_tree_models.py`

**Interfaces:**
- Produces: `NodeType`, `TreeNode`, `NodeAssignment`
- Default progress_json factory by template

- [ ] **Step 1: Failing test**

```python
def test_tree_models_and_default_progress():
    from app.models.tree import TreeNode, NodeType, NodeAssignment, default_progress_json
    assert TreeNode.__tablename__ == "tree_nodes"
    w = default_progress_json("work_item")
    assert w["template"] == "work_item"
    assert w["status"] == "not_started"
    m = default_progress_json("milestone")
    assert m["status"] == "not_reached"
    s = default_progress_json("scope")
    assert "summary" in s
```

- [ ] **Step 2: Implement**

```python
# backend/app/models/tree.py
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from app.db.base import Base

def default_progress_json(template: str) -> dict:
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    if template == "work_item":
        return {
            "template": "work_item",
            "status": "not_started",
            "percent": 0,
            "checklist": [],
            "updated_at": now,
            "last_record_id": None,
        }
    if template == "milestone":
        return {
            "template": "milestone",
            "status": "not_reached",
            "updated_at": now,
            "last_record_id": None,
        }
    # scope
    return {
        "template": "scope",
        "summary": {
            "total_work_items": 0,
            "done": 0,
            "blocked": 0,
            "milestones_reached": 0,
            "milestones_total": 0,
            "rollupon": "child_work_items",
        },
        "updated_at": now,
        "last_record_id": None,
    }

class NodeType(Base):
    __tablename__ = "node_types"
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    key = Column(String(64), nullable=False)  # scope|work_item|milestone|custom_*
    name = Column(String(100), nullable=False)
    behavior_template = Column(String(32), nullable=False)  # BehaviorTemplate
    config_json = Column(JSON, nullable=True)

class TreeNode(Base):
    __tablename__ = "tree_nodes"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    parent_id = Column(Integer, ForeignKey("tree_nodes.id"), nullable=True, index=True)
    node_type_id = Column(Integer, ForeignKey("node_types.id"), nullable=False)
    title = Column(String(300), nullable=False)
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    path = Column(String(1000), nullable=False, default="/")
    depth = Column(Integer, default=0, nullable=False)
    start_at = Column(DateTime(timezone=True), nullable=True)
    due_at = Column(DateTime(timezone=True), nullable=True)
    milestone_at = Column(DateTime(timezone=True), nullable=True)
    allow_clear_text_progress = Column(Boolean, default=False, nullable=False)
    assignment_model_json = Column(JSON, nullable=True)
    progress_json = Column(JSON, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class NodeAssignment(Base):
    __tablename__ = "node_assignments"
    id = Column(Integer, primary_key=True)
    node_id = Column(Integer, ForeignKey("tree_nodes.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    role_key = Column(String(64), nullable=False, default="primary")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 3: Seed system NodeTypes** in bootstrap or first project create: scope, work_item, milestone  
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(tree): node type tree node assignment models"
```

---

### Task 3: AclService

**Files:**
- Create: `backend/app/services/acl.py`
- Test: `backend/tests/collab/test_acl_service.py`

**Interfaces:**
- `AclService.can(db, user_id, company_id, action: str, *, project_id=None, node_id=None) -> bool`
- Actions: `project.create_empty`, `project.assign_pm`, `tree.edit_any`, `tree.edit_subtree`, `member.pull`, `evidence.submit`, `evidence.read`, `progress.read`, `progress.write_formal`, `wiki.manual_write`, `review.confirm`, `audit.read`

- [ ] **Step 1: Unit tests**

```python
import pytest
from types import SimpleNamespace

@pytest.mark.asyncio
async def test_pm_can_edit_any_tree(acl_ctx):
    """acl_ctx: db + seed pm/member/outsider"""
    from app.services.acl import AclService
    acl = AclService()
    assert await acl.can(acl_ctx.db, acl_ctx.pm_id, acl_ctx.company_id, "tree.edit_any", project_id=acl_ctx.project_id)
    assert not await acl.can(acl_ctx.db, acl_ctx.member_id, acl_ctx.company_id, "tree.edit_any", project_id=acl_ctx.project_id)

@pytest.mark.asyncio
async def test_node_owner_edit_subtree_only_under_path(acl_ctx):
    from app.services.acl import AclService
    acl = AclService()
    # member primary on node path /1/2/
    ok = await acl.can(
        acl_ctx.db, acl_ctx.member_id, acl_ctx.company_id, "tree.edit_subtree",
        project_id=acl_ctx.project_id, node_id=acl_ctx.child_under_owned,
    )
    bad = await acl.can(
        acl_ctx.db, acl_ctx.member_id, acl_ctx.company_id, "tree.edit_subtree",
        project_id=acl_ctx.project_id, node_id=acl_ctx.sibling_not_owned,
    )
    assert ok and not bad

@pytest.mark.asyncio
async def test_left_member_cannot_submit_evidence(acl_ctx):
    from app.services.acl import AclService
    acl = AclService()
    assert not await acl.can(
        acl_ctx.db, acl_ctx.left_user_id, acl_ctx.company_id, "evidence.submit",
        project_id=acl_ctx.project_id, node_id=acl_ctx.node_id,
    )
```

- [ ] **Step 2: Implement AclService（核心逻辑）**

```python
# backend/app/services/acl.py — 关键算法
# 1) 查 company_memberships: status active + employment active（写类动作）
# 2) super_admin: company.policy U; project.assign_pm; audit 等
# 3) project_members where left_at is null:
#    role==pm → tree.edit_any, member.pull, review.confirm, evidence.read all
#    role==member → evidence.submit if member; progress.read
# 4) node_assignments: primary/collaborator on node or ancestor path prefix → tree.edit_subtree
# 5) path prefix: target.path.startswith(owned.path)
```

完整实现须覆盖附录 E 表；写类动作统一先查 employment。

- [ ] **Step 3: Tests pass; commit**

```bash
git commit -m "feat(acl): project path acl service"
```

---

### Task 4: ProjectService + Projects API

**Files:**
- Create: `backend/app/services/project_service.py`
- Create: `backend/app/schemas/project.py`
- Create: `backend/app/api/v1/projects.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/collab/test_projects_api.py`

**Interfaces:**
- `POST /api/v1/projects` body `{name, company_id}` → draft, pm null（Auth：`require_org_leader`，见 handoff §1；契约 §2.1）
- `POST /api/v1/projects/{id}/pm` `{user_id}`
- `POST /api/v1/projects/{id}/members` `{user_id, mode: "pull"}`
- `POST /api/v1/projects/{id}/invitations` `{user_id}`
- `POST /api/v1/projects/{id}/members/leave` 自己退出
- `POST /api/v1/projects/{id}/archive`

- [ ] **Step 1: API tests**

```python
@pytest.mark.asyncio
async def test_create_empty_project(async_client, org_leader_headers, company_id):
    r = await async_client.post(
        "/api/v1/projects",
        json={"name": "营销改版", "company_id": company_id},
        headers=org_leader_headers,
    )
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["status"] == "draft"
    assert data["pm_user_id"] is None

@pytest.mark.asyncio
async def test_assign_pm_and_pull_member(async_client, seed):
    r = await async_client.post(
        f"/api/v1/projects/{seed.project_id}/pm",
        json={"user_id": seed.pm_user_id},
        headers=seed.leader_headers,
    )
    assert r.json()["code"] == 200
    r2 = await async_client.post(
        f"/api/v1/projects/{seed.project_id}/members",
        json={"user_id": seed.member_user_id, "mode": "pull"},
        headers=seed.pm_headers,
    )
    assert r2.json()["code"] == 200

@pytest.mark.asyncio
async def test_non_member_forbidden(async_client, outsider_headers, project_id):
    r = await async_client.get(f"/api/v1/projects/{project_id}/tree", headers=outsider_headers)
    assert r.status_code == 403 or r.json()["code"] != 200
```

- [ ] **Step 2: Implement create**

```python
async def create_project(db, *, company_id, name, creator_user_id) -> Project:
    from app.services.entitlement import EntitlementService, QuotaExceeded
    # count projects, check_quota max_projects
    # require feature project_tree
    p = Project(company_id=company_id, name=name, status="draft", created_by=creator_user_id)
    db.add(p)
    await db.flush()
    # creator 不自动变 PM；OrgLeader 可非成员
    return p
```

指定 PM 时：确保 PM 有 company membership；upsert project_members role=pm；旧 PM 降为 member 或保留策略按产品：转让时旧 PM → member。

- [ ] **Step 3: pull member** — 要求双方 company membership active；`left_at` 清空或新建行  
- [ ] **Step 4: invite** — secrets.token_urlsafe(32)；status pending  
- [ ] **Step 5: Tests pass; commit**

```bash
git commit -m "feat(project): empty project pm members API"
```

---

### Task 5: TreeService path / move / cycle

**Files:**
- Create: `backend/app/services/tree_service.py`
- Test: `backend/tests/collab/test_tree_service.py`

**Interfaces:**
- `create_node(db, project, parent_id, node_type_key, title, ...) -> TreeNode`
- `move_node(db, node_id, new_parent_id, sort_order) -> TreeNode`
- `soft_delete_node(db, node_id)` — 不删进度账本
- path 规则：创建后 `path = parent.path + f"{id}/"`；根 `path = f"/{id}/"`

- [ ] **Step 1: Tests**

```python
@pytest.mark.asyncio
async def test_create_root_and_child_paths(db, project):
    from app.services.tree_service import TreeService
    svc = TreeService()
    root = await svc.create_node(db, project, parent_id=None, node_type_key="scope", title="根")
    assert root.path == f"/{root.id}/"
    child = await svc.create_node(db, project, parent_id=root.id, node_type_key="work_item", title="任务")
    assert child.path == f"/{root.id}/{child.id}/"
    assert child.depth == 1

@pytest.mark.asyncio
async def test_move_rejects_cycle(db, project):
    from app.services.tree_service import TreeService
    import pytest
    svc = TreeService()
    a = await svc.create_node(db, project, None, "scope", "A")
    b = await svc.create_node(db, project, a.id, "scope", "B")
    with pytest.raises(ValueError, match="环"):
        await svc.move_node(db, a.id, new_parent_id=b.id, sort_order=0)

@pytest.mark.asyncio
async def test_move_rewrites_descendant_paths(db, project):
    from app.services.tree_service import TreeService
    svc = TreeService()
    r = await svc.create_node(db, project, None, "scope", "R")
    a = await svc.create_node(db, project, r.id, "scope", "A")
    c = await svc.create_node(db, project, a.id, "work_item", "C")
    s = await svc.create_node(db, project, r.id, "scope", "S")
    await svc.move_node(db, a.id, new_parent_id=s.id, sort_order=0)
    await db.refresh(c)
    assert c.path.startswith(f"/{r.id}/{s.id}/{a.id}/")
```

- [ ] **Step 2: Implement path rewrite on move** — 批量 UPDATE 所有 `path LIKE old_path || '%'`  
- [ ] **Step 3: Commit**

```bash
git commit -m "feat(tree): path materialization and cycle-safe move"
```

---

### Task 6: Tree / Nodes API

**Files:**
- Create: `backend/app/schemas/tree.py`
- Create: `backend/app/api/v1/nodes.py`（或合并 projects.py）
- Modify: `backend/app/api/v1/projects.py` — tree routes
- Test: `backend/tests/collab/test_tree_api.py`

**Interfaces:**
- `GET /api/v1/projects/{id}/tree`
- `POST /api/v1/projects/{id}/nodes` 附录 F.2 body
- `PATCH /api/v1/nodes/{id}`
- `POST /api/v1/nodes/{id}/move` `{new_parent_id, sort_order}`
- `POST /api/v1/nodes/{id}/assignees` `{user_id, role_key}`

- [ ] **Step 1: API tests matching F.2**

```python
@pytest.mark.asyncio
async def test_create_work_item_with_assignee(async_client, seed):
    r = await async_client.post(
        f"/api/v1/projects/{seed.project_id}/nodes",
        json={
            "parent_id": seed.root_id,
            "node_type_key": "work_item",
            "title": "登录改版",
            "due_at": "2026-08-01T16:00:00+08:00",
            "allow_clear_text_progress": False,
            "assignees": [{"user_id": seed.member_user_id, "role_key": "primary"}],
        },
        headers=seed.pm_headers,
    )
    assert r.json()["code"] == 200
    assert r.json()["data"]["progress_json"]["status"] == "not_started"
```

- [ ] **Step 2: 每个写端点 `if not await acl.can(...): raise 403`**  
- [ ] **Step 3: GET tree 仅 project member**  
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(tree): project tree and nodes HTTP API"
```

---

### Task 7: 退出与归档

**Files:**
- Modify: `project_service.py`, `projects.py`
- Test: `test_projects_api.py` 追加

- [ ] **Step 1: leave sets left_at; subsequent tree edit 403**  
- [ ] **Step 2: archive sets status=archived, archived_at; write 403 unless super_admin 解档**  
- [ ] **Step 3: Commit**

```bash
git commit -m "feat(project): leave and archive with acl revoke"
```

---

### Task 8: Fixture 导出给脊梁计划

**Files:**
- Create/Modify: `backend/tests/conftest_collab.py` — `seed_company_project_node_member()`

```python
async def seed_company_project_node_member(db) -> dict:
    """返回 company_id, project_id, node_id, pm_user_id, member_user_id, headers..."""
```

- [ ] **Step 1: 被 evidence-progress-audit Task 0 引用**  
- [ ] **Step 2: 全量 pytest collab project/tree**  

Run: `cd backend; pytest tests/collab/test_project_models.py tests/collab/test_tree_models.py tests/collab/test_acl_service.py tests/collab/test_projects_api.py tests/collab/test_tree_service.py tests/collab/test_tree_api.py -v`  
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git commit -m "test(collab): shared project tree fixtures for evidence spine"
```

---

## Spec Coverage

| 需求 | Task |
|------|------|
| 空项目 | 4 |
| PM / 成员 / 邀请 / 退出 | 4, 7 |
| 一树 CRUD + path | 5, 6 |
| 节点类型 scope/work_item/milestone | 2, 6 |
| ACL 矩阵 | 3 |
| 指派 primary/collaborator | 2, 6 |
| 归档 | 7 |
| 供证据脊梁 fixture | 8 |

**Handoff:** `2026-07-19-evidence-progress-audit.md`
