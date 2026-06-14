from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from app.core.config import settings
from app.db.session import SessionLocal, init_db
from app.api.v1 import auth, users, tasks, categories, tags, reminders
from app.services.reminder_service import check_and_send_reminders
from app.core.dependencies import get_db
import logging

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# APScheduler 实例
scheduler = BackgroundScheduler()


def start_scheduler():
    """启动定时任务调度器"""
    if settings.SCHEDULER_ENABLED:
        from app.db.session import SessionLocal
        def run_reminder_job():
            db = SessionLocal()
            try:
                check_and_send_reminders(db)
            finally:
                db.close()
        scheduler.add_job(
            run_reminder_job,
            "interval",
            seconds=settings.SCHEDULER_INTERVAL_SECONDS,
            id="check_reminders",
            replace_existing=True,
        )
        scheduler.start()
        logger.info("APScheduler 已启动")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时
    init_db()
    logger.info("数据库初始化完成")
    start_scheduler()
    yield
    # 关闭时
    scheduler.shutdown()
    logger.info("APScheduler 已关闭")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(users.router, prefix=settings.API_V1_PREFIX)
app.include_router(tasks.router, prefix=settings.API_V1_PREFIX)
app.include_router(categories.router, prefix=settings.API_V1_PREFIX)
app.include_router(tags.router, prefix=settings.API_V1_PREFIX)
app.include_router(reminders.router, prefix=settings.API_V1_PREFIX)


@app.get("/api/v1/health")
def health_check():
    """健康检查"""
    from datetime import datetime
    return {
        "code": 200,
        "message": "success",
        "data": {
            "status": "healthy",
            "version": settings.APP_VERSION,
            "timestamp": datetime.now().isoformat(),
        }
    }


@app.get("/")
def root():
    """根路径"""
    return {"message": "WorkTodo API", "version": settings.APP_VERSION}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)