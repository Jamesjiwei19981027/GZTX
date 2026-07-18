"""
WorkTodo 后端应用入口
"""
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.session import init_db, close_db
from app.api.v1 import auth, tasks, categories, tags, reminders, users, notifications, attachments, wx

# Email check lock to prevent concurrent email processing
_email_check_lock = asyncio.Lock()
# Reminder check lock
_reminder_check_lock = asyncio.Lock()
# Daily digest lock
_daily_digest_lock = asyncio.Lock()


async def check_new_emails():
    """
    Scheduled task to check for new email replies.
    Runs every EMAIL_CHECK_INTERVAL seconds via APScheduler.
    Uses asyncio.Lock to prevent concurrent execution.
    """
    if _email_check_lock.locked():
        print("[EmailCheck] Previous check still running, skipping...")
        return {"status": "skipped", "reason": "previous_running"}

    async with _email_check_lock:
        processed = 0
        failed = 0

        try:
            from app.services.email_receiver import EmailReceiver
            from app.services.task_email_service import TaskEmailService
            from app.db.session import SyncSessionLocal

            receiver = EmailReceiver()
            service = TaskEmailService()
            emails = receiver.fetch_new_emails()

            for email_data in emails:
                try:
                    # Extract task_id from reply address
                    task_id = receiver.extract_task_id(email_data.get("to", ""))
                    if not task_id:
                        print(f"[EmailCheck] No valid task_id in to: {email_data.get('to')}")
                        continue

                    db = SyncSessionLocal()
                    try:
                        result = service.process_email_reply(
                            task_id=task_id,
                            sender_email=email_data.get("from", ""),
                            raw_content=email_data.get("body", ""),
                            db=db,
                            original_message_id=email_data.get("message_id")
                        )
                        if result.get("success"):
                            processed += 1
                        else:
                            failed += 1
                            print(f"[EmailCheck] Process failed for task {task_id}: {result.get('message')}")
                    finally:
                        db.close()

                except Exception as e:
                    print(f"[EmailCheck] Failed to process email: {e}")
                    failed += 1

        except Exception as e:
            print(f"[EmailCheck] Task failed: {e}")

        result = {"processed": processed, "failed": failed}
        print(f"[EmailCheck] Completed: {result}")
        return result


async def check_reminders():
    """
    Scheduled task to check and send due reminders.
    Runs every 60 seconds via APScheduler.
    Uses asyncio.Lock to prevent concurrent execution.
    """
    if _reminder_check_lock.locked():
        print("[ReminderCheck] Previous check still running, skipping...")
        return {"status": "skipped", "reason": "previous_running"}

    async with _reminder_check_lock:
        try:
            from app.services.reminder_service import ReminderService
            from app.db.session import SyncSessionLocal

            db = SyncSessionLocal()
            try:
                results = ReminderService.check_and_send_reminders(db)
                print(f"[ReminderCheck] Processed {len(results)} reminders")
                return {"processed": len(results)}
            finally:
                db.close()
        except Exception as e:
            print(f"[ReminderCheck] Task failed: {e}")
            return {"error": str(e)}


async def send_daily_digest():
    """
    Scheduled task: send daily digest email to all users with email configured.
    Runs once per day at DAILY_DIGEST_HOUR (local time) via APScheduler cron trigger.
    """
    if _daily_digest_lock.locked():
        print("[DailyDigest] Previous run still active, skipping...")
        return

    async with _daily_digest_lock:
        from app.db.session import SyncSessionLocal
        from app.models.user import User
        from app.models.task import Task
        from app.utils.email import build_daily_digest_email, _send_smtp
        from app.core.config import settings as app_settings
        from datetime import datetime, timedelta

        db = SyncSessionLocal()
        try:
            tz_offset = app_settings.USER_TIMEZONE_OFFSET
            # "Today" in user's local time mapped to UTC
            utc_now = datetime.utcnow()
            local_today_start_utc = utc_now.replace(
                hour=0, minute=0, second=0, microsecond=0
            ) - timedelta(hours=tz_offset)
            local_today_end_utc = local_today_start_utc + timedelta(days=1)
            local_yesterday_start_utc = local_today_start_utc - timedelta(days=1)

            date_text = (utc_now + timedelta(hours=tz_offset)).strftime("%Y年%m月%d日")

            # Find all users with email
            users = db.query(User).filter(
                User.email.isnot(None),
                User.email != "",
                User.is_active == True,
            ).all()

            sent_count = 0
            for user in users:
                try:
                    # Today's incomplete tasks (due within local today)
                    today_tasks_orm = db.query(Task).filter(
                        Task.user_id == user.id,
                        Task.is_deleted == False,
                        Task.status < 2,
                        Task.due_date >= local_today_start_utc,
                        Task.due_date < local_today_end_utc,
                    ).order_by(Task.priority.desc(), Task.due_date.asc()).all()

                    # Overdue tasks (past local today, still incomplete)
                    overdue_tasks_orm = db.query(Task).filter(
                        Task.user_id == user.id,
                        Task.is_deleted == False,
                        Task.status < 2,
                        Task.due_date < local_today_start_utc,
                    ).order_by(Task.due_date.asc()).all()

                    # Yesterday's completed count
                    completed_count = db.query(Task).filter(
                        Task.user_id == user.id,
                        Task.status == 2,
                        Task.completed_at >= local_yesterday_start_utc,
                        Task.completed_at < local_today_start_utc,
                    ).count()

                    # Skip if nothing to report
                    if not today_tasks_orm and not overdue_tasks_orm and completed_count == 0:
                        continue

                    # Convert ORM objects to dicts for the template
                    today_tasks = []
                    for t in today_tasks_orm:
                        cat_name = ""
                        cat_color = ""
                        try:
                            if t.category:
                                cat_name = t.category.name or ""
                                cat_color = t.category.color or ""
                        except Exception:
                            pass
                        today_tasks.append({
                            "title": t.title,
                            "priority": t.priority,
                            "due_date": t.due_date,
                            "description": t.description or "",
                            "status": t.status,
                            "category_name": cat_name,
                            "category_color": cat_color,
                            "created_at": t.created_at,
                        })
                    overdue_tasks = []
                    for t in overdue_tasks_orm:
                        cat_name = ""
                        cat_color = ""
                        try:
                            if t.category:
                                cat_name = t.category.name or ""
                                cat_color = t.category.color or ""
                        except Exception:
                            pass
                        overdue_tasks.append({
                            "title": t.title,
                            "priority": t.priority,
                            "due_date": t.due_date,
                            "description": t.description or "",
                            "status": t.status,
                            "category_name": cat_name,
                            "category_color": cat_color,
                            "created_at": t.created_at,
                        })

                    user_name = user.nickname or user.username

                    subject, html_body = build_daily_digest_email(
                        user_name=user_name,
                        today_tasks=today_tasks,
                        overdue_tasks=overdue_tasks,
                        completed_count=completed_count,
                        date_text=date_text,
                        app_url=app_settings.APP_URL,
                    )

                    text_body = (
                        f"今日待办摘要 ({date_text})\n"
                        f"今日待办: {len(today_tasks)} | 已逾期: {len(overdue_tasks)} | 昨日完成: {completed_count}\n"
                    )

                    # SMTP config
                    smtp_host = app_settings.SMTP_HOST
                    smtp_user = app_settings.SMTP_USER
                    smtp_password = app_settings.SMTP_PASSWORD
                    smtp_port = app_settings.SMTP_PORT
                    smtp_from = app_settings.SMTP_FROM or smtp_user

                    if not all([smtp_host, smtp_user, smtp_password]):
                        print(f"[DailyDigest] SMTP not configured, skipping user {user.id}")
                        continue

                    success = _send_smtp(
                        to_email=user.email,
                        from_addr=smtp_from,
                        subject=subject,
                        text_body=text_body,
                        html_body=html_body,
                        smtp_host=smtp_host,
                        smtp_port=smtp_port,
                        smtp_user=smtp_user,
                        smtp_password=smtp_password,
                    )

                    if success:
                        sent_count += 1
                        print(f"[DailyDigest] Sent to {user.email}")

                except Exception as e:
                    print(f"[DailyDigest] Failed for user {user.id}: {e}")

            print(f"[DailyDigest] Completed: {sent_count}/{len(users)} users")

        except Exception as e:
            print(f"[DailyDigest] Task failed: {e}")
        finally:
            db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时：初始化数据库
    await init_db()

    # 启动 APScheduler for periodic tasks
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    scheduler = AsyncIOScheduler()

    # Register email check job
    scheduler.add_job(check_new_emails, 'interval', seconds=settings.EMAIL_CHECK_INTERVAL, id='check_new_emails')

    # Register reminder check job (every 60 seconds)
    scheduler.add_job(check_reminders, 'interval', seconds=60, id='check_reminders')

    # Register daily digest job (cron: DAILY_DIGEST_HOUR local time → UTC)
    digest_utc_hour = (settings.DAILY_DIGEST_HOUR - settings.USER_TIMEZONE_OFFSET) % 24
    scheduler.add_job(
        send_daily_digest, 'cron',
        hour=digest_utc_hour, minute=0,
        id='daily_digest'
    )

    scheduler.start()
    print(f"[Scheduler] Started APScheduler")

    print(f"✅ {settings.APP_NAME} v{settings.APP_VERSION} 启动成功")
    print(f"📊 数据库: {'SQLite' if settings.is_sqlite else 'PostgreSQL'}")
    print(f"📧 邮件检查间隔: {settings.EMAIL_CHECK_INTERVAL}秒")
    print(f"📬 每日摘要: 每天 {settings.DAILY_DIGEST_HOUR}:00 (UTC+{settings.USER_TIMEZONE_OFFSET})")
    print(f"📖 API文档: http://localhost:8000/docs")

    yield

    # 关闭时：释放数据库连接
    scheduler.shutdown()
    await close_db()
    print(f"👋 {settings.APP_NAME} 已关闭")


# 创建 FastAPI 应用
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="工作待办提醒系统 API",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册 API 路由
app.include_router(auth.router, prefix="/api/v1")
app.include_router(tasks.router, prefix="/api/v1")
app.include_router(categories.router, prefix="/api/v1")
app.include_router(tags.router, prefix="/api/v1")
app.include_router(reminders.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(attachments.router, prefix="/api/v1")
app.include_router(wx.router, prefix="/api/v1")


@app.get("/api/v1/health", tags=["系统"])
async def health_check():
    """健康检查"""
    return {
        "code": 200,
        "message": "success",
        "data": {
            "status": "healthy",
            "version": settings.APP_VERSION,
            "timestamp": datetime.now().isoformat(),
        },
    }
