"""项目配额只计未归档项目：归档释放名额，取消归档重新校验。"""
from app.models.company import Company


async def _set_quota(db_session, company_id: int, limit: int) -> None:
    company = await db_session.get(Company, company_id)
    ent = dict(company.entitlement_json or {})
    ent['quotas'] = {**(ent.get('quotas') or {}), 'max_projects': limit}
    company.entitlement_json = ent
    await db_session.commit()


async def test_archived_projects_release_quota(async_client, seed_ids, db_session):
    cid, h = seed_ids['company_id'], seed_ids['org_leader_headers']
    # 种子里已有 1 个未归档项目；上限设为 1，再建应被拒
    await _set_quota(db_session, cid, 1)
    r = await async_client.post('/api/v1/projects', headers=h, json={'company_id': cid, 'name': '超额项目'})
    assert r.status_code == 409, r.text

    # 归档已有项目 → 名额释放，可以新建
    first = seed_ids['project_id']
    assert (await async_client.post(f'/api/v1/projects/{first}/archive', headers=h)).status_code == 200
    r = await async_client.post('/api/v1/projects', headers=h, json={'company_id': cid, 'name': '归档后新建'})
    assert r.status_code == 200, r.text

    # 名额又满了：取消归档旧项目应被拒，项目保持归档
    r = await async_client.post(f'/api/v1/projects/{first}/unarchive', headers=h)
    assert r.status_code == 409, r.text
    assert '配额' in r.json()['message']
    detail = (await async_client.get(f'/api/v1/projects/{first}', headers=h)).json()['data']
    assert detail['status'] == 'archived'

    # 上限放宽后可以恢复
    await _set_quota(db_session, cid, 5)
    r = await async_client.post(f'/api/v1/projects/{first}/unarchive', headers=h)
    assert r.status_code == 200, r.text
    assert r.json()['data']['status'] == 'active'
