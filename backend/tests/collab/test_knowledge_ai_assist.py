"""AI relationships remain owner-private, cited and explicitly confirmed."""
import json
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.models.personal_knowledge import PersonalKnowledgeEntry, PersonalKnowledgeLink


def url(ids, suffix):
    return f"/api/v1/projects/{ids['project_id']}/personal-knowledge{suffix}"


async def notes(db, ids):
    rows = [PersonalKnowledgeEntry(company_id=ids['company_id'], project_id=ids['project_id'],
        owner_user_id=owner, title=title, body_text=body) for owner, title, body in [
        (ids['member_user_id'], 'Release checklist', 'Delivery requires acceptance evidence.'),
        (ids['member_user_id'], 'Acceptance notes', 'Acceptance evidence includes test results.'),
        (ids['pm_user_id'], 'Private leader note', 'OTHER_OWNER_SECRET')]]
    db.add_all(rows)
    await db.commit()
    return rows


def model(monkeypatch, rows, *, wrong=False, after=None):
    calls = []
    async def resolve(db, **kwargs):
        return SimpleNamespace(provider='openai_compatible', is_usable=lambda: True, use_for_agent=True, enabled=True)
    async def complete(llm, **kwargs):
        calls.append(kwargs['messages'])
        if after:
            await after()
        return {'ok': True, 'content': json.dumps({'suggestions': [{
            'source_entry_id': rows[0].id, 'target_entry_id': rows[2 if wrong else 1].id,
            'label': 'acceptance prerequisite', 'reason': 'Both discuss acceptance evidence.',
            'source_quote': 'acceptance evidence', 'target_quote': 'Acceptance evidence'}]})}
    monkeypatch.setattr('app.services.llm_settings.resolve_llm', resolve)
    monkeypatch.setattr('app.services.llm_settings.chat_completion', complete)
    return calls


@pytest.mark.asyncio
async def test_ai_suggestions_read_only_then_confirm_idempotently(async_client, db_session, seed_ids, monkeypatch):
    ids = seed_ids
    rows = await notes(db_session, ids)
    calls = model(monkeypatch, rows)
    response = await async_client.post(url(ids, '/assist'), headers=ids['member_headers'], json={})
    assert response.status_code == 200, response.text
    suggestions = response.json()['data']['suggestions']
    assert len(suggestions) == 1
    assert 'OTHER_OWNER_SECRET' not in json.dumps(calls)
    assert (await db_session.execute(select(PersonalKnowledgeLink))).scalars().all() == []
    for expected_created in [1, 0]:
        applied = await async_client.post(url(ids, '/assist/apply'), headers=ids['member_headers'], json={'suggestions': suggestions})
        assert applied.status_code == 200, applied.text
        assert applied.json()['data']['created'] == expected_created
    assert len((await db_session.execute(select(PersonalKnowledgeLink))).scalars().all()) == 1


@pytest.mark.asyncio
async def test_ai_cannot_cite_other_owner_or_invent_relationship(async_client, db_session, seed_ids, monkeypatch):
    rows = await notes(db_session, seed_ids)
    model(monkeypatch, rows, wrong=True)
    response = await async_client.post(url(seed_ids, '/assist'), headers=seed_ids['member_headers'], json={})
    assert response.status_code == 422, response.text
    assert (await db_session.execute(select(PersonalKnowledgeLink))).scalars().all() == []


@pytest.mark.asyncio
async def test_changed_sources_and_other_owner_confirmation_rejected(async_client, db_session, seed_ids, monkeypatch):
    ids = seed_ids
    rows = await notes(db_session, ids)
    model(monkeypatch, rows)
    generated = await async_client.post(url(ids, '/assist'), headers=ids['member_headers'], json={})
    assert generated.status_code == 200, generated.text
    body = {'suggestions': generated.json()['data']['suggestions']}
    denied = await async_client.post(url(ids, '/assist/apply'), headers=ids['pm_headers'], json=body)
    assert denied.status_code == 404, denied.text
    rows[0].body_text += ' Updated after AI read.'
    await db_session.commit()
    changed = await async_client.post(url(ids, '/assist/apply'), headers=ids['member_headers'], json=body)
    assert changed.status_code == 409, changed.text
    assert (await db_session.execute(select(PersonalKnowledgeLink))).scalars().all() == []


@pytest.mark.asyncio
async def test_ai_unconfigured_preserves_notes_and_does_not_fabricate(async_client, db_session, seed_ids, monkeypatch):
    await notes(db_session, seed_ids)
    async def resolve(db, **kwargs):
        return SimpleNamespace(provider='fake', is_usable=lambda: True, use_for_agent=True, enabled=True)
    monkeypatch.setattr('app.services.llm_settings.resolve_llm', resolve)
    response = await async_client.post(url(seed_ids, '/assist'), headers=seed_ids['member_headers'], json={})
    assert response.status_code == 409, response.text
    assert len((await db_session.execute(select(PersonalKnowledgeEntry))).scalars().all()) == 3
