"""人轴形态规则的服务端强制。

产品已锁定的规则：
- 主干只排 person；空白处只收人 → 根节点必须是「人」
- 每个项目只能有一个终责根节点
- 终责根节点必须是项目负责人
- 事项只能挂在人身上
- 人挂人 = 下级人员
- 人员最多四层（终责人 + 三层下属）
- 终责根节点下还有人员或任务，不能删除
"""
import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models.project import Project, ProjectMember
from app.models.tree import TreeNode
from app.services.tree_service import TreeService


def _code(resp):
    body = resp.json()
    return body.get("code") or (body.get("detail") or {}).get("code")


@pytest.mark.asyncio
@pytest.mark.parametrize("type_key", ["work_item", "milestone", "scope"])
async def test_root_must_be_person(async_client, seed_ids, type_key):
    """空白处只收人：事项不能当根"""
    r = await async_client.post(
        f"/api/v1/projects/{seed_ids['project_id']}/nodes",
        json={"parent_id": None, "node_type_key": type_key, "title": "非法根"},
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 422, r.text
    assert "主干只能排人" in r.text


@pytest.mark.asyncio
async def test_matter_cannot_hang_under_matter(async_client, seed_ids):
    """事项只能落到人身上：node_id 是挂在 person 下的 work_item，不能再往它下面挂"""
    r = await async_client.post(
        f"/api/v1/projects/{seed_ids['project_id']}/nodes",
        json={
            "parent_id": seed_ids["node_id"],
            "node_type_key": "work_item",
            "title": "挂到工作项下",
        },
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 422, r.text
    assert "只能挂在" in r.text


@pytest.mark.asyncio
async def test_person_under_person_is_subordinate(async_client, seed_ids):
    r = await async_client.post(
        f"/api/v1/projects/{seed_ids['project_id']}/nodes",
        json={
            "parent_id": seed_ids["root_node_id"],
            "node_type_key": "person",
            "title": "下级",
        },
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_move_matter_under_matter_rejected(async_client, seed_ids):
    """把事项移到另一个事项下同样要拦"""
    other = await async_client.post(
        f"/api/v1/projects/{seed_ids['project_id']}/nodes",
        json={
            "parent_id": seed_ids["root_node_id"],
            "node_type_key": "milestone",
            "title": "里程碑B",
        },
        headers=seed_ids["pm_headers"],
    )
    other_id = other.json()["data"]["id"]

    r = await async_client.post(
        f"/api/v1/nodes/{seed_ids['node_id']}/move",
        json={"new_parent_id": other_id, "sort_order": 0},
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 422, r.text
    assert "只能挂在" in r.text


@pytest.mark.asyncio
async def test_move_matter_to_root_rejected(async_client, seed_ids):
    r = await async_client.post(
        f"/api/v1/nodes/{seed_ids['node_id']}/move",
        json={"new_parent_id": None, "sort_order": 0},
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 422, r.text
    assert "主干只能排人" in r.text


@pytest.mark.asyncio
async def test_patch_cannot_turn_populated_person_into_matter(async_client, seed_ids):
    """属性面板类型下拉是绕过拖拽规则的另一条路：

    把主干上带子节点的 person 改成 work_item，其名下事项会从人轴画布消失。
    """
    r = await async_client.patch(
        f"/api/v1/nodes/{seed_ids['root_node_id']}",
        json={"node_type_key": "work_item"},
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 422, r.text
    assert ("主干只能排人" in r.text) or ("失去挂载点" in r.text)


@pytest.mark.asyncio
async def test_patch_matter_type_swap_still_allowed(async_client, seed_ids):
    """人下面的事项在事项类型之间互换是合法的（work_item ↔ milestone）"""
    r = await async_client.patch(
        f"/api/v1/nodes/{seed_ids['node_id']}",
        json={"node_type_key": "milestone"},
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["node_type_key"] == "milestone"


@pytest.mark.asyncio
async def test_patch_same_type_is_noop_and_keeps_progress(
    async_client, seed_ids, db_session
):
    """把类型"改"成原值不应触发进度重置——否则前端一次无谓的 PATCH 就清空进度"""
    node = await db_session.get(TreeNode, seed_ids["node_id"])
    node.progress_json = {"template": "work_item", "percent": 42}
    await db_session.commit()

    r = await async_client.patch(
        f"/api/v1/nodes/{seed_ids['node_id']}",
        json={"node_type_key": "work_item", "title": "改个标题"},
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 200, r.text

    await db_session.refresh(node)
    assert node.progress_json.get("percent") == 42, "同类型 PATCH 不应重置进度"


async def _import_token(async_client, db_session, seed_ids, parent_node_id):
    """建一条个人任务并走 import/preview 拿 confirm_token"""
    from app.models.category import Category
    from app.models.task import Task

    cat = Category(
        user_id=seed_ids["pm_user_id"], name="默认", color="#409EFF", is_default=True
    )
    db_session.add(cat)
    await db_session.flush()
    task = Task(
        user_id=seed_ids["pm_user_id"], category_id=cat.id, title="待导入任务"
    )
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)

    r = await async_client.post(
        f"/api/v1/projects/{seed_ids['project_id']}/import/preview",
        json={"task_ids": [task.id], "parent_node_id": parent_node_id},
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 200, r.text
    return r.json()["data"]["confirm_token"]


@pytest.mark.asyncio
async def test_import_without_person_parent_rejected(
    async_client, db_session, seed_ids
):
    """导入的任务建成 work_item，不指定挂载的人就会造出 work_item 根节点"""
    token = await _import_token(async_client, db_session, seed_ids, None)
    r = await async_client.post(
        f"/api/v1/projects/{seed_ids['project_id']}/import/confirm",
        json={"confirm_token": token},
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 422, r.text
    assert "人" in r.text


@pytest.mark.asyncio
async def test_import_under_person_works(async_client, db_session, seed_ids):
    token = await _import_token(
        async_client, db_session, seed_ids, seed_ids["root_node_id"]
    )
    r = await async_client.post(
        f"/api/v1/projects/{seed_ids['project_id']}/import/confirm",
        json={"confirm_token": token},
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 200, r.text
    assert len(r.json()["data"]["imported"]) == 1


@pytest.mark.asyncio
async def test_import_under_matter_rejected_not_500(
    async_client, db_session, seed_ids
):
    """挂到事项下要返回 422，而不是让 TreeShapeError 冒泡成 500"""
    token = await _import_token(
        async_client, db_session, seed_ids, seed_ids["node_id"]
    )
    r = await async_client.post(
        f"/api/v1/projects/{seed_ids['project_id']}/import/confirm",
        json={"confirm_token": token},
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 422, r.text
    assert "只能挂在" in r.text


# ---------------------------------------------------------------------------
# B1 任务单新增规则测试
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cannot_create_second_root(async_client, seed_ids):
    """1. 已有根时再建根被拒"""
    pid = seed_ids["project_id"]
    r = await async_client.post(
        f"/api/v1/projects/{pid}/nodes",
        json={"parent_id": None, "node_type_key": "person", "title": "第二个根", "assignees": [{"user_id": seed_ids["pm_user_id"]}]},
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 422, r.text
    assert "每个项目只能有一个终责根节点" in r.text


@pytest.mark.asyncio
async def test_root_owner_rule_with_pm(async_client, seed_ids, db_session):
    """2. pm 不为空时根的 primary 不是 pm 被拒、是 pm 通过"""
    p = Project(
        company_id=seed_ids["company_id"],
        name="PM规则测试项目",
        pm_user_id=seed_ids["pm_user_id"],
        created_by=seed_ids["admin_user_id"],
    )
    db_session.add(p)
    await db_session.flush()
    db_session.add_all([
        ProjectMember(project_id=p.id, user_id=seed_ids["pm_user_id"], role="pm"),
        ProjectMember(project_id=p.id, user_id=seed_ids["member_user_id"], role="member"),
    ])
    await db_session.commit()

    # primary 不是 pm → 被拒
    denied = await async_client.post(
        f"/api/v1/projects/{p.id}/nodes",
        json={"parent_id": None, "node_type_key": "person", "title": "非PM根", "assignees": [{"user_id": seed_ids["member_user_id"], "role_key": "primary"}]},
        headers=seed_ids["pm_headers"],
    )
    assert denied.status_code == 422, denied.text
    assert "终责根节点必须是项目负责人" in denied.text

    # primary 是 pm → 通过
    allowed = await async_client.post(
        f"/api/v1/projects/{p.id}/nodes",
        json={"parent_id": None, "node_type_key": "person", "title": "PM终责根", "assignees": [{"user_id": seed_ids["pm_user_id"], "role_key": "primary"}]},
        headers=seed_ids["pm_headers"],
    )
    assert allowed.status_code == 200, allowed.text


@pytest.mark.asyncio
async def test_root_owner_rule_without_pm(async_client, seed_ids, db_session):
    """3. pm 为空时任意人可当根"""
    p = Project(
        company_id=seed_ids["company_id"],
        name="无PM项目",
        pm_user_id=None,
        created_by=seed_ids["admin_user_id"],
    )
    db_session.add(p)
    await db_session.flush()
    db_session.add(ProjectMember(project_id=p.id, user_id=seed_ids["member_user_id"], role="member"))
    await db_session.commit()

    # 任意在职成员皆可建根
    r = await TreeService().create_node(
        db_session,
        p,
        parent_id=None,
        node_type_key="person",
        title="任意根",
        assignees=[{"user_id": seed_ids["member_user_id"], "role_key": "primary"}],
    )
    assert r.id is not None
    assert r.parent_id is None


@pytest.mark.asyncio
async def test_move_non_root_to_root_rejected(async_client, seed_ids):
    """4. 把非根移到根位置被拒"""
    # 先在已有根下建一个人员
    child = await async_client.post(
        f"/api/v1/projects/{seed_ids['project_id']}/nodes",
        json={"parent_id": seed_ids["root_node_id"], "node_type_key": "person", "title": "下属"},
        headers=seed_ids["pm_headers"],
    )
    assert child.status_code == 200, child.text
    child_id = child.json()["data"]["id"]

    # 试图把 child 移到根（new_parent_id=None），因为已有 root_node_id，被单根规则拒绝
    r = await async_client.post(
        f"/api/v1/nodes/{child_id}/move",
        json={"new_parent_id": None, "sort_order": 0},
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 422, r.text
    assert "每个项目只能有一个终责根节点" in r.text


@pytest.mark.asyncio
async def test_move_root_under_another_rejected(async_client, seed_ids):
    """5. 把根挂到别人下面被拒"""
    child = await async_client.post(
        f"/api/v1/projects/{seed_ids['project_id']}/nodes",
        json={"parent_id": seed_ids["root_node_id"], "node_type_key": "person", "title": "下属"},
        headers=seed_ids["pm_headers"],
    )
    assert child.status_code == 200, child.text
    child_id = child.json()["data"]["id"]

    # 试图把终责根移到 child 下面
    r = await async_client.post(
        f"/api/v1/nodes/{seed_ids['root_node_id']}/move",
        json={"new_parent_id": child_id, "sort_order": 0},
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 422, r.text
    assert "终责根节点不能挂到别人下面" in r.text


@pytest.mark.asyncio
async def test_person_limit_four_levels(async_client, seed_ids):
    """6. 四层人员通过、五层被拒（根算第 1 层）"""
    pid = seed_ids["project_id"]
    root = seed_ids["root_node_id"]
    # 第 2 层
    l2 = await async_client.post(
        f"/api/v1/projects/{pid}/nodes",
        json={"parent_id": root, "node_type_key": "person", "title": "第二层"},
        headers=seed_ids["pm_headers"],
    )
    assert l2.status_code == 200, l2.text
    l2_id = l2.json()["data"]["id"]

    # 第 3 层
    l3 = await async_client.post(
        f"/api/v1/projects/{pid}/nodes",
        json={"parent_id": l2_id, "node_type_key": "person", "title": "第三层"},
        headers=seed_ids["pm_headers"],
    )
    assert l3.status_code == 200, l3.text
    l3_id = l3.json()["data"]["id"]

    # 第 4 层：允许
    l4 = await async_client.post(
        f"/api/v1/projects/{pid}/nodes",
        json={"parent_id": l3_id, "node_type_key": "person", "title": "第四层"},
        headers=seed_ids["pm_headers"],
    )
    assert l4.status_code == 200, l4.text
    l4_id = l4.json()["data"]["id"]

    # 第 5 层：被拒
    l5 = await async_client.post(
        f"/api/v1/projects/{pid}/nodes",
        json={"parent_id": l4_id, "node_type_key": "person", "title": "第五层"},
        headers=seed_ids["pm_headers"],
    )
    assert l5.status_code == 422, l5.text
    assert "人员最多四层" in l5.text


@pytest.mark.asyncio
async def test_delete_root_with_children_rejected(async_client, seed_ids):
    """7. 根有子节点时删除被拒，无子节点时允许"""
    root = seed_ids["root_node_id"]
    # 根节点下有工作项 node_id，删除必被拒
    preview = (await async_client.get(f"/api/v1/nodes/{root}/deletion-preview", headers=seed_ids["pm_headers"])).json()["data"]
    r = await async_client.delete(
        f"/api/v1/nodes/{root}?cascade=true&preview_token={preview['preview_token']}",
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 422, r.text
    assert "终责根节点下还有人员或任务，不能删除" in r.text

    # 先删除根下面的子节点 node_id
    del_child = await async_client.delete(f"/api/v1/nodes/{seed_ids['node_id']}", headers=seed_ids["pm_headers"])
    assert del_child.status_code == 200, del_child.text

    # 没有子节点时允许删除根节点
    preview2 = (await async_client.get(f"/api/v1/nodes/{root}/deletion-preview", headers=seed_ids["pm_headers"])).json()["data"]
    del_root = await async_client.delete(
        f"/api/v1/nodes/{root}?preview_token={preview2['preview_token']}",
        headers=seed_ids["pm_headers"],
    )
    assert del_root.status_code == 200, del_root.text


@pytest.mark.asyncio
async def test_all_single_root_rules_bypassed_when_disabled(
    async_client, seed_ids, monkeypatch, db_session
):
    """8. ENFORCE_WORK_TREE_SHAPE=false 时以上全部放行"""
    monkeypatch.setattr(settings, "ENFORCE_WORK_TREE_SHAPE", False)
    pid = seed_ids["project_id"]
    root = seed_ids["root_node_id"]

    # 1. 允许建第二个根
    r_root2 = await async_client.post(
        f"/api/v1/projects/{pid}/nodes",
        json={"parent_id": None, "node_type_key": "person", "title": "第二根（放行）"},
        headers=seed_ids["pm_headers"],
    )
    assert r_root2.status_code == 200, r_root2.text
    root2_id = r_root2.json()["data"]["id"]

    # 2. PM不为空时根非PM也放行
    r_non_pm = await async_client.post(
        f"/api/v1/projects/{pid}/nodes",
        json={"parent_id": None, "node_type_key": "person", "title": "非PM根（放行）", "assignees": [{"user_id": seed_ids["member_user_id"]}]},
        headers=seed_ids["pm_headers"],
    )
    assert r_non_pm.status_code == 200, r_non_pm.text

    # 3. 把根挂到别人下面放行
    r_move = await async_client.post(
        f"/api/v1/nodes/{root2_id}/move",
        json={"new_parent_id": root, "sort_order": 0},
        headers=seed_ids["pm_headers"],
    )
    assert r_move.status_code == 200, r_move.text

    # 4. 把非根移到根放行
    r_to_root = await async_client.post(
        f"/api/v1/nodes/{root2_id}/move",
        json={"new_parent_id": None, "sort_order": 0},
        headers=seed_ids["pm_headers"],
    )
    assert r_to_root.status_code == 200, r_to_root.text

    # 5. 根下有子节点时删除放行
    preview = (await async_client.get(f"/api/v1/nodes/{root}/deletion-preview", headers=seed_ids["pm_headers"])).json()["data"]
    del_r = await async_client.delete(
        f"/api/v1/nodes/{root}?cascade=true&preview_token={preview['preview_token']}",
        headers=seed_ids["pm_headers"],
    )
    assert del_r.status_code == 200, del_r.text
