import pytest

from tests.collab.conftest import make_dev_license


@pytest.mark.asyncio
async def test_list_my_companies(async_client, seed_ids):
    r = await async_client.get(
        "/api/v1/companies/mine",
        headers=seed_ids["member_headers"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["code"] == 200
    items = body["data"]["items"]
    assert len(items) >= 1
    assert any(c["id"] == seed_ids["company_id"] for c in items)


@pytest.mark.asyncio
async def test_create_company_and_license(async_client, db_session, monkeypatch):
    """空库首次 bootstrap：single_company 允许创建第一家公司。"""
    from app.core.config import settings

    monkeypatch.setattr(settings, "DEPLOY_MODE", "single_company")
    # 本测试使用独立用户；seed 不注入，但 collab async_client 可能已有 seed 表。
    # 若库中已有公司则应 403——此处用无 seed 的纯客户端路径见 bootstrap 测试。
    # 为保持兼容：仅在公司数为 0 时断言 create 成功。
    from sqlalchemy import func, select
    from app.models.company import Company

    n = (await db_session.execute(select(func.count()).select_from(Company))).scalar() or 0
    if int(n) > 0:
        pytest.skip("db already has company; covered by test_single_company_blocks_second_company_api")

    from app.core.security import create_access_token, get_password_hash
    from app.models.user import User

    from datetime import datetime as _dt

    # 协作写路径要求邮箱+手机双验证（阶段 5 的验证门禁分级）
    u = User(
        username="cadmin",
        email="cadmin@ex.com",
        password_hash=get_password_hash("x"),
        nickname="cadmin",
        email_verified_at=_dt.utcnow(),
        phone_verified_at=_dt.utcnow(),
    )
    db_session.add(u)
    await db_session.commit()
    headers = {"Authorization": f"Bearer {create_access_token(data={'sub': u.id})}"}

    r = await async_client.post(
        "/api/v1/companies",
        json={"name": "新公司", "slug": "newco", "policy_preset": "standard"},
        headers=headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["code"] == 200
    company_id = body["data"]["id"]
    assert body["data"]["status"] == "pending_license"

    raw, sig = make_dev_license("newco")
    r2 = await async_client.post(
        f"/api/v1/companies/{company_id}/license",
        json={"license_payload": raw, "signature": sig},
        headers=headers,
    )
    assert r2.status_code == 200
    assert r2.json()["code"] == 200
    assert r2.json()["data"]["status"] == "active"

    r3 = await async_client.get(
        f"/api/v1/companies/{company_id}/features", headers=headers
    )
    assert r3.json()["code"] == 200
    assert r3.json()["data"]["unlocked"] is True
    assert r3.json()["data"]["features"]["project_tree"] is True


@pytest.mark.asyncio
async def test_feature_gate_blocks_without_unlock(async_client, db_session):
    from app.core.security import create_access_token, get_password_hash
    from app.models.user import User
    from app.services.company_bootstrap import bootstrap_single_company

    from datetime import datetime as _dt

    u = User(
        username="penduser",
        email="pend@ex.com",
        password_hash=get_password_hash("x"),
        nickname="p",
        email_verified_at=_dt.utcnow(),
        phone_verified_at=_dt.utcnow(),
    )
    db_session.add(u)
    await db_session.flush()
    c = await bootstrap_single_company(
        db_session, name="挂起", slug="pendco", admin_user_id=u.id, activate=False
    )
    await db_session.commit()
    headers = {"Authorization": f"Bearer {create_access_token(data={'sub': u.id})}"}

    r = await async_client.post(
        "/api/v1/projects",
        json={"name": "不可建", "company_id": c.id},
        headers=headers,
    )
    assert r.status_code == 403
    assert r.json()["code"] == 40310
