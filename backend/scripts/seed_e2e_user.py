"""为 E2E 冒烟准备一个可登录、已通过验证的账号（幂等）。

供 .github/workflows/e2e.yml 使用。本地也可直接跑：
    cd backend && DEBUG=true python scripts/seed_e2e_user.py

只在 DEBUG=true 下允许执行——它会写入一个固定口令的账号，
绝不能在生产库上跑。
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.security import get_password_hash  # noqa: E402
from app.db.session import async_session_factory, init_db  # noqa: E402
from app.models.category import Category  # noqa: E402
from app.models.user import User  # noqa: E402

E2E_USER = os.environ.get("E2E_USER", "e2e_user")
E2E_PASSWORD = os.environ.get("E2E_PASSWORD", "e2e-password-123")
E2E_EMAIL = os.environ.get("E2E_EMAIL", "e2e_user@example.com")
E2E_PHONE = os.environ.get("E2E_PHONE", "13900000001")


async def main() -> None:
    if not settings.DEBUG:
        raise SystemExit("拒绝执行：seed_e2e_user 仅允许在 DEBUG=true 下运行")

    await init_db()
    async with async_session_factory() as db:
        existing = (
            await db.execute(select(User).where(User.username == E2E_USER))
        ).scalar_one_or_none()

        now = datetime.utcnow()
        if existing:
            existing.password_hash = get_password_hash(E2E_PASSWORD)
            existing.email_verified_at = existing.email_verified_at or now
            existing.phone_verified_at = existing.phone_verified_at or now
            existing.is_active = True
            user = existing
        else:
            user = User(
                username=E2E_USER,
                email=E2E_EMAIL,
                phone=E2E_PHONE,
                nickname="E2E 用户",
                password_hash=get_password_hash(E2E_PASSWORD),
                email_verified_at=now,
                phone_verified_at=now,
                is_active=True,
            )
            db.add(user)
            await db.flush()

        # 建任务要求存在默认分类
        has_cat = (
            await db.execute(select(Category).where(Category.user_id == user.id))
        ).scalar_one_or_none()
        if not has_cat:
            db.add(
                Category(
                    user_id=user.id,
                    name="默认",
                    color="#409EFF",
                    is_default=True,
                    sort_order=0,
                )
            )

        await db.commit()
        print(f"[seed] E2E 用户就绪: {E2E_USER} (id={user.id})")


if __name__ == "__main__":
    asyncio.run(main())
