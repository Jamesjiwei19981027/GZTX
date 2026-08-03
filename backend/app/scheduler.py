"""Dedicated APScheduler process for production deployments.

Web workers disable the in-process scheduler so reminders and digests are not
executed once per gunicorn worker. This module owns the one scheduler process.
"""

from __future__ import annotations

import asyncio
import signal

from app.core.config import settings
from app.db.session import close_db, init_db
from app.main import create_scheduler


async def run() -> None:
    settings.validate_production_secrets()
    await init_db()
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except (NotImplementedError, RuntimeError):
            # Windows test runners do not expose add_signal_handler.
            pass

    scheduler = create_scheduler()
    print("[Scheduler] Dedicated scheduler started")
    try:
        await stop.wait()
    finally:
        scheduler.shutdown(wait=False)
        await close_db()
        print("[Scheduler] Dedicated scheduler stopped")


if __name__ == "__main__":
    asyncio.run(run())
