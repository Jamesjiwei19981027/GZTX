import pytest


@pytest.mark.asyncio
async def test_bootstrap_creates_super_admin(db_session):
    from app.core.security import get_password_hash
    from app.models.company import CompanyMembership
    from app.models.user import User
    from app.services.company_bootstrap import bootstrap_single_company
    from sqlalchemy import select

    u = User(
        username="boot",
        email="boot@ex.com",
        password_hash=get_password_hash("x"),
        nickname="boot",
    )
    db_session.add(u)
    await db_session.flush()
    c = await bootstrap_single_company(
        db_session, name="默认公司", slug="default-boot", admin_user_id=u.id
    )
    assert c.status in ("active", "pending_license")
    m = (
        await db_session.execute(
            select(CompanyMembership).where(
                CompanyMembership.company_id == c.id,
                CompanyMembership.user_id == u.id,
            )
        )
    ).scalar_one()
    assert m.is_super_admin is True
    assert m.is_org_leader is True
