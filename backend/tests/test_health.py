import pytest
from sqlalchemy import text


@pytest.mark.asyncio
async def test_health_checks_database_and_reports_schema_state(client):
    response = await client.get("/api/v1/health")
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["status"] == "healthy"
    assert data["database"] == "ok"
    assert data["migration"] in {"not_managed", "unknown"}


@pytest.mark.asyncio
async def test_health_reports_actual_version_when_alembic_managed(
    client, db_session
):
    """alembic_version 存在时必须报实际版本号，不得因 AUTO_CREATE_SCHEMA=true 恒报 not_managed。"""
    await db_session.execute(
        text(
            "CREATE TABLE alembic_version ("
            "version_num VARCHAR(32) NOT NULL, "
            "CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num))"
        )
    )
    await db_session.execute(
        text("INSERT INTO alembic_version (version_num) VALUES ('cd67ef89ab01')")
    )
    await db_session.commit()

    response = await client.get("/api/v1/health")
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["migration"] == "cd67ef89ab01"


@pytest.mark.asyncio
async def test_health_version_follows_settings(client, monkeypatch):
    """APP_VERSION 可被环境变量/配置覆盖，health 原样透出。"""
    from app.core.config import settings

    monkeypatch.setattr(settings, "APP_VERSION", "v2.3.4-test")
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["data"]["version"] == "v2.3.4-test"
