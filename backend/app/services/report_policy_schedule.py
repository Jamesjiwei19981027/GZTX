"""汇报策略（周期 / 截止时间 / 提醒）的读写与调度。

策略保存在 ``ReportPolicy.config_json``：

- ``period``        daily | weekly | monthly
- ``deadline_time`` "HH:MM"，用户本地时间（UTC + USER_TIMEZONE_OFFSET）
- ``weekday``       每周截止日，1=周一 … 7=周日
- ``month_day``     每月截止日，1~28
- ``remind``        截止前是否提醒还没提交的成员
- ``remind_lead_minutes`` 提前多少分钟开始提醒
- ``last_reminded_key``   调度器内部去重用，同一周期只提醒一次

调度器（``main.run_report_policy_reminders``）定时调用
:func:`run_policy_reminders`，它读的就是这里保存的同一份配置。
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.company import CompanyMembership
from app.models.project import Project, ProjectMember
from app.models.report import AgentReport, ReportPolicy
from app.services.notify.service import NotificationService

PERIOD_LABELS = {"daily": "每日", "weekly": "每周", "monthly": "每月"}
DEFAULTS = {
    "period": "weekly",
    "deadline_time": "18:00",
    "weekday": 5,
    "month_day": 25,
    "remind": False,
    "remind_lead_minutes": 120,
}
_TIME_RE = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")


def validate_deadline_time(value: str) -> bool:
    return bool(_TIME_RE.match((value or "").strip()))


def normalize_policy_config(raw: dict | None) -> dict:
    """补齐默认值并规整字段；保留 auto_submit 等其他键。"""
    cfg = dict(raw or {})
    if cfg.get("period") not in PERIOD_LABELS:
        cfg["period"] = DEFAULTS["period"]
    t = str(cfg.get("deadline_time") or "").strip()
    if validate_deadline_time(t):
        h, m = t.split(":")
        cfg["deadline_time"] = f"{int(h):02d}:{m}"
    else:
        cfg["deadline_time"] = DEFAULTS["deadline_time"]
    try:
        wd = int(cfg.get("weekday"))
    except (TypeError, ValueError):
        wd = DEFAULTS["weekday"]
    cfg["weekday"] = wd if 1 <= wd <= 7 else DEFAULTS["weekday"]
    try:
        md = int(cfg.get("month_day"))
    except (TypeError, ValueError):
        md = DEFAULTS["month_day"]
    cfg["month_day"] = md if 1 <= md <= 28 else DEFAULTS["month_day"]
    cfg["remind"] = bool(cfg.get("remind", DEFAULTS["remind"]))
    try:
        lead = int(cfg.get("remind_lead_minutes"))
    except (TypeError, ValueError):
        lead = DEFAULTS["remind_lead_minutes"]
    cfg["remind_lead_minutes"] = lead if 0 <= lead <= 1440 else DEFAULTS["remind_lead_minutes"]
    return cfg


def current_period(cfg: dict, now_local: datetime):
    """今天是否是截止日。是则返回 (周期标识, 周期起点(本地), 截止时刻(本地))，否则 None。"""
    cfg = normalize_policy_config(cfg)
    h, m = (int(x) for x in cfg["deadline_time"].split(":"))
    today = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    deadline = today.replace(hour=h, minute=m)
    period = cfg["period"]
    if period == "daily":
        return today.date().isoformat(), today, deadline
    if period == "weekly":
        if now_local.isoweekday() != cfg["weekday"]:
            return None
        monday = today - timedelta(days=today.isoweekday() - 1)
        iso = today.isocalendar()
        return f"{iso[0]}-W{iso[1]:02d}", monday, deadline
    if now_local.day != cfg["month_day"]:
        return None
    return today.strftime("%Y-%m"), today.replace(day=1), deadline


def _to_utc_naive(local_dt: datetime) -> datetime:
    return local_dt - timedelta(hours=settings.USER_TIMEZONE_OFFSET)


async def run_policy_reminders(db: AsyncSession, now_utc: datetime | None = None) -> dict:
    """按每个项目保存的汇报策略，提醒截止前还没提交汇报的成员。

    只处理 ``enabled`` 且 ``remind`` 为真的 cron 策略；同一周期只提醒一次。
    """
    now_utc = now_utc or datetime.now(timezone.utc).replace(tzinfo=None)
    if now_utc.tzinfo is not None:
        now_utc = now_utc.astimezone(timezone.utc).replace(tzinfo=None)
    now_local = now_utc + timedelta(hours=settings.USER_TIMEZONE_OFFSET)

    policies = (
        await db.execute(
            select(ReportPolicy).where(
                ReportPolicy.enabled.is_(True), ReportPolicy.trigger == "cron"
            )
        )
    ).scalars().all()
    reminded_users = 0
    reminded_policies = 0
    seen_projects: set[int] = set()
    for policy in policies:
        if policy.project_id in seen_projects:
            continue
        cfg = normalize_policy_config(policy.config_json)
        if not cfg["remind"]:
            continue
        cur = current_period(cfg, now_local)
        if cur is None:
            continue
        key, start_local, deadline_local = cur
        window_open = deadline_local - timedelta(minutes=cfg["remind_lead_minutes"])
        if not (window_open <= now_local <= deadline_local):
            continue
        if (policy.config_json or {}).get("last_reminded_key") == key:
            continue
        seen_projects.add(policy.project_id)
        project = await db.get(Project, policy.project_id)
        if not project or project.status == "archived":
            continue
        member_ids = (
            await db.execute(
                select(ProjectMember.user_id)
                .join(
                    CompanyMembership,
                    (CompanyMembership.user_id == ProjectMember.user_id)
                    & (CompanyMembership.company_id == project.company_id),
                )
                .where(
                    ProjectMember.project_id == project.id,
                    ProjectMember.left_at.is_(None),
                    CompanyMembership.status == "active",
                    CompanyMembership.employment_status == "active",
                )
            )
        ).scalars().all()
        start_utc = _to_utc_naive(start_local)
        submitted = set(
            (
                await db.execute(
                    select(AgentReport.author_user_id).where(
                        AgentReport.project_id == project.id,
                        AgentReport.status.in_(["submitted", "aggregated"]),
                        AgentReport.submitted_at >= start_utc,
                    )
                )
            ).scalars().all()
        )
        targets = sorted({uid for uid in member_ids if uid not in submitted})
        if targets:
            await NotificationService().enqueue(
                db,
                company_id=project.company_id,
                user_ids=targets,
                template_key="report.policy.reminder",
                payload={
                    "project_id": project.id,
                    "project_name": project.name,
                    "period": cfg["period"],
                    "period_label": PERIOD_LABELS[cfg["period"]],
                    "deadline": deadline_local.strftime("%H:%M"),
                },
                channels=["in_app"],
                project_id=project.id,
            )
            reminded_users += len(targets)
        reminded_policies += 1
        policy.config_json = {**(policy.config_json or {}), "last_reminded_key": key}
    await db.flush()
    return {"policies": reminded_policies, "users": reminded_users}
