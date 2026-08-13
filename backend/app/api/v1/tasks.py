"""
任务相关接口
"""
from typing import List, Optional
import json
import re
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload

from app.core.dependencies import CurrentUser, DbSession, VerifiedUser
from app.core.collab_errors import fail
from app.models.task import Task
from app.models.task_assignment import TaskAssignment
from app.models.category import Category
from app.models.tag import Tag, task_tags
from app.models.reminder import Reminder
from app.models.project import Project, ProjectMember
from app.models.company import CompanyMembership
from app.models.user import User
from app.models.tree import TreeNode
from app.schemas.task import (
    TaskCreate,
    TaskUpdate,
    TaskResponse,
    TaskComplete,
    TaskStatsResponse,
    PriorityStat,
    CategoryStat,
    BatchAction,
    TaskExtractRequest,
)
from app.schemas.common import ResponseData, PaginatedData

router = APIRouter(prefix="/tasks", tags=["任务"])


async def _validate_collab_scope(
    db: DbSession,
    user_id: int,
    *,
    company_id: int | None,
    project_id: int | None,
    project_node_id: int | None,
) -> int | None:
    """Validate task collaboration identifiers and return the canonical company id."""
    if project_id is None:
        if project_node_id is not None:
            raise HTTPException(status_code=422, detail="项目事项必须绑定项目")
        if company_id is not None:
            membership = await db.execute(
                select(CompanyMembership.id).where(
                    CompanyMembership.company_id == company_id,
                    CompanyMembership.user_id == user_id,
                    CompanyMembership.status == "active",
                ).limit(1)
            )
            if membership.scalar_one_or_none() is None:
                raise HTTPException(status_code=403, detail="非公司成员")
        return company_id

    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    membership = await db.execute(
        select(ProjectMember.id).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
            ProjectMember.left_at.is_(None),
        ).limit(1)
    )
    if membership.scalar_one_or_none() is None and project.created_by != user_id:
        raise HTTPException(status_code=403, detail="非项目成员")
    if company_id is not None and company_id != project.company_id:
        raise HTTPException(status_code=422, detail="公司与项目不匹配")
    if project_node_id is not None:
        node = await db.get(TreeNode, project_node_id)
        if not node or node.is_deleted or node.project_id != project_id:
            raise HTTPException(status_code=422, detail="项目事项与项目不匹配")
    return project.company_id


def _dedupe_user_ids(user_ids: List[int] | None) -> List[int]:
    """Keep assignment order stable while making repeated IDs idempotent."""
    seen: set[int] = set()
    result: List[int] = []
    for raw_id in user_ids or []:
        user_id = int(raw_id)
        if user_id not in seen:
            seen.add(user_id)
            result.append(user_id)
    return result


async def _validate_task_assignees(
    db: DbSession,
    *,
    owner_user_id: int,
    origin: str,
    company_id: int | None,
    project_id: int | None,
    requested_user_ids: List[int] | None,
) -> List[tuple[int, str]]:
    """Validate and normalize task assignees before touching the database."""
    user_ids = _dedupe_user_ids(requested_user_ids)

    # Personal tasks are intentionally single-owner.  An empty request still
    # means the creator, so clients cannot accidentally orphan a personal task.
    if origin != "project_link" or project_id is None:
        if not user_ids:
            user_ids = [owner_user_id]
        if user_ids != [owner_user_id]:
            raise HTTPException(status_code=403, detail="涓汉浠诲姟涓嶅厑璁告寚娲惧叾浠栫敤鎴?")
        return [(owner_user_id, "primary")]

    if not user_ids:
        return []

    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="椤圭洰涓嶅瓨鍦?")
    effective_company_id = company_id if company_id is not None else project.company_id
    if effective_company_id != project.company_id:
        raise HTTPException(status_code=422, detail="鍏徃涓庨」鐩笉鍖归厤")

    valid_result = await db.execute(
        select(ProjectMember.user_id)
        .join(
            CompanyMembership,
            and_(
                CompanyMembership.user_id == ProjectMember.user_id,
                CompanyMembership.company_id == project.company_id,
            ),
        )
        .join(User, User.id == ProjectMember.user_id)
        .where(
            ProjectMember.project_id == project.id,
            ProjectMember.user_id.in_(user_ids),
            ProjectMember.left_at.is_(None),
            CompanyMembership.status == "active",
            CompanyMembership.employment_status == "active",
            User.is_active.is_(True),
        )
    )
    valid_ids = set(valid_result.scalars().all())
    if valid_ids != set(user_ids):
        raise HTTPException(status_code=403, detail="鍙兘鎸囨淳缁欐湁鏁堢殑椤圭洰鎴愬憳")
    return [
        (user_id, "primary" if index == 0 else "collaborator")
        for index, user_id in enumerate(user_ids)
    ]


async def _replace_task_assignees(
    db: DbSession,
    task: Task,
    assignments: List[tuple[int, str]],
) -> None:
    existing = await db.execute(
        select(TaskAssignment).where(TaskAssignment.task_id == task.id)
    )
    for row in existing.scalars().all():
        await db.delete(row)
    await db.flush()
    for user_id, role_key in assignments:
        db.add(
            TaskAssignment(
                task_id=task.id,
                user_id=user_id,
                role_key=role_key,
            )
        )
    await db.flush()


def _task_assignee_dict(row: TaskAssignment) -> dict:
    user = row.user
    display_name = (
        (user.nickname if user else None)
        or (user.username if user else None)
        or f"鐢ㄦ埛{row.user_id}"
    )
    return {
        "user_id": row.user_id,
        "role_key": row.role_key,
        "display_name": display_name,
        "nickname": user.nickname if user else None,
        "username": user.username if user else None,
        "avatar_url": user.avatar_url if user else None,
    }


def _serialize_task(task: Task) -> dict:
    # The ORM relation is named ``assignees`` too, but its rows carry a
    # nested User object rather than the flattened response contract.  Strip
    # that relation before Pydantic validation and add the flattened form
    # below.
    raw = dict(getattr(task, "__dict__", {}))
    raw.pop("_sa_instance_state", None)
    raw.pop("assignees", None)
    raw.pop("assignee", None)
    task_dict = TaskResponse.model_validate(raw).model_dump()
    rows = list(getattr(task, "assignees", None) or [])
    assignees = [_task_assignee_dict(row) for row in rows]
    # Migration backfills old personal tasks; this fallback also keeps an
    # in-memory legacy row useful in development databases before migration.
    if not assignees and getattr(task, "origin", "personal") == "personal":
        owner = getattr(task, "user", None)
        assignees = [
            {
                "user_id": task.user_id,
                "role_key": "primary",
                "display_name": (owner.nickname if owner else None)
                or (owner.username if owner else None)
                or f"鐢ㄦ埛{task.user_id}",
                "nickname": owner.nickname if owner else None,
                "username": owner.username if owner else None,
                "avatar_url": owner.avatar_url if owner else None,
            }
        ]
    task_dict["assignees"] = assignees
    task_dict["assignee"] = next(
        (item for item in assignees if item["role_key"] == "primary"),
        assignees[0] if assignees else None,
    )
    task_dict["priority_label"] = task.priority_label
    task_dict["status_label"] = task.status_label
    return task_dict


@router.get("", response_model=ResponseData)
async def get_tasks(
    db: DbSession,
    user: CurrentUser,
    page: int = Query(1, ge=1),
    # 日历月视图一次拉全月任务，前端用 page_size=200
    page_size: int = Query(20, ge=1, le=200),
    # 可重复：?status=0&status=1 表示"未完成"。
    # 此前是 Optional[int]，重复传只有一个生效，小程序的待办列表因此把
    # 进行中的任务全漏掉了。单值 ?status=0 的老用法保持等价。
    status: Optional[List[int]] = Query(None),
    priority: Optional[int] = None,
    category_id: Optional[int] = None,
    tag_ids: Optional[str] = None,
    due_date_from: Optional[str] = None,
    due_date_to: Optional[str] = None,
    search: Optional[str] = None,
    is_recurring: Optional[bool] = None,
    needs_follow_up: Optional[bool] = None,
    include_deleted: bool = False,
    sort_by: str = "created_at",
    sort_order: str = "desc",
):
    """获取任务列表"""
    # 基础查询
    query = select(Task).where(Task.user_id == user.id)

    if not include_deleted:
        query = query.where(Task.is_deleted == False)

    # 筛选条件
    if status:
        query = query.where(Task.status.in_(status))
    if priority is not None:
        query = query.where(Task.priority == priority)
    if category_id is not None:
        query = query.where(Task.category_id == category_id)
    if is_recurring is not None:
        query = query.where(Task.is_recurring == is_recurring)
    if needs_follow_up:
        query = query.where(Task.needs_follow_up == True)
    if search:
        query = query.where(Task.title.ilike(f"%{search}%"))

    # 日期范围筛选
    if due_date_from:
        query = query.where(Task.due_date >= datetime.fromisoformat(due_date_from))
    if due_date_to:
        query = query.where(Task.due_date <= datetime.fromisoformat(due_date_to))

    # 标签筛选
    if tag_ids:
        ids = [int(x) for x in tag_ids.split(",")]
        query = query.join(task_tags).where(task_tags.c.tag_id.in_(ids))

    # 排序
    sort_column = getattr(Task, sort_by, Task.created_at)
    if sort_order == "asc":
        query = query.order_by(sort_column.asc())
    else:
        query = query.order_by(sort_column.desc())

    # 计算总数
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # 分页
    query = query.offset((page - 1) * page_size).limit(page_size)
    query = query.options(
        selectinload(Task.category),
        selectinload(Task.tags),
        selectinload(Task.reminders),
        selectinload(Task.assignees).selectinload(TaskAssignment.user),
    )

    result = await db.execute(query)
    tasks = result.scalars().all()

    # 构建响应
    task_responses = []
    for t in tasks:
        task_responses.append(_serialize_task(t))

    total_pages = (total + page_size - 1) // page_size

    return ResponseData(
        data=PaginatedData(
            items=task_responses,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )
    )


def _ics_escape(text: str) -> str:
    """RFC 5545 文本转义：反斜杠、分号、逗号、换行"""
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
    )


async def _build_user_ics(db, user_id: int, include_completed: bool = False) -> str:
    """生成某用户的 iCalendar 内容（一次性导出与订阅地址共用）。

    截止时间为当天 00:00:00 的任务按全天事件导出，其余按具体时刻导出。
    """
    query = select(Task).where(
        Task.user_id == user_id,
        Task.is_deleted == False,
        Task.due_date.isnot(None),
    )
    if not include_completed:
        query = query.where(Task.status != 2)
    query = query.order_by(Task.due_date.asc()).limit(1000)
    tasks = (await db.execute(query)).scalars().all()

    now_utc = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//WorkTodo//Task Export//CN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:WorkTodo",
    ]
    for t in tasks:
        due = t.due_date
        lines.append("BEGIN:VEVENT")
        lines.append(f"UID:task-{t.id}@worktodo")
        lines.append(f"DTSTAMP:{now_utc}")
        if due.hour == 0 and due.minute == 0 and due.second == 0:
            lines.append(f"DTSTART;VALUE=DATE:{due.strftime('%Y%m%d')}")
        else:
            dt = due if due.tzinfo else due.replace(tzinfo=timezone.utc)
            lines.append(
                f"DTSTART:{dt.astimezone(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
            )
        lines.append(f"SUMMARY:{_ics_escape(t.title or '')}")
        if t.description:
            lines.append(f"DESCRIPTION:{_ics_escape(t.description)}")
        lines.append(f"STATUS:{'COMPLETED' if t.status == 2 else 'CONFIRMED'}")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


@router.get("/export.ics")
async def export_tasks_ics(
    db: DbSession,
    user: CurrentUser,
    include_completed: bool = False,
):
    """导出当前用户有截止时间的任务为 iCalendar（.ics），可导入系统日历。"""
    from fastapi.responses import Response

    content = await _build_user_ics(db, user.id, include_completed)
    return Response(
        content=content,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="worktodo.ics"'},
    )


def calendar_feed_sig(user_id: int) -> str:
    """订阅地址签名：HMAC(SECRET_KEY, "calendar-feed:{user_id}") 截断 16 位。

    与 utils/email.py 的 Reply-To 签名同一思路：URL 中只暴露截断签名，
    不含 SECRET_KEY 本身；系统日历客户端无法带 Bearer 头，靠该签名鉴权。
    """
    import hashlib
    import hmac

    from app.core.config import settings

    return hmac.new(
        settings.SECRET_KEY.encode(),
        f"calendar-feed:{user_id}".encode(),
        hashlib.sha256,
    ).hexdigest()[:16]


@router.get("/calendar-feed-url", response_model=ResponseData)
async def get_calendar_feed_url(user: CurrentUser):
    """返回当前用户的 ICS 订阅相对路径（前端自行拼接域名）。"""
    sig = calendar_feed_sig(user.id)
    return ResponseData(
        data={"url": f"/api/v1/tasks/calendar/{user.id}.ics?sig={sig}"}
    )


@router.get("/calendar/{user_id}.ics")
async def calendar_feed_ics(
    user_id: int,
    db: DbSession,
    sig: str = "",
    include_completed: bool = False,
):
    """免 Header 的 ICS 订阅地址，供系统日历持续同步；签名不匹配返回 403。"""
    import hmac

    from fastapi.responses import Response

    if not sig or not hmac.compare_digest(sig, calendar_feed_sig(user_id)):
        raise HTTPException(status_code=403, detail="签名无效")

    content = await _build_user_ics(db, user_id, include_completed)
    return Response(
        content=content,
        media_type="text/calendar; charset=utf-8",
    )


@router.get("/today", response_model=ResponseData)
async def get_today_tasks(
    db: DbSession,
    user: CurrentUser,
):
    """获取今日待办"""
    from datetime import date
    today = date.today()
    tomorrow = today + __import__("datetime").timedelta(days=1)

    query = (
        select(Task)
        .where(
            Task.user_id == user.id,
            Task.is_deleted == False,
            Task.due_date >= datetime.combine(today, datetime.min.time()),
            Task.due_date < datetime.combine(tomorrow, datetime.min.time()),
        )
        .options(
            selectinload(Task.category),
            selectinload(Task.tags),
            selectinload(Task.reminders),
            selectinload(Task.assignees).selectinload(TaskAssignment.user),
        )
        .order_by(Task.priority.desc(), Task.due_date.asc())
    )

    result = await db.execute(query)
    tasks = result.scalars().all()

    task_responses = []
    for t in tasks:
        task_responses.append(_serialize_task(t))

    return ResponseData(data=task_responses)


@router.get("/stats", response_model=ResponseData)
async def get_task_stats(
    db: DbSession,
    user: CurrentUser,
    period: str = "today",
):
    """获取任务统计"""
    query = select(Task).where(Task.user_id == user.id, Task.is_deleted == False)

    # 按时间范围筛选 — 统一用 naive UTC，与 SQLite func.now()/server_default 一致
    # （勿用 date.today() 本地日界：UTC 库时会把「今天」任务滤成 0）
    from datetime import timedelta

    now = datetime.utcnow()
    if period == "today":
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        query = query.where(Task.created_at >= today_start)
    elif period == "week":
        week_ago = now - timedelta(days=7)
        query = query.where(Task.created_at >= week_ago)
    elif period == "month":
        month_ago = now - timedelta(days=30)
        query = query.where(Task.created_at >= month_ago)
    elif period == "year":
        year_ago = now - timedelta(days=365)
        query = query.where(Task.created_at >= year_ago)

    result = await db.execute(query)
    tasks = result.scalars().all()

    total = len(tasks)
    completed = sum(1 for t in tasks if t.status == Task.STATUS_DONE)
    pending = sum(1 for t in tasks if t.status == Task.STATUS_TODO)
    in_progress = sum(1 for t in tasks if t.status == Task.STATUS_IN_PROGRESS)
    # 确保 due_date 比较时两者都是 naive datetime
    overdue = sum(
        1 for t in tasks
        if t.due_date and t.due_date < now and t.status != Task.STATUS_DONE
    )

    # 按优先级统计
    by_priority = {
        "high": PriorityStat(
            total=sum(1 for t in tasks if t.priority == 2),
            completed=sum(1 for t in tasks if t.priority == 2 and t.status == Task.STATUS_DONE),
        ).model_dump(),
        "medium": PriorityStat(
            total=sum(1 for t in tasks if t.priority == 1),
            completed=sum(1 for t in tasks if t.priority == 1 and t.status == Task.STATUS_DONE),
        ).model_dump(),
        "low": PriorityStat(
            total=sum(1 for t in tasks if t.priority == 0),
            completed=sum(1 for t in tasks if t.priority == 0 and t.status == Task.STATUS_DONE),
        ).model_dump(),
    }

    # 按分类统计
    cat_map = {}  # {category_id: {"name": str, "total": int, "completed": int}}
    for t in tasks:
        cid = t.category_id
        if cid not in cat_map:
            cat_map[cid] = {"name": "", "total": 0, "completed": 0}
        cat_map[cid]["total"] += 1
        if t.status == Task.STATUS_DONE:
            cat_map[cid]["completed"] += 1

    # 查询分类名称
    if cat_map:
        cat_ids = [cid for cid in cat_map.keys() if cid is not None]
        if cat_ids:
            cat_result = await db.execute(
                select(Category.id, Category.name).where(Category.id.in_(cat_ids))
            )
            for cid, cname in cat_result.all():
                if cid in cat_map:
                    cat_map[cid]["name"] = cname

    # 处理无分类的任务
    by_category = []
    for cid, info in cat_map.items():
        by_category.append(CategoryStat(
            category_id=cid,
            category_name=info["name"] if info["name"] else "未分类",
            total=info["total"],
            completed=info["completed"],
        ))

    return ResponseData(
        data=TaskStatsResponse(
            total=total,
            completed=completed,
            pending=pending,
            in_progress=in_progress,
            overdue=overdue,
            # 百分数 0-100，与 Task.completion_rate（0-100 整数）同口径。
            # 此前返回 0-1 的比率，而 Web（Math.round）与 APP（toStringAsFixed(0)）
            # 都按百分数展示 —— 完成度低于 50% 一律显示 0%，进度环形同虚设。
            completion_rate=round(completed / total * 100, 1) if total > 0 else 0.0,
            by_priority=by_priority,
            by_category=by_category,
        )
    )


def _fallback_task_draft(text: str) -> dict:
    """Return a deterministic draft when the configured LLM is unavailable."""
    lines = [line.strip(" -*\t") for line in text.splitlines() if line.strip()]
    title = lines[0][:200] if lines else text[:200]
    if len(title) > 80 and "。" in title:
        title = title.split("。", 1)[0][:200]
    priority = 2 if re.search(r"(紧急|马上|urgent|asap|今天必须)", text, re.I) else 1
    due_date = None
    match = re.search(r"(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})", text)
    if match:
        due_date = f"{int(match.group(1)):04d}-{int(match.group(2)):02d}-{int(match.group(3)):02d}"
    return {
        "title": title,
        "description": text,
        "priority": priority,
        "status": 0,
        "due_date": due_date,
        "category": None,
    }


def _parse_task_draft(content: str, source_text: str) -> dict:
    """Parse a JSON LLM response and safely fall back to deterministic data."""
    raw = (content or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.I | re.S).strip()
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return _fallback_task_draft(source_text)
    if not isinstance(parsed, dict):
        return _fallback_task_draft(source_text)
    fallback = _fallback_task_draft(source_text)
    title = str(parsed.get("title") or fallback["title"]).strip()[:200]
    if not title:
        title = fallback["title"]
    priority = parsed.get("priority", fallback["priority"])
    try:
        priority = int(priority)
    except (TypeError, ValueError):
        priority = fallback["priority"]
    priority = priority if priority in (0, 1, 2) else fallback["priority"]
    due_date = parsed.get("due_date") or fallback["due_date"]
    if due_date:
        due_date = str(due_date)[:32]
    return {
        "title": title,
        "description": str(parsed.get("description") or fallback["description"])[:20000],
        "priority": priority,
        "status": int(parsed.get("status", 0)) if str(parsed.get("status", 0)).isdigit() else 0,
        "due_date": due_date,
        "category": str(parsed.get("category"))[:120] if parsed.get("category") else None,
    }


@router.post("/extract-from-chat", response_model=ResponseData)
async def extract_task_from_chat(
    data: TaskExtractRequest, db: DbSession, user: VerifiedUser
):
    """Extract a task draft from chat text using the configured LLM.

    This endpoint is intentionally draft-only: the caller must explicitly send
    the returned fields to ``POST /tasks``.  That keeps chat capture reversible
    and prevents an LLM from silently creating user data.
    """
    company_id = await _validate_collab_scope(
        db,
        user.id,
        company_id=data.company_id,
        project_id=data.project_id,
        project_node_id=None,
    )
    from app.services.llm_settings import chat_completion, resolve_llm

    llm = await resolve_llm(db, company_id=company_id, user=user)
    result = await chat_completion(
        llm,
        messages=[
            {
                "role": "system",
                "content": (
                    "Extract one actionable task from the user's chat. Return only JSON "
                    "with title, description, priority (0 low, 1 medium, 2 high), "
                    "status (0), due_date (ISO date or null), and category."
                ),
            },
            {"role": "user", "content": data.chat_text},
        ],
        temperature=0,
        max_tokens=512,
    )
    draft = _parse_task_draft(result.get("content", ""), data.chat_text)
    source_meta = dict(data.source_meta or {})
    source_meta.setdefault("extracted", True)
    source_meta["provider"] = result.get("provider") or llm.provider
    draft.update(
        {
            "company_id": company_id,
            "project_id": data.project_id,
            "origin": "project_link" if data.project_id else "personal",
            "source_channel": data.source_channel.strip()[:32] or "chat",
            "source_title": data.source_title,
            "source_url": data.source_url,
            "source_message_id": data.source_message_id,
            "source_meta": source_meta,
        }
    )
    return ResponseData(
        data={"draft": draft, "provider": result.get("provider") or llm.provider}
    )


@router.get("/{task_id}", response_model=ResponseData)
async def get_task(task_id: int, db: DbSession, user: CurrentUser):
    """获取任务详情"""
    query = (
        select(Task)
        .where(Task.id == task_id, Task.user_id == user.id)
        .options(
            selectinload(Task.category),
            selectinload(Task.tags),
            selectinload(Task.reminders),
            selectinload(Task.assignees).selectinload(TaskAssignment.user),
        )
    )
    result = await db.execute(query)
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    return ResponseData(data=_serialize_task(task))


@router.post("", response_model=ResponseData, status_code=status.HTTP_201_CREATED)
async def create_task(data: TaskCreate, db: DbSession, user: VerifiedUser):
    """创建任务（需完成双验证）"""
    ui_prefs = ((user.notify_pref or {}).get("ui") or {}) if isinstance(user.notify_pref, dict) else {}
    effective_priority = data.priority
    if "priority" not in data.model_fields_set:
        try:
            candidate = int(ui_prefs.get("task_default_priority"))
            if candidate in (0, 1, 2):
                effective_priority = candidate
        except (TypeError, ValueError):
            pass
    # 获取默认分类
    if data.category_id is None:
        preferred_category_id = ui_prefs.get("task_default_category_id")
        default_cat = None
        if preferred_category_id is not None:
            default_cat = (
                await db.execute(
                    select(Category).where(
                        Category.id == preferred_category_id,
                        Category.user_id == user.id,
                    )
                )
            ).scalar_one_or_none()
        result = await db.execute(
            select(Category).where(
                Category.user_id == user.id,
                Category.is_default == True,
            )
        )
        default_cat = default_cat or result.scalar_one_or_none()
        category_id = default_cat.id if default_cat else None
    else:
        # 校验分类归属：此前不查，任意 category_id 都能写进来，
        # 任务详情回读分类名/颜色时就把别人的分类信息带出去了。
        owned = (
            await db.execute(
                select(Category).where(
                    Category.id == data.category_id,
                    Category.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        if not owned:
            raise HTTPException(status_code=404, detail="分类不存在")
        category_id = owned.id

    # SQLite 不支持时区信息，转换为 naive datetime
    due_date_val = data.due_date
    if due_date_val and due_date_val.tzinfo is not None:
        due_date_val = due_date_val.replace(tzinfo=None)

    project_id = data.project_id
    company_id = await _validate_collab_scope(
        db,
        user.id,
        company_id=data.company_id,
        project_id=project_id,
        project_node_id=data.project_node_id,
    )
    if data.origin == "project_link" and project_id is None:
        raise HTTPException(status_code=422, detail="项目来源任务必须绑定项目")
    if data.origin == "personal" and project_id is not None:
        raise HTTPException(status_code=422, detail="绑定项目的任务来源必须为 project_link")

    assignment_specs = await _validate_task_assignees(
        db,
        owner_user_id=user.id,
        origin=data.origin,
        company_id=company_id,
        project_id=project_id,
        requested_user_ids=data.assignee_user_ids,
    )

    task = Task(
        user_id=user.id,
        user=user,
        category_id=category_id,
        title=data.title,
        description=data.description,
        priority=effective_priority,
        status=data.status,
        completed_at=datetime.utcnow() if data.status == Task.STATUS_DONE else None,
        due_date=due_date_val,
        is_recurring=data.is_recurring,
        recurrence_rule=data.recurrence_rule,
        company_id=company_id,
        project_id=project_id,
        project_node_id=data.project_node_id,
        origin=data.origin,
        linked_readonly=data.linked_readonly,
        source_channel=data.source_channel,
        source_title=data.source_title,
        source_url=data.source_url,
        source_message_id=data.source_message_id,
        source_meta=data.source_meta,
    )
    db.add(task)
    await db.flush()
    await _replace_task_assignees(db, task, assignment_specs)

    # 添加标签
    if data.tag_ids:
        result = await db.execute(select(Tag).where(Tag.id.in_(data.tag_ids), Tag.user_id == user.id))
        tags = list(result.scalars().all())
        if len({tag.id for tag in tags}) != len(set(data.tag_ids)):
            raise HTTPException(status_code=404, detail="标签不存在")
        # 先异步加载 tags 关系，避免赋值时触发同步懒加载导致 MissingGreenlet
        await db.refresh(task, ["tags"])
        task.tags = tags

    # 添加提醒
    if data.reminders:
        for r in data.reminders:
            # SQLite 不支持时区信息，转换为 naive datetime 避免 MissingGreenlet 错误
            remind_at = r.remind_at
            if remind_at and remind_at.tzinfo is not None:
                remind_at = remind_at.replace(tzinfo=None)

            reminder = Reminder(
                task_id=task.id,
                user_id=user.id,
                remind_at=remind_at,
                remind_type=r.remind_type,
                notify_channels=r.notify_channels,
            )
            db.add(reminder)

    await db.flush()

    # 重新加载关联数据
    await db.refresh(task, ["category", "tags", "reminders", "assignees"])

    return ResponseData(data=_serialize_task(task))


@router.put("/{task_id}", response_model=ResponseData)
async def update_task(task_id: int, data: TaskUpdate, db: DbSession, user: CurrentUser):
    """更新任务"""
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == user.id)
    )
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    update_data = data.model_dump(exclude_unset=True)
    requested_assignee_ids = update_data.pop("assignee_user_ids", None)
    assignees_should_change = requested_assignee_ids is not None

    effective_project_id = update_data.get("project_id", task.project_id)
    effective_node_id = update_data.get("project_node_id", task.project_node_id)
    effective_company_id = update_data.get("company_id", task.company_id)
    if (
        "project_id" in update_data
        or "project_node_id" in update_data
        or "company_id" in update_data
        or "origin" in update_data
    ):
        effective_company_id = await _validate_collab_scope(
            db,
            user.id,
            company_id=effective_company_id,
            project_id=effective_project_id,
            project_node_id=effective_node_id,
        )
        if effective_project_id is not None:
            update_data["company_id"] = effective_company_id

    effective_origin = update_data.get("origin", getattr(task, "origin", "personal"))
    if effective_origin == "project_link" and effective_project_id is None:
        raise HTTPException(status_code=422, detail="项目来源任务必须绑定项目")
    if effective_origin == "personal" and effective_project_id is not None:
        raise HTTPException(status_code=422, detail="绑定项目的任务来源必须为 project_link")

    if (
        "project_id" in update_data
        or "project_node_id" in update_data
        or "company_id" in update_data
        or "origin" in update_data
    ):
        assignees_should_change = True
    assignment_specs = None
    if assignees_should_change:
        assignment_specs = await _validate_task_assignees(
            db,
            owner_user_id=task.user_id,
            origin=effective_origin,
            company_id=effective_company_id,
            project_id=effective_project_id,
            requested_user_ids=requested_assignee_ids,
        )

    if "category_id" in update_data:
        category_id = update_data["category_id"]
        if category_id is None:
            raise HTTPException(status_code=422, detail="任务分类不能为空")
        category_exists = await db.scalar(
            select(Category.id).where(
                Category.id == category_id,
                Category.user_id == user.id,
            )
        )
        if category_exists is None:
            raise HTTPException(status_code=404, detail="分类不存在")

    # 投影只读：禁止改 status
    if (
        getattr(task, "origin", "personal") == "project_link"
        and getattr(task, "linked_readonly", True)
        and "status" in update_data
        and update_data["status"] != task.status
    ):
        return fail(403, 40321, "项目投影待办不可直接修改状态，请通过材料/进度流程")

    if "status" in update_data:
        update_data["completed_at"] = (
            datetime.utcnow() if update_data["status"] == Task.STATUS_DONE else None
        )

    # 处理标签更新
    tag_ids = update_data.pop("tag_ids", None)
    if tag_ids is not None:
        result = await db.execute(
            select(Tag).where(Tag.id.in_(tag_ids), Tag.user_id == user.id)
        )
        tags = list(result.scalars().all())
        if len({tag.id for tag in tags}) != len(set(tag_ids)):
            raise HTTPException(status_code=404, detail="标签不存在")
        # 先异步加载 tags 关系，避免赋值时触发同步懒加载导致 MissingGreenlet
        await db.refresh(task, ["tags"])
        task.tags = tags

    # 处理提醒更新：先删后建
    reminders_data = update_data.pop("reminders", None)
    if reminders_data is not None:
        # 删除旧提醒
        old_reminders = await db.execute(
            select(Reminder).where(Reminder.task_id == task.id)
        )
        for old_r in old_reminders.scalars().all():
            await db.delete(old_r)
        await db.flush()

        # 创建新提醒
        for r in reminders_data:
            remind_at = r.get("remind_at") if isinstance(r, dict) else r.remind_at
            remind_type = r.get("remind_type", 0) if isinstance(r, dict) else r.remind_type
            notify_channels = r.get("notify_channels") if isinstance(r, dict) else r.notify_channels

            # SQLite 不支持时区信息，转换为 naive datetime
            if remind_at and hasattr(remind_at, 'tzinfo') and remind_at.tzinfo is not None:
                remind_at = remind_at.replace(tzinfo=None)

            reminder = Reminder(
                task_id=task.id,
                user_id=user.id,
                remind_at=remind_at,
                remind_type=remind_type or 0,
                notify_channels=notify_channels,
            )
            db.add(reminder)

    # 更新其他字段
    for key, value in update_data.items():
        setattr(task, key, value)

    await db.flush()
    if assignment_specs is not None:
        await _replace_task_assignees(db, task, assignment_specs)
    await db.refresh(task)  # 刷新所有列属性（包括 updated_at 等 onupdate 生成的值）
    await db.refresh(task, ["category", "tags", "reminders", "assignees"])

    return ResponseData(data=_serialize_task(task))


@router.patch("/{task_id}/complete", response_model=ResponseData)
async def complete_task(task_id: int, data: TaskComplete, db: DbSession, user: CurrentUser):
    """标记任务完成（含完成评价）"""
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == user.id)
    )
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    if (
        getattr(task, "origin", "personal") == "project_link"
        and getattr(task, "linked_readonly", True)
    ):
        return fail(403, 40321, "项目投影待办不可直接标记完成")

    # 保存完成评价数据
    task.completion_rate = data.completion_rate
    task.completion_comment = data.completion_comment
    task.needs_follow_up = data.needs_follow_up

    if data.needs_follow_up:
        # 需要跟进：不标记为已完成，保留在未完成列表
        task.follow_up_reason = data.follow_up_reason

        # 处理时区：SQLite 不支持时区信息
        follow_up_remind_at = data.follow_up_remind_at
        if follow_up_remind_at and follow_up_remind_at.tzinfo is not None:
            follow_up_remind_at = follow_up_remind_at.replace(tzinfo=None)
        task.follow_up_remind_at = follow_up_remind_at
        task.follow_up_notify_channels = data.follow_up_notify_channels

        # 创建跟进提醒
        if follow_up_remind_at:
            reminder = Reminder(
                task_id=task.id,
                user_id=user.id,
                remind_at=follow_up_remind_at,
                remind_type=3,  # 3=跟进
                notify_channels=data.follow_up_notify_channels,
            )
            db.add(reminder)

        # 不修改 task.status，保持原状态（待办/进行中）
    else:
        # 不需要跟进：正常标记完成
        task.status = Task.STATUS_DONE
        task.completed_at = datetime.utcnow()

    await db.flush()
    await db.refresh(task)  # 刷新所有列属性（包括 updated_at 等 onupdate 生成的值）
    await db.refresh(task, ["category", "tags", "reminders", "assignees"])

    return ResponseData(data=_serialize_task(task))


@router.patch("/{task_id}/uncomplete", response_model=ResponseData)
async def uncomplete_task(task_id: int, db: DbSession, user: CurrentUser):
    """取消任务完成"""
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == user.id)
    )
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    task.status = Task.STATUS_TODO
    task.completed_at = None

    # 与 complete / update 一致返回完整任务：前端做单条本地替换，
    # 部分载荷会把 title / due_date 等字段抹掉
    await db.flush()
    await db.refresh(task)
    await db.refresh(task, ["category", "tags", "reminders", "assignees"])

    return ResponseData(data=_serialize_task(task))


@router.delete("/{task_id}", response_model=ResponseData)
async def delete_task(task_id: int, db: DbSession, user: CurrentUser):
    """删除任务（软删除）"""
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == user.id)
    )
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    task.is_deleted = True
    task.deleted_at = datetime.utcnow()

    return ResponseData(message="删除成功")


@router.patch("/batch/complete", response_model=ResponseData)
async def batch_complete(data: BatchAction, db: DbSession, user: CurrentUser):
    """批量完成"""
    now = datetime.utcnow()
    result = await db.execute(
        select(Task).where(
            Task.id.in_(data.task_ids),
            Task.user_id == user.id,
            Task.is_deleted == False,
        )
    )
    tasks = result.scalars().all()

    # 项目投影任务是只读的（linked_readonly），单条完成接口会拦，
    # 批量接口此前直接绕过，等于给了一条改协作数据的旁路。
    editable = [t for t in tasks if not getattr(t, "linked_readonly", False)]
    for task in editable:
        task.status = Task.STATUS_DONE
        task.completed_at = now

    return ResponseData(
        data={
            "completed_count": len(editable),
            "skipped_readonly": len(tasks) - len(editable),
        }
    )


@router.delete("/batch", response_model=ResponseData)
async def batch_delete(data: BatchAction, db: DbSession, user: CurrentUser):
    """批量删除"""
    now = datetime.utcnow()
    result = await db.execute(
        select(Task).where(
            Task.id.in_(data.task_ids),
            Task.user_id == user.id,
            Task.is_deleted == False,
        )
    )
    tasks = result.scalars().all()

    for task in tasks:
        task.is_deleted = True
        task.deleted_at = now

    return ResponseData(data={"deleted_count": len(tasks)})
