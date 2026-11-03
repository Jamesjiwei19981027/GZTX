import pytest
from sqlalchemy import select

from app.models.project import Project, ProjectMember
from app.models.tree import TreeNode
from app.services.tree_service import TreeService
from app.models.company import CompanyMembership
from app.models.category import Category
from app.models.task import Task
from app.models.shell import DirectConversation, DirectConversationMember, DirectMessage, TeamChannel, TeamChannelMessage
from tests.collab.conftest import _headers


async def secondary(client, ids, parent=None, assignee=None):
    response = await client.post(f"/api/v1/projects/{ids['project_id']}/nodes", headers=ids['member_headers'], json={
        'parent_id': parent or ids['root_node_id'], 'node_type_key': 'person', 'title': '下辖执行人',
        'assignees': [{'user_id': assignee, 'role_key': 'primary'}] if assignee else [],
    })
    assert response.status_code == 200, response.text
    return response.json()['data']['id']


@pytest.mark.asyncio
async def test_pm_cannot_delete_or_take_over_another_owners_secondary(async_client, seed_ids, db_session):
    pid, root = seed_ids['project_id'], seed_ids['root_node_id']
    from app.models.user import User

    lead = User(username='dept_lead_1', email='lead1@example.com', password_hash='unused', is_active=True)
    db_session.add(lead)
    await db_session.flush()
    db_session.add_all([
        CompanyMembership(company_id=seed_ids['company_id'], user_id=lead.id, status='active', employment_status='active'),
        ProjectMember(project_id=pid, user_id=lead.id),
    ])
    await db_session.commit()
    lead_headers = _headers(lead.id)

    main_person = await async_client.post(f"/api/v1/projects/{pid}/nodes", headers=seed_ids['pm_headers'], json={
        'parent_id': root, 'node_type_key': 'person', 'title': '业务主管',
        'assignees': [{'user_id': lead.id, 'role_key': 'primary'}],
        'node_origin': 'project',
    })
    assert main_person.status_code == 200, main_person.text
    main_id = main_person.json()['data']['id']

    child_resp = await async_client.post(f"/api/v1/projects/{pid}/nodes", headers=lead_headers, json={
        'parent_id': main_id, 'node_type_key': 'person', 'title': '下辖执行人',
    })
    assert child_resp.status_code == 200, child_resp.text
    child = child_resp.json()['data']['id']

    permissions = (await async_client.get(f"/api/v1/projects/{pid}/my-permissions", headers=seed_ids['pm_headers'])).json()['data']['node_permissions']
    assert permissions[str(child)]['can_delete_person'] is False
    for method, suffix, body in [('delete', '', None), ('post', '/move', {'new_parent_id': main_id}), ('put', '/assignees', {'assignees': [{'user_id': seed_ids['pm_user_id']}]})]:
        kwargs = {'json': body} if body is not None else {}
        result = await async_client.request(method, f'/api/v1/nodes/{child}{suffix}', headers=seed_ids['pm_headers'], **kwargs)
        assert result.status_code == 403, result.text
    removed = await async_client.delete(f'/api/v1/nodes/{child}', headers=lead_headers)
    assert removed.status_code == 200, removed.text


@pytest.mark.asyncio
async def test_type_conversion_cannot_bypass_secondary_assignment_ownership(async_client, seed_ids, db_session):
    pid, root = seed_ids['project_id'], seed_ids['root_node_id']
    from app.models.user import User

    lead = User(username='dept_lead_2', email='lead2@example.com', password_hash='unused', is_active=True)
    db_session.add(lead)
    await db_session.flush()
    db_session.add_all([
        CompanyMembership(company_id=seed_ids['company_id'], user_id=lead.id, status='active', employment_status='active'),
        ProjectMember(project_id=pid, user_id=lead.id),
    ])
    await db_session.commit()
    lead_headers = _headers(lead.id)

    main_person = await async_client.post(f"/api/v1/projects/{pid}/nodes", headers=seed_ids['pm_headers'], json={
        'parent_id': root, 'node_type_key': 'person', 'title': '业务主管',
        'assignees': [{'user_id': lead.id, 'role_key': 'primary'}],
        'node_origin': 'project',
    })
    assert main_person.status_code == 200, main_person.text
    main_id = main_person.json()['data']['id']

    child_resp = await async_client.post(f"/api/v1/projects/{pid}/nodes", headers=lead_headers, json={
        'parent_id': main_id, 'node_type_key': 'person', 'title': '下辖执行人',
    })
    assert child_resp.status_code == 200, child_resp.text
    child = child_resp.json()['data']['id']

    converted = await async_client.patch(f'/api/v1/nodes/{child}', headers=seed_ids['pm_headers'], json={'node_type_key': 'work_item'})
    assert converted.status_code == 200, converted.text
    for method, suffix in [('put', '/assignees'), ('patch', '')]:
        denied = await async_client.request(method, f'/api/v1/nodes/{child}{suffix}', headers=seed_ids['pm_headers'], json={'assignees': [{'user_id': seed_ids['pm_user_id']}]})
        assert denied.status_code == 403, denied.text


@pytest.mark.asyncio
async def test_owning_higher_main_does_not_take_over_another_main_secondary(async_client, seed_ids, db_session):
    pid, root = seed_ids['project_id'], seed_ids['root_node_id']
    from app.models.user import User

    lead = User(username='dept_lead_3', email='lead3@example.com', password_hash='unused', is_active=True)
    db_session.add(lead)
    await db_session.flush()
    db_session.add_all([
        CompanyMembership(company_id=seed_ids['company_id'], user_id=lead.id, status='active', employment_status='active'),
        ProjectMember(project_id=pid, user_id=lead.id),
    ])
    await db_session.commit()
    lead_headers = _headers(lead.id)

    main_person = await async_client.post(f"/api/v1/projects/{pid}/nodes", headers=seed_ids['pm_headers'], json={
        'parent_id': root, 'node_type_key': 'person', 'title': '项目主管',
        'assignees': [{'user_id': lead.id, 'role_key': 'primary'}],
        'node_origin': 'project',
    })
    assert main_person.status_code == 200, main_person.text
    main_id = main_person.json()['data']['id']

    child_resp = await async_client.post(f"/api/v1/projects/{pid}/nodes", headers=lead_headers, json={
        'parent_id': main_id, 'node_type_key': 'person', 'title': '下辖执行人',
    })
    assert child_resp.status_code == 200, child_resp.text
    child = child_resp.json()['data']['id']

    denied = await async_client.delete(f'/api/v1/nodes/{child}', headers=seed_ids['pm_headers'])
    assert denied.status_code == 403, denied.text
    allowed = await async_client.delete(f'/api/v1/nodes/{child}', headers=lead_headers)
    assert allowed.status_code == 200, allowed.text


@pytest.mark.asyncio
async def test_person_depth_limit_prevents_fifth_person_but_allows_work(async_client, seed_ids):
    second = await secondary(async_client, seed_ids)
    third = await secondary(async_client, seed_ids, second)
    fourth = await secondary(async_client, seed_ids, third)
    denied = await async_client.post(f"/api/v1/projects/{seed_ids['project_id']}/nodes", headers=seed_ids['member_headers'], json={'parent_id': fourth, 'node_type_key': 'person', 'title': '第五层'})
    assert denied.status_code == 422, denied.text
    allowed = await async_client.post(f"/api/v1/projects/{seed_ids['project_id']}/nodes", headers=seed_ids['member_headers'], json={'parent_id': third, 'node_type_key': 'work_item', 'title': '可添加事项'})
    assert allowed.status_code == 200, allowed.text


@pytest.mark.asyncio
async def test_project_task_listing_reads_other_owners_but_is_project_scoped(async_client, seed_ids, db_session):
    category = Category(user_id=seed_ids['pm_user_id'], name='项目任务')
    db_session.add(category)
    await db_session.flush()
    db_session.add_all([
        Task(user_id=seed_ids['pm_user_id'], category_id=category.id, title='共享项目任务', origin='project_link', company_id=seed_ids['company_id'], project_id=seed_ids['project_id']),
        Task(user_id=seed_ids['pm_user_id'], category_id=category.id, title='私人任务'),
    ])
    await db_session.commit()
    response = await async_client.get(f"/api/v1/projects/{seed_ids['project_id']}/tasks", headers=seed_ids['member_headers'])
    assert response.status_code == 200, response.text
    assert [t['title'] for t in response.json()['data']['items']] == ['共享项目任务']
    assert response.json()['data']['total'] == 1
    forbidden = await async_client.get(f"/api/v1/projects/{seed_ids['project_id']}/tasks", headers=seed_ids['outsider_headers'])
    assert forbidden.status_code == 403, forbidden.text


@pytest.mark.asyncio
async def test_ancestor_requires_fresh_preview_and_cascade_confirmation(async_client, seed_ids):
    pid = seed_ids['project_id']
    branch = await secondary(async_client, seed_ids)
    child = await secondary(async_client, seed_ids, parent=branch)
    denied = await async_client.delete(f'/api/v1/nodes/{branch}', headers=seed_ids['pm_headers'])
    assert denied.status_code == 409, denied.text
    preview = await async_client.get(f'/api/v1/nodes/{branch}/deletion-preview', headers=seed_ids['pm_headers'])
    assert preview.status_code == 200, preview.text
    data = preview.json()['data']
    assert data['descendant_count'] == 1
    assert data['warning']
    await secondary(async_client, seed_ids, parent=branch)
    stale = await async_client.delete(f"/api/v1/nodes/{branch}?cascade=true&preview_token={data['preview_token']}", headers=seed_ids['pm_headers'])
    assert stale.status_code == 409, stale.text
    fresh = (await async_client.get(f'/api/v1/nodes/{branch}/deletion-preview', headers=seed_ids['pm_headers'])).json()['data']
    deleted = await async_client.delete(f"/api/v1/nodes/{branch}?cascade=true&preview_token={fresh['preview_token']}", headers=seed_ids['pm_headers'])
    assert deleted.status_code == 200, deleted.text


@pytest.mark.asyncio
async def test_handover_preserves_children_and_remaining_person_membership(async_client, seed_ids):
    pid, root = seed_ids['project_id'], seed_ids['root_node_id']
    departing = await secondary(async_client, seed_ids)
    item_resp = await async_client.post(f"/api/v1/projects/{pid}/nodes", headers=seed_ids['pm_headers'], json={
        'parent_id': departing, 'node_type_key': 'work_item', 'title': '待移交工作项'
    })
    assert item_resp.status_code == 200, item_resp.text
    item_id = item_resp.json()['data']['id']

    target = await secondary(async_client, seed_ids)
    preview = (await async_client.get(f'/api/v1/nodes/{departing}/deletion-preview', headers=seed_ids['pm_headers'])).json()['data']
    assert target in [n['id'] for n in preview['handover_candidates']]
    result = await async_client.delete(f"/api/v1/nodes/{departing}?handover_to_node_id={target}&preview_token={preview['preview_token']}", headers=seed_ids['pm_headers'])
    assert result.status_code == 200, result.text
    item = await async_client.get(f"/api/v1/nodes/{item_id}", headers=seed_ids['member_headers'])
    assert item.status_code == 200, item.text
    assert item.json()['data']['parent_id'] == target


@pytest.mark.asyncio
async def test_secondary_project_channels_need_explicit_manager_grant(async_client, seed_ids, db_session):
    root = await db_session.get(TreeNode, seed_ids['root_node_id'])
    await TreeService().set_assignees(db_session, root.id, [{'user_id': seed_ids['pm_user_id']}])
    await db_session.commit()
    child = await async_client.post(f"/api/v1/projects/{seed_ids['project_id']}/nodes", headers=seed_ids['pm_headers'], json={'parent_id': root.id, 'node_type_key': 'person', 'node_origin': 'subordinate', 'title': '下辖人员', 'assignees': [{'user_id': seed_ids['member_user_id']}]})
    child_id = child.json()['data']['id']
    url = f"/api/v1/companies/{seed_ids['company_id']}/channels?project_id={seed_ids['project_id']}"
    denied = await async_client.get(url, headers=seed_ids['member_headers'])
    assert denied.status_code == 403, denied.text
    self_grant = await async_client.patch(f'/api/v1/nodes/{child_id}', headers=seed_ids['member_headers'], json={'responsibility_permissions': {'channel_access': True}})
    assert self_grant.status_code == 403, self_grant.text
    grant = await async_client.patch(f'/api/v1/nodes/{child_id}', headers=seed_ids['pm_headers'], json={'responsibility_permissions': {'channel_access': True}})
    assert grant.status_code == 200, grant.text
    assert grant.json()['data']['responsibility_permissions']['channel_access'] is True
    allowed = await async_client.get(url, headers=seed_ids['member_headers'])
    assert allowed.status_code == 200, allowed.text


@pytest.mark.asyncio
async def test_secondary_assignment_enrolls_active_company_person_without_channel_grant(async_client, seed_ids, db_session):
    db_session.add(CompanyMembership(company_id=seed_ids['company_id'], user_id=seed_ids['outsider_user_id'], status='active', employment_status='active'))
    await db_session.commit()
    await secondary(async_client, seed_ids, assignee=seed_ids['outsider_user_id'])
    tree = await async_client.get(f"/api/v1/projects/{seed_ids['project_id']}/tree", headers=seed_ids['outsider_headers'])
    assert tree.status_code == 200, tree.text
    channels = await async_client.get(f"/api/v1/companies/{seed_ids['company_id']}/channels?project_id={seed_ids['project_id']}", headers=seed_ids['outsider_headers'])
    assert channels.status_code == 403, channels.text


@pytest.mark.asyncio
async def test_revoking_secondary_channel_grant_denies_project_group_calls(async_client, seed_ids, db_session):
    root = await db_session.get(TreeNode, seed_ids['root_node_id'])
    await TreeService().set_assignees(db_session, root.id, [{'user_id': seed_ids['pm_user_id']}])
    group = DirectConversation(company_id=seed_ids['company_id'], project_id=seed_ids['project_id'], kind='group', created_by=seed_ids['pm_user_id'])
    db_session.add(group)
    await db_session.flush()
    db_session.add(DirectConversationMember(conversation_id=group.id, user_id=seed_ids['member_user_id']))
    await db_session.commit()
    child = await async_client.post(f"/api/v1/projects/{seed_ids['project_id']}/nodes", headers=seed_ids['pm_headers'], json={'parent_id': root.id, 'node_type_key':'person', 'node_origin':'subordinate', 'title':'通话需授权', 'assignees':[{'user_id':seed_ids['member_user_id']}], 'responsibility_permissions':{'channel_access':True}})
    child_id = child.json()['data']['id']
    allowed = await async_client.post('/api/v1/calls/sessions', headers=seed_ids['member_headers'], json={'conversation_id':group.id})
    assert allowed.status_code == 200, allowed.text
    await async_client.patch(f'/api/v1/nodes/{child_id}', headers=seed_ids['pm_headers'], json={'responsibility_permissions':{'channel_access':False}})
    denied = await async_client.post('/api/v1/calls/sessions', headers=seed_ids['member_headers'], json={'conversation_id':group.id})
    assert denied.status_code == 403, denied.text
    from tests.collab.test_calls import RouteSocket
    from app.api.v1.calls import call_signal
    from app.core.security import create_access_token
    socket = RouteSocket(create_access_token(data={'sub':seed_ids['member_user_id']}))
    await call_signal(group.id, socket, db_session)
    assert socket.accepted is False
    assert socket.closed_code == 4403


@pytest.mark.asyncio
async def test_cascade_revokes_only_affected_project_and_preserves_chat_history(async_client, seed_ids, db_session):
    pid = seed_ids['project_id']
    from app.models.user import User

    target_user = User(username='test_revoked_user', email='revoked@example.com', password_hash='unused', is_active=True)
    db_session.add(target_user)
    await db_session.flush()
    uid = target_user.id
    db_session.add(CompanyMembership(company_id=seed_ids['company_id'], user_id=uid, status='active', employment_status='active'))
    db_session.add(ProjectMember(project_id=pid, user_id=uid))

    other = Project(company_id=seed_ids['company_id'], name='其他项目', created_by=seed_ids['admin_user_id'], pm_user_id=seed_ids['pm_user_id'])
    db_session.add(other)
    await db_session.flush()
    db_session.add(ProjectMember(project_id=other.id, user_id=uid))
    channels, groups = [], []
    for project_id in [pid, other.id]:
        channel = TeamChannel(company_id=seed_ids['company_id'], project_id=project_id, name='项目频道')
        group = DirectConversation(company_id=seed_ids['company_id'], project_id=project_id, kind='group', created_by=seed_ids['pm_user_id'])
        db_session.add_all([channel, group])
        await db_session.flush()
        db_session.add_all([DirectConversationMember(conversation_id=group.id, user_id=uid),
            DirectMessage(conversation_id=group.id, user_id=uid, body='需要保留的历史'),
            TeamChannelMessage(channel_id=channel.id, user_id=uid, body='需要保留的频道记录')])
        channels.append(channel.id)
        groups.append(group.id)
    await db_session.commit()

    node = await secondary(async_client, seed_ids, assignee=uid)
    preview = (await async_client.get(f'/api/v1/nodes/{node}/deletion-preview', headers=seed_ids['pm_headers'])).json()['data']
    removed = await async_client.delete(f"/api/v1/nodes/{node}?cascade=true&preview_token={preview['preview_token']}", headers=seed_ids['pm_headers'])
    assert removed.status_code == 200, removed.text
    assert removed.json()['data']['revoked_user_ids'] == [uid]

    target_headers = _headers(uid)
    for channel_id, group_id, expected in [(channels[0], groups[0], 403), (channels[1], groups[1], 200)]:
        messages = await async_client.get(f'/api/v1/channels/{channel_id}/messages', headers=target_headers)
        assert messages.status_code == expected, messages.text
        direct = await async_client.get(f'/api/v1/conversations/{group_id}/messages', headers=target_headers)
        assert direct.status_code == expected, direct.text
    assert len((await db_session.execute(select(DirectMessage))).scalars().all()) == 2
    assert len((await db_session.execute(select(TeamChannelMessage))).scalars().all()) == 2


@pytest.mark.asyncio
async def test_handover_moves_linked_tasks_and_cascade_recycles_them(async_client, seed_ids, db_session):
    pid, root = seed_ids['project_id'], seed_ids['root_node_id']
    from app.models.user import User

    trans_user = User(username='trans_user', email='trans@example.com', password_hash='unused', is_active=True)
    db_session.add(trans_user)
    await db_session.flush()
    db_session.add_all([
        CompanyMembership(company_id=seed_ids['company_id'], user_id=trans_user.id, status='active', employment_status='active'),
        ProjectMember(project_id=pid, user_id=trans_user.id),
    ])
    await db_session.commit()

    source_person = await secondary(async_client, seed_ids, assignee=trans_user.id)
    category = Category(user_id=trans_user.id, name='关联任务')
    db_session.add(category)
    await db_session.flush()
    task = Task(user_id=trans_user.id, category_id=category.id, title='角色关联任务', origin='project_link', company_id=seed_ids['company_id'], project_id=pid, project_node_id=source_person)
    db_session.add(task)
    await db_session.commit()

    target_id = await secondary(async_client, seed_ids)
    preview = (await async_client.get(f'/api/v1/nodes/{source_person}/deletion-preview', headers=seed_ids['pm_headers'])).json()['data']
    assert preview['affected_task_count'] == 1
    moved = await async_client.delete(f"/api/v1/nodes/{source_person}?handover_to_node_id={target_id}&preview_token={preview['preview_token']}", headers=seed_ids['pm_headers'])
    assert moved.status_code == 200, moved.text
    await db_session.refresh(task)
    assert task.project_node_id == target_id
    assert task.is_deleted is False
    preview = (await async_client.get(f'/api/v1/nodes/{target_id}/deletion-preview', headers=seed_ids['pm_headers'])).json()['data']
    deleted = await async_client.delete(f"/api/v1/nodes/{target_id}?cascade=true&preview_token={preview['preview_token']}", headers=seed_ids['pm_headers'])
    assert deleted.status_code == 200, deleted.text
    await db_session.refresh(task)
    assert task.is_deleted is True
