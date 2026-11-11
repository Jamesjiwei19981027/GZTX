"""在线状态上报：首次写入与重复写入都走原子 upsert，不再因先查后插撞主键。"""
from sqlalchemy import select

from app.models.shell import UserPresence


async def test_presence_insert_then_update(async_client, seed_ids, db_session):
    h = seed_ids['member_headers']
    r1 = await async_client.put('/api/v1/users/me/presence', headers=h, json={'status': 'online'})
    assert r1.status_code == 200, r1.text
    r2 = await async_client.put('/api/v1/users/me/presence', headers=h, json={'status': 'busy'})
    assert r2.status_code == 200, r2.text
    uid = r2.json()['data']['user_id']
    rows = (await db_session.execute(select(UserPresence).where(UserPresence.user_id == uid))).scalars().all()
    assert len(rows) == 1
    await db_session.refresh(rows[0])
    assert rows[0].status == 'busy'


async def test_presence_existing_row_without_session_cache(async_client, seed_ids, db_session):
    """模拟并发：另一请求已插入同一用户的行，本次上报仍应成功更新而非 500。"""
    h = seed_ids['pm_headers']
    me = (await async_client.get('/api/v1/users/me', headers=h)).json()['data']
    db_session.add(UserPresence(user_id=me['id'], status='offline'))
    await db_session.commit()
    r = await async_client.put('/api/v1/users/me/presence', headers=h, json={'status': 'online'})
    assert r.status_code == 200, r.text
    row = await db_session.get(UserPresence, me['id'])
    await db_session.refresh(row)
    assert row.status == 'online'
