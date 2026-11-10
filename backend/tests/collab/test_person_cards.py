"""卡片数据契约、严格权限与跨项目隔离。"""
import pytest
from sqlalchemy import select

from app.models.audit import AuditLog
from app.models.project import Project
from app.models.tree import TreeNode
from app.services.tree_service import TreeService


@pytest.mark.parametrize('actor,expected', [('pm', 200), ('org_leader', 200), ('member', 403), ('outsider', 403)])
async def test_template_permissions(async_client, seed_ids, actor, expected):
    p = seed_ids['project_id']
    r = await async_client.put(f'/api/v1/projects/{p}/card-template', headers=seed_ids[f'{actor}_headers'], json={'fields': ['name'], 'density': 'compact', 'color': 'ink'})
    assert r.status_code == expected, r.text
    if expected == 200:
        for path in (f'/projects/{p}', f'/projects/{p}/tree'):
            data = (await async_client.get('/api/v1' + path, headers=seed_ids['member_headers'])).json()['data']
            assert data['card_template_json']['fields'] == ['name']


@pytest.mark.parametrize('actor,expected', [('pm', 200), ('org_leader', 200), ('member', 200), ('outsider', 403)])
async def test_style_permissions_and_audit(async_client, seed_ids, db_session, actor, expected):
    p, n = seed_ids['project_id'], seed_ids['root_node_id']
    body = {'color': 'sage', 'tags': [{'text': '驻场', 'color': 'ochre'}], 'custom_fields': [{'key': '地点', 'value': '上海'}], 'fields': []}
    r = await async_client.put(f'/api/v1/projects/{p}/nodes/{n}/card-style', headers=seed_ids[f'{actor}_headers'], json=body)
    assert r.status_code == expected, r.text
    if expected == 200:
        assert r.json()['data']['card_style_json'] == body
        logs = (await db_session.execute(select(AuditLog).where(AuditLog.action == 'card_style.update'))).scalars().all()
        assert len(logs) == 1
        assert logs[0].detail_json['after'] == body
        reset = await async_client.put(f'/api/v1/projects/{p}/nodes/{n}/card-style', headers=seed_ids[f'{actor}_headers'], json={})
        assert reset.json()['data']['card_style_json'] == {}


async def test_only_direct_manager(async_client, seed_ids, db_session):
    t = TreeService()
    project = await db_session.get(Project, seed_ids['project_id'])
    child = await t.create_node(db_session, project, parent_id=seed_ids['root_node_id'], node_type_key='person', title='直属下级')
    grandchild = await t.create_node(db_session, project, parent_id=child.id, node_type_key='person', title='间接下级')
    await db_session.commit()
    for node, status in ((child, 200), (grandchild, 403)):
        r = await async_client.put(f'/api/v1/projects/{project.id}/nodes/{node.id}/card-style', headers=seed_ids['member_headers'], json={'color': 'ink'})
        assert r.status_code == status, r.text


async def test_non_person_and_cross_project(async_client, seed_ids):
    p = seed_ids['project_id']
    r = await async_client.put(f'/api/v1/projects/{p}/nodes/{seed_ids["node_id"]}/card-style', headers=seed_ids['pm_headers'], json={})
    assert r.status_code == 422, r.text
    r = await async_client.put(f'/api/v1/projects/{p + 999}/nodes/{seed_ids["root_node_id"]}/card-style', headers=seed_ids['pm_headers'], json={})
    assert r.status_code == 404


@pytest.mark.parametrize('body', [
    {'color': '#ffffff'}, {'fields': ['unknown']}, {'fields': ['name', 'name']},
    {'tags': [{'text': '字' * 13, 'color': 'ink'}]}, {'tags': [{'text': 'a', 'color': 'ink'}] * 9},
    {'custom_fields': [{'key': '字' * 13, 'value': 'a'}]},
    {'custom_fields': [{'key': 'a', 'value': '字' * 61}]},
    {'custom_fields': [{'key': 'a', 'value': 'a'}] * 11}, {'avatar': 'https://evil.test/a'},
    {'density': 'detailed'}, {'fields': None}, {'tags': 'a'}, {'extra': True},
])
async def test_style_rejects_invalid(async_client, seed_ids, body):
    r = await async_client.put(f'/api/v1/projects/{seed_ids["project_id"]}/nodes/{seed_ids["root_node_id"]}/card-style', headers=seed_ids['pm_headers'], json=body)
    assert r.status_code == 422, r.text


async def test_limits_and_private_pref_merge(async_client, seed_ids):
    body = {'tags': [{'text': '字' * 12, 'color': 'ink'}] * 8, 'custom_fields': [{'key': '字' * 12, 'value': '字' * 60}] * 10, 'avatar': 'initial'}
    r = await async_client.put(f'/api/v1/projects/{seed_ids["project_id"]}/nodes/{seed_ids["root_node_id"]}/card-style', headers=seed_ids['pm_headers'], json=body)
    assert r.status_code == 200, r.text
    key = str(seed_ids['project_id'])
    for value in ({key: {'fields': [], 'show_colors': False}}, {str(int(key) + 1): {'density': 'detailed'}}):
        r = await async_client.put('/api/v1/users/me/ui-prefs', headers=seed_ids['member_headers'], json={'person_cards': value})
        assert r.status_code == 200, r.text
    data = (await async_client.get('/api/v1/users/me/ui-prefs', headers=seed_ids['member_headers'])).json()['data']['ui']['person_cards']
    assert data[key] == {'fields': [], 'show_colors': False}
    other = (await async_client.get('/api/v1/users/me/ui-prefs', headers=seed_ids['pm_headers'])).json()['data']['ui']
    assert not other.get('person_cards')
    r = await async_client.put('/api/v1/users/me/ui-prefs', headers=seed_ids['member_headers'], json={'person_cards': {key: {'color': 'ink'}}})
    assert r.status_code == 422


def test_priority_merge():
    from app.services.person_cards import merge_card
    result = merge_card({'fields': ['role'], 'density': 'detailed', 'color': 'sage'}, {'fields': [], 'color': 'clay', 'tags': [{'text': '标签', 'color': 'ink'}]}, {'fields': ['name'], 'show_colors': False, 'show_tags': False})
    assert result['fields'] == ['name']
    assert result['density'] == 'detailed'
    assert result['color'] == 'ink'
    assert result['tags'] == []
    assert merge_card({'fields': ['name']}, {'fields': []}, {})['fields'] == []


@pytest.mark.parametrize('body', [{'density': 'wide'}, {'color': 'red'}, {'tags': []}, {'fields': ['role', 'role']}])
async def test_template_validation(async_client, seed_ids, body):
    r = await async_client.put(f'/api/v1/projects/{seed_ids["project_id"]}/card-template', headers=seed_ids['pm_headers'], json=body)
    assert r.status_code == 422, r.text


async def test_admin_is_not_implicitly_a_card_manager(async_client, seed_ids, db_session):
    p = await db_session.get(Project, seed_ids['project_id'])
    p.created_by = seed_ids['pm_user_id']
    await db_session.commit()
    for path in (f'/projects/{p.id}/card-template', f'/projects/{p.id}/nodes/{seed_ids["root_node_id"]}/card-style'):
        r = await async_client.put('/api/v1' + path, headers=seed_ids['org_leader_headers'], json={})
        assert r.status_code == 403, r.text


async def test_archived_cards_read_only(async_client, seed_ids, db_session):
    p = await db_session.get(Project, seed_ids['project_id'])
    p.status = 'archived'
    await db_session.commit()
    for path in (f'/projects/{p.id}/card-template', f'/projects/{p.id}/nodes/{seed_ids["root_node_id"]}/card-style'):
        r = await async_client.put('/api/v1' + path, headers=seed_ids['pm_headers'], json={})
        assert r.status_code == 403, r.text


async def test_audit_refreshes_stale_session(async_client, seed_ids, db_session):
    project = await db_session.get(Project, seed_ids['project_id'])
    stale_node = await db_session.get(TreeNode, seed_ids['root_node_id'])
    first = {'color': 'clay'}
    r = await async_client.put(f'/api/v1/projects/{project.id}/nodes/{stale_node.id}/card-style', headers=seed_ids['pm_headers'], json=first)
    assert r.status_code == 200, r.text
    await TreeService().save_card(db_session, project, seed_ids['pm_user_id'], {}, stale_node)
    await db_session.commit()
    logs = list((await db_session.execute(select(AuditLog).where(AuditLog.action == 'card_style.update').order_by(AuditLog.id))).scalars().all())
    assert logs[1].detail_json == {'before': first, 'after': {}}


@pytest.mark.parametrize('change', ['archived', 'type'])
async def test_save_rechecks_stale_project_and_node(seed_ids, db_session, async_engine, change):
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from app.models.tree import NodeType
    project = await db_session.get(Project, seed_ids['project_id'])
    node = await db_session.get(TreeNode, seed_ids['root_node_id'])
    async with async_sessionmaker(async_engine, expire_on_commit=False)() as other:
        if change == 'archived':
            (await other.get(Project, project.id)).status = 'archived'
        else:
            work_type = (await other.execute(select(NodeType).where(NodeType.key == 'work_item'))).scalar_one()
            (await other.get(TreeNode, node.id)).node_type_id = work_type.id
        await other.commit()
    with pytest.raises((PermissionError, ValueError)):
        await TreeService().save_card(db_session, project, seed_ids['pm_user_id'], {'color': 'ink'}, node)


def test_incremental_migration_and_downgrade(tmp_path, monkeypatch):
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import create_engine, inspect, text
    url = 'sqlite:///' + (tmp_path / 'old.db').as_posix()
    monkeypatch.setenv('DATABASE_URL', url)
    engine = create_engine(url)
    with engine.begin() as conn:
        conn.execute(text('CREATE TABLE projects (id INTEGER PRIMARY KEY)'))
        conn.execute(text('CREATE TABLE tree_nodes (id INTEGER PRIMARY KEY)'))
    cfg = Config('alembic.ini')
    command.stamp(cfg, 'fr6f7a8b9c0d')
    command.upgrade(cfg, 'head')
    assert 'card_template_json' in {c['name'] for c in inspect(engine).get_columns('projects')}
    assert 'card_style_json' in {c['name'] for c in inspect(engine).get_columns('tree_nodes')}
    command.downgrade(cfg, 'fr6f7a8b9c0d')
    assert 'card_template_json' not in {c['name'] for c in inspect(engine).get_columns('projects')}
    engine.dispose()
