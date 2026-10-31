"""Homepage period, project visibility, completion events and reschedule audit regressions."""
from datetime import datetime, timedelta
import pytest
from sqlalchemy import select
from app.models.category import Category
from app.models.task import Task
from app.models.task_assignment import TaskAssignment
from app.models.user import User
from app.models.report import ReportRun

@pytest.fixture
async def stats_tasks(db_session, test_user):
    category = Category(user_id=test_user.id, name="统计", color="#409EFF")
    other = User(username="stats-other", email="stats-other@example.com", password_hash="unused")
    db_session.add_all([category, other])
    await db_session.flush()
    now = datetime.utcnow()
    local = now + timedelta(hours=8)
    quarter_local = local.replace(month=(local.month-1)//3*3+1, day=1, hour=0, minute=0, second=0, microsecond=0)
    quarter = quarter_local - timedelta(hours=8)
    rows = [
        Task(user_id=test_user.id, category_id=category.id, title="quarter", project_id=1, created_at=quarter+timedelta(minutes=1)),
        Task(user_id=test_user.id, category_id=category.id, title="prior-quarter", project_id=1, created_at=quarter-timedelta(minutes=1)),
        Task(user_id=test_user.id, category_id=category.id, title="personal", created_at=now),
        Task(user_id=test_user.id, category_id=category.id, title="other-project", project_id=2, created_at=now),
        Task(user_id=other.id, category_id=category.id, title="private-other", project_id=1, created_at=now),
        Task(user_id=other.id, category_id=category.id, title="assigned", project_id=1, created_at=now),
        Task(user_id=test_user.id, category_id=category.id, title="old-completed-now", project_id=1, created_at=now-timedelta(days=400), completed_at=now, status=2),
        Task(user_id=test_user.id, category_id=category.id, title="deleted", project_id=1, created_at=now, is_deleted=True),
    ]
    db_session.add_all(rows)
    await db_session.flush()
    db_session.add(TaskAssignment(task_id=rows[5].id, user_id=test_user.id, role_key="assignee"))
    await db_session.commit()
    return rows

@pytest.mark.asyncio
async def test_quarter_stats_match_scope_and_assignee_visibility(client, auth_headers, stats_tasks):
    response = await client.get("/api/v1/tasks/stats?period=quarter&project_id=1&timezone_offset=480", headers=auth_headers)
    assert response.status_code == 200, response.text
    assert response.json()["data"]["total"] == 3  # current quarter + personal + assigned

@pytest.mark.asyncio
async def test_trend_counts_old_task_completed_now_and_keeps_real_quarter(client, auth_headers, stats_tasks):
    response = await client.get("/api/v1/tasks/stats/trend?period=quarter&project_id=1&timezone_offset=480", headers=auth_headers)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["period"] == "quarter"
    now = datetime.utcnow()+timedelta(hours=8)
    assert data["series"][0]["date"] == f"{now.year}-{((now.month-1)//3*3+1):02d}-01"
    assert sum(day["created"] for day in data["series"]) == 3
    assert sum(day["completed"] for day in data["series"]) == 1

@pytest.mark.asyncio
async def test_trend_uses_local_midnight_not_utc_date(client, auth_headers, db_session, test_user):
    cat = Category(user_id=test_user.id, name="边界", color="#409EFF")
    db_session.add(cat); await db_session.flush()
    local_today = (datetime.utcnow()+timedelta(hours=8)).replace(hour=0, minute=0, second=0, microsecond=0)
    db_session.add(Task(user_id=test_user.id, category_id=cat.id, title="local-midnight", created_at=local_today-timedelta(hours=8)+timedelta(minutes=1)))
    await db_session.commit()
    response = await client.get("/api/v1/tasks/stats/trend?period=week&timezone_offset=480", headers=auth_headers)
    series = response.json()["data"]["series"]
    assert series[-1]["date"] == local_today.strftime("%Y-%m-%d")
    assert series[-1]["created"] == 1

@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["stats", "stats/trend"])
async def test_statistics_reject_invalid_period(client, auth_headers, path):
    response = await client.get(f"/api/v1/tasks/{path}?period=invalid", headers=auth_headers)
    assert response.status_code == 422

@pytest.mark.asyncio
async def test_schedule_history_keeps_original_deadline_and_report_snapshot(client, auth_headers, db_session, test_user):
    cat = Category(user_id=test_user.id, name="历史", color="#409EFF")
    db_session.add(cat); await db_session.flush()
    original = datetime(2020, 1, 1, 1, 30)
    task = Task(user_id=test_user.id, category_id=cat.id, title="past", due_date=original)
    db_session.add(task); await db_session.flush()
    report = ReportRun(company_id=1, project_id=1, actor_user_id=test_user.id, payload_json={"tasks":[{"id":task.id,"due_date":"2020-01-01T01:30:00Z"}]})
    db_session.add(report); await db_session.commit()
    for due in ["2020-01-02T01:30:00Z", "2020-01-02T01:30:00Z", None]:
        response = await client.put(f"/api/v1/tasks/{task.id}", headers=auth_headers, json={"due_date":due})
        assert response.status_code == 200, response.text
    history = await client.get(f"/api/v1/tasks/{task.id}/schedule-history", headers=auth_headers)
    assert history.status_code == 200, history.text
    rows = history.json()["data"]["items"]
    assert len(rows) == 2
    assert rows[0]["old_due_date"].startswith("2020-01-01T01:30:00")
    assert rows[1]["new_due_date"] is None
    await db_session.refresh(report)
    assert report.payload_json["tasks"][0]["due_date"] == "2020-01-01T01:30:00Z"
    # Task visibility is enforced, even if the caller guesses another task ID.
    other = User(username="history-other", email="history-other@example.com", password_hash="unused")
    db_session.add(other); await db_session.flush()
    private_task = Task(user_id=other.id, category_id=cat.id, title="private")
    db_session.add(private_task); await db_session.commit()
    denied = await client.get(f"/api/v1/tasks/{private_task.id}/schedule-history", headers=auth_headers)
    assert denied.status_code == 404


@pytest.mark.asyncio
async def test_batch_reschedule_records_deadline_without_breaking_completion(client, auth_headers, db_session, test_user):
    cat = Category(user_id=test_user.id, name="batch-history", color="#409EFF")
    db_session.add(cat)
    await db_session.flush()
    task = Task(user_id=test_user.id, category_id=cat.id, title="batch", due_date=datetime(2020, 1, 1, 9, 30))
    db_session.add(task)
    await db_session.commit()
    response = await client.patch("/api/v1/tasks/batch/reschedule", headers=auth_headers, json={"task_ids": [task.id], "due_date": "2020-01-03"})
    assert response.status_code == 200, response.text
    history = (await client.get(f"/api/v1/tasks/{task.id}/schedule-history", headers=auth_headers)).json()["data"]["items"]
    assert len(history) == 1
    assert history[0]["old_due_date"] == "2020-01-01T09:30:00Z"
    assert history[0]["new_due_date"] == "2020-01-03T09:30:00Z"


@pytest.mark.asyncio
async def test_rescheduling_completed_task_keeps_real_completion_date(client, auth_headers, db_session, test_user):
    cat = Category(user_id=test_user.id, name="completed-history", color="#409EFF")
    db_session.add(cat)
    await db_session.flush()
    completed = datetime(2020, 1, 2, 9, 30)
    task = Task(user_id=test_user.id, category_id=cat.id, title="completed", status=2, completed_at=completed)
    db_session.add(task)
    await db_session.commit()
    response = await client.put(f"/api/v1/tasks/{task.id}", headers=auth_headers, json={"status":2, "due_date":"2020-01-03T09:30:00Z"})
    assert response.status_code == 200
    await db_session.refresh(task)
    assert task.completed_at == completed
