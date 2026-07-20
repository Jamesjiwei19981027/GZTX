import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_report_policies_and_manual_run(async_client: AsyncClient, seed_ids):
    pid = seed_ids["project_id"]

    r = await async_client.get(
        f"/api/v1/projects/{pid}/report-policies",
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 200
    items = r.json()["data"]["items"]
    assert len(items) >= 1
    assert items[0]["template_key"] == "progress_summary"

    r2 = await async_client.post(
        f"/api/v1/projects/{pid}/reports/run",
        headers=seed_ids["pm_headers"],
        json={"trigger": "manual_confirm"},
    )
    assert r2.status_code == 200
    data = r2.json()["data"]
    assert data["status"] == "completed"
    assert data["run_id"]
    assert "进度摘要" in (data["summary_text"] or "")


@pytest.mark.asyncio
async def test_report_run_forbidden_for_outsider(async_client: AsyncClient, seed_ids):
    pid = seed_ids["project_id"]
    r = await async_client.post(
        f"/api/v1/projects/{pid}/reports/run",
        headers=seed_ids["outsider_headers"],
        json={"trigger": "manual_confirm"},
    )
    assert r.status_code == 403
