"""树编辑 ACL 回归：tree.edit_any / tree.edit_subtree(_owns_path) / 布局接口权限口径"""
import pytest


@pytest.mark.asyncio
async def test_edit_person_and_reassign_atomically(async_client, seed_ids):
    node_id = seed_ids['root_node_id']
    response = await async_client.patch(f'/api/v1/nodes/{node_id}', headers=seed_ids['member_headers'], json={
        'title': '交付负责人', 'description': '更新项目岗位',
    })
    assert response.status_code == 200, response.text
    data = response.json()['data']
    assert data['title'] == '交付负责人'
    reassigned = await async_client.patch(f'/api/v1/nodes/{node_id}', headers=seed_ids['member_headers'], json={
        'assignees': [{'user_id': seed_ids['pm_user_id'], 'role_key': 'primary'}],
    })
    assert reassigned.status_code == 403, reassigned.text
    retained = await async_client.patch(f'/api/v1/nodes/{node_id}', headers=seed_ids['member_headers'], json={'title': '仍可维护本人岗位'})
    assert retained.status_code == 200, retained.text
    assert retained.json()['data']['assignees'][0]['user_id'] == seed_ids['member_user_id']


@pytest.mark.asyncio
async def test_invalid_person_reassignment_keeps_original_node(async_client, seed_ids):
    node_id = seed_ids['root_node_id']
    before = (await async_client.get(f'/api/v1/nodes/{node_id}', headers=seed_ids['pm_headers'])).json()['data']
    response = await async_client.patch(f'/api/v1/nodes/{node_id}', headers=seed_ids['pm_headers'], json={
        'title': '不应保存', 'assignees': [{'user_id': seed_ids['outsider_user_id'], 'role_key': 'primary'}],
    })
    assert response.status_code == 422, response.text
    after = (await async_client.get(f'/api/v1/nodes/{node_id}', headers=seed_ids['pm_headers'])).json()['data']
    assert after['title'] == before['title']
    assert after['assignees'] == before['assignees']


@pytest.mark.asyncio
async def test_member_subtree_permissions(async_client, seed_ids):
    pid = seed_ids["project_id"]
    root = seed_ids["root_node_id"]

    # 1) 普通成员是 root 的 primary 责任人 → 可在自己子树下挂下属（edit_subtree 放行）
    r = await async_client.post(
        f"/api/v1/projects/{pid}/nodes",
        json={"parent_id": root, "node_type_key": "person", "title": "成员的下属"},
        headers=seed_ids["member_headers"],
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["id"], r.text

    # 2) 普通成员建主干节点（parent_id=null）→ 403（仅 PM/超管 tree.edit_any）
    r = await async_client.post(
        f"/api/v1/projects/{pid}/nodes",
        json={"parent_id": None, "node_type_key": "person", "title": "越权主干"},
        headers=seed_ids["member_headers"],
    )
    assert r.status_code == 403, r.text

    # 3) PM/管理员在另一个项目中建主干人（不指派给 member）→ member 往它下面挂 → 403（不拥有该路径）
    p2_resp = await async_client.post(
        "/api/v1/projects",
        json={"company_id": seed_ids["company_id"], "name": "第二个项目"},
        headers=seed_ids["org_leader_headers"],
    )
    assert p2_resp.status_code == 200, p2_resp.text
    p2_id = p2_resp.json()["data"]["id"]
    await async_client.post(
        f"/api/v1/projects/{p2_id}/members",
        json={"user_id": seed_ids["member_user_id"], "role": "member"},
        headers=seed_ids["org_leader_headers"],
    )
    r = await async_client.post(
        f"/api/v1/projects/{p2_id}/nodes",
        json={"parent_id": None, "node_type_key": "person", "title": "项目2终责根", "assignees": [{"user_id": seed_ids["admin_user_id"], "role_key": "primary"}]},
        headers=seed_ids["org_leader_headers"],
    )
    assert r.status_code == 200, r.text
    other_trunk = r.json()["data"]["id"]

    r = await async_client.post(
        f"/api/v1/projects/{p2_id}/nodes",
        json={"parent_id": other_trunk, "node_type_key": "person", "title": "越权挂载"},
        headers=seed_ids["member_headers"],
    )
    assert r.status_code == 403, r.text

    # 4) 普通成员 move（连线改挂）→ 403（move 仅 tree.edit_any）
    r = await async_client.post(
        f"/api/v1/nodes/{root}/move",
        json={"new_parent_id": other_trunk, "sort_order": 0},
        headers=seed_ids["member_headers"],
    )
    assert r.status_code == 403, r.text

    # 5) 非项目成员（outsider）连读树都不行 → 403
    r = await async_client.get(
        f"/api/v1/projects/{pid}/tree",
        headers=seed_ids["outsider_headers"],
    )
    assert r.status_code == 403, r.text

    # 6) 布局接口：member 可改自己子树节点布局；改别人主干 → 403
    r = await async_client.put(
        f"/api/v1/nodes/{root}/layout",
        json={"offset_x": 10, "offset_y": 20},
        headers=seed_ids["member_headers"],
    )
    assert r.status_code == 200, r.text
    r = await async_client.put(
        f"/api/v1/nodes/{other_trunk}/layout",
        json={"offset_x": 10, "offset_y": 20},
        headers=seed_ids["member_headers"],
    )
    assert r.status_code == 403, r.text
