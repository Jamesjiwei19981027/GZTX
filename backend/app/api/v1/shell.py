"""Remix UI 壳层补齐 API：消息 / 活动流 / 人轴审计 / 节点布局 / 趋势"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm.attributes import flag_modified

from app.core.collab_errors import CollabError, fail
from app.core.dependencies import CurrentUser, DbSession
from app.models.audit import AuditLog
from app.models.company import CompanyMembership
from app.models.evidence import EvidencePackage
from app.models.project import Project, ProjectMember
from app.models.shell import TeamChannel, TeamChannelMessage, UserPresence
from app.models.task import Task
from app.models.tree import TreeNode
from app.models.user import User
from app.schemas.common import ResponseData
from app.services.acl import AclService
from app.services.tree_service import TreeService

router = APIRouter(tags=["shell"])
acl = AclService()
tsvc = TreeService()


class ChannelCreate(BaseModel):
    key: str = "general"
    name: str = Field(..., min_length=1, max_length=120)
    project_id: Optional[int] = None


class MessageCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)
    parent_id: Optional[int] = None


class LayoutBody(BaseModel):
    offset_x: float = 0
    offset_y: float = 0


class UiPrefsBody(BaseModel):
    language: Optional[str] = None
    accent: Optional[str] = None
    theme_mode: Optional[str] = None


class PresenceBody(BaseModel):
    status: str = "online"  # online|busy|offline


async def _require_company_member(db, user_id: int, company_id: int):
    mq = await db.execute(
        select(CompanyMembership.id).where(
            CompanyMembership.company_id == company_id,
            CompanyMembership.user_id == user_id,
            CompanyMembership.status == "active",
        ).limit(1)
    )
    if mq.scalar():
        return
    q = await db.execute(
        select(ProjectMember.id)
        .join(Project, Project.id == ProjectMember.project_id)
        .where(
            Project.company_id == company_id,
            ProjectMember.user_id == user_id,
            ProjectMember.left_at.is_(None),
        )
        .limit(1)
    )
    if not q.scalar():
        raise CollabError(403, 40301, "非公司成员")


async def _ensure_default_channels(db, company_id: int, project_id: int | None):
    keys = [
        ("general", "全员交流大厅"),
        ("project", "项目冲刺组"),
        ("direct", "私信与提及"),
    ]
    out = []
    for key, name in keys:
        conds = [
            TeamChannel.company_id == company_id,
            TeamChannel.key == key,
        ]
        if project_id is not None:
            conds.append(TeamChannel.project_id == project_id)
        else:
            conds.append(TeamChannel.project_id.is_(None))
        q = await db.execute(select(TeamChannel).where(*conds))
        ch = q.scalar_one_or_none()
        if not ch:
            ch = TeamChannel(
                company_id=company_id,
                project_id=project_id,
                key=key,
                name=name,
            )
            db.add(ch)
            await db.flush()
        out.append(ch)
    return out


def _msg_dto(m: TeamChannelMessage, u: User | None) -> dict:
    return {
        "id": m.id,
        "channel_id": m.channel_id,
        "user_id": m.user_id,
        "sender_name": (u.nickname or u.username) if u else f"用户{m.user_id}",
        "sender_avatar": (u.avatar_url or "") if u else "",
        "body": m.body,
        "likes": m.likes or 0,
        "parent_id": m.parent_id,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


@router.get("/companies/{company_id}/channels", response_model=ResponseData)
async def list_channels(
    company_id: int,
    db: DbSession,
    user: CurrentUser,
    project_id: Optional[int] = None,
):
    try:
        await _require_company_member(db, user.id, company_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    channels = await _ensure_default_channels(db, company_id, project_id)
    await db.commit()
    return ResponseData(
        data={
            "items": [
                {
                    "id": c.id,
                    "key": c.key,
                    "name": c.name,
                    "project_id": c.project_id,
                }
                for c in channels
            ]
        }
    )


@router.post("/companies/{company_id}/channels", response_model=ResponseData)
async def create_channel(
    company_id: int, body: ChannelCreate, db: DbSession, user: CurrentUser
):
    try:
        await _require_company_member(db, user.id, company_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    ch = TeamChannel(
        company_id=company_id,
        project_id=body.project_id,
        key=body.key[:32],
        name=body.name,
    )
    db.add(ch)
    await db.commit()
    await db.refresh(ch)
    return ResponseData(
        data={"id": ch.id, "key": ch.key, "name": ch.name, "project_id": ch.project_id}
    )


@router.get("/channels/{channel_id}/messages", response_model=ResponseData)
async def list_messages(
    channel_id: int,
    db: DbSession,
    user: CurrentUser,
    page: int = 1,
    page_size: int = 50,
):
    ch = await db.get(TeamChannel, channel_id)
    if not ch:
        return fail(404, 40400, "频道不存在")
    try:
        await _require_company_member(db, user.id, ch.company_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    page = max(1, page)
    page_size = min(100, max(1, page_size))
    q = await db.execute(
        select(TeamChannelMessage, User)
        .outerjoin(User, User.id == TeamChannelMessage.user_id)
        .where(TeamChannelMessage.channel_id == channel_id)
        .order_by(TeamChannelMessage.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = q.all()
    items = [_msg_dto(m, u) for m, u in rows]
    items.reverse()
    return ResponseData(data={"items": items, "page": page, "page_size": page_size})


@router.post("/channels/{channel_id}/messages", response_model=ResponseData)
async def post_message(
    channel_id: int, body: MessageCreate, db: DbSession, user: CurrentUser
):
    ch = await db.get(TeamChannel, channel_id)
    if not ch:
        return fail(404, 40400, "频道不存在")
    try:
        await _require_company_member(db, user.id, ch.company_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    m = TeamChannelMessage(
        channel_id=channel_id,
        user_id=user.id,
        body=body.body.strip(),
        parent_id=body.parent_id,
    )
    db.add(m)
    await db.commit()
    await db.refresh(m)
    u = await db.get(User, user.id)
    return ResponseData(data=_msg_dto(m, u))


@router.post("/channels/messages/{message_id}/like", response_model=ResponseData)
async def like_message(message_id: int, db: DbSession, user: CurrentUser):
    m = await db.get(TeamChannelMessage, message_id)
    if not m:
        return fail(404, 40400, "消息不存在")
    ch = await db.get(TeamChannel, m.channel_id)
    if not ch:
        return fail(404, 40400, "频道不存在")
    try:
        await _require_company_member(db, user.id, ch.company_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    m.likes = int(m.likes or 0) + 1
    await db.commit()
    return ResponseData(data={"id": m.id, "likes": m.likes})


@router.get("/projects/{project_id}/activity", response_model=ResponseData)
async def project_activity(
    project_id: int,
    db: DbSession,
    user: CurrentUser,
    limit: int = Query(30, ge=1, le=100),
):
    p = await db.get(Project, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(db, user.id, p.company_id, "project.read", project_id=p.id):
        return fail(403, 40301, "无权查看项目")
    q = await db.execute(
        select(AuditLog)
        .where(AuditLog.project_id == project_id)
        .order_by(AuditLog.id.desc())
        .limit(limit)
    )
    logs = q.scalars().all()
    items = []
    for a in logs:
        detail = a.detail_json or {}
        title = detail.get("title") or a.action
        items.append(
            {
                "id": a.id,
                "type": a.action,
                "title": title,
                "resource_type": a.resource_type,
                "resource_id": a.resource_id,
                "actor_user_id": a.actor_user_id,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "detail": detail,
            }
        )
    # 若审计为空，用最近证据补一刀
    if not items:
        eq = await db.execute(
            select(EvidencePackage)
            .where(EvidencePackage.project_id == project_id)
            .order_by(EvidencePackage.id.desc())
            .limit(limit)
        )
        for pkg in eq.scalars().all():
            items.append(
                {
                    "id": f"ev-{pkg.id}",
                    "type": "evidence.submitted",
                    "title": (pkg.summary_text or "证据提交")[:80],
                    "resource_type": "evidence",
                    "resource_id": str(pkg.id),
                    "actor_user_id": pkg.submitter_user_id,
                    "created_at": pkg.submitted_at.isoformat()
                    if pkg.submitted_at
                    else None,
                    "detail": {},
                }
            )
    return ResponseData(data={"items": items})


@router.post("/projects/{project_id}/axis-audit", response_model=ResponseData)
async def axis_audit(project_id: int, db: DbSession, user: CurrentUser):
    """人轴风险审计：基于进度/证据的启发式（不依赖前端 Gemini）。"""
    p = await db.get(Project, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(db, user.id, p.company_id, "project.read", project_id=p.id):
        return fail(403, 40301, "无权查看项目")

    nodes = (
        await db.execute(
            select(TreeNode).where(
                TreeNode.project_id == project_id, TreeNode.is_deleted.is_(False)
            )
        )
    ).scalars().all()
    type_keys = {}
    people = []
    for n in nodes:
        key, _ = await tsvc.get_type_key(db, n)
        type_keys[n.id] = key
        if key == "person":
            people.append(n)

    node_audits = []
    for person in people:
        children = [n for n in nodes if n.parent_id == person.id]
        matters = [c for c in children if type_keys.get(c.id) != "person"]
        blocked = 0
        stale = 0
        done = 0
        for m in matters:
            pj = m.progress_json or {}
            st = pj.get("status")
            pct = float(pj.get("percent") or 0)
            if st in ("blocked", "at_risk") or pct < 0:
                blocked += 1
            if st in ("done", "completed", "reached") or pct >= 100:
                done += 1
            # 无进展且无证据 → stale
            ev_cnt = (
                await db.execute(
                    select(func.count())
                    .select_from(EvidencePackage)
                    .where(EvidencePackage.node_id == m.id)
                )
            ).scalar() or 0
            if pct < 10 and int(ev_cnt) == 0 and matters:
                stale += 1
        risk = "low"
        if blocked >= 2 or stale >= 3:
            risk = "high"
        elif blocked >= 1 or stale >= 1:
            risk = "medium"
        suggested = []
        if blocked:
            suggested.append("跟进被阻塞事项并补充证据")
        if stale:
            suggested.append("推动无进展事项提交首份证据")
        if not matters:
            suggested.append("为人节点挂载范围/工作项")
        if not suggested:
            suggested.append("保持节奏，按期复核终责链路")
        node_audits.append(
            {
                "node_id": person.id,
                "title": person.title,
                "risk_level": risk,
                "summary": f"事项 {len(matters)}，完成 {done}，阻塞 {blocked}，停滞 {stale}",
                "suggested_actions": suggested,
            }
        )

    overall = "low"
    if any(a["risk_level"] == "high" for a in node_audits):
        overall = "high"
    elif any(a["risk_level"] == "medium" for a in node_audits):
        overall = "medium"

    return ResponseData(
        data={
            "project_id": project_id,
            "overall_risk": overall,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "nodes": node_audits,
        }
    )


@router.put("/nodes/{node_id}/layout", response_model=ResponseData)
async def put_node_layout(
    node_id: int, body: LayoutBody, db: DbSession, user: CurrentUser
):
    node = await db.get(TreeNode, node_id)
    if not node or node.is_deleted:
        return fail(404, 40400, "节点不存在")
    if not await acl.can(
        db, user.id, node.company_id, "tree.edit_any", project_id=node.project_id
    ):
        # 允许成员编辑自己指派节点的布局
        if not await acl.can(
            db,
            user.id,
            node.company_id,
            "tree.edit_subtree",
            project_id=node.project_id,
            node_id=node.id,
        ):
            return fail(403, 40300, "无权编辑布局")
    pj = dict(node.progress_json or {})
    pj["ui_offset"] = {"x": float(body.offset_x), "y": float(body.offset_y)}
    node.progress_json = pj
    flag_modified(node, "progress_json")
    await db.commit()
    return ResponseData(data={"id": node.id, "ui_offset": pj["ui_offset"]})


@router.get("/tasks/stats/trend", response_model=ResponseData)
async def task_stats_trend(
    db: DbSession,
    user: CurrentUser,
    period: str = "week",
):
    days = 7 if period == "week" else 30 if period == "month" else 90
    now = datetime.utcnow()
    start = (now - timedelta(days=days - 1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    q = await db.execute(
        select(Task).where(
            Task.user_id == user.id,
            Task.is_deleted.is_(False),
            Task.created_at >= start,
        )
    )
    tasks = q.scalars().all()
    buckets: dict[str, dict] = {}
    for i in range(days):
        d = (start + timedelta(days=i)).strftime("%Y-%m-%d")
        buckets[d] = {"date": d, "created": 0, "completed": 0}
    for t in tasks:
        if t.created_at:
            key = t.created_at.strftime("%Y-%m-%d")
            if key in buckets:
                buckets[key]["created"] += 1
        if t.completed_at:
            key = t.completed_at.strftime("%Y-%m-%d")
            if key in buckets:
                buckets[key]["completed"] += 1
    series = list(buckets.values())
    return ResponseData(data={"period": period, "series": series})


@router.put("/users/me/ui-prefs", response_model=ResponseData)
async def put_ui_prefs(body: UiPrefsBody, db: DbSession, user: CurrentUser):
    pref = dict(user.notify_pref or {})
    ui = dict(pref.get("ui") or {})
    data = body.model_dump(exclude_unset=True)
    ui.update({k: v for k, v in data.items() if v is not None})
    pref["ui"] = ui
    user.notify_pref = pref
    flag_modified(user, "notify_pref")
    await db.commit()
    return ResponseData(data={"ui": ui})


@router.get("/users/me/ui-prefs", response_model=ResponseData)
async def get_ui_prefs(db: DbSession, user: CurrentUser):
    pref = user.notify_pref or {}
    return ResponseData(data={"ui": pref.get("ui") or {}})


@router.put("/users/me/presence", response_model=ResponseData)
async def put_presence(body: PresenceBody, db: DbSession, user: CurrentUser):
    status = body.status if body.status in ("online", "busy", "offline") else "online"
    row = await db.get(UserPresence, user.id)
    if not row:
        row = UserPresence(user_id=user.id, status=status)
        db.add(row)
    else:
        row.status = status
        row.last_seen_at = datetime.now(timezone.utc)
    await db.commit()
    return ResponseData(data={"user_id": user.id, "status": status})


@router.get("/companies/{company_id}/presence", response_model=ResponseData)
async def list_presence(company_id: int, db: DbSession, user: CurrentUser):
    try:
        await _require_company_member(db, user.id, company_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    # 公司成员
    mq = await db.execute(
        select(CompanyMembership.user_id).where(
            CompanyMembership.company_id == company_id,
            CompanyMembership.status == "active",
        )
    )
    user_ids = [r[0] for r in mq.all()]
    if not user_ids:
        return ResponseData(data={"items": []})
    pq = await db.execute(select(UserPresence).where(UserPresence.user_id.in_(user_ids)))
    by_id = {p.user_id: p for p in pq.scalars().all()}
    now = datetime.now(timezone.utc)
    items = []
    for uid in user_ids:
        p = by_id.get(uid)
        st = "offline"
        if p:
            st = p.status
            if p.last_seen_at:
                seen = p.last_seen_at
                if seen.tzinfo is None:
                    seen = seen.replace(tzinfo=timezone.utc)
                if (now - seen).total_seconds() > 300 and st == "online":
                    st = "offline"
        items.append({"user_id": uid, "status": st})
    return ResponseData(data={"items": items})
