"""匿名登录开关、本人站内测试通知与 SSO 移动返回契约。"""
from urllib.parse import parse_qs, urlparse
import base64
import hashlib
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models.company import Company
from app.models.notify import CollabInboxMessage, NotificationRecord
from app.models.sso import SsoLoginAttempt
from .test_real_sso import configure, ding_routes, external_http


@pytest.mark.asyncio
async def test_registration_config_exposes_only_company_login_switches(async_client, seed_ids, db_session):
    company = await db_session.get(Company, seed_ids['company_id'])
    company.login_methods_json = {'password': False, 'dingtalk': True, 'oidc': True, 'client_secret': 'do-not-leak'}
    company.policy_json = {'private_policy': 'hidden'}
    await db_session.commit()
    response = await async_client.get('/api/v1/auth/registration-config', params={'company_id': company.id})
    assert response.status_code == 200, response.text
    data = response.json()['data']
    assert data['login_methods'] == {'password': False, 'wechat': True, 'wecom': False, 'dingtalk': True, 'feishu': False, 'oidc': True, 'saml': False}
    assert set(data) == {'mode', 'phone_required', 'login_methods'}
    assert 'do-not-leak' not in response.text and 'private_policy' not in response.text
    default = await async_client.get('/api/v1/auth/registration-config')
    assert default.json()['data']['login_methods'] == data['login_methods']


@pytest.mark.asyncio
async def test_test_send_in_app_creates_own_inbox_and_record(async_client, seed_ids, db_session):
    response = await async_client.post('/api/v1/notify/test-send', headers=seed_ids['member_headers'], json={'channel': 'in_app', 'user_id': seed_ids['pm_user_id']})
    assert response.status_code == 200, response.text
    assert response.json()['data'] == {'ok': True, 'error': None}
    message = (await db_session.scalars(select(CollabInboxMessage))).one()
    assert message.user_id == seed_ids['member_user_id']
    assert message.company_id == seed_ids['company_id']
    assert message.body_text == '这是一条测试通知，站内通知通道工作正常。'
    assert message.is_read is False
    record = (await db_session.scalars(select(NotificationRecord))).one()
    assert (record.user_id, record.channel, record.status, record.error) == (seed_ids['member_user_id'], 'in_app', 'sent', None)
    mine = await async_client.get('/api/v1/notifications/collab', headers=seed_ids['member_headers'])
    assert mine.json()['data']['items'][0]['id'] == message.id
    other = await async_client.get('/api/v1/notifications/collab', headers=seed_ids['pm_headers'])
    assert other.json()['data']['items'] == []
    assert (await async_client.post('/api/v1/notify/test-send', json={'channel': 'in_app'})).status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize('return_to', ['worktodo://sso/callback', 'https://work.example/?mobile=1', '/?mobile=1'])
async def test_mobile_sso_return_uses_cookie_bound_single_use_ticket(async_client, seed_ids, db_session, external_http, monkeypatch, return_to):
    monkeypatch.setattr(settings, 'APP_URL', 'https://work.example')
    cid = await configure(async_client, seed_ids, db_session)
    ding_routes(external_http)
    verifier = 'native-verifier-' + 'a' * 48
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
    mobile = return_to.startswith('worktodo:')
    start = await async_client.get('/api/v1/sso/dingtalk/start', params={'company_id': cid, 'return_to': return_to, **({'code_challenge': challenge, 'code_challenge_method': 'S256'} if mobile else {})})
    assert start.status_code == 200, start.text
    args = parse_qs(urlparse(start.json()['data']['authorize_url']).query)
    # 本地 ASGI 使用 http；补充安全 Cookie 模拟同一个 https 发起浏览器。
    cookie = next(cookie.value for cookie in async_client.cookies.jar if cookie.name == 'worktodo_sso_browser')
    headers = {'Accept': 'text/html', 'Cookie': f'worktodo_sso_browser={cookie}'}
    callback = await async_client.get('/api/v1/sso/dingtalk/callback', params={'code': 'real', 'state': args['state'][0]}, headers=headers)
    assert callback.status_code == 303, callback.text
    location = callback.headers['location']
    expected = return_to if not return_to.startswith('/') else 'https://work.example' + return_to
    assert location.split('#')[0] == expected
    assert 'access_token' not in location and 'refresh_token' not in location
    ticket = parse_qs(urlparse(location).fragment)['sso_ticket'][0]
    no_cookie = await async_client.post('/api/v1/sso/complete', json={'ticket': ticket})
    assert no_cookie.status_code == 422
    if mobile:
        wrong = await async_client.post('/api/v1/sso/complete', json={'ticket': ticket, 'code_verifier': 'b' * 64})
        assert wrong.status_code == 422
    body = {'ticket': ticket, **({'code_verifier': verifier} if mobile else {})}
    complete = await async_client.post('/api/v1/sso/complete', json=body, headers={} if mobile else headers)
    assert complete.status_code == 200, complete.text
    assert complete.json()['data']['access_token']
    assert (await async_client.post('/api/v1/sso/complete', json=body, headers={} if mobile else headers)).status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize('extra', [{}, {'code_challenge': 'a' * 43, 'code_challenge_method': 'plain'}, {'code_challenge': 'short', 'code_challenge_method': 'S256'}])
async def test_mobile_sso_requires_s256_challenge(async_client, seed_ids, extra):
    response = await async_client.get('/api/v1/sso/dingtalk/start', params={'company_id': seed_ids['company_id'], 'return_to': 'worktodo://sso/callback', **extra})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_mobile_sso_browser_alias_keeps_cookie_and_never_returns_tokens_in_callback(async_client, seed_ids, db_session, external_http, monkeypatch):
    monkeypatch.setattr(settings, 'APP_URL', 'http://test')
    cid = await configure(async_client, seed_ids, db_session)
    ding_routes(external_http)
    verifier = 'c' * 64
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
    response = await async_client.get('/api/v1/sso/dingtalk', params={'company_id': cid, 'return_to': 'worktodo://sso/callback', 'code_challenge': challenge, 'code_challenge_method': 'S256'})
    assert response.status_code == 303, response.text
    assert 'HttpOnly' in response.headers['set-cookie']
    assert response.headers['cache-control'] == 'no-store'
    state = parse_qs(urlparse(response.headers['location']).query)['state'][0]
    callback = await async_client.get('/api/v1/sso/dingtalk/callback', params={'code': 'real', 'state': state})
    assert callback.status_code == 303
    ticket = parse_qs(urlparse(callback.headers['location']).fragment)['sso_ticket'][0]
    assert 'access_token' not in callback.text and 'access_token' not in callback.headers['location']
    async_client.cookies.clear()
    complete = await async_client.post('/api/v1/sso/complete', json={'ticket': ticket, 'code_verifier': verifier})
    assert complete.status_code == 200, complete.text


@pytest.mark.asyncio
async def test_mobile_sso_expired_ticket_cannot_be_redeemed(async_client, seed_ids, db_session):
    verifier, ticket = 'd' * 64, 'expired-ticket-' + 'e' * 32
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
    now = datetime.now(timezone.utc)
    db_session.add(SsoLoginAttempt(state_hash='f' * 64, company_id=seed_ids['company_id'], provider='dingtalk', browser_hash='a' * 64,
        nonce='expired', return_to='worktodo://sso/callback', code_challenge=challenge, expires_at=now + timedelta(minutes=1),
        ticket_hash=hashlib.sha256(ticket.encode()).hexdigest(), user_id=seed_ids['member_user_id'], ticket_expires_at=now - timedelta(seconds=1)))
    await db_session.commit()
    response = await async_client.post('/api/v1/sso/complete', json={'ticket': ticket, 'code_verifier': verifier})
    assert response.status_code == 422, response.text


@pytest.mark.asyncio
@pytest.mark.parametrize('return_to', ['https://evil.example/', '//evil.example/', 'worktodo://evil/path', 'worktodo://sso/callback?next=https://evil.example', 'worktodo://sso/callback#injected', 'https://work.example@evil.example/', '/%5cevil.example', 'javascript:alert(1)'])
async def test_mobile_sso_return_rejects_unsafe_targets(async_client, seed_ids, return_to):
    response = await async_client.get('/api/v1/sso/dingtalk/start', params={'company_id': seed_ids['company_id'], 'return_to': return_to})
    assert response.status_code == 422
