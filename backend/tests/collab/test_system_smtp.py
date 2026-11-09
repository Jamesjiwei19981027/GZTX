"""系统发信（注册验证码）读取企业管理页填写的公司级 SMTP。"""
from __future__ import annotations

import pytest

from app.core.config import settings
from app.models.company import Company


def _strong_keys(monkeypatch):
    monkeypatch.setattr(settings, "SMTP_HOST", "")
    monkeypatch.setattr(settings, "SMTP_USER", "")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "")
    monkeypatch.setattr(settings, "DEBUG", False)
    monkeypatch.setattr(
        settings, "SECRET_KEY", "unit-test-strong-secret-key-not-in-weak-list-32"
    )
    monkeypatch.setattr(settings, "INTEGRATION_SECRET_KEY", "unit-test-integration-secret-key")


@pytest.mark.asyncio
async def test_verification_code_uses_default_company_smtp(db_session, seed_ids, monkeypatch):
    from app.services import verification
    from app.services.smtp_settings import save_company_smtp

    _strong_keys(monkeypatch)
    cid = seed_ids["company_id"]
    company = await db_session.get(Company, cid)
    monkeypatch.setattr(settings, "DEFAULT_COMPANY_SLUG", company.slug)

    calls = []

    def fake_send_smtp(**kwargs):
        calls.append(kwargs)
        return True

    monkeypatch.setattr("app.utils.email._send_smtp", fake_send_smtp)

    await save_company_smtp(
        db_session,
        cid,
        smtp_host="smtp.qq.test",
        smtp_port=465,
        smtp_user="sender@qq.test",
        smtp_password="auth-code",
        smtp_from="sender@qq.test",
    )
    await db_session.commit()

    ok = await verification._deliver("email", "invitee@x.com", "123456", db=db_session)
    assert ok is True
    assert len(calls) == 1
    assert calls[0]["to_email"] == "invitee@x.com"
    assert calls[0]["smtp_host"] == "smtp.qq.test"
    assert calls[0]["smtp_password"] == "auth-code"
    assert "123456" in calls[0]["text_body"]


@pytest.mark.asyncio
async def test_verification_code_fails_without_any_smtp(db_session, seed_ids, monkeypatch):
    from app.services import verification

    _strong_keys(monkeypatch)
    monkeypatch.setattr(settings, "DEFAULT_COMPANY_SLUG", "no-such-company")
    calls = []
    monkeypatch.setattr("app.utils.email._send_smtp", lambda **kw: calls.append(kw) or True)

    ok = await verification._deliver("email", "invitee@x.com", "123456", db=db_session)
    assert ok is False
    assert calls == []
