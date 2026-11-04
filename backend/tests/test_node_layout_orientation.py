"""测试节点位置按方向存储及换父清空规则 (B1)"""
import pytest
from app.models.tree import TreeNode
from app.services.tree_service import TreeService

from tests.collab.conftest import async_client, seed_ids


@pytest.mark.asyncio
async def test_node_layout_orientation_lifecycle(async_client, seed_ids):
    root_id = seed_ids["root_node_id"]
    headers = seed_ids["pm_headers"]
    pid = seed_ids["project_id"]

    # 1. 带 horizontal 写入只改 horizontal
    r1 = await async_client.put(
        f"/api/v1/nodes/{root_id}/layout",
        json={"offset_x": 100, "offset_y": 200, "orientation": "horizontal"},
        headers=headers,
    )
    assert r1.status_code == 200, r1.text
    data1 = r1.json()["data"]
    assert data1["id"] == root_id
    assert data1["ui_offset"] is None
    assert data1["ui_offsets"] == {"horizontal": {"x": 100.0, "y": 200.0}}

    # 2. 再带 vertical 写入两者并存
    r2 = await async_client.put(
        f"/api/v1/nodes/{root_id}/layout",
        json={"offset_x": 50, "offset_y": 60, "orientation": "vertical"},
        headers=headers,
    )
    assert r2.status_code == 200, r2.text
    data2 = r2.json()["data"]
    assert data2["ui_offset"] is None
    assert data2["ui_offsets"]["horizontal"] == {"x": 100.0, "y": 200.0}
    assert data2["ui_offsets"]["vertical"] == {"x": 50.0, "y": 60.0}

    # 3. 不带 orientation 写旧字段，保留原有 ui_offsets
    r3 = await async_client.put(
        f"/api/v1/nodes/{root_id}/layout",
        json={"offset_x": 12, "offset_y": 34},
        headers=headers,
    )
    assert r3.status_code == 200, r3.text
    data3 = r3.json()["data"]
    assert data3["ui_offset"] == {"x": 12.0, "y": 34.0}
    assert data3["ui_offsets"]["horizontal"] == {"x": 100.0, "y": 200.0}
    assert data3["ui_offsets"]["vertical"] == {"x": 50.0, "y": 60.0}

    # 4. 非法值返回 422
    r_invalid = await async_client.put(
        f"/api/v1/nodes/{root_id}/layout",
        json={"offset_x": 10, "offset_y": 20, "orientation": "diagonal"},
        headers=headers,
    )
    assert r_invalid.status_code == 422, r_invalid.text

    # 5. 树接口与节点接口返回 ui_offsets 与 ui_offset
    # 5.1 节点详情接口 GET /nodes/{id}
    r_node = await async_client.get(
        f"/api/v1/nodes/{root_id}",
        headers=headers,
    )
    assert r_node.status_code == 200, r_node.text
    node_data = r_node.json()["data"]
    assert node_data["ui_offset"] == {"x": 12.0, "y": 34.0}
    assert node_data["ui_offsets"] == {
        "horizontal": {"x": 100.0, "y": 200.0},
        "vertical": {"x": 50.0, "y": 60.0},
    }

    # 5.2 树接口 GET /projects/{id}/tree
    r_tree = await async_client.get(
        f"/api/v1/projects/{pid}/tree?format=flat",
        headers=headers,
    )
    assert r_tree.status_code == 200, r_tree.text
    nodes_flat = r_tree.json()["data"]["nodes"]
    root_node_flat = next(n for n in nodes_flat if n["id"] == root_id)
    assert root_node_flat["ui_offset"] == {"x": 12.0, "y": 34.0}
    assert root_node_flat["ui_offsets"] == {
        "horizontal": {"x": 100.0, "y": 200.0},
        "vertical": {"x": 50.0, "y": 60.0},
    }

    # 5.3 聚合接口 GET /users/me/people-axis
    r_agg = await async_client.get(
        "/api/v1/users/me/people-axis",
        headers=headers,
    )
    assert r_agg.status_code == 200, r_agg.text
    agg_projects = r_agg.json()["data"]["projects"]
    target_project = next(p for p in agg_projects if p["project_id"] == pid)
    root_node_agg = next(n for n in target_project["nodes"] if n["id"] == root_id)
    assert root_node_agg["ui_offset"] == {"x": 12.0, "y": 34.0}
    assert root_node_agg["ui_offsets"] == {
        "horizontal": {"x": 100.0, "y": 200.0},
        "vertical": {"x": 50.0, "y": 60.0},
    }


@pytest.mark.asyncio
async def test_node_move_clears_offsets_on_parent_change(async_client, seed_ids, db_session):
    pid = seed_ids["project_id"]
    root_id = seed_ids["root_node_id"]
    headers = seed_ids["pm_headers"]
    tsvc = TreeService()

    # 创建两个同级人员节点挂在 root 下
    r_p1 = await async_client.post(
        f"/api/v1/projects/{pid}/nodes",
        json={"parent_id": root_id, "node_type_key": "person", "title": "主管A"},
        headers=headers,
    )
    assert r_p1.status_code == 200, r_p1.text
    p1_id = r_p1.json()["data"]["id"]

    r_p2 = await async_client.post(
        f"/api/v1/projects/{pid}/nodes",
        json={"parent_id": root_id, "node_type_key": "person", "title": "主管B"},
        headers=headers,
    )
    assert r_p2.status_code == 200, r_p2.text
    p2_id = r_p2.json()["data"]["id"]

    # 在主管A下创建一个人员节点
    r_sub = await async_client.post(
        f"/api/v1/projects/{pid}/nodes",
        json={"parent_id": p1_id, "node_type_key": "person", "title": "下属成员"},
        headers=headers,
    )
    assert r_sub.status_code == 200, r_sub.text
    sub_id = r_sub.json()["data"]["id"]

    # 给 sub 设置 ui_offset 和 ui_offsets
    await async_client.put(
        f"/api/v1/nodes/{sub_id}/layout",
        json={"offset_x": 15, "offset_y": 25},
        headers=headers,
    )
    await async_client.put(
        f"/api/v1/nodes/{sub_id}/layout",
        json={"offset_x": 115, "offset_y": 215, "orientation": "horizontal"},
        headers=headers,
    )
    await async_client.put(
        f"/api/v1/nodes/{sub_id}/layout",
        json={"offset_x": 315, "offset_y": 415, "orientation": "vertical"},
        headers=headers,
    )

    # 验证设置成功
    r_sub_check = await async_client.get(f"/api/v1/nodes/{sub_id}", headers=headers)
    assert r_sub_check.json()["data"]["ui_offset"] == {"x": 15.0, "y": 25.0}
    assert r_sub_check.json()["data"]["ui_offsets"] == {
        "horizontal": {"x": 115.0, "y": 215.0},
        "vertical": {"x": 315.0, "y": 415.0},
    }

    # 1. 同父节点内仅改 sort_order：偏移量不清
    r_move_same = await async_client.post(
        f"/api/v1/nodes/{sub_id}/move",
        json={"new_parent_id": p1_id, "sort_order": 99},
        headers=headers,
    )
    assert r_move_same.status_code == 200, r_move_same.text
    r_after_same = await async_client.get(f"/api/v1/nodes/{sub_id}", headers=headers)
    assert r_after_same.json()["data"]["ui_offset"] == {"x": 15.0, "y": 25.0}
    assert r_after_same.json()["data"]["ui_offsets"] == {
        "horizontal": {"x": 115.0, "y": 215.0},
        "vertical": {"x": 315.0, "y": 415.0},
    }

    # 2. 换上级（父节点真正改变）：ui_offset 和 ui_offsets 均被清除
    r_move_diff = await async_client.post(
        f"/api/v1/nodes/{sub_id}/move",
        json={"new_parent_id": p2_id, "sort_order": 0},
        headers=headers,
    )
    assert r_move_diff.status_code == 200, r_move_diff.text
    r_after_diff = await async_client.get(f"/api/v1/nodes/{sub_id}", headers=headers)
    assert r_after_diff.json()["data"]["ui_offset"] is None
    assert r_after_diff.json()["data"]["ui_offsets"] == {}

    # 3. 直接验证 TreeService.move_node 的同父换序与换父行为
    node = await db_session.get(TreeNode, sub_id)
    node.progress_json = {
        "ui_offset": {"x": 1, "y": 2},
        "ui_offsets": {"horizontal": {"x": 1, "y": 2}},
    }
    await db_session.commit()

    # 同父换序
    await tsvc.move_node(db_session, sub_id, new_parent_id=p2_id, sort_order=10)
    await db_session.commit()
    node = await db_session.get(TreeNode, sub_id)
    assert node.progress_json.get("ui_offset") == {"x": 1, "y": 2}
    assert node.progress_json.get("ui_offsets") == {"horizontal": {"x": 1, "y": 2}}

    # 换父回 p1
    await tsvc.move_node(db_session, sub_id, new_parent_id=p1_id, sort_order=0)
    await db_session.commit()
    node = await db_session.get(TreeNode, sub_id)
    assert "ui_offset" not in (node.progress_json or {})
    assert "ui_offsets" not in (node.progress_json or {})
