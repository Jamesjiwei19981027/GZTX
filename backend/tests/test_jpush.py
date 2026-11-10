"""JPush 全部使用桩；绝不连接真实极光。"""
import pytest
from sqlalchemy import select
from app.core.config import settings, Settings
from app.core.security import create_access_token
from app.models.user import User


@pytest.fixture(autouse=True)
def disabled_push(monkeypatch):
    monkeypatch.setattr(settings, "JPUSH_APP_KEY", "")
    monkeypatch.setattr(settings, "JPUSH_MASTER_SECRET", "")


@pytest.mark.asyncio
async def test_device_ownership(client, auth_headers, test_user, db_session, monkeypatch):
    from app.models.push_device import PushDevice
    monkeypatch.setattr(settings, "JPUSH_APP_KEY", "a" * 24)
    monkeypatch.setattr(settings, "JPUSH_MASTER_SECRET", "b" * 24)
    body = {"platform": "android", "registration_id": "rid-device-1", "app_version": "2.0.0"}
    assert (await client.post('/api/v1/push/devices', json=body)).status_code == 401
    for _ in range(2):
        assert (await client.post('/api/v1/push/devices', json=body, headers=auth_headers)).status_code == 200
    device = (await db_session.execute(select(PushDevice))).scalar_one()
    assert device.user_id == test_user.id
    other = User(username="pushother", email="pushother@example.com", password_hash="unused")
    db_session.add(other)
    await db_session.commit()
    other_headers = {"Authorization": "Bearer " + create_access_token(data={"sub": other.id})}
    url = '/api/v1/push/devices/rid-device-1'
    assert (await client.delete(url, headers=other_headers)).status_code == 404
    assert (await client.post('/api/v1/push/devices', json=body, headers=other_headers)).status_code == 200
    await db_session.refresh(device)
    assert device.user_id == other.id
    assert (await client.delete(url, headers=auth_headers)).status_code == 404
    assert (await client.delete(url, headers=other_headers)).status_code == 204
    assert (await client.delete(url, headers=other_headers)).status_code == 204
    assert (await db_session.execute(select(PushDevice))).scalars().all() == []


@pytest.mark.asyncio
async def test_unconfigured_status_and_registration(client, auth_headers, db_session):
    from app.models.push_device import PushDevice
    assert (await client.get('/api/v1/push/status')).status_code == 401
    assert (await client.get('/api/v1/push/status', headers=auth_headers)).json() == {"enabled": False}
    response = await client.post('/api/v1/push/devices', json={"platform": "android", "registration_id": "rid"}, headers=auth_headers)
    assert response.json() == {"enabled": False}
    assert not (await db_session.execute(select(PushDevice))).scalars().all()
    assert (await client.post('/api/v1/push/devices', json={"platform": "web", "registration_id": ""}, headers=auth_headers)).status_code == 422


@pytest.mark.asyncio
async def test_enqueue_config_and_preference(db_session, test_user, monkeypatch):
    from app.models.notify import NotifyJob
    from app.services.notify import NotificationService
    service = NotificationService()
    ids = await service.enqueue(db_session, company_id=1, user_ids=[test_user.id], template_key="auth.welcome", payload={}, channels=['in_app', 'push'])
    assert [(await db_session.get(NotifyJob, i)).channel for i in ids] == ['in_app']
    monkeypatch.setattr(settings, 'JPUSH_APP_KEY', 'a' * 24)
    monkeypatch.setattr(settings, 'JPUSH_MASTER_SECRET', 'b' * 24)
    ids = await service.enqueue(db_session, company_id=1, user_ids=[test_user.id], template_key="auth.welcome", payload={})
    assert 'push' in [(await db_session.get(NotifyJob, i)).channel for i in ids]
    test_user.notify_pref = {'channels': {'push': {'enabled': False}}}
    ids = await service.enqueue(db_session, company_id=1, user_ids=[test_user.id], template_key="auth.welcome", payload={}, channels=['push'])
    assert ids == []


@pytest.mark.asyncio
@pytest.mark.parametrize('mode', ['success', 'invalid', 'failure', 'parameter', 'timeout'])
async def test_send_payload_and_isolation(db_session, test_user, monkeypatch, caplog, mode):
    import httpx
    from app.models.push_device import PushDevice
    from app.models.notify import NotifyJob, CollabInboxMessage
    from app.services.notify import push
    from app.workers.notify_worker import process_one_job
    monkeypatch.setattr(settings, 'JPUSH_APP_KEY', 'a' * 24)
    monkeypatch.setattr(settings, 'JPUSH_MASTER_SECRET', 'b' * 24)
    devices = [PushDevice(user_id=test_user.id, platform='android', registration_id=f'rid-{i}') for i in range(2)]
    db_session.add_all(devices)
    await db_session.flush()
    requests = []
    def handler(request):
        import json
        requests.append(json.loads(request.content))
        assert request.url == 'https://api.jpush.cn/v3/push'
        assert request.headers['authorization'].startswith('Basic ')
        if mode == 'timeout':
            raise httpx.ReadTimeout('secret must never be logged')
        code = {'invalid': 1011, 'parameter': 1003}.get(mode, 1000)
        return httpx.Response(200 if mode == 'success' else 400, json={'msg_id': 1} if mode == 'success' else {'error': {'code': code, 'message': 'secret must never be logged'}})
    real_client = httpx.AsyncClient
    monkeypatch.setattr(push, 'http_client', lambda: real_client(transport=httpx.MockTransport(handler)))
    for channel in ['push', 'in_app']:
        job = NotifyJob(company_id=1, user_id=test_user.id, channel=channel, template_key='evidence.adopted', payload_json={'package_id': 7, 'project_id': 2, 'private': 'not an extra'})
        db_session.add(job)
        await db_session.flush()
        await process_one_job(db_session, job.id)
        assert job.status == ('sent' if channel == 'in_app' or mode == 'success' else 'failed')
    body = requests[0]
    assert body['audience'] == {'registration_id': ['rid-0', 'rid-1']}
    assert body['notification']['android']['extras'] == {'template_key': 'evidence.adopted', 'package_id': 7, 'project_id': 2}
    assert body['notification']['android']['title'] and body['notification']['android']['alert']
    assert body['options']['apns_production'] is False
    assert body['options']['classification'] == 1
    assert set(body['options']['third_party_channel']) >= {'xiaomi', 'huawei', 'oppo', 'vivo', 'honor'}
    assert all((device.disabled_at is not None) == (mode == 'invalid') for device in devices)
    assert len((await db_session.execute(select(CollabInboxMessage))).scalars().all()) == 1
    assert 'secret must never' not in caplog.text


def test_production_gate_allows_blank_and_rejects_placeholder():
    config = Settings(_env_file=None, DEBUG=False, SECRET_KEY='A7m4X9z2K6r8N3p5V1c0B4d6F8h2', LICENSE_VERIFY_MODE='ed25519', LICENSE_PUBLIC_KEY='a-real-public-key')
    config.validate_production_secrets()
    for field in ['JPUSH_APP_KEY', 'JPUSH_MASTER_SECRET']:
        setattr(config, field, 'your-jpush-credential')
        with pytest.raises(RuntimeError, match=field):
            config.validate_production_secrets()
        setattr(config, field, '')


@pytest.mark.asyncio
async def test_disabled_channel_never_constructs_http_client(db_session, test_user, monkeypatch):
    from app.services.notify import push
    def forbidden():
        raise AssertionError('unconfigured channel must not construct a transport')
    monkeypatch.setattr(push, 'http_client', forbidden)
    assert await push.send_push_channel(db_session, test_user, 'auth.welcome', {}) is True
    monkeypatch.setattr(settings, 'JPUSH_APP_KEY', 'a' * 24)
    assert await push.send_push_channel(db_session, test_user, 'auth.welcome', {}) is True
    monkeypatch.setattr(settings, 'JPUSH_MASTER_SECRET', 'b' * 24)
    test_user.notify_pref = {'channels': {'push': {'enabled': False}}}
    assert await push.send_push_channel(db_session, test_user, 'auth.welcome', {}) is True


@pytest.mark.asyncio
async def test_disabled_device_is_reenabled_by_registration(client, auth_headers, test_user, db_session, monkeypatch):
    from datetime import datetime, timezone
    from app.models.push_device import PushDevice
    monkeypatch.setattr(settings, 'JPUSH_APP_KEY', 'a' * 24)
    monkeypatch.setattr(settings, 'JPUSH_MASTER_SECRET', 'b' * 24)
    device = PushDevice(user_id=test_user.id, platform='android', registration_id='old-rid', disabled_at=datetime.now(timezone.utc))
    db_session.add(device)
    await db_session.commit()
    response = await client.post('/api/v1/push/devices', json={'platform': 'android', 'registration_id': 'old-rid', 'app_version': '3'}, headers=auth_headers)
    assert response.status_code == 200
    await db_session.refresh(device)
    assert device.disabled_at is None
    assert device.app_version == '3'
