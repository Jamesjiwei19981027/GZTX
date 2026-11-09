"""项目管理：改名、换负责人、归档 / 取消归档（归档后只读）"""
import pytest

API = "/api/v1"


@pytest.mark.asyncio
async def test_patch_project_rename_and_change_pm(async_client, seed_ids):
    pid = seed_ids["project_id"]
    r = await async_client.patch(
        f"{API}/projects/{pid}", json={"name": "  新名称  "}, headers=seed_ids["pm_headers"]
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["name"] == "新名称"
    r = await async_client.get(f"{API}/projects/{pid}", headers=seed_ids["pm_headers"])
    assert r.json()["data"]["name"] == "新名称"

    # 换负责人：member 成为 PM
    r = await async_client.patch(
        f"{API}/projects/{pid}",
        json={"pm_user_id": seed_ids["member_user_id"]},
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["pm_user_id"] == seed_ids["member_user_id"]
    assert r.json()["data"]["final_owner"]["user_id"] == seed_ids["member_user_id"]
    # 原 PM 不再能改名
    r = await async_client.patch(
        f"{API}/projects/{pid}", json={"name": "偷改"}, headers=seed_ids["pm_headers"]
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_patch_project_rejects_empty_name_and_outsider_pm(async_client, seed_ids):
    pid = seed_ids["project_id"]
    r = await async_client.patch(
        f"{API}/projects/{pid}", json={"name": "   "}, headers=seed_ids["pm_headers"]
    )
    assert r.status_code == 422
    r = await async_client.patch(
        f"{API}/projects/{pid}",
        json={"pm_user_id": seed_ids["outsider_user_id"]},
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 422
    r = await async_client.patch(
        f"{API}/projects/{pid}", json={"name": "x"}, headers=seed_ids["member_headers"]
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_archive_is_readonly_and_unarchive_restores(async_client, seed_ids):
    pid = seed_ids["project_id"]
    r = await async_client.post(f"{API}/projects/{pid}/archive", headers=seed_ids["pm_headers"])
    assert r.status_code == 200 and r.json()["data"]["status"] == "archived"

    # 归档后：改名、改节点都被拒；超管也一样
    r = await async_client.patch(
        f"{API}/projects/{pid}", json={"name": "归档后改"}, headers=seed_ids["pm_headers"]
    )
    assert r.status_code == 409
    for headers in (seed_ids["pm_headers"], seed_ids["super_admin_headers"]):
        r = await async_client.patch(
            f"{API}/nodes/{seed_ids['node_id']}", json={"title": "归档后改"}, headers=headers
        )
        assert r.status_code == 403, r.text

    # 非负责人不能取消归档
    r = await async_client.post(
        f"{API}/projects/{pid}/unarchive", headers=seed_ids["member_headers"]
    )
    assert r.status_code == 403
    r = await async_client.post(f"{API}/projects/{pid}/unarchive", headers=seed_ids["pm_headers"])
    assert r.status_code == 200 and r.json()["data"]["status"] == "active"
    r = await async_client.get(f"{API}/projects/{pid}", headers=seed_ids["pm_headers"])
    assert r.json()["data"]["status"] == "active"
    assert r.json()["data"]["archived_at"] is None
    r = await async_client.patch(
        f"{API}/nodes/{seed_ids['node_id']}", json={"title": "恢复后可改"}, headers=seed_ids["pm_headers"]
    )
    assert r.status_code == 200, r.text
