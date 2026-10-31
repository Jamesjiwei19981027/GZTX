"""Real chat/DB integration; only the external model is replaced."""
from types import SimpleNamespace

import pytest

from app.models.project import Project, ProjectMember


@pytest.mark.asyncio
@pytest.mark.parametrize('long_body', [False, True])
async def test_chat_retrieves_only_own_current_project_wiki(async_client, db_session, seed_ids, monkeypatch, long_body):
    ids = seed_ids
    foreign = Project(company_id=ids['company_id'], name='另一私人空间',
        pm_user_id=ids['pm_user_id'], created_by=ids['pm_user_id'], status='active')
    db_session.add(foreign)
    await db_session.flush()
    db_session.add_all([
        ProjectMember(project_id=foreign.id, user_id=ids['pm_user_id'], role='pm'),
        ProjectMember(project_id=foreign.id, user_id=ids['member_user_id'], role='member'),
    ])
    await db_session.commit()
    own = 'WIKINEEDLE_MY_CURRENT_PROJECT 验收通过七项'
    other_user = 'WIKINEEDLE_OTHER_PERSON_SECRET'
    other_project = 'WIKINEEDLE_OTHER_PROJECT_SECRET'
    for project_id, headers, content in [
        (ids['project_id'], ids['member_headers'], own),
        (ids['project_id'], ids['pm_headers'], other_user),
        (foreign.id, ids['member_headers'], other_project),
    ]:
        response = await async_client.post(
            f'/api/v1/projects/{project_id}/personal-knowledge/entries', headers=headers,
            json={'title': 'WIKINEEDLE 验收知识',
                  'body_text': ('背景记录。' * 4000 if long_body else '') + content,
                  'tags': ['验收']})
        assert response.status_code == 200, response.text

    captured = []
    async def resolve(*args, **kwargs):
        return SimpleNamespace(provider='openai_compatible', use_for_agent=True,
            source='test', is_usable=lambda: True)
    async def completion(*args, **kwargs):
        captured.append('\n'.join(str(item['content']) for item in kwargs['messages']))
        return {'ok': True, 'provider': 'openai_compatible', 'content': '已读取个人知识'}
    import app.services.llm_settings as llm_settings
    monkeypatch.setattr(llm_settings, 'resolve_llm', resolve)
    monkeypatch.setattr(llm_settings, 'chat_completion', completion)
    response = await async_client.post('/api/v1/agents/chat', headers=ids['member_headers'],
        json={'company_id': ids['company_id'], 'project_id': ids['project_id'],
              'message': '请核对 WIKINEEDLE 验收知识'})
    assert response.status_code == 200, response.text
    prompt = '\n'.join(captured)
    assert own in prompt
    assert other_user not in prompt
    assert other_project not in prompt
