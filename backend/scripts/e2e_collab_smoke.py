"""
契约冒烟：公司 → License → 项目 → 树 → 材料 → 进度
用法（需先起服务或在进程内 ASGI）:
  cd backend && .venv312/Scripts/python scripts/e2e_collab_smoke.py
"""
import asyncio
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.dependencies import get_db
from app.core.security import create_access_token, get_password_hash
from app.db.base import Base
from app.main import app as fastapi_app
from app.models.user import User
from app.services.license_verify import sign_license_dev
import app.models  # noqa: F401


async def main() -> int:
    settings.LICENSE_PUBLIC_KEY = "dev-secret-key-for-tests-only"
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def override():
        async with factory() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    fastapi_app.dependency_overrides[get_db] = override

    async with factory() as db:
        u = User(
            username="smoke",
            email="smoke@ex.com",
            password_hash=get_password_hash("x"),
            nickname="smoke",
        )
        db.add(u)
        await db.commit()
        await db.refresh(u)
        uid = u.id

    headers = {"Authorization": f"Bearer {create_access_token(data={'sub': uid})}"}
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/api/v1/companies",
            json={"name": "冒烟公司", "slug": "smoke", "policy_preset": "standard"},
            headers=headers,
        )
        assert r.json()["code"] == 200, r.text
        cid = r.json()["data"]["id"]

        payload = {
            "company_slug": "smoke",
            "features": {"project_tree": True, "agents": True},
            "quotas": {"max_projects": 10},
            "valid_to": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        }
        raw = json.dumps(payload, sort_keys=True)
        sig = sign_license_dev(raw, settings.LICENSE_PUBLIC_KEY)
        r = await c.post(
            f"/api/v1/companies/{cid}/license",
            json={"license_payload": raw, "signature": sig},
            headers=headers,
        )
        assert r.json()["code"] == 200, r.text

        r = await c.post(
            "/api/v1/projects",
            json={"name": "冒烟项目", "company_id": cid},
            headers=headers,
        )
        assert r.json()["code"] == 200, r.text
        pid = r.json()["data"]["id"]

        r = await c.post(
            f"/api/v1/projects/{pid}/pm",
            json={"user_id": uid},
            headers=headers,
        )
        assert r.json()["code"] == 200, r.text

        r = await c.post(
            f"/api/v1/projects/{pid}/nodes",
            json={"parent_id": None, "node_type_key": "work_item", "title": "冒烟项"},
            headers=headers,
        )
        assert r.json()["code"] == 200, r.text
        nid = r.json()["data"]["id"]

        r = await c.post(
            f"/api/v1/nodes/{nid}/evidence",
            json={
                "summary_text": "冒烟完成",
                "structured": {"percent": 100, "status": "done"},
                "file_ids": [],
            },
            headers=headers,
        )
        assert r.json()["code"] == 200, r.text
        assert r.json()["data"]["status"] == "adopted"

        r = await c.get(f"/api/v1/nodes/{nid}/progress", headers=headers)
        assert r.json()["data"]["progress_json"]["status"] == "done"
        print("E2E collab smoke OK", {"company_id": cid, "project_id": pid, "node_id": nid})
        return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
