"""Authorized shared knowledge -> private summary -> own agent retrieval."""
import json
from types import SimpleNamespace

import pytest

from app.models.personal_knowledge import PersonalKnowledgeEntry
from app.models.wiki import ProjectWikiEntry


@pytest.mark.asyncio
async def test_authorized_saved_summary_is_used_only_by_its_owner_agent(async_client, db_session, seed_ids, monkeypatch):
    ids = seed_ids
    fact = 'PROJECTKBFLOW 已确认八项接口验收通过，另两项待复核。'
    page = ProjectWikiEntry(company_id=ids['company_id'], project_id=ids['project_id'],
        title='PROJECTKBFLOW 共享验收记录', body_text=fact, source='manual', created_by=ids['pm_user_id'])
    db_session.add(page)
    db_session.add(PersonalKnowledgeEntry(company_id=ids['company_id'], project_id=ids['project_id'],
        owner_user_id=ids['pm_user_id'], title='PROJECTKBFLOW 私人判断', body_text='PM_PRIVATE_MUST_NOT_SUMMARIZE'))
    await db_session.commit()
    base = f"/api/v1/projects/{ids['project_id']}/knowledge-space"
    grant = await async_client.put(base + f"/grants/{ids['member_user_id']}",
        headers=ids['pm_headers'], json={'can_summarize': True})
    assert grant.status_code == 200, grant.text

    prompts = []
    async def resolve(*args, **kwargs):
        return SimpleNamespace(provider='openai_compatible', source='user', use_for_agent=True, enabled=True, is_usable=lambda: True)
    async def completion(*args, **kwargs):
        prompts.append('\n'.join(str(item['content']) for item in kwargs['messages']))
        return {'ok': True, 'provider': 'openai_compatible', 'content': json.dumps({
            'title': 'PROJECTKBFLOW 接口验收学习',
            'points': [{'text': '八项通过，两项需复核。', 'page_id': page.id, 'quote': fact}],
        }, ensure_ascii=False)}
    import app.services.llm_settings as llm_settings
    monkeypatch.setattr(llm_settings, 'resolve_llm', resolve)
    monkeypatch.setattr(llm_settings, 'chat_completion', completion)
    response = await async_client.post(base + '/summaries', headers=ids['member_headers'],
        json={'page_ids': [page.id], 'instruction': '总结验收知识并保留未完成事项'})
    assert response.status_code == 200, response.text
    draft = response.json()['data']
    assert fact in '\n'.join(prompts)
    assert 'PM_PRIVATE_MUST_NOT_SUMMARIZE' not in '\n'.join(prompts)
    saved_body = draft['body_text'] + '\n我的复盘：PROJECTKBFLOW_PERSONAL_LESSON 复核条件必须逐项记录。'
    saved = await async_client.post(base + f"/summaries/{draft['id']}/save", headers=ids['member_headers'],
        json={'title': draft['title'], 'body_text': saved_body, 'tags': ['验收复盘']})
    assert saved.status_code == 200, saved.text
    entry = saved.json()['data']['entry']
    assert entry['source_type'] == 'project_summary'
    assert entry['source_id'] == draft['id']
    monkeypatch.setattr(llm_settings, 'resolve_llm', resolve)
    monkeypatch.setattr(llm_settings, 'chat_completion', completion)
    for headers, own in [(ids['member_headers'], True), (ids['pm_headers'], False)]:
        prompts.clear()
        chat = await async_client.post('/api/v1/agents/chat', headers=headers,
            json={'company_id': ids['company_id'], 'project_id': ids['project_id'], 'message': '解释 PROJECTKBFLOW 验收复盘'})
        assert chat.status_code == 200, chat.text
        prompt = '\n'.join(prompts)
        assert ('PROJECTKBFLOW_PERSONAL_LESSON' in prompt) == own
    detail = await async_client.get(base + f"/summaries/{draft['id']}", headers=ids['pm_headers'])
    assert detail.status_code == 404, 'Managers cannot read another person\'s summary draft'
