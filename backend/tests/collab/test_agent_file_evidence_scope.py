"""Only external LLM calls are stubbed; upload, extraction and scope checks are real."""
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models.evidence import EvidencePackage
from app.models.project import Project, ProjectMember
from app.services.extraction.service import extract_package


async def _upload(client, db, ids, *, headers, project_id, node_id, text):
    response = await client.post('/api/v1/evidence/files', headers=headers,
        data={'company_id': ids['company_id'], 'project_id': project_id},
        files={'file': ('notes.txt', text.encode(), 'text/plain')})
    assert response.status_code == 200, response.text
    file_id = response.json()['data']['file_id']
    response = await client.post(f'/api/v1/nodes/{node_id}/evidence', headers=headers,
        json={'summary_text': '附件说明，不包含附件中的事实', 'file_ids': [file_id]})
    assert response.status_code == 200, response.text
    package_id = response.json()['data'].get('package_id') or response.json()['data'].get('id')
    await extract_package(db, package_id, index_after_adopt=False)
    package = await db.get(EvidencePackage, package_id)
    package.status = 'submitted'
    await db.commit()
    return file_id


@pytest.mark.asyncio
@pytest.mark.parametrize('mode', ['chat', 'report'])
async def test_personal_agent_reads_private_file_body_in_own_project_only(async_client, db_session, seed_ids, monkeypatch, tmp_path, mode):
    monkeypatch.setattr(settings, 'COLLAB_OBJECT_ROOT', str(tmp_path))
    monkeypatch.setattr(settings, 'EXTRACTION_MODE', 'worker')
    ids = seed_ids
    own_fact = 'AURORA_OWN_FILE_BODY acceptance passed 7 of 9 checks'
    other_user_fact = 'AURORA_OTHER_USER_PRIVATE do not expose this draft'
    other_project_fact = 'AURORA_OTHER_PROJECT_PRIVATE do not expose this project'
    own_id = await _upload(async_client, db_session, ids, headers=ids['member_headers'],
        project_id=ids['project_id'], node_id=ids['node_id'], text=own_fact)
    await _upload(async_client, db_session, ids, headers=ids['pm_headers'],
        project_id=ids['project_id'], node_id=ids['node_id'], text=other_user_fact)

    # A second project is accessible to the same user, so membership alone cannot isolate it.
    from app.services.tree_service import TreeService
    foreign = Project(company_id=ids['company_id'], name='另一项目', pm_user_id=ids['pm_user_id'], created_by=ids['pm_user_id'], status='active')
    db_session.add(foreign)
    await db_session.flush()
    db_session.add_all([ProjectMember(project_id=foreign.id, user_id=ids['pm_user_id'], role='pm'), ProjectMember(project_id=foreign.id, user_id=ids['member_user_id'], role='member')])
    await db_session.flush()
    node = await TreeService().create_node(db_session, foreign, parent_id=None, node_type_key='person', title='外项目责任人', assignees=[{'user_id': ids['pm_user_id'], 'role_key': 'primary'}, {'user_id': ids['member_user_id'], 'role_key': 'primary'}])
    await db_session.commit()
    await _upload(async_client, db_session, ids, headers=ids['member_headers'], project_id=foreign.id, node_id=node.id, text=other_project_fact)

    captured = []
    async def model(*args, **kwargs):
        return SimpleNamespace(provider='openai_compatible', use_for_agent=True, source='test', is_usable=lambda: True)
    async def completion(*args, **kwargs):
        captured.append('\n'.join(str(item['content']) for item in kwargs['messages']))
        return {'ok': True, 'provider': 'openai_compatible', 'content': '已读取附件事实'}
    import app.services.llm_settings as llm_settings
    import app.services.hierarchical_reporting as reporting
    monkeypatch.setattr(llm_settings, 'resolve_llm', model)
    monkeypatch.setattr(llm_settings, 'chat_completion', completion)
    monkeypatch.setattr(reporting, 'resolve_llm', model)
    monkeypatch.setattr(reporting, 'chat_completion', completion)

    if mode == 'chat':
        response = await async_client.post('/api/v1/agents/chat', headers=ids['member_headers'], json={'company_id': ids['company_id'], 'project_id': ids['project_id'], 'message': '请核对 AURORA 附件的验收结论'})
    else:
        bindings = await async_client.post(f"/api/v1/projects/{ids['project_id']}/report-agents/bindings", headers=ids['pm_headers'], json={})
        assert bindings.status_code == 200, bindings.text
        response = await async_client.post('/api/v1/reports/generate', headers=ids['member_headers'], json={'project_id': ids['project_id']})
    assert response.status_code == 200, response.text
    prompt = '\n'.join(captured)
    assert own_fact in prompt, 'The model must receive extracted body text, not only caption or filename'
    assert other_user_fact not in prompt, 'Unapproved uploads of other users must remain private'
    assert other_project_fact not in prompt, 'Accessible projects still require separate contexts'
