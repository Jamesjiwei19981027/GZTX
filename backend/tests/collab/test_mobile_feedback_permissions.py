"""Regression coverage for management and work-contact boundaries."""
import pytest
from sqlalchemy import select
from app.models.company import CompanyMembership
from app.models.tree import NodeAssignment


@pytest.mark.asyncio
async def test_collaborator_cannot_manage_subordinates(async_client, seed_ids, db_session):
    root = seed_ids['root_node_id']
    assignment = (await db_session.execute(select(NodeAssignment).where(
        NodeAssignment.node_id == root, NodeAssignment.user_id == seed_ids['member_user_id'],
    ))).scalar_one()
    assignment.role_key = 'collaborator'
    await db_session.commit()
    response = await async_client.post(f"/api/v1/projects/{seed_ids['project_id']}/nodes",
        headers=seed_ids['member_headers'], json={'parent_id': root, 'node_type_key': 'person', 'title': '下级'})
    assert response.status_code == 403, response.text


@pytest.mark.asyncio
async def test_project_manager_cannot_make_person_their_own_supervisor(async_client, seed_ids):
    response = await async_client.post(f"/api/v1/projects/{seed_ids['project_id']}/nodes",
        headers=seed_ids['pm_headers'], json={'parent_id': seed_ids['root_node_id'], 'node_type_key': 'person',
        'title': '同人重复节点', 'assignees': [{'user_id': seed_ids['member_user_id'], 'role_key': 'primary'}]})
    assert response.status_code == 422, response.text


@pytest.mark.asyncio
async def test_only_pm_changes_supervisor(async_client, seed_ids):
    response = await async_client.post(f"/api/v1/nodes/{seed_ids['root_node_id']}/move",
        headers=seed_ids['member_headers'], json={'new_parent_id': None})
    assert response.status_code == 403, response.text


@pytest.mark.asyncio
async def test_company_membership_alone_does_not_allow_private_chat(async_client, seed_ids, db_session):
    db_session.add(CompanyMembership(company_id=seed_ids['company_id'], user_id=seed_ids['outsider_user_id'],
        status='active', employment_status='active'))
    await db_session.commit()
    response = await async_client.post(f"/api/v1/companies/{seed_ids['company_id']}/conversations",
        headers=seed_ids['member_headers'], json={'member_user_ids': [seed_ids['outsider_user_id']]})
    assert response.status_code == 403, response.text


@pytest.mark.asyncio
async def test_contacts_include_direct_manager_and_exclude_unrelated_users(async_client, seed_ids):
    response = await async_client.get(f"/api/v1/companies/{seed_ids['company_id']}/contacts", headers=seed_ids['member_headers'])
    assert response.status_code == 200, response.text
    ids = {item['id'] for item in response.json()['data']['items']}
    assert seed_ids['pm_user_id'] in ids
    assert seed_ids['outsider_user_id'] not in ids
    allowed = await async_client.post(f"/api/v1/companies/{seed_ids['company_id']}/conversations",
        headers=seed_ids['member_headers'], json={'member_user_ids': [seed_ids['pm_user_id']]})
    assert allowed.status_code == 200, allowed.text


@pytest.mark.asyncio
async def test_reassigning_node_cannot_make_own_supervisor(async_client, seed_ids):
    pid = seed_ids['project_id']
    created = await async_client.post(f'/api/v1/projects/{pid}/nodes', headers=seed_ids['pm_headers'],
        json={'parent_id': seed_ids['root_node_id'], 'node_type_key': 'person', 'title': 'Independent child'})
    nid = created.json()['data']['id']
    changed = await async_client.patch(f'/api/v1/nodes/{nid}', headers=seed_ids['pm_headers'],
        json={'assignees': [{'user_id': seed_ids['member_user_id'], 'role_key': 'primary'}]})
    assert changed.status_code == 422, changed.text


@pytest.mark.asyncio
async def test_private_chat_cannot_skip_reporting_levels(async_client, seed_ids, db_session):
    from app.models.user import User
    from app.models.project import ProjectMember
    from tests.collab.conftest import _headers
    leader = User(username='branch_manager', email='branch@example.com', password_hash='unused', is_active=True)
    staff = User(username='staff_member', email='staff@example.com', password_hash='unused', is_active=True)
    db_session.add_all([leader, staff])
    await db_session.flush()
    db_session.add_all([
        CompanyMembership(company_id=seed_ids['company_id'], user_id=leader.id, status='active', employment_status='active'),
        CompanyMembership(company_id=seed_ids['company_id'], user_id=staff.id, status='active', employment_status='active'),
        ProjectMember(project_id=seed_ids['project_id'], user_id=leader.id),
        ProjectMember(project_id=seed_ids['project_id'], user_id=staff.id),
    ])
    await db_session.commit()
    pid = seed_ids['project_id']
    branch = await async_client.post(f'/api/v1/projects/{pid}/nodes', headers=seed_ids['pm_headers'],
        json={'parent_id': seed_ids['root_node_id'], 'node_type_key': 'person', 'title': 'Branch', 'assignees': [{'user_id': leader.id, 'role_key': 'primary'}]})
    assert branch.status_code == 200, branch.text
    branch_id = branch.json()['data']['id']

    leaf = await async_client.post(f'/api/v1/projects/{pid}/nodes', headers=seed_ids['pm_headers'],
        json={'parent_id': branch_id, 'node_type_key': 'person', 'title': 'Staff', 'assignees': [{'user_id': staff.id, 'role_key': 'primary'}]})
    assert leaf.status_code == 200, leaf.text

    staff_headers = _headers(staff.id)
    denied = await async_client.post(f"/api/v1/companies/{seed_ids['company_id']}/conversations", headers=staff_headers,
        json={'member_user_ids': [seed_ids['pm_user_id']]})
    assert denied.status_code == 403, denied.text
    allowed = await async_client.post(f"/api/v1/companies/{seed_ids['company_id']}/conversations", headers=staff_headers,
        json={'member_user_ids': [leader.id]})
    assert allowed.status_code == 200, allowed.text


@pytest.mark.asyncio
async def test_public_mentions_channel_is_not_named_like_private_chat(async_client, seed_ids):
    response = await async_client.get(f"/api/v1/companies/{seed_ids['company_id']}/channels", headers=seed_ids['member_headers'])
    channels = response.json()['data']['items']
    assert all('私信' not in c['name'] and '私聊' not in c['name'] for c in channels)
