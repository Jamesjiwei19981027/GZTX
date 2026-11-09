"""注册双验证与补验接口测试"""
import pytest
from httpx import AsyncClient

from app.core.config import settings


@pytest.mark.asyncio
async def test_send_code_invalid_phone(client: AsyncClient):
    r = await client.post(
        "/api/v1/auth/send-code", json={"channel": "sms", "target": "12345"}
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_send_code_resend_throttle(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "DEBUG", True)
    r1 = await client.post(
        "/api/v1/auth/send-code", json={"channel": "sms", "target": "13911110001"}
    )
    assert r1.status_code == 200
    r2 = await client.post(
        "/api/v1/auth/send-code", json={"channel": "sms", "target": "13911110001"}
    )
    assert r2.status_code == 429


@pytest.mark.asyncio
async def test_send_code_invalid_email_rejected_like_register(client: AsyncClient):
    """回归：send-code 与 register 的邮箱校验口径必须一致。

    历史 bug：send-code 只查 "@"，user@test.local 能拿到验证码，
    但 register 的 EmailStr（email-validator）会拒绝保留域名，注册时才失败。
    """
    invalid_emails = [
        "user@test.local",  # 保留/特殊用途域名
        "user@invalid",  # 无 TLD
        "not-an-email",  # 无 @
        "a b@example.com",  # 含空格
    ]
    for email in invalid_emails:
        r = await client.post(
            "/api/v1/auth/send-code",
            json={"channel": "email", "target": email},
        )
        assert r.status_code == 422, f"send-code 应拒绝 {email!r}: {r.text}"

        r = await client.post(
            "/api/v1/auth/register",
            json={
                "username": f"u_{abs(hash(email)) % 10**8}",
                "password": "password123",
                "email": email,
                "email_code": "000000",
            },
        )
        assert r.status_code == 422, f"register 应拒绝 {email!r}: {r.text}"


@pytest.mark.asyncio
async def test_send_code_valid_email_still_accepted(client: AsyncClient, monkeypatch):
    """收紧校验后，正常邮箱的 send-code 不受影响（DEBUG 下仍回显 debug_code）"""
    monkeypatch.setattr(settings, "DEBUG", True)
    r = await client.post(
        "/api/v1/auth/send-code",
        json={"channel": "email", "target": "newuser@example.com"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"].get("debug_code")


@pytest.mark.asyncio
async def test_send_code_registered_email_rejected(client: AsyncClient, test_user):
    r = await client.post(
        "/api/v1/auth/send-code",
        json={"channel": "email", "target": "test@example.com"},
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_email_verified_user_can_create_personal_task(client: AsyncClient, db_session):
    """个人待办只要求邮箱验证，手机号门槛仅适用于协作写入。"""
    from datetime import datetime, timezone

    from app.core.security import create_access_token, get_password_hash
    from app.models.category import Category
    from app.models.user import User

    u = User(
        username="emailverified1",
        email="emailverified1@example.com",
        email_verified_at=datetime.now(timezone.utc),
        password_hash=get_password_hash("password123"),
        nickname="Email verified",
    )
    db_session.add(u)
    await db_session.flush()
    db_session.add(Category(user_id=u.id, name="默认", color="#409EFF", is_default=True, sort_order=0))
    await db_session.commit()
    await db_session.refresh(u)
    headers = {"Authorization": f"Bearer {create_access_token(data={'sub': u.id})}"}

    response = await client.post(
        "/api/v1/tasks", headers=headers, json={"title": "personal task"}
    )
    assert response.status_code == 201, response.text


@pytest.mark.asyncio
async def test_unverified_user_blocked_from_task_create(client: AsyncClient, db_session):
    """未完成邮箱验证的账号仍被个人任务写接口拒绝（40320）。"""
    from app.core.security import create_access_token, get_password_hash
    from app.models.user import User

    u = User(
        username="unverified1",
        email="unverified1@example.com",
        password_hash=get_password_hash("password123"),
        nickname="Unverified",
    )
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)

    headers = {"Authorization": f"Bearer {create_access_token(data={'sub': u.id})}"}
    r = await client.post(
        "/api/v1/tasks", headers=headers, json={"title": "should be blocked"}
    )
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == 40320

    # 读接口不受限
    r2 = await client.get("/api/v1/tasks", headers=headers)
    assert r2.status_code == 200


@pytest.mark.asyncio
async def test_bind_flow_completes_verification(client: AsyncClient, db_session, monkeypatch):
    """登录后补验：send-code + confirm 后解除受限"""
    monkeypatch.setattr(settings, "DEBUG", True)
    from app.core.security import create_access_token, get_password_hash
    from app.models.user import User

    from app.models.category import Category

    u = User(
        username="unverified2",
        email="unverified2@example.com",
        password_hash=get_password_hash("password123"),
        nickname="Unverified2",
    )
    db_session.add(u)
    await db_session.flush()
    db_session.add(
        Category(user_id=u.id, name="默认", color="#409EFF", is_default=True, sort_order=0)
    )
    await db_session.commit()
    await db_session.refresh(u)
    headers = {"Authorization": f"Bearer {create_access_token(data={'sub': u.id})}"}

    # 状态查询
    st = await client.get("/api/v1/users/me/verification", headers=headers)
    assert st.status_code == 200
    assert st.json()["data"]["is_verified"] is False

    # 补验邮箱
    r = await client.post(
        "/api/v1/users/me/verification/send-code",
        headers=headers,
        json={"channel": "email", "target": "unverified2@example.com"},
    )
    assert r.status_code == 200, r.text
    code = r.json()["data"]["debug_code"]
    r = await client.post(
        "/api/v1/users/me/verification/confirm",
        headers=headers,
        json={"channel": "email", "target": "unverified2@example.com", "code": code},
    )
    assert r.status_code == 200
    assert r.json()["data"]["email_verified"] is True

    # 补验手机
    r = await client.post(
        "/api/v1/users/me/verification/send-code",
        headers=headers,
        json={"channel": "sms", "target": "13911110002"},
    )
    assert r.status_code == 200
    code = r.json()["data"]["debug_code"]
    r = await client.post(
        "/api/v1/users/me/verification/confirm",
        headers=headers,
        json={"channel": "sms", "target": "13911110002", "code": code},
    )
    assert r.status_code == 200
    assert r.json()["data"]["is_verified"] is True

    # 解除受限
    r = await client.post(
        "/api/v1/tasks", headers=headers, json={"title": "now allowed"}
    )
    assert r.status_code == 201


@pytest.mark.asyncio
async def test_email_register_allows_personal_task_before_phone_bind(client: AsyncClient, monkeypatch):
    """邮箱码注册后即可创建个人待办；手机号验证留给协作功能。"""
    monkeypatch.setattr(settings, "DEBUG", True)

    r = await client.post(
        "/api/v1/auth/send-code",
        json={"channel": "email", "target": "flowuser@example.com"},
    )
    email_code = r.json()["data"]["debug_code"]
    r = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "flowuser",
            "password": "password123",
            "email": "flowuser@example.com",
            "email_code": email_code,
        },
    )
    assert r.status_code in (200, 201), r.text
    token = r.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 邮箱已验证：个人任务不再被手机号门槛拦截
    allowed = await client.post(
        "/api/v1/tasks", headers=headers, json={"title": "personal task"}
    )
    assert allowed.status_code == 201

    # 绑手机依然会完整更新协作资格状态
    r = await client.post(
        "/api/v1/users/me/verification/send-code",
        headers=headers,
        json={"channel": "sms", "target": "13911110009"},
    )
    code = r.json()["data"]["debug_code"]
    r = await client.post(
        "/api/v1/users/me/verification/confirm",
        headers=headers,
        json={"channel": "sms", "target": "13911110009", "code": code},
    )
    assert r.status_code == 200
    assert r.json()["data"]["is_verified"] is True

    # 手机验证完成后依然可正常创建个人任务
    allowed = await client.post(
        "/api/v1/tasks", headers=headers, json={"title": "after phone bind"}
    )
    assert allowed.status_code == 201


@pytest.mark.asyncio
async def test_wrong_code_attempts_persist_across_rollback(
    client: AsyncClient, db_session, test_user, monkeypatch
):
    """回归：试错计数必须落库。

    consume_code 失败会抛 VerificationError → HTTPException，get_db 对冒泡异常
    整体 rollback；若计数在请求会话内自增就会被回滚掉，MAX_ATTEMPTS 永不触发，
    6 位验证码可被无限穷举。
    """
    from sqlalchemy import select

    from app.models.verification import VerificationCode
    from app.services.verification import MAX_ATTEMPTS

    monkeypatch.setattr(settings, "DEBUG", True)
    r = await client.post(
        "/api/v1/auth/send-code",
        json={"channel": "email", "target": "test@example.com", "purpose": "login"},
    )
    assert r.status_code == 200, r.text
    real_code = r.json()["data"]["debug_code"]

    async def _attempts() -> int:
        rec = (
            await db_session.execute(
                select(VerificationCode)
                .where(VerificationCode.target == "test@example.com")
                .order_by(VerificationCode.id.desc())
                .limit(1)
            )
        ).scalar_one()
        await db_session.refresh(rec)
        return rec.attempts

    wrong = "000000" if real_code != "000000" else "111111"
    for expected in range(1, MAX_ATTEMPTS + 1):
        r = await client.post(
            "/api/v1/auth/login-code",
            json={"channel": "email", "target": "test@example.com", "code": wrong},
        )
        assert r.status_code == 422, r.text
        assert await _attempts() == expected, f"第 {expected} 次试错未落库"

    assert "次数过多" in r.json()["detail"]

    # 试错用尽后该码作废：即便拿到正确码也不能再登录
    r = await client.post(
        "/api/v1/auth/login-code",
        json={"channel": "email", "target": "test@example.com", "code": real_code},
    )
    assert r.status_code == 422, r.text
    assert "access_token" not in r.text


@pytest.mark.asyncio
async def test_correct_code_still_logs_in_after_few_failures(
    client: AsyncClient, test_user, monkeypatch
):
    """未用尽试错次数时，正确码仍应正常登录（防爆破不误伤正常用户）"""
    monkeypatch.setattr(settings, "DEBUG", True)
    r = await client.post(
        "/api/v1/auth/send-code",
        json={"channel": "email", "target": "test@example.com", "purpose": "login"},
    )
    real_code = r.json()["data"]["debug_code"]
    wrong = "000000" if real_code != "000000" else "111111"

    for _ in range(2):
        r = await client.post(
            "/api/v1/auth/login-code",
            json={"channel": "email", "target": "test@example.com", "code": wrong},
        )
        assert r.status_code == 422

    r = await client.post(
        "/api/v1/auth/login-code",
        json={"channel": "email", "target": "test@example.com", "code": real_code},
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["access_token"]


@pytest.mark.asyncio
async def test_wx_fake_phone_bind(client: AsyncClient, db_session, monkeypatch):
    """DEBUG 下 fake:code 绑定手机号"""
    monkeypatch.setattr(settings, "DEBUG", True)
    from app.core.security import create_access_token, get_password_hash
    from app.models.user import User

    u = User(
        username="wxuser1",
        password_hash=get_password_hash("password123"),
        nickname="WX",
    )
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    headers = {"Authorization": f"Bearer {create_access_token(data={'sub': u.id})}"}

    r = await client.post(
        "/api/v1/users/me/bind-phone-wx",
        headers=headers,
        json={"code": "fake:13911110003"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["phone_verified"] is True


# ---- A-01 忘记密码 ----
@pytest.mark.asyncio
async def test_reset_password_flow_and_no_enumeration(client: AsyncClient, db_session, monkeypatch):
    from sqlalchemy import select
    from app.core.security import get_password_hash
    from app.models.user import User

    monkeypatch.setattr(settings, "DEBUG", True)
    monkeypatch.setattr(settings, "REGISTRATION_MODE", "open", raising=False)
    db_session.add(User(username="resetu", email="reset@example.com", password_hash=get_password_hash("oldpass123"), is_active=True))
    await db_session.commit()

    # 存在与不存在的邮箱，返回完全一致（防账号枚举）
    a = await client.post("/api/v1/auth/send-code", json={"channel": "email", "target": "reset@example.com", "purpose": "reset_password"})
    b = await client.post("/api/v1/auth/send-code", json={"channel": "email", "target": "nobody@example.com", "purpose": "reset_password"})
    assert a.status_code == b.status_code == 200
    assert a.json()["message"] == b.json()["message"]
    assert set(a.json()["data"].keys()) == set(b.json()["data"].keys()) == {"sent", "resend_after"}
    # 立刻重发也与首次一致（不暴露“过于频繁”）
    c = await client.post("/api/v1/auth/send-code", json={"channel": "email", "target": "reset@example.com", "purpose": "reset_password"})
    assert c.status_code == 200 and c.json()["message"] == a.json()["message"]

    from app.models.verification import VerificationCode  # noqa
    from app.services import verification as v
    # 从库里取不出明文码，直接用 DEBUG 路径重新生成一条已知码
    rec = (await db_session.execute(select(VerificationCode).where(VerificationCode.target == "reset@example.com", VerificationCode.purpose == "reset_password"))).scalars().first()
    assert rec is not None
    assert (await db_session.execute(select(VerificationCode).where(VerificationCode.target == "nobody@example.com"))).first() is None
    rec.code_hash = v._hash_code("123456")
    await db_session.commit()

    # 错误验证码：统一提示
    bad = await client.post("/api/v1/auth/reset-password", json={"channel": "email", "target": "reset@example.com", "code": "000000", "new_password": "newpass123"})
    ghost = await client.post("/api/v1/auth/reset-password", json={"channel": "email", "target": "nobody@example.com", "code": "000000", "new_password": "newpass123"})
    assert bad.status_code == ghost.status_code == 422
    assert bad.json()["detail"] == ghost.json()["detail"]

    ok = await client.post("/api/v1/auth/reset-password", json={"channel": "email", "target": "reset@example.com", "code": "123456", "new_password": "newpass123"})
    assert ok.status_code == 200, ok.text
    old = await client.post("/api/v1/auth/login", json={"username": "resetu", "password": "oldpass123"})
    new = await client.post("/api/v1/auth/login", json={"username": "resetu", "password": "newpass123"})
    assert old.status_code == 401 and new.status_code == 200
    # 验证码只能用一次
    again = await client.post("/api/v1/auth/reset-password", json={"channel": "email", "target": "reset@example.com", "code": "123456", "new_password": "another123"})
    assert again.status_code == 422


@pytest.mark.asyncio
async def test_reset_password_code_attempts_limited(client: AsyncClient, db_session, monkeypatch):
    from app.core.security import get_password_hash
    from app.models.user import User
    from app.services.verification import MAX_ATTEMPTS

    monkeypatch.setattr(settings, "DEBUG", True)
    db_session.add(User(username="resetv", email="resetv@example.com", password_hash=get_password_hash("oldpass123"), is_active=True))
    await db_session.commit()
    r = await client.post("/api/v1/auth/send-code", json={"channel": "email", "target": "resetv@example.com", "purpose": "reset_password"})
    assert r.status_code == 200
    real = None
    for _ in range(MAX_ATTEMPTS):
        x = await client.post("/api/v1/auth/reset-password", json={"channel": "email", "target": "resetv@example.com", "code": "111111", "new_password": "newpass123"})
        assert x.status_code == 422
    # 次数用尽后，即使码对也不行
    from sqlalchemy import select
    from app.models.verification import VerificationCode
    from app.services import verification as v
    rec = (await db_session.execute(select(VerificationCode).where(VerificationCode.target == "resetv@example.com"))).scalars().first()
    rec.code_hash = v._hash_code("222222")
    await db_session.commit()
    final = await client.post("/api/v1/auth/reset-password", json={"channel": "email", "target": "resetv@example.com", "code": "222222", "new_password": "newpass123"})
    assert final.status_code == 422
