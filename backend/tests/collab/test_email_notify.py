"""Email notify channel: real send_email_channel + welcome; mock SMTP transport only."""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.core.config import settings
from app.services.notify import channels as ch


@pytest.mark.asyncio
async def test_send_email_channel_invokes_smtp_when_configured(monkeypatch):
    calls = []

    def fake_send_smtp(**kwargs):
        calls.append(kwargs)
        return True

    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.test.local")
    monkeypatch.setattr(settings, "SMTP_USER", "u@test.local")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "secret")
    monkeypatch.setattr(settings, "SMTP_FROM", "from@test.local")
    monkeypatch.setattr(settings, "SMTP_PORT", 465)
    monkeypatch.setattr("app.utils.email._send_smtp", fake_send_smtp)

    user = SimpleNamespace(id=1, email="member@example.com", username="m")
    ok = await ch.send_email_channel(
        user, "evidence.adopted", {"node_title": "工作项A"}
    )
    assert ok is True
    assert len(calls) == 1
    assert calls[0]["to_email"] == "member@example.com"
    assert calls[0]["smtp_host"] == "smtp.test.local"
    assert "工作项A" in calls[0]["text_body"]


@pytest.mark.asyncio
async def test_send_email_channel_dry_run_without_smtp(monkeypatch):
    calls = []

    def fake_send_smtp(**kwargs):
        calls.append(kwargs)
        return True

    monkeypatch.setattr(settings, "SMTP_HOST", "")
    monkeypatch.setattr(settings, "SMTP_USER", "")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "")
    monkeypatch.setattr(settings, "DEBUG", True)
    monkeypatch.setattr("app.utils.email._send_smtp", fake_send_smtp)

    user = SimpleNamespace(id=1, email="member@example.com")
    ok = await ch.send_email_channel(user, "auth.welcome", {"username": "x", "company_name": "C", "app_url": "http://x"})
    assert ok is True
    assert calls == []


@pytest.mark.asyncio
async def test_send_email_channel_prod_without_smtp_returns_false(monkeypatch):
    calls = []

    def fake_send_smtp(**kwargs):
        calls.append(kwargs)
        return True

    monkeypatch.setattr(settings, "SMTP_HOST", "")
    monkeypatch.setattr(settings, "SMTP_USER", "")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "")
    monkeypatch.setattr(settings, "DEBUG", False)
    monkeypatch.setattr("app.utils.email._send_smtp", fake_send_smtp)

    user = SimpleNamespace(id=1, email="member@example.com")
    ok = await ch.send_email_channel(user, "auth.welcome", {"username": "x", "company_name": "C", "app_url": "http://x"})
    assert ok is False
    assert calls == []


@pytest.mark.asyncio
async def test_welcome_email_uses_channel(monkeypatch):
    calls = []

    def fake_send_smtp(**kwargs):
        calls.append(kwargs)
        return True

    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.test.local")
    monkeypatch.setattr(settings, "SMTP_USER", "u@test.local")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "secret")
    monkeypatch.setattr(settings, "SMTP_FROM", "from@test.local")
    monkeypatch.setattr(settings, "APP_URL", "https://app.example.com")
    monkeypatch.setattr("app.utils.email._send_smtp", fake_send_smtp)

    user = SimpleNamespace(id=9, email="new@example.com", username="newu")
    ok = await ch.send_welcome_email(user, company_name="演示公司", company_slug="demo")
    assert ok is True
    assert len(calls) == 1
    assert "auth.welcome" in calls[0]["subject"] or "WorkTodo" in calls[0]["subject"]
    assert "newu" in calls[0]["text_body"]
