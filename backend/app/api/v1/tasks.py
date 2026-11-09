"""
任务相关接口
"""
from typing import List, Optional
import json
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import select, func, and_, or_
from sqlalchemy.orm import selectinload

from app.core.dependencies import CurrentUser, DbSession, EmailVerifiedUser
from app.core.config import settings
from app.core.collab_errors import fail
from app.models.task import Task
from app.models.task_schedule import TaskScheduleChange
from app.services.task_statistics import statistics_query, statistics_window
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
    BatchReschedule,
    TaskExtractRequest,
)
from app.schemas.common import ResponseData, PaginatedData
from app.utils.datetime import to_naive_utc

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


def task_visibility_filter(user_id: int):
    """读路径可见性：本人拥有 OR 被指派（TaskAssignment）。

    写路径（更新/完成/删除/回收站）仍然 owner-only；协作任务的状态流转
    走项目材料/进度流程，不在这里放开。
    """
    return or_(
        Task.user_id == user_id,
        Task.id.in_(
            select(TaskAssignment.task_id).where(TaskAssignment.user_id == user_id)
        ),
    )


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
    """获取任务列表（本人 + 被指派给我的任务）"""
    # 基础查询
    query = select(Task).where(task_visibility_filter(user.id))

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
        query = query.where(Task.due_date >= to_naive_utc(datetime.fromisoformat(due_date_from)))
    if due_date_to:
        query = query.where(Task.due_date <= to_naive_utc(datetime.fromisoformat(due_date_to)))

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


async def ensure_calendar_feed_token(db: DbSession, user) -> str:
    """取当前用户的 ICS 订阅令牌，没有就生成一个。

    旧实现是 HMAC(SECRET_KEY, user_id) 截断 16 位：既短（8 字节熵），又**无法撤销**
    ——泄露后除了换全站 SECRET_KEY（把所有人的会话一起踢掉）没有别的办法。
    改为 per-user 落库的 32 字节随机令牌，可单独重置。
    """
    import secrets

    if not user.calendar_feed_token:
        user.calendar_feed_token = secrets.token_urlsafe(32)
        await db.flush()
    return user.calendar_feed_token


@router.get("/calendar-feed-url", response_model=ResponseData)
async def get_calendar_feed_url(db: DbSession, user: CurrentUser):
    """返回当前用户的 ICS 订阅相对路径（前端自行拼接域名）。"""
    token = await ensure_calendar_feed_token(db, user)
    return ResponseData(data={"url": f"/api/v1/tasks/calendar/{token}.ics"})


@router.post("/calendar-feed-url/reset", response_model=ResponseData)
async def reset_calendar_feed_url(db: DbSession, user: CurrentUser):
    """重置订阅令牌：旧地址立即失效（已添加的日历订阅会失败，需要重新添加）。"""
    import secrets

    user.calendar_feed_token = secrets.token_urlsafe(32)
    await db.flush()
    return ResponseData(
        data={"url": f"/api/v1/tasks/calendar/{user.calendar_feed_token}.ics"},
        message="订阅地址已重置，旧地址立即失效",
    )


@router.get("/calendar/{token}.ics")
async def calendar_feed_ics(
    token: str,
    db: DbSession,
    request: Request,
    include_completed: bool = False,
):
    """免 Header 的 ICS 订阅地址，供系统日历持续同步；令牌无效返回 403。"""
    from fastapi.responses import Response

    from app.models.user import User as UserModel
    from app.services.rate_limit import enforce_calendar_feed

    await enforce_calendar_feed(db, request)

    holder = None
    if token:
        holder = (
            await db.execute(
                select(UserModel).where(UserModel.calendar_feed_token == token)
            )
        ).scalar_one_or_none()
    if holder is None or not holder.is_active:
        raise HTTPException(status_code=403, detail="订阅令牌无效")

    content = await _build_user_ics(db, holder.id, include_completed)
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
            task_visibility_filter(user.id),
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
    project_id: int | None = Query(None, gt=0),
    timezone_offset: int = Query(0, ge=-720, le=840),
):
    """获取任务统计"""
    start, now, _, _ = statistics_window(period, timezone_offset)
    query = statistics_query(user.id, project_id).where(Task.created_at >= start, Task.created_at <= now)

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
    data: TaskExtractRequest, db: DbSession, user: EmailVerifiedUser
):
    """从聊天文本中 AI 提取任务草稿

    Extract a task draft from chat text using the configured LLM.

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


@router.get("/trash", response_model=ResponseData)
async def get_trash(
    db: DbSession,
    user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
):
    """回收站：当前用户软删任务，按删除时间倒序（30 天后由调度任务物理清理）。"""
    base = select(Task).where(Task.user_id == user.id, Task.is_deleted == True)

    total = (
        await db.execute(select(func.count()).select_from(base.subquery()))
    ).scalar() or 0

    query = (
        base.order_by(Task.deleted_at.desc().nulls_last(), Task.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .options(
            selectinload(Task.category),
            selectinload(Task.tags),
            selectinload(Task.reminders),
            selectinload(Task.assignees).selectinload(TaskAssignment.user),
        )
    )
    tasks = (await db.execute(query)).scalars().all()

    return ResponseData(
        data=PaginatedData(
            items=[_serialize_task(t) for t in tasks],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=(total + page_size - 1) // page_size,
        )
    )


@router.post("/{task_id:int}/restore", response_model=ResponseData)
async def restore_task(task_id: int, db: DbSession, user: CurrentUser):
    """从回收站恢复任务（仅本人的软删任务）。"""
    result = await db.execute(
        select(Task).where(
            Task.id == task_id,
            Task.user_id == user.id,
            Task.is_deleted == True,
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在或不在回收站")

    task.is_deleted = False
    task.deleted_at = None

    await db.flush()
    await db.refresh(task)
    await db.refresh(task, ["category", "tags", "reminders", "assignees"])

    return ResponseData(data=_serialize_task(task))


@router.get("/{task_id:int}", response_model=ResponseData)
async def get_task(task_id: int, db: DbSession, user: CurrentUser):
    """获取任务详情（本人或被指派人可见）"""
    query = (
        select(Task)
        .where(Task.id == task_id, task_visibility_filter(user.id))
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
async def create_task(data: TaskCreate, db: DbSession, user: EmailVerifiedUser):
    """创建任务（需完成邮箱验证；协作任务需手机号）"""
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

    # 库里统一存 naive UTC（schema 的 UTCDateTime 已归一，这里兜底）
    due_date_val = to_naive_utc(data.due_date)

    project_id = data.project_id
    is_collab = data.company_id is not None or project_id is not None or data.project_node_id is not None
    # 与 get_collaboration_user 口径一致：邮箱必验；手机仅在 PHONE_VERIFICATION_REQUIRED 时要求
    if settings.REGISTER_VERIFICATION_REQUIRED and is_collab:
        if not user.email_verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": 40321, "message": "协作任务需要完成邮箱验证"},
            )
        if settings.PHONE_VERIFICATION_REQUIRED and not user.phone_verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": 40320, "message": "协作任务需要完成手机验证"},
            )
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
        checklist=(
            [item.model_dump() for item in data.checklist]
            if data.checklist is not None
            else None
        ),
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
            # 库里统一存 naive UTC
            remind_at = to_naive_utc(r.remind_at)

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


@router.get("/{task_id:int}/schedule-history", response_model=ResponseData)
async def task_schedule_history(task_id: int, db: DbSession, user: CurrentUser):
    """查看任务的排期变更历史"""
    task = await db.scalar(select(Task).where(Task.id == task_id, Task.is_deleted.is_(False), task_visibility_filter(user.id)))
    if task is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    rows = (await db.execute(select(TaskScheduleChange).where(TaskScheduleChange.task_id == task_id).order_by(TaskScheduleChange.id))).scalars().all()
    def iso(value):
        return to_naive_utc(value).isoformat() + "Z" if value else None
    return ResponseData(data={"items": [{"id": row.id, "actor_user_id": row.actor_user_id,
        "old_due_date": iso(row.old_due_date), "new_due_date": iso(row.new_due_date),
        "created_at": iso(row.created_at)} for row in rows]})


@router.put("/{task_id:int}", response_model=ResponseData)
async def update_task(task_id: int, data: TaskUpdate, db: DbSession, user: CurrentUser):
    """更新任务"""
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == user.id)
    )
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    # UTCDateTime's response serializer emits strings even in model_dump's
    # Python mode. ORM DateTime fields need the validated datetime objects.
    update_data = data.model_dump(exclude_unset=True, exclude={"due_date", "reminders"})
    if "due_date" in data.model_fields_set:
        update_data["due_date"] = to_naive_utc(data.due_date)
    if "reminders" in data.model_fields_set:
        update_data["reminders"] = data.reminders
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

    if "status" in update_data and update_data["status"] != task.status:
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

            # 库里统一存 naive UTC
            if isinstance(remind_at, datetime):
                remind_at = to_naive_utc(remind_at)

            reminder = Reminder(
                task_id=task.id,
                user_id=user.id,
                remind_at=remind_at,
                remind_type=remind_type or 0,
                notify_channels=notify_channels,
            )
            db.add(reminder)

    # 更新其他字段
    if "due_date" in update_data and to_naive_utc(task.due_date) != update_data["due_date"]:
        db.add(TaskScheduleChange(task_id=task.id, actor_user_id=user.id,
            old_due_date=task.due_date, new_due_date=update_data["due_date"]))
    for key, value in update_data.items():
        setattr(task, key, value)

    await db.flush()
    if assignment_specs is not None:
        await _replace_task_assignees(db, task, assignment_specs)
    await db.refresh(task)  # 刷新所有列属性（包括 updated_at 等 onupdate 生成的值）
    await db.refresh(task, ["category", "tags", "reminders", "assignees"])

    return ResponseData(data=_serialize_task(task))


def _next_recurrence_due(due: Optional[datetime], rule) -> Optional[datetime]:
    """按 recurrence_rule 计算下一次截止时间（daily|weekly|monthly|weekdays|yearly）。

    与同步 TaskService._calculate_next_occurrence 同语义，另支持 weekdays
    （跳过周六日的工作日循环）；月/年溢出用 _replace_ymd 夹到月末。
    """
    from app.services.task_service import _replace_ymd

    if not due or not rule:
        return None
    if isinstance(rule, str):
        frequency, interval = rule, 1
    elif isinstance(rule, dict):
        frequency = rule.get("frequency", "daily")
        try:
            interval = max(1, int(rule.get("interval", 1) or 1))
        except (TypeError, ValueError):
            interval = 1
    else:
        return None

    if frequency == "daily":
        return due + timedelta(days=interval)
    if frequency == "weekly":
        return due + timedelta(weeks=interval)
    if frequency == "weekdays":
        nxt = due
        for _ in range(interval):
            nxt += timedelta(days=1)
            while nxt.weekday() >= 5:
                nxt += timedelta(days=1)
        return nxt
    if frequency == "monthly":
        month = due.month + interval
        year = due.year + (month - 1) // 12
        month = (month - 1) % 12 + 1
        return _replace_ymd(due, year, month)
    if frequency == "yearly":
        return _replace_ymd(due, due.year + interval, due.month)
    return None


async def _spawn_next_recurring_instance(
    db: DbSession, task: Task, owner
) -> Optional[dict]:
    """模板任务完成后生成下一次实例；同模板同截止时间已存在则复用（幂等）。"""
    next_due = _next_recurrence_due(task.due_date, task.recurrence_rule)
    if not next_due:
        return None

    existing = (
        await db.execute(
            select(Task)
            .where(
                Task.parent_task_id == task.id,
                Task.due_date == next_due,
                Task.is_deleted == False,
            )
            .limit(1)
        )
    ).scalar_one_or_none()

    if existing is not None:
        instance = existing
    else:
        instance = Task(
            user_id=task.user_id,
            user=owner,
            category_id=task.category_id,
            title=task.title,
            description=task.description,
            priority=task.priority,
            status=Task.STATUS_TODO,
            due_date=next_due,
            is_recurring=False,
            parent_task_id=task.id,
        )
        db.add(instance)
        await db.flush()
        # 复制标签（tags 关系需先异步加载，避免 MissingGreenlet）
        await db.refresh(task, ["tags"])
        if task.tags:
            await db.refresh(instance, ["tags"])
            instance.tags = list(task.tags)
            await db.flush()

    await db.refresh(instance, ["category", "tags", "reminders", "assignees"])
    return _serialize_task(instance)


@router.patch("/{task_id:int}/complete", response_model=ResponseData)
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

        # 库里统一存 naive UTC
        follow_up_remind_at = to_naive_utc(data.follow_up_remind_at)
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
        next_instance = None
    else:
        # 不需要跟进：正常标记完成
        task.status = Task.STATUS_DONE
        task.completed_at = datetime.utcnow()

        # 重复任务模板：完成即生成下一次实例（实例自身不再繁殖）
        next_instance = None
        if task.is_recurring and task.parent_task_id is None:
            next_instance = await _spawn_next_recurring_instance(db, task, user)

    await db.flush()
    await db.refresh(task)  # 刷新所有列属性（包括 updated_at 等 onupdate 生成的值）
    await db.refresh(task, ["category", "tags", "reminders", "assignees"])

    payload = _serialize_task(task)
    # 前端靠 next_instance 做本地插入（无则 null）
    payload["next_instance"] = next_instance
    return ResponseData(data=payload)


@router.patch("/{task_id:int}/uncomplete", response_model=ResponseData)
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


@router.delete("/{task_id:int}", response_model=ResponseData)
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
            "skipped_task_ids": [t.id for t in tasks if t not in editable],
        }
    )


@router.patch("/batch/reschedule", response_model=ResponseData)
async def batch_reschedule(data: BatchReschedule, db: DbSession, user: CurrentUser):
    """批量顺延：只替换截止日期的日期部分，保留原时分秒；无截止时间的按当天 00:00 设置。

    项目投影任务（origin=project_link 且 linked_readonly）只读，跳过并计数返回。
    """
    result = await db.execute(
        select(Task).where(
            Task.id.in_(data.task_ids),
            Task.user_id == user.id,
            Task.is_deleted == False,
        )
    )
    tasks = result.scalars().all()

    editable = [
        t
        for t in tasks
        if not (
            getattr(t, "origin", "personal") == "project_link"
            and getattr(t, "linked_readonly", True)
        )
    ]
    for task in editable:
        old_due_date = task.due_date
        if task.due_date is not None:
            task.due_date = datetime.combine(data.due_date, task.due_date.time())
        else:
            task.due_date = datetime.combine(data.due_date, datetime.min.time())
        if task.due_date != old_due_date:
            db.add(TaskScheduleChange(task_id=task.id, actor_user_id=user.id,
                old_due_date=old_due_date, new_due_date=task.due_date))

    return ResponseData(
        data={
            "updated_count": len(editable),
            "skipped_readonly": len(tasks) - len(editable),
            "skipped_task_ids": [t.id for t in tasks if t not in editable],
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
