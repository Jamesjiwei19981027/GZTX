"""R3 安卓读取契约：个人 ASR 与邀请能力快照。"""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models.bindings import AsrBinding
from app.models.company import CompanyMembership
from app.models.delegation import DelegationGrant
from app.models.project import Project


@pytest.mark.asyncio
async def test_personal_asr_empty_own_company_and_masked(async_client, db_session, seed_ids):
    cid, uid = seed_ids['company_id'], seed_ids['member_user_id']
    headers = seed_ids['member_headers']
    url = f'/api/v1/users/me/bindings/asr?company_id={cid}'
    empty = await async_client.get(url, headers=headers)
    assert empty.status_code == 200
    assert empty.json()['data'] is None
    db_session.add_all([
        AsrBinding(company_id=cid, user_id=None, provider_id='company-default', is_default=True),
        AsrBinding(company_id=cid, user_id=seed_ids['pm_user_id'], provider_id='another-user'),
        AsrBinding(company_id=cid, user_id=uid, provider_id='personal', config_json={'api_key': 'secret', 'api_key_encrypted': 'cipher', 'model': 'whisper'}),
    ])
    await db_session.commit()
    response = await async_client.get(url, headers=headers)
    data = response.json()['data']
    assert data['provider_id'] == 'personal'
    assert data['has_api_key'] is True
    assert data['config_json'] == {'model': 'whisper'}
    assert 'secret' not in response.text and 'cipher' not in response.text
    assert (await async_client.get(url, headers=seed_ids['outsider_headers'])).status_code == 403
    assert (await async_client.get('/api/v1/users/me/bindings/asr?company_id=999999', headers=headers)).status_code == 404
    assert (await async_client.get(url)).status_code == 401


@pytest.mark.asyncio
async def test_personal_asr_rejects_inactive_membership(async_client, db_session, seed_ids):
    membership = (await db_session.execute(select(CompanyMembership).where(
        CompanyMembership.company_id == seed_ids['company_id'], CompanyMembership.user_id == seed_ids['member_user_id'],
    ))).scalar_one()
    membership.employment_status = 'inactive'
    await db_session.commit()
    response = await async_client.get(f"/api/v1/users/me/bindings/asr?company_id={seed_ids['company_id']}", headers=seed_ids['member_headers'])
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_can_invite_matches_acl_and_expiry(async_client, db_session, seed_ids):
    cid, pid = seed_ids['company_id'], seed_ids['project_id']
    url = f'/api/v1/projects/{pid}/my-permissions'
    for key, expected in [('pm_headers', True), ('super_admin_headers', True), ('member_headers', False)]:
        response = await async_client.get(url, headers=seed_ids[key])
        assert response.status_code == 200
        assert response.json()['data']['can_invite'] is expected
    db_session.add(CompanyMembership(company_id=cid, user_id=seed_ids['outsider_user_id'], status='active', employment_status='active'))
    grant = DelegationGrant(company_id=cid, project_id=pid, grantor_user_id=seed_ids['pm_user_id'],
        grantee_user_id=seed_ids['outsider_user_id'], actions_json=['member.pull'], status='active',
        valid_to=datetime.now(timezone.utc) + timedelta(days=1))
    db_session.add(grant)
    await db_session.commit()
    delegated = await async_client.get(url, headers=seed_ids['outsider_headers'])
    assert delegated.status_code == 200, delegated.text
    assert delegated.json()['data']['can_invite'] is True
    grant.valid_from = datetime.now(timezone.utc) + timedelta(hours=1)
    await db_session.commit()
    assert (await async_client.get(url, headers=seed_ids['outsider_headers'])).status_code == 403
    grant.valid_from = datetime.now(timezone.utc) - timedelta(hours=1)
    grant.valid_to = datetime.now(timezone.utc) - timedelta(seconds=1)
    await db_session.commit()
    assert (await async_client.get(url, headers=seed_ids['outsider_headers'])).status_code == 403
    project = await db_session.get(Project, pid)
    project.status = 'archived'
    await db_session.commit()
    archived = await async_client.get(url, headers=seed_ids['pm_headers'])
    assert archived.json()['data']['can_invite'] is False
