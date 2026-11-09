"""D-4 / A-11：通知偏好与界面偏好共用 notify_pref，连续/并发写入不得互相覆盖。"""
import asyncio

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_toggles_and_ui_prefs_do_not_overwrite_each_other(client: AsyncClient, auth_headers):
    h = auth_headers
    r = await client.put("/api/v1/users/me", headers=h, json={"notify_pref": {"channels": {"email": {"enabled": False}}}})
    assert r.status_code == 200, r.text
    r = await client.put("/api/v1/users/me/ui-prefs", headers=h, json={"theme_mode": "dark", "accent": "teal"})
    assert r.status_code == 200, r.text
    r = await client.put("/api/v1/users/me", headers=h, json={"notify_pref": {"channels": {"push": {"enabled": False}}, "weekend_mute": True}})
    assert r.status_code == 200, r.text
    r = await client.put("/api/v1/users/me", headers=h, json={"notify_pref": {"quiet_hours": {"start": "22:00", "end": "07:00"}}})
    assert r.status_code == 200, r.text

    me = (await client.get("/api/v1/users/me", headers=h)).json()["data"]["notify_pref"]
    assert me["channels"]["email"]["enabled"] is False
    assert me["channels"]["push"]["enabled"] is False
    assert me["weekend_mute"] is True
    assert me["quiet_hours"] == {"start": "22:00", "end": "07:00"}
    ui = (await client.get("/api/v1/users/me/ui-prefs", headers=h)).json()["data"]["ui"]
    assert ui["theme_mode"] == "dark" and ui["accent"] == "teal"


@pytest.mark.asyncio
async def test_concurrent_writes_keep_both_sides(client: AsyncClient, auth_headers):
    h = auth_headers
    await asyncio.gather(
        client.put("/api/v1/users/me", headers=h, json={"notify_pref": {"channels": {"wechat": {"enabled": False}}}}),
        client.put("/api/v1/users/me/ui-prefs", headers=h, json={"theme_mode": "dark"}),
    )
    me = (await client.get("/api/v1/users/me", headers=h)).json()["data"]["notify_pref"]
    ui = (await client.get("/api/v1/users/me/ui-prefs", headers=h)).json()["data"]["ui"]
    assert me["channels"]["wechat"]["enabled"] is False
    assert ui["theme_mode"] == "dark"
