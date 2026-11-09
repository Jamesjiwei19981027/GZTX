import pytest
from sqlalchemy import select
from app.models.report import ReportPolicy


@pytest.mark.asyncio
async def test_disabled_report_policy_survives_read_and_update(async_client, db_session, seed_ids):
    pid = seed_ids['project_id']
    headers = seed_ids['pm_headers']
    response = await async_client.put(f'/api/v1/projects/{pid}/report-policy', headers=headers,
        json={'enabled': False, 'period': 'monthly', 'deadline_time': '17:30', 'month_day': 28, 'remind': False})
    assert response.status_code == 200, response.text
    policy_id = response.json()['data']['id']
    policies = (await async_client.get(f'/api/v1/projects/{pid}/report-policies', headers=headers)).json()['data']['items']
    assert len(policies) == 1
    assert policies[0]['id'] == policy_id and policies[0]['enabled'] is False
    updated = await async_client.put(f'/api/v1/projects/{pid}/report-policy', headers=headers, json={'deadline_time': '18:00'})
    assert updated.json()['data']['id'] == policy_id
    assert updated.json()['data']['enabled'] is False
    await db_session.rollback()
    rows = (await db_session.scalars(select(ReportPolicy).where(ReportPolicy.project_id == pid))).all()
    assert len(rows) == 1
