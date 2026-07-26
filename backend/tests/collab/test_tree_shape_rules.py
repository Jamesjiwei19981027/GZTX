"""人轴形态规则的服务端强制。

产品已锁定的规则：
- 主干只排 person；空白处只收人 → 根节点必须是「人」
- 工作项 / 里程碑 / 范围只能挂在人身上
- 人挂人 = 下级人员

历史缺陷：这些只在 Web 的 dropRules.ts 与 APP 画布里拦，后端 create/move/patch
零校验。任何项目成员直接调 API 就能造出 work_item 当根、person 挂在 milestone 下
的树；三端共用同一份数据，人轴布局的前提被打破——不挂在人下面的事项会直接从
画布上消失（layout 只收集 person 的直接子事项）。
"""
import pytest

from app.core.config import settings


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
async def test_person_root_allowed(async_client, seed_ids):
    r = await async_client.post(
        f"/api/v1/projects/{seed_ids['project_id']}/nodes",
        json={"parent_id": None, "node_type_key": "person", "title": "另一位负责人"},
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 200, r.text


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
    # 根 + 有子节点，两条都踩：报哪条都算拦住了
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
    from app.models.tree import TreeNode

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


@pytest.mark.asyncio
async def test_enforcement_can_be_disabled_for_legacy_data(
    async_client, seed_ids, monkeypatch
):
    """存量非人轴数据的过渡开关"""
    monkeypatch.setattr(settings, "ENFORCE_WORK_TREE_SHAPE", False)
    r = await async_client.post(
        f"/api/v1/projects/{seed_ids['project_id']}/nodes",
        json={"parent_id": None, "node_type_key": "scope", "title": "遗留根范围"},
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 200, r.text
