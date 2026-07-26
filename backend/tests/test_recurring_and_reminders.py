"""循环任务日期推进 + 提醒创建 回归测试。

历史缺陷：
1. 月度/年度循环用 `dt.replace(year=..., month=...)` 推进，1/31 → 2 月、
   2/29 → 平年时抛 ValueError: day is out of range for month，任务一完成就 500；
2. POST /reminders 硬编码 task_id=0（schema 里根本没有该字段），
   每条提醒都是指向不存在任务的孤儿，永远发不出去。
"""
from datetime import datetime

import pytest
from httpx import AsyncClient

from app.services.task_service import _replace_ymd


class TestRecurrenceDayOverflow:
    @pytest.mark.parametrize(
        "src,year,month,expected_day",
        [
            (datetime(2026, 1, 31), 2026, 2, 28),  # 平年 2 月
            (datetime(2024, 1, 31), 2024, 2, 29),  # 闰年 2 月
            (datetime(2026, 3, 31), 2026, 4, 30),  # 30 天的月份
            (datetime(2024, 2, 29), 2025, 2, 28),  # 闰日 → 平年
            (datetime(2026, 1, 15), 2026, 2, 15),  # 不溢出时保持原样
        ],
    )
    def test_day_clamped_to_month_end(self, src, year, month, expected_day):
        out = _replace_ymd(src, year, month)
        assert (out.year, out.month, out.day) == (year, month, expected_day)

    def test_monthly_recurrence_from_jan_31_does_not_raise(self):
        from app.services.task_service import TaskService

        nxt = TaskService._calculate_next_occurrence(
            datetime(2026, 1, 31), {"frequency": "monthly", "interval": 1}
        )
        assert nxt is not None
        assert (nxt.month, nxt.day) == (2, 28)

    def test_yearly_recurrence_from_leap_day_does_not_raise(self):
        from app.services.task_service import TaskService

        nxt = TaskService._calculate_next_occurrence(
            datetime(2024, 2, 29), {"frequency": "yearly", "interval": 1}
        )
        assert nxt is not None
        assert (nxt.year, nxt.month, nxt.day) == (2025, 2, 28)


@pytest.mark.asyncio
async def test_reminder_is_bound_to_the_requested_task(
    client: AsyncClient, db_session, test_user, auth_headers
):
    from app.models.category import Category
    from app.models.task import Task

    cat = Category(user_id=test_user.id, name="默认", color="#409EFF", is_default=True)
    db_session.add(cat)
    await db_session.flush()
    task = Task(user_id=test_user.id, category_id=cat.id, title="要提醒的任务")
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)

    r = await client.post(
        "/api/v1/reminders",
        headers=auth_headers,
        json={
            "task_id": task.id,
            "remind_at": "2026-08-01T09:00:00",
            "remind_type": 0,
        },
    )
    assert r.status_code == 201, r.text

    from sqlalchemy import select

    from app.models.reminder import Reminder

    rec = (await db_session.execute(select(Reminder))).scalars().one()
    assert rec.task_id == task.id, "提醒必须绑到请求指定的任务，而不是 0"


@pytest.mark.asyncio
async def test_reminder_for_others_task_rejected(
    client: AsyncClient, db_session, test_user, auth_headers
):
    """不能给别人的任务建提醒"""
    from app.core.security import get_password_hash
    from app.models.category import Category
    from app.models.task import Task
    from app.models.user import User

    other = User(
        username="other_owner",
        email="other_owner@example.com",
        password_hash=get_password_hash("password123"),
    )
    db_session.add(other)
    await db_session.flush()
    cat = Category(user_id=other.id, name="默认", color="#409EFF", is_default=True)
    db_session.add(cat)
    await db_session.flush()
    task = Task(user_id=other.id, category_id=cat.id, title="别人的任务")
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)

    r = await client.post(
        "/api/v1/reminders",
        headers=auth_headers,
        json={"task_id": task.id, "remind_at": "2026-08-01T09:00:00"},
    )
    assert r.status_code == 404, r.text


@pytest.mark.asyncio
async def test_reminder_requires_task_id(client: AsyncClient, auth_headers):
    r = await client.post(
        "/api/v1/reminders",
        headers=auth_headers,
        json={"remind_at": "2026-08-01T09:00:00"},
    )
    assert r.status_code == 422, r.text
