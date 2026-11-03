import pytest


@pytest.mark.asyncio
async def test_create_project_tree_and_evidence_flow(async_client, seed_ids):
    # tree readable by member
    r = await async_client.get(
        f"/api/v1/projects/{seed_ids['project_id']}/tree",
        headers=seed_ids["member_headers"],
    )
    assert r.status_code == 200
    assert r.json()["code"] == 200
    assert len(r.json()["data"]["nodes"]) >= 1

    # outsider forbidden
    r0 = await async_client.get(
        f"/api/v1/projects/{seed_ids['project_id']}/tree",
        headers=seed_ids["outsider_headers"],
    )
    assert r0.status_code == 403

    # create node as PM
    r2 = await async_client.post(
        f"/api/v1/projects/{seed_ids['project_id']}/nodes",
        json={
            "parent_id": seed_ids["root_node_id"],
            "node_type_key": "work_item",
            "title": "新工作项",
            "assignees": [{"user_id": seed_ids["member_user_id"], "role_key": "primary"}],
        },
        headers=seed_ids["pm_headers"],
    )
    assert r2.json()["code"] == 200
    node_id = r2.json()["data"]["id"]
    assert r2.json()["data"]["progress_json"]["status"] == "not_started"

    # submit evidence as member → adopted
    r3 = await async_client.post(
        f"/api/v1/nodes/{node_id}/evidence",
        json={
            "summary_text": "完成联调",
            "structured": {"percent": 100, "status": "done"},
            "file_ids": [],
        },
        headers=seed_ids["member_headers"],
    )
    assert r3.status_code == 200
    body = r3.json()
    assert body["code"] == 200
    assert body["data"]["status"] == "adopted"

    # progress timeline
    r4 = await async_client.get(
        f"/api/v1/nodes/{node_id}/progress",
        headers=seed_ids["pm_headers"],
    )
    assert r4.json()["code"] == 200
    assert r4.json()["data"]["progress_json"]["status"] == "done"
    assert len(r4.json()["data"]["recent_records"]) >= 1

    # Authenticated mini-program evidence uses the same project ACL.
    r5 = await async_client.post(
        f"/api/v1/nodes/{node_id}/evidence",
        json={"summary_text": "wx", "file_ids": []},
        headers={**seed_ids["member_headers"], "X-Client-Channel": "wechat"},
    )
    assert r5.status_code == 200, r5.text
    assert r5.json()["code"] == 200


@pytest.mark.asyncio
async def test_move_rejects_cycle(async_client, seed_ids):
    # 人挂人 = 下级，是合法链路；构造 root → A → B，再把 A 移到 B 下触发成环
    r_a = await async_client.post(
        f"/api/v1/projects/{seed_ids['project_id']}/nodes",
        json={"parent_id": seed_ids["root_node_id"], "node_type_key": "person", "title": "下级A"},
        headers=seed_ids["pm_headers"],
    )
    a_id = r_a.json()["data"]["id"]
    r_b = await async_client.post(
        f"/api/v1/projects/{seed_ids['project_id']}/nodes",
        json={"parent_id": a_id, "node_type_key": "person", "title": "下级B"},
        headers=seed_ids["pm_headers"],
    )
    b_id = r_b.json()["data"]["id"]
    r = await async_client.post(
        f"/api/v1/nodes/{a_id}/move",
        json={"new_parent_id": b_id, "sort_order": 0},
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 422
    assert r.json()["code"] == 42204


@pytest.mark.asyncio
async def test_append_progress_service(db_session, seed_ids):
    from app.models.tree import TreeNode
    from app.services.progress_service import append_progress

    node = await db_session.get(TreeNode, seed_ids["node_id"])
    before = dict(node.progress_json)
    after = {
        "template": "work_item",
        "status": "done",
        "percent": 100,
        "checklist": [],
        "updated_at": "2026-07-19T00:00:00Z",
    }
    rec = await append_progress(
        db_session,
        company_id=node.company_id,
        project_id=node.project_id,
        node_id=node.id,
        event_type="set_status",
        source="pm_agent_auto",
        before_json=before,
        after_json=after,
        reason="test",
    )
    await db_session.commit()
    assert rec.id is not None
    await db_session.refresh(node)
    assert node.progress_json["status"] == "done"
    assert node.progress_json["last_record_id"] == rec.id
