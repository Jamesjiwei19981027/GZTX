"""终责轴向位置：服务端持久化 + 仅 PM/创建者可改。

历史缺陷：偏移量只存客户端本地（Web localStorage / APP SharedPreferences），
「仅项目 PM / created_by 可拖」这条产品规则也只在客户端判断——
换个客户端直接调接口即可改动所有人看到的布局，且 PM 拖完不跨端同步、换设备即丢。
"""
import pytest


def _code(resp):
    body = resp.json()
    return body.get("code") or (body.get("detail") or {}).get("code")


@pytest.mark.asyncio
async def test_default_is_zero_and_exposed_in_dto(async_client, seed_ids):
    r = await async_client.get(
        f"/api/v1/projects/{seed_ids['project_id']}", headers=seed_ids["pm_headers"]
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["final_owner_along_delta"] == 0


@pytest.mark.asyncio
async def test_pm_can_set_and_it_persists_across_clients(async_client, seed_ids):
    r = await async_client.put(
        f"/api/v1/projects/{seed_ids['project_id']}/final-owner-position",
        json={"along_delta": 320},
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["final_owner_along_delta"] == 320

    # 换一个成员（等价于换端/换设备）读到的是同一个值
    r2 = await async_client.get(
        f"/api/v1/projects/{seed_ids['project_id']}",
        headers=seed_ids["member_headers"],
    )
    assert r2.json()["data"]["final_owner_along_delta"] == 320


@pytest.mark.asyncio
async def test_plain_member_cannot_move_final_owner(async_client, seed_ids):
    r = await async_client.put(
        f"/api/v1/projects/{seed_ids['project_id']}/final-owner-position",
        json={"along_delta": 999},
        headers=seed_ids["member_headers"],
    )
    assert r.status_code == 403, r.text
    assert _code(r) == 40305

    # 确认没写进去
    r2 = await async_client.get(
        f"/api/v1/projects/{seed_ids['project_id']}", headers=seed_ids["pm_headers"]
    )
    assert r2.json()["data"]["final_owner_along_delta"] == 0


@pytest.mark.asyncio
async def test_creator_can_move_even_if_not_pm(async_client, seed_ids):
    """项目由 admin 创建、PM 是另一个人；created_by 同样有权"""
    r = await async_client.put(
        f"/api/v1/projects/{seed_ids['project_id']}/final-owner-position",
        json={"along_delta": 120},
        headers=seed_ids["super_admin_headers"],
    )
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_negative_delta_rejected(async_client, seed_ids):
    r = await async_client.put(
        f"/api/v1/projects/{seed_ids['project_id']}/final-owner-position",
        json={"along_delta": -5},
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 422, r.text
