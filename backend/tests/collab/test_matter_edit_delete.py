"""人轴事项（工作项 / 里程碑 / 范围）的改名、改日期、改负责人、删除与撤销"""
import pytest

API = "/api/v1"


@pytest.mark.asyncio
async def test_edit_matter_title_due_and_assignee(async_client, seed_ids):
    nid = seed_ids["node_id"]
    r = await async_client.patch(
        f"{API}/nodes/{nid}",
        json={
            "title": "工作项A（改名）",
            "due_at": "2026-12-31T23:59:59",
            "assignees": [{"user_id": seed_ids["pm_user_id"], "role_key": "primary"}],
        },
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["title"] == "工作项A（改名）"
    assert data["due_at"].startswith("2026-12-31")
    assert [a["user_id"] for a in data["assignees"]] == [seed_ids["pm_user_id"]]
    got = await async_client.get(f"{API}/nodes/{nid}", headers=seed_ids["member_headers"])
    assert got.json()["data"]["title"] == "工作项A（改名）"


@pytest.mark.asyncio
async def test_delete_matter_then_restore(async_client, seed_ids):
    nid = seed_ids["node_id"]
    pid = seed_ids["project_id"]
    # 负责该事项的成员本人可以删除（不需要走人员删除的预览确认）
    r = await async_client.delete(f"{API}/nodes/{nid}", headers=seed_ids["member_headers"])
    assert r.status_code == 200, r.text
    assert r.json()["data"]["is_deleted"] is True and r.json()["data"]["can_restore"] is True

    tree = await async_client.get(f"{API}/projects/{pid}/tree", headers=seed_ids["pm_headers"])
    ids = [n["id"] for n in tree.json()["data"]["items"]] if "items" in tree.json()["data"] else None
    if ids is not None:
        assert nid not in ids
    assert (await async_client.get(f"{API}/nodes/{nid}", headers=seed_ids["pm_headers"])).status_code == 404

    # 成员关系没有因为删除事项被收回
    members = await async_client.get(f"{API}/projects/{pid}/members", headers=seed_ids["pm_headers"])
    assert seed_ids["member_user_id"] in [
        m["user_id"] for m in members.json()["data"]["items"] if not m.get("left_at")
    ]

    # 外人不能撤销；负责人可以
    bad = await async_client.post(f"{API}/nodes/{nid}/restore", headers=seed_ids["outsider_headers"])
    assert bad.status_code == 403
    ok = await async_client.post(f"{API}/nodes/{nid}/restore", headers=seed_ids["pm_headers"])
    assert ok.status_code == 200, ok.text
    assert ok.json()["data"]["title"] == "工作项A"
    assert (await async_client.get(f"{API}/nodes/{nid}", headers=seed_ids["pm_headers"])).status_code == 200


@pytest.mark.asyncio
async def test_outsider_cannot_delete_matter_and_person_still_needs_preview(async_client, seed_ids):
    nid = seed_ids["node_id"]
    r = await async_client.delete(f"{API}/nodes/{nid}", headers=seed_ids["outsider_headers"])
    assert r.status_code == 403
    # 人员节点仍走原来的「预览 + 确认」，不受事项轻量删除影响
    r = await async_client.delete(
        f"{API}/nodes/{seed_ids['root_node_id']}", headers=seed_ids["member_headers"]
    )
    assert r.status_code in (403, 409, 422)


@pytest.mark.asyncio
async def test_move_matter_to_another_person(async_client, seed_ids):
    """拖拽改上级背后的接口：事项可以挪到另一位负责人名下"""
    pid = seed_ids["project_id"]
    created = await async_client.post(
        f"{API}/projects/{pid}/nodes",
        json={
            "parent_id": seed_ids["root_node_id"],
            "node_type_key": "person",
            "title": "下级甲",
            "node_origin": "project",
            "assignees": [{"user_id": seed_ids["admin_user_id"], "role_key": "primary"}],
        },
        headers=seed_ids["pm_headers"],
    )
    assert created.status_code == 200, created.text
    new_person = created.json()["data"]["id"]
    r = await async_client.post(
        f"{API}/nodes/{seed_ids['node_id']}/move",
        json={"new_parent_id": new_person, "sort_order": 0},
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["parent_id"] == new_person
