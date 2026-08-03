import pytest


@pytest.mark.asyncio
async def test_health_checks_database_and_reports_schema_state(client):
    response = await client.get("/api/v1/health")
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["status"] == "healthy"
    assert data["database"] == "ok"
    assert data["migration"] in {"not_managed", "unknown"}
