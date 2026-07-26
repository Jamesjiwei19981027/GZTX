"""公司只读态下所有树写接口都必须被拦住。

历史缺陷：assert_company_write 只挂在 patch_node、材料上传/提交、wiki 创建上；
create_node / move_node / delete_node / put_assignees / assign_pm / pull_member
全部漏配 —— 公司进入只读或 License 过期后，仍能通过这些接口增/移/删节点、改指派，
与「readonly 禁止写入」的契约自相矛盾。
"""
import pytest


@pytest.fixture
async def readonly_company(db_session, seed_ids):
    from app.models.company import Company

    company = await db_session.get(Company, seed_ids["company_id"])
    company.status = "readonly"
    await db_session.commit()
    return company


def _is_write_blocked(resp) -> bool:
    """只读拦截返回 403 + 40310/40311/40312"""
    if resp.status_code != 403:
        return False
    body = resp.json()
    code = body.get("code") or (body.get("detail") or {}).get("code")
    return code in (40310, 40311, 40312)


@pytest.mark.asyncio
async def test_create_node_blocked_when_readonly(
    async_client, seed_ids, readonly_company
):
    r = await async_client.post(
        f"/api/v1/projects/{seed_ids['project_id']}/nodes",
        headers=seed_ids["pm_headers"],
        json={"parent_id": seed_ids["root_node_id"], "node_type_key": "work_item", "title": "新增"},
    )
    assert _is_write_blocked(r), r.text


@pytest.mark.asyncio
async def test_move_node_blocked_when_readonly(
    async_client, seed_ids, readonly_company
):
    r = await async_client.post(
        f"/api/v1/nodes/{seed_ids['node_id']}/move",
        headers=seed_ids["pm_headers"],
        json={"new_parent_id": seed_ids["root_node_id"], "sort_order": 1},
    )
    assert _is_write_blocked(r), r.text


@pytest.mark.asyncio
async def test_delete_node_blocked_when_readonly(
    async_client, seed_ids, readonly_company
):
    r = await async_client.delete(
        f"/api/v1/nodes/{seed_ids['node_id']}", headers=seed_ids["pm_headers"]
    )
    assert _is_write_blocked(r), r.text


@pytest.mark.asyncio
async def test_put_assignees_blocked_when_readonly(
    async_client, seed_ids, readonly_company
):
    r = await async_client.put(
        f"/api/v1/nodes/{seed_ids['node_id']}/assignees",
        headers=seed_ids["pm_headers"],
        json={"assignees": [{"user_id": seed_ids["member_user_id"], "role_key": "primary"}]},
    )
    assert _is_write_blocked(r), r.text


@pytest.mark.asyncio
async def test_assign_pm_blocked_when_readonly(
    async_client, seed_ids, readonly_company
):
    r = await async_client.post(
        f"/api/v1/projects/{seed_ids['project_id']}/pm",
        headers=seed_ids["pm_headers"],
        json={"user_id": seed_ids["member_user_id"]},
    )
    assert _is_write_blocked(r), r.text


@pytest.mark.asyncio
async def test_pull_member_blocked_when_readonly(
    async_client, seed_ids, readonly_company
):
    r = await async_client.post(
        f"/api/v1/projects/{seed_ids['project_id']}/members",
        headers=seed_ids["pm_headers"],
        json={"user_id": seed_ids["outsider_user_id"]},
    )
    assert _is_write_blocked(r), r.text


@pytest.mark.asyncio
async def test_reads_still_work_when_readonly(
    async_client, seed_ids, readonly_company
):
    """只读是禁写不禁读：树仍要能看"""
    r = await async_client.get(
        f"/api/v1/projects/{seed_ids['project_id']}/tree",
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_writes_work_when_company_active(async_client, seed_ids):
    """反向确认：正常公司态下这些接口本来就该通，闸门不能误伤"""
    r = await async_client.post(
        f"/api/v1/projects/{seed_ids['project_id']}/nodes",
        headers=seed_ids["pm_headers"],
        json={"parent_id": seed_ids["root_node_id"], "node_type_key": "work_item", "title": "正常新增"},
    )
    assert r.status_code == 200, r.text
