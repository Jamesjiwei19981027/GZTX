"""企微组织同步骨架（httpx 可 mock）"""
from app.services.org_sync.base import DeptDTO, UserDTO


class WeComProvider:
    def __init__(self, credentials: dict, config: dict | None = None):
        self.credentials = credentials or {}
        self.config = config or {}

    async def fetch_departments(self) -> list[DeptDTO]:
        # P1 骨架：若 config 带 snapshot 则用其；否则空
        snap = self.config.get("static_snapshot") or {}
        return [
            DeptDTO(
                external_id=str(d["external_id"]),
                name=d["name"],
                parent_external_id=d.get("parent_external_id"),
                leader_external_id=d.get("leader_external_id"),
            )
            for d in (snap.get("depts") or [])
        ]

    async def fetch_users(self) -> list[UserDTO]:
        snap = self.config.get("static_snapshot") or {}
        return [
            UserDTO(
                external_id=str(u["external_id"]),
                name=u.get("name") or "",
                email=u.get("email"),
                mobile=u.get("mobile"),
                dept_external_ids=list(u.get("dept_external_ids") or []),
                employment=u.get("employment") or "active",
                title=u.get("title"),
            )
            for u in (snap.get("users") or [])
        ]
