"""个人凭证：回显脱敏 + 加密落库 回归测试。

历史缺陷：
1. /users/me 与 PUT /users/me 直接把整个 notify_pref 原样返回，绕过
   /notifications 下专门的脱敏接口，明文回显个人 SMTP 密码与 LLM API Key；
2. 二者明文存进 users.notify_pref，而公司级同类凭证走 secret_box 加密，
   数据库文件或备份泄露即等于全量凭证泄露。
"""
import pytest
from httpx import AsyncClient

from app.core.config import settings


@pytest.mark.asyncio
async def test_users_me_never_echoes_personal_secrets(
    client: AsyncClient, db_session, test_user, auth_headers
):
    from sqlalchemy.orm.attributes import flag_modified

    test_user.notify_pref = {
        "channels": {
            "email": {"smtp_host": "smtp.qq.com", "smtp_password": "super-secret-pw"},
            "llm": {"provider": "openai_compatible", "api_key": "sk-live-DEADBEEF"},
        }
    }
    flag_modified(test_user, "notify_pref")
    await db_session.commit()

    for method in ("get", "put"):
        r = await getattr(client, method)(
            "/api/v1/users/me",
            headers=auth_headers,
            **({"json": {"nickname": "Test User"}} if method == "put" else {}),
        )
        assert r.status_code == 200, r.text
        body = r.text
        assert "super-secret-pw" not in body, f"{method} /users/me 回显了 SMTP 密码"
        assert "sk-live-DEADBEEF" not in body, f"{method} /users/me 回显了 LLM 密钥"

        email_cfg = r.json()["data"]["notify_pref"]["channels"]["email"]
        # 非凭证字段照常返回，且保留"是否已配置"信息
        assert email_cfg["smtp_host"] == "smtp.qq.com"
        assert email_cfg["has_smtp_password"] is True
        assert "smtp_password" not in email_cfg
        assert r.json()["data"]["notify_pref"]["channels"]["llm"]["has_api_key"] is True


def test_scrub_secrets_keeps_existing_has_flags():
    """已有的 has_password 标志本身不是凭证，不应被再包一层"""
    from app.schemas.user import scrub_secrets

    out = scrub_secrets({"has_password": True, "nested": [{"api_key": "x"}]})
    assert out["has_password"] is True
    assert out["nested"][0] == {"has_api_key": True}


def test_seal_unseal_roundtrip(monkeypatch):
    from app.services.user_secrets import PREFIX, seal, unseal

    monkeypatch.setattr(settings, "DEBUG", True)
    sealed = seal("my-smtp-password")
    assert sealed.startswith(PREFIX)
    assert "my-smtp-password" not in sealed
    assert unseal(sealed) == "my-smtp-password"


def test_unseal_accepts_legacy_plaintext(monkeypatch):
    """存量明文值无前缀，必须原样可读，否则升级即打挂所有已配置用户的发信"""
    from app.services.user_secrets import unseal

    monkeypatch.setattr(settings, "DEBUG", True)
    assert unseal("legacy-plaintext-pw") == "legacy-plaintext-pw"
    assert unseal("") == ""
    assert unseal(None) == ""


def test_unseal_undecryptable_is_treated_as_unconfigured(monkeypatch):
    """密钥轮换后解不开：按未配置处理并告警，不要把发信链路整体打挂"""
    from app.services.user_secrets import PREFIX, unseal

    monkeypatch.setattr(settings, "DEBUG", True)
    assert unseal(PREFIX + "not-a-valid-fernet-token") == ""


@pytest.mark.asyncio
async def test_smtp_password_stored_encrypted(
    client: AsyncClient, db_session, test_user, auth_headers, monkeypatch
):
    monkeypatch.setattr(settings, "DEBUG", True)
    r = await client.put(
        "/api/v1/notifications/smtp-config",
        headers=auth_headers,
        json={
            "smtp_host": "smtp.qq.com",
            "smtp_port": 465,
            "smtp_user": "me@qq.com",
            "smtp_password": "plaintext-should-not-land",
        },
    )
    assert r.status_code == 200, r.text
    assert "plaintext-should-not-land" not in r.text

    await db_session.refresh(test_user)
    stored = test_user.notify_pref["channels"]["email"]["smtp_password"]
    assert stored != "plaintext-should-not-land", "个人 SMTP 密码仍是明文落库"
    assert stored.startswith("enc:v1:")

    # 发信侧仍能解出原值
    from app.services.smtp_settings import smtp_from_user

    assert smtp_from_user(test_user).password == "plaintext-should-not-land"
