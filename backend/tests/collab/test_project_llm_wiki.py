import json
from copy import deepcopy
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.models.evidence import EvidencePackage
from app.models.tree import TreeNode
from app.models.wiki import ProjectWikiEntry


async def _material(db, ids, summary="开发已完成，验收未通过。"):
    row = EvidencePackage(company_id=ids["company_id"], project_id=ids["project_id"],
        node_id=ids["node_id"], submitter_user_id=ids["member_user_id"],
        status="adopted", summary_text=summary)
    db.add(row)
    await db.commit()
    return row


def _model(monkeypatch, *, quote="开发已完成，验收未通过。"):
    from app.services import project_wiki

    async def resolve(*args, **kwargs):
        return SimpleNamespace(provider="openai_compatible", model="fixture", use_for_agent=True,
                               is_usable=lambda: True)

    async def completion(*args, **kwargs):
        # External model only is replaced; parsing, grounding, persistence and ACL are real.
        source = json.loads(kwargs["messages"][-1]["content"])["source"]
        return {"ok": True, "content": json.dumps({"pages": [{"topic": "work", "title": "交付状态",
            "facts": [{"text": "开发完成，但验收仍待处理。", "source_id": source["id"], "quote": quote}]}]})}

    monkeypatch.setattr(project_wiki, "resolve_llm", resolve)
    monkeypatch.setattr(project_wiki, "chat_completion", completion)


@pytest.mark.asyncio
async def test_catalog_forbids_nonmember(async_client, seed_ids):
    res = await async_client.get(f'/api/v1/projects/{seed_ids["project_id"]}/llm-wiki', headers=seed_ids["outsider_headers"])
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_missing_model_does_not_create_fake_draft(async_client, db_session, seed_ids):
    pkg = await _material(db_session, seed_ids)
    res = await async_client.post(f'/api/v1/projects/{pkg.project_id}/llm-wiki/drafts',
        headers=seed_ids["member_headers"], json={"package_id": pkg.id})
    assert res.status_code == 409
    assert "模型" in res.json()["detail"]
    assert not (await db_session.execute(select(ProjectWikiEntry).where(ProjectWikiEntry.source == "llm_wiki_draft"))).scalars().all()


@pytest.mark.asyncio
async def test_grounded_draft_is_private_then_publish_preserves_progress(async_client, db_session, seed_ids, monkeypatch):
    _model(monkeypatch)
    pkg = await _material(db_session, seed_ids)
    before = deepcopy((await db_session.get(TreeNode, pkg.node_id)).progress_json)
    base = f'/api/v1/projects/{pkg.project_id}/llm-wiki'
    res = await async_client.post(base+'/drafts', headers=seed_ids["member_headers"], json={"package_id": pkg.id})
    assert res.status_code == 200, res.text
    draft = res.json()["data"]
    assert draft["proposals"][0]["facts"][0]["quote"] == "开发已完成，验收未通过。"
    denied = await async_client.post(base+f'/drafts/{draft["id"]}/publish', headers=seed_ids["member_headers"])
    assert denied.status_code == 403
    published = await async_client.post(base+f'/drafts/{draft["id"]}/publish', headers=seed_ids["pm_headers"])
    assert published.status_code == 200, published.text
    again = await async_client.post(base+f'/drafts/{draft["id"]}/publish', headers=seed_ids["pm_headers"])
    assert again.status_code == 200
    await db_session.refresh(await db_session.get(TreeNode, pkg.node_id))
    assert (await db_session.get(TreeNode, pkg.node_id)).progress_json == before
    catalog = (await async_client.get(base, headers=seed_ids["member_headers"])).json()["data"]
    assert len(catalog["pages"]) == 1
    assert catalog["drafts"] == []
    assert catalog["pages"][0]["meta"]["facts"][0]["package_id"] == pkg.id


@pytest.mark.asyncio
async def test_invalid_quote_is_not_saved(async_client, db_session, seed_ids, monkeypatch):
    _model(monkeypatch, quote="全部验收通过")
    pkg = await _material(db_session, seed_ids)
    res = await async_client.post(f'/api/v1/projects/{pkg.project_id}/llm-wiki/drafts',
        headers=seed_ids["member_headers"], json={"package_id": pkg.id})
    assert res.status_code == 422
    assert not (await db_session.execute(select(ProjectWikiEntry))).scalars().all()


@pytest.mark.asyncio
async def test_superseded_source_cannot_publish(async_client, db_session, seed_ids, monkeypatch):
    _model(monkeypatch)
    pkg = await _material(db_session, seed_ids)
    base = f'/api/v1/projects/{pkg.project_id}/llm-wiki'
    draft = (await async_client.post(base+'/drafts', headers=seed_ids["pm_headers"], json={"package_id": pkg.id})).json()["data"]
    pkg.status = "superseded"
    await db_session.commit()
    res = await async_client.post(base+f'/drafts/{draft["id"]}/publish', headers=seed_ids["pm_headers"])
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_two_drafts_do_not_overwrite_concurrent_revision(async_client, db_session, seed_ids, monkeypatch):
    _model(monkeypatch)
    pkg = await _material(db_session, seed_ids)
    base = f'/api/v1/projects/{pkg.project_id}/llm-wiki'
    drafts = []
    for _ in range(2):
        response = await async_client.post(base+'/drafts', headers=seed_ids["pm_headers"], json={"package_id": pkg.id})
        assert response.status_code == 200, response.text
        drafts.append(response.json()["data"]["id"])
    first = await async_client.post(base+f'/drafts/{drafts[0]}/publish', headers=seed_ids["pm_headers"])
    assert first.status_code == 200
    stale = await async_client.post(base+f'/drafts/{drafts[1]}/publish', headers=seed_ids["pm_headers"])
    assert stale.status_code == 409


@pytest.mark.asyncio
async def test_drafts_never_enter_shared_index(db_session, seed_ids):
    from app.models.knowledge import KnowledgeChunk
    from app.services.knowledge.indexer import index_wiki_entry

    row = ProjectWikiEntry(company_id=seed_ids['company_id'], project_id=seed_ids['project_id'],
        title='私人草稿', body_text='未经确认的私人材料内容', source='llm_wiki_draft',
        created_by=seed_ids['pm_user_id'])
    db_session.add(row)
    await db_session.flush()
    assert await index_wiki_entry(db_session, row) == 0
    assert not (await db_session.execute(select(KnowledgeChunk))).scalars().all()


@pytest.mark.asyncio
async def test_private_draft_hidden_from_other_member_and_legacy_api(async_client, db_session, seed_ids, monkeypatch):
    _model(monkeypatch)
    pkg = await _material(db_session, seed_ids)
    base = f'/api/v1/projects/{pkg.project_id}/llm-wiki'
    response = await async_client.post(base+'/drafts', headers=seed_ids['pm_headers'], json={'package_id': pkg.id})
    draft_id = response.json()['data']['id']
    catalog = await async_client.get(base, headers=seed_ids['member_headers'])
    assert catalog.json()['data']['drafts'] == []
    legacy = await async_client.get(f'/api/v1/projects/{pkg.project_id}/wiki', headers=seed_ids['member_headers'])
    assert legacy.json()['data']['items'] == []
    direct = await async_client.get(f'/api/v1/wiki/{draft_id}', headers=seed_ids['member_headers'])
    assert direct.status_code == 403
    foreign = await async_client.post('/api/v1/projects/999999/llm-wiki/drafts',
        headers=seed_ids['pm_headers'], json={'package_id': pkg.id})
    assert foreign.status_code == 404


@pytest.mark.asyncio
async def test_second_material_merges_without_losing_first(async_client, db_session, seed_ids, monkeypatch):
    base = f'/api/v1/projects/{seed_ids["project_id"]}/llm-wiki'
    for quote in ['开发已完成，验收未通过。', '验收整改已完成，请再次复核。']:
        _model(monkeypatch, quote=quote)
        pkg = await _material(db_session, seed_ids, summary=quote)
        response = await async_client.post(base+'/drafts', headers=seed_ids['pm_headers'], json={'package_id': pkg.id})
        assert response.status_code == 200, response.text
        published = await async_client.post(base+f'/drafts/{response.json()["data"]["id"]}/publish', headers=seed_ids['pm_headers'])
        assert published.status_code == 200, published.text
    catalog = (await async_client.get(base, headers=seed_ids['member_headers'])).json()['data']
    assert len(catalog['pages']) == 1
    assert catalog['pages'][0]['meta']['revision'] == 2
    assert [f['quote'] for f in catalog['pages'][0]['meta']['facts']] == ['开发已完成，验收未通过。', '验收整改已完成，请再次复核。']


def test_long_material_keeps_last_segment_and_line_locations():
    from app.services.project_wiki import source_parts, parse_proposals
    full = ('前段材料\n' * 2600) + '最终结论：暂缓验收。'
    source = {'id': 'note:1', 'name': '提交说明', 'text': full}
    parts = source_parts([source])
    assert ''.join(p['text'] for p in parts) == full
    last = parts[-1]
    content = json.dumps({'pages': [{'topic': 'risks', 'facts': [{'text': '暂缓验收',
        'quote': '最终结论：暂缓验收。', 'source_id': last['id']}]}]})
    proposal = parse_proposals(content, {**last, 'full_text': full}, SimpleNamespace(id=1), SimpleNamespace(id=2, title='工作'))
    assert proposal[0]['facts'][0]['line_start'] == 2601


@pytest.mark.asyncio
async def test_real_docx_material_generates_grounded_draft_without_vectors(async_client, db_session, seed_ids, monkeypatch, tmp_path):
    from io import BytesIO
    from zipfile import ZipFile
    from app.core.config import settings
    from app.models.knowledge import KnowledgeChunk
    from app.services.evidence_service import save_upload_file
    from app.services.knowledge import indexer

    monkeypatch.setattr(settings, 'COLLAB_OBJECT_ROOT', str(tmp_path / 'objects'))
    async def forbidden_embedding(*args, **kwargs):
        raise AssertionError('LLM Wiki must not call an embedding model')
    monkeypatch.setattr(indexer, 'embed_texts', forbidden_embedding)
    quote = '材料结论：接口尚未验收。'
    _model(monkeypatch, quote=quote)
    stream = BytesIO()
    with ZipFile(stream, 'w') as doc:
        doc.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
        doc.writestr('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        doc.writestr('word/document.xml', f'<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>{quote}</w:t></w:r></w:p></w:body></w:document>')
    file = await save_upload_file(db_session, user_id=seed_ids['member_user_id'], filename='接口交付.docx',
        content=stream.getvalue(), mime_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        company_id=seed_ids['company_id'], project_id=seed_ids['project_id'])
    pkg = await _material(db_session, seed_ids, summary='')
    file.package_id = pkg.id
    await db_session.commit()
    response = await async_client.post(f'/api/v1/projects/{pkg.project_id}/llm-wiki/drafts',
        headers=seed_ids['member_headers'], json={'package_id': pkg.id})
    assert response.status_code == 200, response.text
    fact = response.json()['data']['proposals'][0]['facts'][0]
    assert fact['source_id'] == f'file:{file.id}'
    assert fact['quote'] == quote
    assert not (await db_session.execute(select(KnowledgeChunk))).scalars().all()


@pytest.mark.asyncio
async def test_materials_and_drafts_cannot_cross_accessible_projects(async_client, db_session, seed_ids, monkeypatch):
    from app.models.company import Company
    from app.services.project_service import ProjectService

    _model(monkeypatch)
    pkg = await _material(db_session, seed_ids)
    base = f'/api/v1/projects/{pkg.project_id}/llm-wiki'
    draft_response = await async_client.post(base+'/drafts', headers=seed_ids['pm_headers'], json={'package_id': pkg.id})
    draft_id = draft_response.json()['data']['id']
    service = ProjectService()
    other = await service.create_project(db_session,
        company=await db_session.get(Company, seed_ids['company_id']), name='另一项目', creator_user_id=seed_ids['admin_user_id'])
    await service.assign_pm(db_session, other, seed_ids['pm_user_id'])
    await db_session.commit()
    other_base = f'/api/v1/projects/{other.id}/llm-wiki'
    catalog = await async_client.get(other_base, headers=seed_ids['pm_headers'])
    assert catalog.status_code == 200
    assert catalog.json()['data']['materials'] == []
    assert catalog.json()['data']['drafts'] == []
    generate = await async_client.post(other_base+'/drafts', headers=seed_ids['pm_headers'], json={'package_id': pkg.id})
    assert generate.status_code == 404
    publish = await async_client.post(other_base+f'/drafts/{draft_id}/publish', headers=seed_ids['pm_headers'])
    assert publish.status_code == 404
