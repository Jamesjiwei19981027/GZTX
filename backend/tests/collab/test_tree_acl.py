"""树编辑 ACL 回归：tree.edit_any / tree.edit_subtree(_owns_path) / 布局接口权限口径"""
import pytest


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

    # 3) PM 建一个不指派给 member 的主干人 → member 往它下面挂 → 403（不拥有该路径）
    r = await async_client.post(
        f"/api/v1/projects/{pid}/nodes",
        json={"parent_id": None, "node_type_key": "person", "title": "别人的主干"},
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 200, r.text
    other_trunk = r.json()["data"]["id"]

    r = await async_client.post(
        f"/api/v1/projects/{pid}/nodes",
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
