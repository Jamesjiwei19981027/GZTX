import pytest

from app.services.asr.router import AsrRouter
from app.services.asr.builtin import FakeAsr
from app.core.config import settings


@pytest.mark.asyncio
async def test_text_material_without_files_uses_real_evidence_endpoint(async_client, seed_ids):
    response = await async_client.post(f"/api/v1/nodes/{seed_ids['node_id']}/evidence",headers=seed_ids['member_headers'],
        json={'summary_text':'今日完成接口联调，遗留问题已记录，明日进入客户验收。','evidence_kind':'document','file_ids':[]})
    assert response.status_code == 200, response.text
    assert response.json()['data']['package_id']


@pytest.mark.asyncio
async def test_unconfigured_material_dictation_never_returns_placeholder(async_client, seed_ids):
    response = await async_client.post('/api/v1/asr/transcribe', headers=seed_ids['member_headers'],
        data={'company_id': seed_ids['company_id'], 'project_id': seed_ids['project_id']},
        files={'file': ('material.webm', b'recorded-audio', 'audio/webm')})
    assert response.status_code == 503, response.text
    assert '[builtin-asr]' not in response.text


@pytest.mark.asyncio
async def test_material_dictation_checks_project_and_returns_editable_text(async_client, seed_ids, monkeypatch):
    async def resolve(self, *args, **kwargs):
        return FakeAsr('本周完成接口联调，等待验收。')
    monkeypatch.setattr(AsrRouter, 'resolve', resolve)
    response = await async_client.post('/api/v1/asr/transcribe', headers=seed_ids['member_headers'],
        data={'company_id': seed_ids['company_id'], 'project_id': seed_ids['project_id']},
        files={'file': ('material.webm', b'recorded-audio', 'audio/webm')})
    assert response.status_code == 200, response.text
    assert response.json()['data']['text'] == '本周完成接口联调，等待验收。'
    denied = await async_client.post('/api/v1/asr/transcribe', headers=seed_ids['outsider_headers'],
        data={'company_id': seed_ids['company_id'], 'project_id': seed_ids['project_id']},
        files={'file': ('material.webm', b'recorded-audio', 'audio/webm')})
    assert denied.status_code == 403
    missing = await async_client.post('/api/v1/asr/transcribe', headers=seed_ids['member_headers'],
        data={'company_id': seed_ids['company_id'], 'project_id': 99999},
        files={'file': ('material.webm', b'recorded-audio', 'audio/webm')})
    assert missing.status_code in (403, 404)


@pytest.mark.asyncio
async def test_material_dictation_rejects_empty_and_non_audio(async_client, seed_ids, monkeypatch):
    async def resolve(self, *args, **kwargs):
        return FakeAsr('不应转写')
    monkeypatch.setattr(AsrRouter, 'resolve', resolve)
    for filename, content, mime in [('empty.webm', b'', 'audio/webm'), ('document.txt', b'hello', 'text/plain')]:
        response = await async_client.post('/api/v1/asr/transcribe', headers=seed_ids['member_headers'],
            data={'company_id': seed_ids['company_id'], 'project_id': seed_ids['project_id']},
            files={'file': (filename, content, mime)})
        assert response.status_code == 422, response.text


@pytest.mark.asyncio
async def test_asr_admin_config_encrypts_key_and_real_adapter_receives_audio(async_client, seed_ids, monkeypatch, db_session):
    import httpx
    from sqlalchemy import select
    from app.models.bindings import AsrBinding
    from app.models.company import Company
    monkeypatch.setattr(settings, 'INTEGRATION_SECRET_KEY', 'voice-test-integration-key-only-12345')
    cid = seed_ids['company_id']
    saved = await async_client.put(f'/api/v1/companies/{cid}/bindings/asr', headers=seed_ids['super_admin_headers'],
        json={'provider_id':'cloud:whisper','config_json':{'base_url':'https://asr.example.test/v1','model':'whisper-1','api_key':'private-voice-test-key'}})
    assert saved.status_code == 200, saved.text
    assert 'private-voice-test-key' not in saved.text
    assert 'api_key_encrypted' not in saved.text
    row = (await db_session.execute(select(AsrBinding).where(AsrBinding.company_id == cid, AsrBinding.is_default.is_(True)))).scalar_one()
    assert 'api_key' not in row.config_json
    assert row.config_json['api_key_encrypted'] != 'private-voice-test-key'
    listed = await async_client.get(f'/api/v1/companies/{cid}/bindings', headers=seed_ids['member_headers'])
    assert 'private-voice-test-key' not in listed.text and 'api_key_encrypted' not in listed.text
    engine = await AsrRouter().resolve(db_session, await db_session.get(Company,cid), user_id=seed_ids['member_user_id'])
    seen = []
    def answer(request):
        seen.append(request)
        assert request.url.path == '/v1/audio/transcriptions'
        assert request.headers['authorization'] == 'Bearer private-voice-test-key'
        assert b'real-audio-bytes' in request.content
        assert b'whisper-1' in request.content
        return httpx.Response(200,json={'text':'识别后的工作材料'})
    original = httpx.AsyncClient
    monkeypatch.setattr('app.services.asr.openai_compatible.httpx.AsyncClient', lambda **kwargs: original(transport=httpx.MockTransport(answer),**kwargs))
    assert await engine.transcribe(b'real-audio-bytes','audio/webm') == '识别后的工作材料'
    assert len(seen) == 1
