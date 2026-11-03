"""Responsibility extensions and node capability boundaries share server truth."""
import pytest


@pytest.mark.asyncio
async def test_subordinate_origin_is_recorded_and_cannot_be_forged(async_client, seed_ids):
    pid, root = seed_ids['project_id'], seed_ids['root_node_id']
    child = await async_client.post(f'/api/v1/projects/{pid}/nodes', headers=seed_ids['member_headers'], json={
        'parent_id': root, 'node_type_key': 'person', 'title': '下辖执行人',
    })
    assert child.status_code == 200, child.text
    assert child.json()['data']['node_origin'] == 'subordinate'
    forged = await async_client.post(f'/api/v1/projects/{pid}/nodes', headers=seed_ids['member_headers'], json={
        'parent_id': root, 'node_type_key': 'person', 'title': '伪造项目定义', 'node_origin': 'project',
    })
    assert forged.status_code == 403, forged.text
    child_id = child.json()['data']['id']
    loaded = await async_client.get(f'/api/v1/nodes/{child_id}', headers=seed_ids['member_headers'])
    assert loaded.json()['data']['node_origin'] == 'subordinate'
    flat = await async_client.get(f'/api/v1/projects/{pid}/tree?format=flat', headers=seed_ids['pm_headers'])
    assert next(n for n in flat.json()['data']['nodes'] if n['id'] == child_id)['node_origin'] == 'subordinate'


@pytest.mark.asyncio
async def test_disabled_evidence_policy_applies_to_work_items_and_descendants(async_client, seed_ids):
    pid, root, item = seed_ids['project_id'], seed_ids['root_node_id'], seed_ids['node_id']
    patch = await async_client.patch(f'/api/v1/nodes/{root}', headers=seed_ids['pm_headers'], json={
        'responsibility_permissions': {'evidence_submit': 'disabled'},
    })
    assert patch.status_code == 200, patch.text
    assert patch.json()['data']['responsibility_permissions']['evidence_submit'] == 'disabled'
    denied = await async_client.post(f'/api/v1/nodes/{item}/evidence', headers=seed_ids['member_headers'], json={'summary_text': '这份材料不应该允许提交'})
    assert denied.status_code == 403, denied.text
    snapshot = await async_client.get(f'/api/v1/projects/{pid}/my-permissions', headers=seed_ids['member_headers'])
    assert snapshot.json()['data']['node_permissions'][str(item)]['can_submit_evidence'] is False
    child = await async_client.post(f'/api/v1/projects/{pid}/nodes', headers=seed_ids['member_headers'], json={
        'parent_id': root, 'node_type_key': 'person', 'title': '子分支',
        'responsibility_permissions': {'evidence_submit': 'members'},
    })
    assert child.status_code == 200, child.text
    denied_child = await async_client.post(f"/api/v1/nodes/{child.json()['data']['id']}/evidence", headers=seed_ids['member_headers'], json={'summary_text': '不能通过子分支放宽上级限制'})
    assert denied_child.status_code == 403, denied_child.text


@pytest.mark.asyncio
async def test_node_manager_cannot_add_when_ancestor_disallows_extensions(async_client, seed_ids):
    pid, root = seed_ids['project_id'], seed_ids['root_node_id']
    result = await async_client.patch(f'/api/v1/nodes/{root}', headers=seed_ids['pm_headers'], json={
        'responsibility_permissions': {'allow_add_subordinates': False, 'allow_add_work_items': False},
    })
    assert result.status_code == 200, result.text
    for kind in ['person', 'work_item']:
        denied = await async_client.post(f'/api/v1/projects/{pid}/nodes', headers=seed_ids['member_headers'], json={
            'parent_id': root, 'node_type_key': kind, 'title': '不允许新增',
        })
        assert denied.status_code == 403, denied.text
    # Project managers still administer the project definition.
    child = await async_client.post(f'/api/v1/projects/{pid}/nodes', headers=seed_ids['pm_headers'], json={
        'parent_id': root, 'node_type_key': 'person', 'title': 'PM定义的下层',
    })
    assert child.status_code == 200, child.text
    assert child.json()['data']['node_origin'] == 'project'
    denied = await async_client.post(f'/api/v1/projects/{pid}/nodes', headers=seed_ids['member_headers'], json={
        'parent_id': child.json()['data']['id'], 'node_type_key': 'person', 'title': '不能绕过上级限制',
    })
    assert denied.status_code == 403, denied.text


@pytest.mark.asyncio
async def test_extension_attachment_keeps_project_definition_separate(async_client, seed_ids):
    pid, root = seed_ids['project_id'], seed_ids['root_node_id']
    extension = await async_client.post(f'/api/v1/projects/{pid}/nodes', headers=seed_ids['pm_headers'], json={
        'parent_id': root, 'node_type_key': 'person', 'title': '下辖分支', 'node_origin': 'subordinate',
    })
    assert extension.status_code == 200, extension.text
    extension_id = extension.json()['data']['id']
    promoted = await async_client.post(f'/api/v1/nodes/{extension_id}/move', headers=seed_ids['member_headers'], json={'new_parent_id': None})
    assert promoted.status_code == 422, promoted.text
    core = await async_client.post(f'/api/v1/projects/{pid}/nodes', headers=seed_ids['pm_headers'], json={
        'parent_id': root, 'node_type_key': 'person', 'title': '项目定义负责人', 'node_origin': 'project',
    })
    assert core.status_code == 200, core.text
    invalid = await async_client.post(f"/api/v1/nodes/{core.json()['data']['id']}/move", headers=seed_ids['pm_headers'], json={'new_parent_id': extension_id})
    assert invalid.status_code == 422, invalid.text


@pytest.mark.asyncio
async def test_invalid_responsibility_policy_is_rejected(async_client, seed_ids):
    response = await async_client.patch(f"/api/v1/nodes/{seed_ids['root_node_id']}", headers=seed_ids['pm_headers'], json={
        'responsibility_permissions': {'evidence_submit': 'everyone_in_the_world'},
    })
    assert response.status_code == 422, response.text


@pytest.mark.asyncio
async def test_owner_cannot_change_own_grants_but_can_configure_child(async_client, seed_ids):
    pid, root = seed_ids['project_id'], seed_ids['root_node_id']
    denied = await async_client.patch(f'/api/v1/nodes/{root}', headers=seed_ids['member_headers'], json={
        'title': '不得部分保存', 'responsibility_permissions': {'evidence_submit': 'members'},
    })
    assert denied.status_code == 403, denied.text
    snapshot = await async_client.get(f'/api/v1/projects/{pid}/my-permissions', headers=seed_ids['member_headers'])
    assert snapshot.json()['data']['node_permissions'][str(root)]['can_manage_permissions'] is False
    child = await async_client.post(f'/api/v1/projects/{pid}/nodes', headers=seed_ids['member_headers'], json={
        'parent_id': root, 'node_type_key': 'person', 'title': '可管理下级权限',
    })
    child_id = child.json()['data']['id']
    allowed = await async_client.patch(f'/api/v1/nodes/{child_id}', headers=seed_ids['member_headers'], json={
        'responsibility_permissions': {'evidence_submit': 'disabled'},
    })
    assert allowed.status_code == 200, allowed.text
    loaded = await async_client.get(f'/api/v1/nodes/{root}', headers=seed_ids['pm_headers'])
    assert loaded.json()['data']['title'] != '不得部分保存'


@pytest.mark.asyncio
@pytest.mark.parametrize('original,target,flag', [
    ('work_item', 'person', 'allow_add_subordinates'),
    ('person', 'work_item', 'allow_add_work_items'),
])
async def test_type_conversion_cannot_bypass_parent_capability(async_client, seed_ids, original, target, flag):
    pid, root = seed_ids['project_id'], seed_ids['root_node_id']
    child = await async_client.post(f'/api/v1/projects/{pid}/nodes', headers=seed_ids['member_headers'], json={
        'parent_id': root, 'node_type_key': original, 'title': '不可转换以绕过权限',
    })
    child_id = child.json()['data']['id']
    await async_client.patch(f'/api/v1/nodes/{root}', headers=seed_ids['pm_headers'], json={
        'responsibility_permissions': {flag: False},
    })
    denied = await async_client.patch(f'/api/v1/nodes/{child_id}', headers=seed_ids['member_headers'], json={'node_type_key': target})
    assert denied.status_code == 403, denied.text
    loaded = await async_client.get(f'/api/v1/nodes/{child_id}', headers=seed_ids['pm_headers'])
    assert loaded.json()['data']['node_type_key'] == original


@pytest.mark.asyncio
async def test_moved_item_inherits_branch_origin_before_conversion(async_client, seed_ids):
    pid, root, item = seed_ids['project_id'], seed_ids['root_node_id'], seed_ids['node_id']
    branch = await async_client.post(f'/api/v1/projects/{pid}/nodes', headers=seed_ids['pm_headers'], json={
        'parent_id': root, 'node_type_key': 'person', 'title': '独立下辖', 'node_origin': 'subordinate',
    })
    branch_id = branch.json()['data']['id']
    moved = await async_client.post(f'/api/v1/nodes/{item}/move', headers=seed_ids['pm_headers'], json={'new_parent_id': branch_id})
    assert moved.status_code == 200, moved.text
    assert moved.json()['data']['node_origin'] == 'subordinate'
    converted = await async_client.patch(f'/api/v1/nodes/{item}', headers=seed_ids['pm_headers'], json={'node_type_key': 'person'})
    assert converted.status_code == 200, converted.text
    assert converted.json()['data']['node_origin'] == 'subordinate'


@pytest.mark.asyncio
async def test_subordinate_origin_survives_type_roundtrip_and_item_move(async_client, seed_ids):
    pid, root = seed_ids['project_id'], seed_ids['root_node_id']
    created = await async_client.post(f'/api/v1/projects/{pid}/nodes', headers=seed_ids['pm_headers'], json={
        'parent_id': root, 'node_type_key': 'person', 'title': '不可通过类型提升', 'node_origin': 'subordinate',
    })
    child = created.json()['data']['id']
    matter = await async_client.patch(f'/api/v1/nodes/{child}', headers=seed_ids['pm_headers'], json={'node_type_key':'work_item'})
    assert matter.status_code == 200, matter.text
    assert matter.json()['data']['node_origin'] == 'subordinate'
    moved = await async_client.post(f'/api/v1/nodes/{child}/move', headers=seed_ids['member_headers'], json={'new_parent_id':root})
    assert moved.status_code == 200, moved.text
    assert moved.json()['data']['node_origin'] == 'subordinate'
    person = await async_client.patch(f'/api/v1/nodes/{child}', headers=seed_ids['pm_headers'], json={'node_type_key':'person'})
    assert person.status_code == 200, person.text
    assert person.json()['data']['node_origin'] == 'subordinate'
    promoted = await async_client.post(f'/api/v1/nodes/{child}/move', headers=seed_ids['member_headers'], json={'new_parent_id':None})
    assert promoted.status_code == 422, promoted.text


@pytest.mark.asyncio
async def test_responsible_scope_honors_item_assignment_and_project_membership(async_client, seed_ids):
    p2_resp = await async_client.post(
        "/api/v1/projects",
        json={"company_id": seed_ids["company_id"], "name": "责任域测试项目"},
        headers=seed_ids["org_leader_headers"],
    )
    assert p2_resp.status_code == 200, p2_resp.text
    pid = p2_resp.json()["data"]["id"]
    await async_client.post(
        f"/api/v1/projects/{pid}/members",
        json={"user_id": seed_ids["member_user_id"], "role": "member"},
        headers=seed_ids["org_leader_headers"],
    )
    root = await async_client.post(f'/api/v1/projects/{pid}/nodes', headers=seed_ids['org_leader_headers'], json={
        'parent_id': None, 'node_type_key': 'person', 'title': '终责责任域',
        'assignees': [{'user_id': seed_ids['admin_user_id'], 'role_key': 'primary'}],
        'responsibility_permissions': {'evidence_submit': 'responsible'},
    })
    assert root.status_code == 200, root.text
    root_id = root.json()['data']['id']
    item = await async_client.post(f'/api/v1/projects/{pid}/nodes', headers=seed_ids['org_leader_headers'], json={
        'parent_id': root_id, 'node_type_key': 'work_item', 'title': '独立指派事项',
    })
    item_id = item.json()['data']['id']
    denied = await async_client.post(f'/api/v1/nodes/{item_id}/evidence', headers=seed_ids['member_headers'], json={'summary_text':'未指派时不可提交'})
    assert denied.status_code == 403, denied.text
    assigned = await async_client.patch(f'/api/v1/nodes/{item_id}', headers=seed_ids['org_leader_headers'], json={
        'assignees': [{'user_id':seed_ids['member_user_id'],'role_key':'primary'}],
    })
    assert assigned.status_code == 200, assigned.text
    accepted = await async_client.post(f'/api/v1/nodes/{item_id}/evidence', headers=seed_ids['member_headers'], json={'summary_text':'被指派后可以提交自己的工作材料'})
    assert accepted.status_code == 200, accepted.text
    snapshot = await async_client.get(f'/api/v1/projects/{pid}/my-permissions', headers=seed_ids['member_headers'])
    capabilities = snapshot.json()['data']['node_permissions']
    assert capabilities[str(root_id)]['can_submit_evidence'] is False
    assert capabilities[str(item_id)]['can_submit_evidence'] is True
