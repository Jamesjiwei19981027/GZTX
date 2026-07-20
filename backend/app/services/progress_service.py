"""正式进度账本 — 唯一写入口"""
from copy import deepcopy
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.progress import ProgressRecord
from app.models.tree import TreeNode


async def append_progress(
    db: AsyncSession,
    *,
    company_id: int,
    project_id: int,
    node_id: int,
    event_type: str,
    source: str,
    after_json: dict,
    before_json: dict | None = None,
    actor_user_id: int | None = None,
    agent_definition_id: int | None = None,
    evidence_package_id: int | None = None,
    review_case_id: int | None = None,
    reason: str | None = None,
) -> ProgressRecord:
    node = await db.get(TreeNode, node_id)
    if node is None or node.is_deleted:
        raise ValueError("node_not_found")
    if node.company_id != company_id or node.project_id != project_id:
        raise ValueError("node_company_mismatch")

    snapshot = deepcopy(after_json)
    if "updated_at" not in snapshot:
        snapshot["updated_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    rec = ProgressRecord(
        company_id=company_id,
        project_id=project_id,
        node_id=node_id,
        event_type=event_type,
        source=source,
        actor_user_id=actor_user_id,
        agent_definition_id=agent_definition_id,
        evidence_package_id=evidence_package_id,
        review_case_id=review_case_id,
        before_json=before_json,
        after_json=snapshot,
        reason=reason,
    )
    db.add(rec)
    await db.flush()

    snapshot = {**snapshot, "last_record_id": rec.id}
    rec.after_json = snapshot
    node.progress_json = snapshot

    db.add(
        AuditLog(
            company_id=company_id,
            project_id=project_id,
            actor_user_id=actor_user_id,
            action="progress.write",
            resource_type="tree_node",
            resource_id=str(node_id),
            detail_json={
                "record_id": rec.id,
                "event_type": event_type,
                "source": source,
                "evidence_package_id": evidence_package_id,
            },
        )
    )
    await db.flush()
    return rec
