"""认证接口限流回归测试"""
import pytest
from httpx import AsyncClient

from app.core.config import settings


@pytest.mark.asyncio
async def test_login_rate_limited_by_account(client: AsyncClient, test_user, monkeypatch):
    """密码登录连续失败会触发 429，而不是无限次 401。

    计数必须跨 401 的 rollback 存活——限流写在请求会话里会被 get_db 回滚掉。
    """
    monkeypatch.setattr(settings, "RATE_LIMIT_LOGIN_PER_ACCOUNT", 3)
    monkeypatch.setattr(settings, "RATE_LIMIT_LOGIN_PER_IP", 1000)

    for _ in range(3):
        r = await client.post(
            "/api/v1/auth/login", json={"username": "testuser", "password": "wrong"}
        )
        assert r.status_code == 401, r.text

    r = await client.post(
        "/api/v1/auth/login", json={"username": "testuser", "password": "wrong"}
    )
    assert r.status_code == 429, r.text
    assert r.headers.get("Retry-After")

    # 密码正确也一并挡住（防爆破不能被"猜对即放行"绕过）
    r = await client.post(
        "/api/v1/auth/login", json={"username": "testuser", "password": "testpassword"}
    )
    assert r.status_code == 429


@pytest.mark.asyncio
async def test_login_rate_limited_by_ip(client: AsyncClient, test_user, monkeypatch):
    """同一 IP 换不同账号猛试也会被挡（撞库）"""
    monkeypatch.setattr(settings, "RATE_LIMIT_LOGIN_PER_IP", 3)
    monkeypatch.setattr(settings, "RATE_LIMIT_LOGIN_PER_ACCOUNT", 1000)

    for i in range(3):
        r = await client.post(
            "/api/v1/auth/login", json={"username": f"ghost{i}", "password": "x"}
        )
        assert r.status_code == 401

    r = await client.post(
        "/api/v1/auth/login", json={"username": "ghost99", "password": "x"}
    )
    assert r.status_code == 429


@pytest.mark.asyncio
async def test_send_code_daily_cap_per_target(client: AsyncClient, monkeypatch):
    """发码有目标维度额度上限，防邮件/短信轰炸与费用消耗"""
    monkeypatch.setattr(settings, "DEBUG", True)
    monkeypatch.setattr(settings, "RATE_LIMIT_SEND_CODE_PER_TARGET", 2)
    monkeypatch.setattr(settings, "RATE_LIMIT_SEND_CODE_PER_IP", 1000)
    # 绕开 60 秒重发间隔，单独验证额度上限
    monkeypatch.setattr("app.services.verification.RESEND_INTERVAL_SECONDS", 0)

    for _ in range(2):
        r = await client.post(
            "/api/v1/auth/send-code",
            json={"channel": "sms", "target": "13900001111"},
        )
        assert r.status_code == 200, r.text

    r = await client.post(
        "/api/v1/auth/send-code", json={"channel": "sms", "target": "13900001111"}
    )
    assert r.status_code == 429, r.text


@pytest.mark.asyncio
async def test_rate_limit_can_be_disabled(client: AsyncClient, test_user, monkeypatch):
    """RATE_LIMIT_ENABLED=false 时不干预（本地联调/单测用）"""
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", False)
    monkeypatch.setattr(settings, "RATE_LIMIT_LOGIN_PER_ACCOUNT", 1)

    for _ in range(4):
        r = await client.post(
            "/api/v1/auth/login", json={"username": "testuser", "password": "wrong"}
        )
        assert r.status_code == 401


@pytest.mark.asyncio
async def test_xff_only_trusted_when_configured(client: AsyncClient, test_user, monkeypatch):
    """TRUST_PROXY_HEADERS=false 时不得采信 X-Forwarded-For，否则可伪造头绕过 IP 限流"""
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", False)
    monkeypatch.setattr(settings, "RATE_LIMIT_LOGIN_PER_IP", 2)
    monkeypatch.setattr(settings, "RATE_LIMIT_LOGIN_PER_ACCOUNT", 1000)

    for i in range(2):
        r = await client.post(
            "/api/v1/auth/login",
            json={"username": "ghost", "password": "x"},
            headers={"X-Forwarded-For": f"10.0.0.{i}"},
        )
        assert r.status_code == 401

    r = await client.post(
        "/api/v1/auth/login",
        json={"username": "ghost", "password": "x"},
        headers={"X-Forwarded-For": "10.0.0.99"},
    )
    assert r.status_code == 429, "伪造 XFF 不应绕过限流"


@pytest.mark.asyncio
async def test_refresh_rate_limited_by_ip(client: AsyncClient, monkeypatch):
    """refresh 匿名端点按 IP 限流；用无效 token 计次，避免轮换干扰。"""
    monkeypatch.setattr(settings, "RATE_LIMIT_REFRESH_PER_IP", 2)

    for _ in range(2):
        r = await client.post("/api/v1/auth/refresh", json={"refresh_token": "not-a-jwt"})
        assert r.status_code == 401, r.text

    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": "not-a-jwt"})
    assert r.status_code == 429, r.text
