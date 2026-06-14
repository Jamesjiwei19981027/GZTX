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
from app.api.v1 import auth, tasks, categories, tags, reminders, users

# Email check lock to prevent concurrent email processing
_email_check_lock = asyncio.Lock()


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
            from app.db.session import SessionLocal

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

                    db = SessionLocal()
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

    scheduler.start()
    print(f"[Scheduler] Started APScheduler")

    print(f"✅ {settings.APP_NAME} v{settings.APP_VERSION} 启动成功")
    print(f"📊 数据库: {'SQLite' if settings.is_sqlite else 'PostgreSQL'}")
    print(f"📧 邮件检查间隔: {settings.EMAIL_CHECK_INTERVAL}秒")
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
