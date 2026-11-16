"""审计权限、存档隔离与真实模型调用契约。"""
import json
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio

from app.core.security import create_access_token
from app.models.project import Project
from app.models.tree import TreeNode
from app.services.tree_service import TreeService
from .conftest import _make_user


@pytest_asyncio.fixture
async def audit_tree(db_session, seed_ids):
    from app.models.company import CompanyMembership
    t = TreeService()
    p = await db_session.get(Project, seed_ids['project_id'])
    root = await db_session.get(TreeNode, seed_ids['root_node_id'])
    people, headers = [root], [seed_ids['member_headers']]
    for level in range(2, 5):
        u = await _make_user(db_session, f'level{level}')
        db_session.add(CompanyMembership(company_id=p.company_id, user_id=u.id, status='active', employment_status='active'))
        person = await t.create_node(db_session, p, parent_id=people[-1].id,
            node_type_key='person', title=f'第{level}层人员', assignees=[{'user_id': u.id}])
        people.append(person)
        headers.append({'Authorization': 'Bearer ' + create_access_token(data={'sub': u.id})})
        await t.create_node(db_session, p, parent_id=person.id, node_type_key='work_item', title=f'事项{level}')
    await db_session.commit()
    return p.id, people, headers


@pytest.mark.parametrize('actor,scope,expected', [
    ('pm', 'project', 200), ('org_leader', 'project', 200),
    ('member', 'project', 403), ('outsider', 'self', 403), ('member', 'self', 200),
])
async def test_scope_matrix(async_client, seed_ids, actor, scope, expected):
    r = await async_client.post(f'/api/v1/projects/{seed_ids["project_id"]}/audits',
        headers=seed_ids[f'{actor}_headers'], json={'scope': scope})
    assert r.status_code == expected, r.text
    if expected == 200:
        d = r.json()['data']
        assert d['mode'] == 'rule'
        assert d['id'] > 0


async def test_leaders_default_switch_and_descendants(async_client, audit_tree, seed_ids):
    p, people, headers = audit_tree
    url = f'/api/v1/projects/{p}'
    for level, expected in ((0, 200), (1, 200), (2, 403)):
        r = await async_client.post(url + '/audits', headers=headers[level],
            json={'scope': 'node', 'node_id': people[-1].id})
        assert r.status_code == expected, r.text
    # 第三层本人仍可审自己；开关不剥夺个人权利。
    r = await async_client.post(url + '/audits', headers=headers[2], json={'scope': 'self'})
    assert {n['node_id'] for n in r.json()['data']['nodes']} == {people[2].id}
    permission = url + f'/nodes/{people[2].id}/audit-permission'
    r = await async_client.put(permission, headers=headers[2], json={'allow_audit_subordinates': True})
    assert r.status_code == 403
    r = await async_client.put(permission, headers=seed_ids['pm_headers'], json={'allow_audit_subordinates': True})
    assert r.status_code == 200, r.text
    r = await async_client.post(url + '/audits', headers=headers[2], json={'scope': 'node', 'node_id': people[2].id})
    assert {n['node_id'] for n in r.json()['data']['nodes']} == {people[2].id, people[3].id}
    await async_client.put(permission, headers=seed_ids['pm_headers'], json={'allow_audit_subordinates': False})
    r = await async_client.post(url + '/audits', headers=headers[2], json={'scope': 'node', 'node_id': people[2].id})
    assert r.status_code == 403
    # 上级已获得的整棵子树权限不会被下级自己的开关截断。
    r = await async_client.post(url + '/audits', headers=headers[0], json={'scope': 'node', 'node_id': people[0].id})
    assert len(r.json()['data']['nodes']) == 4


async def test_archive_recipient_projection(async_client, audit_tree, seed_ids):
    p, people, headers = audit_tree
    url = f'/api/v1/projects/{p}/audits'
    r = await async_client.post(url, headers=seed_ids['pm_headers'], json={'scope': 'project', 'custom_instruction': '保密的管理要求'})
    assert r.status_code == 200, r.text
    audit_id = r.json()['data']['id']
    for path in (url, url + f'/{audit_id}'):
        r = await async_client.get(path, headers=headers[2])
        assert r.status_code == 200, r.text
        d = r.json()['data']
        if 'items' in d:
            d = d['items'][0]
        assert {n['node_id'] for n in d['nodes']} == {people[2].id}
        assert d.get('custom_instruction') is None
        assert d.get('node_id') is None
        assert d['restricted'] is True
        assert '保密的管理要求' not in json.dumps(d, ensure_ascii=False)
    r = await async_client.get(url + f'/{audit_id}', headers=seed_ids['outsider_headers'])
    assert r.status_code == 403


@pytest.mark.parametrize('reply,mode,reason', [
    ('bad JSON', 'rule', 'invalid_model_result'),
    (json.dumps({'overall_risk': 'high', 'nodes': []}), 'rule', 'invalid_model_result'),
])
async def test_bad_model_falls_back(async_client, seed_ids, monkeypatch, reply, mode, reason):
    from app.services import axis_audit as service
    from app.services.llm_settings import ResolvedLlm
    async def resolve(*args, **kwargs):
        return ResolvedLlm('ollama', 'http://unused', 'test', '', source='company')
    async def complete(*args, **kwargs):
        return {'ok': True, 'content': reply}
    monkeypatch.setattr(service, 'llm_from_company', resolve)
    monkeypatch.setattr(service, 'chat_completion', complete)
    r = await async_client.post(f'/api/v1/projects/{seed_ids["project_id"]}/audits',
        headers=seed_ids['pm_headers'], json={'scope': 'project'})
    assert r.status_code == 200, r.text
    assert r.json()['data']['mode'] == mode
    assert r.json()['data']['fallback_reason'] == reason


async def test_real_model_input_and_out_of_scope_ids(async_client, seed_ids, db_session, monkeypatch):
    from app.services import axis_audit as service
    from app.services.llm_settings import ResolvedLlm
    from app.models.evidence import EvidencePackage, EvidenceFile
    from app.models.knowledge import EvidenceFileText
    person_id, matter_id = seed_ids['root_node_id'], seed_ids['node_id']
    package = EvidencePackage(company_id=seed_ids['company_id'], project_id=seed_ids['project_id'],
        node_id=matter_id, submitter_user_id=seed_ids['member_user_id'], summary_text='材料摘要', status='submitted')
    db_session.add(package)
    await db_session.flush()
    file = EvidenceFile(package_id=package.id, storage_key='test', original_name='交付说明.txt')
    db_session.add(file)
    await db_session.flush()
    db_session.add(EvidenceFileText(evidence_file_id=file.id, company_id=seed_ids['company_id'], project_id=seed_ids['project_id'], text_md='已抽取的交付正文'))
    await db_session.commit()
    calls = []
    async def company(*args, **kwargs):
        calls.append('company')
        return ResolvedLlm('ollama', 'http://unused', 'test', '', source='company')
    async def personal(*args, **kwargs):
        assert kwargs['user'].id == seed_ids['member_user_id']
        calls.append('personal')
        return ResolvedLlm('ollama', 'http://unused', 'mine', '', source='user')
    async def complete(llm, **kwargs):
        prompt = kwargs['messages'][-1]['content']
        assert '已抽取的交付正文' in prompt
        assert '交付说明.txt' in prompt
        return {'ok': True, 'content': json.dumps({'overall_risk': 'high', 'nodes': [
            {'node_id': person_id, 'risk_level': 'medium', 'summary': '需要核验材料', 'findings': [
                {'type': '言行不符', 'description': '核验材料', 'matter_ids': [matter_id]},
                {'type': '进度风险', 'description': '越界发现', 'matter_ids': [999999]},
            ], 'suggested_actions': ['核验交付']},
            {'node_id': 999999, 'risk_level': 'high', 'summary': '越界人员', 'findings': [], 'suggested_actions': []},
        ]}, ensure_ascii=False)}
    monkeypatch.setattr(service, 'llm_from_company', company)
    monkeypatch.setattr(service, 'resolve_llm', personal)
    monkeypatch.setattr(service, 'chat_completion', complete)
    for body, source in (({'scope': 'self'}, 'company'), ({'scope': 'self', 'custom_instruction': '检查交付'}, 'personal')):
        r = await async_client.post(f'/api/v1/projects/{seed_ids["project_id"]}/audits', headers=seed_ids['member_headers'], json=body)
        assert r.status_code == 200, r.text
        d = r.json()['data']
        assert d['mode'] == 'ai'
        assert d['model_source'] == source
        assert [n['node_id'] for n in d['nodes']] == [person_id]
        assert '999999' not in json.dumps(d['nodes'])
        assert len(d['nodes'][0]['findings']) == 1
    assert calls == ['company', 'personal']


async def test_rules_dates_and_legacy_scope(async_client, seed_ids, db_session):
    matter = await db_session.get(TreeNode, seed_ids['node_id'])
    matter.due_at = datetime.now(timezone.utc) - timedelta(days=2)
    matter.progress_json = {'status': 'blocked', 'percent': 15, 'updated_at': (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()}
    await db_session.commit()
    r = await async_client.post(f'/api/v1/projects/{seed_ids["project_id"]}/axis-audit', headers=seed_ids['member_headers'], json={})
    assert r.status_code == 200, r.text
    d = r.json()['data']
    assert d['scope'] == 'self'
    assert d['mode'] == 'rule'
    assert d['overall_risk'] == 'high'
    text = json.dumps(d, ensure_ascii=False)
    assert '逾期' in text and '阻塞' in text and '无进展' in text


async def test_validation_and_company_admin_not_manager(async_client, seed_ids, db_session):
    p = await db_session.get(Project, seed_ids['project_id'])
    p.created_by = seed_ids['pm_user_id']
    await db_session.commit()
    url = f'/api/v1/projects/{p.id}/audits'
    r = await async_client.post(url, headers=seed_ids['org_leader_headers'], json={'scope': 'project'})
    assert r.status_code == 403
    for body in ({'scope': 'node'}, {'scope': 'self', 'node_id': 1}, {'scope': 'self', 'custom_instruction': '字' * 501}):
        r = await async_client.post(url, headers=seed_ids['member_headers'], json=body)
        assert r.status_code == 422
    r = await async_client.get(f'/api/v1/projects/{p.id}/audit-options', headers=seed_ids['member_headers'])
    assert r.status_code == 200, r.text
    assert r.json()['data']['can_manage'] is False


async def test_model_wait_rechecks_permission(async_client, audit_tree, seed_ids, db_session, monkeypatch):
    from app.services import axis_audit as service
    from app.services.llm_settings import ResolvedLlm
    p, people, headers = audit_tree
    async def company(*args, **kwargs):
        return ResolvedLlm('ollama', 'http://unused', 'test', '', source='company')
    async def complete(*args, **kwargs):
        root = await db_session.get(TreeNode, people[0].id)
        root.allow_audit_subordinates = False
        await db_session.commit()
        return {'ok': False}
    monkeypatch.setattr(service, 'llm_from_company', company)
    monkeypatch.setattr(service, 'chat_completion', complete)
    r = await async_client.post(f'/api/v1/projects/{p}/audits', headers=headers[0],
        json={'scope': 'node', 'node_id': people[0].id})
    assert r.status_code == 403, r.text


def test_recipient_workload_has_no_peer_totals():
    from types import SimpleNamespace
    from app.services.axis_audit import project_result
    row = SimpleNamespace(id=1, project_id=1, initiator_user_id=2, scope='project', node_id=None,
        custom_instruction='private', mode='rule', model_source=None, created_at=datetime.now(timezone.utc),
        result_json={'mode_message': '规则检查', 'nodes': [
            {'node_id': 1, 'title': '自己', 'risk_level': 'medium', 'summary': '名下0项', 'subject_user_ids': [1],
             'findings': [{'type': '工作量', 'description': '名下 0 项，范围内人均 9.0 项', 'matter_ids': []}], 'suggested_actions': []}]})
    assert project_result(row, 1) is None, '缺少独立收件人快照时必须关闭回退，不能重用全局 AI 文本'
    assert '9.0' in json.dumps(project_result(row, 2))


async def test_recipient_ai_is_generated_from_isolated_material(async_client, audit_tree, seed_ids, monkeypatch):
    from app.services import axis_audit as service
    from app.services.llm_settings import ResolvedLlm
    p, people, headers = audit_tree
    isolated_ids = []
    async def company(*args, **kwargs):
        return ResolvedLlm('ollama', 'http://unused', 'test', '', source='company')
    async def complete(*args, **kwargs):
        payload = json.loads(kwargs['messages'][-1]['content'])
        isolated = 'person' in payload
        if isolated:
            assert '管理秘密' not in kwargs['messages'][-1]['content']
            current = payload['person']
            isolated_ids.append(current['node_id'])
            assert all(other.title not in kwargs['messages'][-1]['content'] for other in people if other.id != current['node_id'])
            input_people = [current]
        else:
            input_people = payload['people']
        return {'ok': True, 'content': json.dumps({'overall_risk': 'medium', 'nodes': [
            {'node_id': row['node_id'], 'risk_level': 'medium', 'summary': '本人材料待核验' if isolated else '管理秘密和其他人的问题',
             'findings': [], 'suggested_actions': []} for row in input_people]}, ensure_ascii=False)}
    monkeypatch.setattr(service, 'llm_from_company', company)
    # 自定义解析仍必须选择用户配置；本测试固定到同一个受控模型。
    monkeypatch.setattr(service, 'resolve_llm', company)
    monkeypatch.setattr(service, 'chat_completion', complete)
    url = f'/api/v1/projects/{p}/audits'
    r = await async_client.post(url, headers=seed_ids['pm_headers'], json={'scope': 'project', 'custom_instruction': '管理秘密'})
    assert r.status_code == 200, r.text
    audit_id = r.json()['data']['id']
    assert len(isolated_ids) == 4
    r = await async_client.get(url + f'/{audit_id}', headers=headers[2])
    text = json.dumps(r.json(), ensure_ascii=False)
    assert '管理秘密' not in text and '其他人的问题' not in text
    assert '本人材料待核验' in text
    assert r.json()['data']['mode'] == 'ai'


async def test_report_rollup_and_evidence_budget_do_not_break_scope(seed_ids, db_session):
    from app.services import axis_audit as service
    from app.models.agent import AgentDefinition
    from app.models.report import AgentReport, ProjectAgentBinding, AgentReportSource
    from app.models.evidence import EvidencePackage
    project = await db_session.get(Project, seed_ids['project_id'])
    definition = AgentDefinition(company_id=project.company_id, name='审计测试')
    db_session.add(definition)
    await db_session.flush()
    binding = ProjectAgentBinding(company_id=project.company_id, project_id=project.id,
        user_id=seed_ids['member_user_id'], agent_definition_id=definition.id)
    db_session.add(binding)
    await db_session.flush()
    for payload, summary in (({'rollup': True}, '下属保密汇总'), ({}, '本人进展摘要')):
        report = AgentReport(company_id=project.company_id, project_id=project.id, binding_id=binding.id,
            author_user_id=seed_ids['member_user_id'], summary_text=summary, payload_json=payload, status='submitted')
        db_session.add(report)
        await db_session.flush()
        db_session.add(AgentReportSource(report_id=report.id, source_type='tree_node', source_id=seed_ids['node_id']))
    tree = await service.load_tree(db_session, project.id)
    people = tree.owned(seed_ids['member_user_id'])
    own_matter = await db_session.get(TreeNode, seed_ids['node_id'])
    own_matter.progress_json = {'status': 'done', 'percent': 100}
    # 最老的有效材料不能被全局最新 800 条正文预算挤掉。
    db_session.add(EvidencePackage(company_id=project.company_id, project_id=project.id,
        node_id=own_matter.id, submitter_user_id=seed_ids['member_user_id'], status='submitted'))
    await db_session.flush()
    for i in range(801):
        db_session.add(EvidencePackage(company_id=project.company_id, project_id=project.id,
            node_id=people[0].id, submitter_user_id=seed_ids['member_user_id'], status='submitted'))
    await db_session.flush()
    await db_session.refresh(own_matter)
    matter_map, counts, inputs = await service.materials(db_session, project, tree, people)
    assert counts[own_matter.id] == 1
    assert '下属保密汇总' not in json.dumps(inputs, ensure_ascii=False)
    assert '本人进展摘要' in json.dumps(inputs, ensure_ascii=False)
    rules = service.rule_result(project, tree, people, matter_map, counts)
    assert not any(f['type'] == '言行不符' for n in rules for f in n['findings'])


async def test_fake_model_and_cross_project(async_client, seed_ids, monkeypatch):
    from app.services import axis_audit as service
    from app.services.llm_settings import ResolvedLlm
    async def fake(*args, **kwargs):
        return ResolvedLlm('fake', '', 'fake', '', source='company')
    async def forbidden(*args, **kwargs):
        pytest.fail('fake 不得调用模型')
    monkeypatch.setattr(service, 'llm_from_company', fake)
    monkeypatch.setattr(service, 'chat_completion', forbidden)
    url = f'/api/v1/projects/{seed_ids["project_id"]}'
    r = await async_client.post(url + '/audits', headers=seed_ids['pm_headers'], json={'scope': 'project'})
    d = r.json()['data']
    assert d['mode'] == 'rule' and d['mode_message'] == '未配置 AI，以下为规则检查'
    r = await async_client.post(url + '/audits', headers=seed_ids['pm_headers'], json={'scope': 'node', 'node_id': 999999})
    assert r.status_code == 403
    r = await async_client.get(f'/api/v1/projects/999999/audits/{d["id"]}', headers=seed_ids['pm_headers'])
    assert r.status_code == 404


def test_incremental_audit_migration(tmp_path, monkeypatch):
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import create_engine, inspect, text
    url = 'sqlite:///' + (tmp_path / 'audit-migration.db').as_posix()
    monkeypatch.setenv('DATABASE_URL', url)
    engine = create_engine(url)
    with engine.begin() as conn:
        for table in ('projects', 'tree_nodes', 'companies', 'users'):
            conn.execute(text(f'CREATE TABLE {table} (id INTEGER PRIMARY KEY)'))
        conn.execute(text('INSERT INTO tree_nodes (id) VALUES (1)'))
    cfg = Config('alembic.ini')
    command.stamp(cfg, 'fs7a8b9c0d1e')
    command.upgrade(cfg, 'head')
    assert 'audit_runs' in inspect(engine).get_table_names()
    with engine.connect() as conn:
        assert conn.execute(text('SELECT allow_audit_subordinates FROM tree_nodes')).scalar() is None
    command.downgrade(cfg, 'fs7a8b9c0d1e')
    assert 'audit_runs' not in inspect(engine).get_table_names()
    assert 'allow_audit_subordinates' not in {c['name'] for c in inspect(engine).get_columns('tree_nodes')}
    engine.dispose()
