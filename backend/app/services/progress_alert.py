"""进度自动写入频控告警"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.progress import ProgressRecord
from app.models.project import ProjectMember
from app.models.tree import TreeNode
from app.services.notify.service import NotificationService
from app.services.policy_guard import PolicyGuard


async def check_and_alert(db: AsyncSession, node_id: int) -> bool:
    node = await db.get(TreeNode, node_id)
    if not node:
        return False
    company = await db.get(Company, node.company_id)
    if not company:
        return False

    pol = PolicyGuard().policy(company)
    alert_cfg = pol.get("progress_auto_write_alert") or {
        "window_seconds": 3600,
        "max_writes_per_node": 20,
        "notify_roles": ["pm"],
    }
    window = int(alert_cfg.get("window_seconds") or 3600)
    max_writes = int(alert_cfg.get("max_writes_per_node") or 20)
    since = datetime.now(timezone.utc) - timedelta(seconds=window)

    q = await db.execute(
        select(func.count())
        .select_from(ProgressRecord)
        .where(
            ProgressRecord.node_id == node_id,
            ProgressRecord.created_at >= since,
        )
    )
    count = int(q.scalar() or 0)
    if count <= max_writes:
        return False

    # notify PM roles on project
    roles = alert_cfg.get("notify_roles") or ["pm"]
    mq = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == node.project_id,
            ProjectMember.left_at.is_(None),
        )
    )
    members = list(mq.scalars().all())
    user_ids = []
    for m in members:
        role = getattr(m, "role", None) or getattr(m, "role_key", None) or ""
        if "pm" in roles and role in ("pm", "project_manager", "owner"):
            user_ids.append(m.user_id)
        elif role in roles:
            user_ids.append(m.user_id)
    if not user_ids:
        # fallback: all non-left members with pm-ish
        user_ids = [m.user_id for m in members if (getattr(m, "role", "") or "") in ("pm", "owner")]

    if not user_ids:
        return False

    await NotificationService().enqueue(
        db,
        company_id=node.company_id,
        user_ids=list(set(user_ids)),
        template_key="progress.auto_write_alert",
        payload={"node_title": node.title, "node_id": node.id, "write_count": count},
        channels=["in_app", "email"],
        project_id=node.project_id,
    )
    return True
