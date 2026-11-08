"""材料人工确认（review）测试

覆盖：
1. 提交后判定为 pending_review，无自动写入进度记录；
2. 负责人采纳后状态为 adopted，进度记录 source 为 manual_review，actor 为确认人；
3. 负责人驳回后状态为 rejected，产生 review_case；
4. 无权限用户操作返回 403；
5. 重复确认（非 pending_review 状态）返回 409；
6. 普通提交人不能自审（403），PM 提交人允许自审。
"""
import pytest
from sqlalchemy import select

from app.models.evidence import AsyncJob, EvidencePackage
from app.models.progress import ProgressRecord
from app.services.evidence_service import run_evidence_judge
from tests.collab.conftest import async_client, seed_ids


@pytest.mark.asyncio
async def test_evidence_submit_to_pending_review_without_progress(async_client, seed_ids, db_session):
    node_id = seed_ids["node_id"]
    member_headers = seed_ids["member_headers"]
    pm_headers = seed_ids["pm_headers"]

    # 1. 提交材料
    resp = await async_client.post(
        f"/api/v1/nodes/{node_id}/evidence",
        headers=member_headers,
        json={"summary_text": "工作项交付物初稿", "file_ids": []},
    )
    assert resp.status_code == 200, resp.text
    pkg_id = resp.json()["data"]["package_id"]
    job_id = int(resp.json()["data"]["job_id"])

    # 2. 跑判定任务
    job = await run_evidence_judge(db_session, job_id)
    await db_session.commit()
    assert job.status == "succeeded"

    # 3. 查看材料包详情
    detail_res = await async_client.get(f"/api/v1/evidence/{pkg_id}", headers=member_headers)
    assert detail_res.status_code == 200
    detail = detail_res.json()["data"]
    assert detail["status"] == "pending_review", "判定后必须为待确认 pending_review"
    assert detail["suggestion"] is not None, "必须返回判定建议"
    assert detail["can_review"] is False, "普通提交人不可确认自己的材料"

    pm_detail_res = await async_client.get(f"/api/v1/evidence/{pkg_id}", headers=pm_headers)
    assert pm_detail_res.status_code == 200
    assert pm_detail_res.json()["data"]["can_review"] is True, "项目 PM 应具备确认权限"

    # 4. 确认此时没有生成任何 ProgressRecord
    records = (
        await db_session.execute(
            select(ProgressRecord).where(ProgressRecord.evidence_package_id == pkg_id)
        )
    ).scalars().all()
    assert records == [], "判定后不得自动生成正式进度记录"


@pytest.mark.asyncio
async def test_pm_adopt_evidence_with_manual_review_source(async_client, seed_ids, db_session):
    node_id = seed_ids["node_id"]
    member_headers = seed_ids["member_headers"]
    pm_headers = seed_ids["pm_headers"]
    pm_user_id = seed_ids["pm_user_id"]

    resp = await async_client.post(
        f"/api/v1/nodes/{node_id}/evidence",
        headers=member_headers,
        json={"summary_text": "工作项交付物待确认", "file_ids": []},
    )
    assert resp.status_code == 200
    pkg_id = resp.json()["data"]["package_id"]
    job_id = int(resp.json()["data"]["job_id"])
    await run_evidence_judge(db_session, job_id)
    await db_session.commit()

    # PM 采纳
    review_resp = await async_client.post(
        f"/api/v1/evidence/{pkg_id}/review",
        headers=pm_headers,
        json={"decision": "adopted", "reason": "质量达标，予以采纳"},
    )
    assert review_resp.status_code == 200, review_resp.text
    adopted_pkg = review_resp.json()["data"]
    assert adopted_pkg["status"] == "adopted"
    assert adopted_pkg["can_review"] is False

    # 检查进度记录
    records = (
        await db_session.execute(
            select(ProgressRecord).where(ProgressRecord.evidence_package_id == pkg_id)
        )
    ).scalars().all()
    assert len(records) == 1
    rec = records[0]
    assert rec.source == "manual_review", "进度记录来源必须为 manual_review"
    assert rec.actor_user_id == pm_user_id, "操作人必须为确认人 PM"


@pytest.mark.asyncio
async def test_pm_reject_evidence(async_client, seed_ids, db_session):
    node_id = seed_ids["node_id"]
    member_headers = seed_ids["member_headers"]
    pm_headers = seed_ids["pm_headers"]

    resp = await async_client.post(
        f"/api/v1/nodes/{node_id}/evidence",
        headers=member_headers,
        json={"summary_text": "待驳回材料", "file_ids": []},
    )
    pkg_id = resp.json()["data"]["package_id"]
    job_id = int(resp.json()["data"]["job_id"])
    await run_evidence_judge(db_session, job_id)
    await db_session.commit()

    # PM 驳回
    review_resp = await async_client.post(
        f"/api/v1/evidence/{pkg_id}/review",
        headers=pm_headers,
        json={"decision": "rejected", "reason": "缺少核心产出物，请重新提交"},
    )
    assert review_resp.status_code == 200
    rejected_pkg = review_resp.json()["data"]
    assert rejected_pkg["status"] == "rejected"
    assert rejected_pkg["can_review"] is False

    # 确认没有 progress 记录
    records = (
        await db_session.execute(
            select(ProgressRecord).where(ProgressRecord.evidence_package_id == pkg_id)
        )
    ).scalars().all()
    assert records == []


@pytest.mark.asyncio
async def test_review_permission_and_submitter_self_review(async_client, seed_ids, db_session):
    node_id = seed_ids["node_id"]
    member_headers = seed_ids["member_headers"]
    outsider_headers = seed_ids["outsider_headers"]
    pm_headers = seed_ids["pm_headers"]

    # 成员提交材料
    resp = await async_client.post(
        f"/api/v1/nodes/{node_id}/evidence",
        headers=member_headers,
        json={"summary_text": "权限测试材料", "file_ids": []},
    )
    pkg_id = resp.json()["data"]["package_id"]
    job_id = int(resp.json()["data"]["job_id"])
    await run_evidence_judge(db_session, job_id)
    await db_session.commit()

    # 1. 外部人员无权限 -> 403
    r_out = await async_client.post(
        f"/api/v1/evidence/{pkg_id}/review",
        headers=outsider_headers,
        json={"decision": "adopted"},
    )
    assert r_out.status_code == 403

    # 2. 普通成员自审自己的材料 -> 403
    r_self = await async_client.post(
        f"/api/v1/evidence/{pkg_id}/review",
        headers=member_headers,
        json={"decision": "adopted"},
    )
    assert r_self.status_code == 403

    # 3. PM 提交自己的材料 -> PM 允许自审
    resp_pm = await async_client.post(
        f"/api/v1/nodes/{node_id}/evidence",
        headers=pm_headers,
        json={"summary_text": "PM 亲自提交的交付材料", "file_ids": []},
    )
    pm_pkg_id = resp_pm.json()["data"]["package_id"]
    pm_job_id = int(resp_pm.json()["data"]["job_id"])
    await run_evidence_judge(db_session, pm_job_id)
    await db_session.commit()

    r_pm_self = await async_client.post(
        f"/api/v1/evidence/{pm_pkg_id}/review",
        headers=pm_headers,
        json={"decision": "adopted", "reason": "PM自审确认"},
    )
    assert r_pm_self.status_code == 200, r_pm_self.text
    assert r_pm_self.json()["data"]["status"] == "adopted"


@pytest.mark.asyncio
async def test_duplicate_review_conflict_409(async_client, seed_ids, db_session):
    node_id = seed_ids["node_id"]
    member_headers = seed_ids["member_headers"]
    pm_headers = seed_ids["pm_headers"]

    resp = await async_client.post(
        f"/api/v1/nodes/{node_id}/evidence",
        headers=member_headers,
        json={"summary_text": "冲突测试材料", "file_ids": []},
    )
    pkg_id = resp.json()["data"]["package_id"]
    job_id = int(resp.json()["data"]["job_id"])
    await run_evidence_judge(db_session, job_id)
    await db_session.commit()

    # 首次采纳 -> 200
    r1 = await async_client.post(
        f"/api/v1/evidence/{pkg_id}/review",
        headers=pm_headers,
        json={"decision": "adopted"},
    )
    assert r1.status_code == 200

    # 重复确认 -> 409 Conflict
    r2 = await async_client.post(
        f"/api/v1/evidence/{pkg_id}/review",
        headers=pm_headers,
        json={"decision": "rejected"},
    )
    assert r2.status_code == 409
