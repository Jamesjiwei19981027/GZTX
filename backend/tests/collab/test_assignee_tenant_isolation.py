"""节点指派的租户边界。

历史缺陷：set_assignees / create_node 完全不校验被指派者归属，任意 user_id
都能写进 node_assignments，而 list_assignees 会 join users 回读昵称与头像
—— 等于给了一个按 id 遍历全系统用户身份信息的接口。
"""
import pytest


def _code(resp):
    body = resp.json()
    return body.get("code") or (body.get("detail") or {}).get("code")


@pytest.mark.asyncio
async def test_cannot_assign_outsider(async_client, seed_ids):
    """outsider 不是本公司成员，指派必须被拒"""
    r = await async_client.put(
        f"/api/v1/nodes/{seed_ids['node_id']}/assignees",
        json={
            "assignees": [
                {"user_id": seed_ids["outsider_user_id"], "role_key": "primary"}
            ]
        },
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 422, r.text
    assert "非本公司在职成员" in r.text


@pytest.mark.asyncio
async def test_cannot_assign_nonexistent_user(async_client, seed_ids):
    """不存在的 user_id 同样拒绝，堵住按 id 遍历探测"""
    r = await async_client.put(
        f"/api/v1/nodes/{seed_ids['node_id']}/assignees",
        json={"assignees": [{"user_id": 999999, "role_key": "primary"}]},
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 422, r.text


@pytest.mark.asyncio
async def test_can_assign_company_member(async_client, seed_ids):
    r = await async_client.put(
        f"/api/v1/nodes/{seed_ids['node_id']}/assignees",
        json={
            "assignees": [
                {"user_id": seed_ids["member_user_id"], "role_key": "primary"}
            ]
        },
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["assignees"][0]["user_id"] == seed_ids["member_user_id"]


@pytest.mark.asyncio
async def test_create_node_with_outsider_assignee_rejected(async_client, seed_ids):
    """建节点时带上跨租户指派同样要拦"""
    r = await async_client.post(
        f"/api/v1/projects/{seed_ids['project_id']}/nodes",
        json={
            "parent_id": seed_ids["root_node_id"],
            "node_type_key": "work_item",
            "title": "越权指派",
            "assignees": [
                {"user_id": seed_ids["outsider_user_id"], "role_key": "primary"}
            ],
        },
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 422, r.text
