"""通用静态快照 Provider（单测与 generic_scim）"""
from app.services.org_sync.base import DeptDTO, UserDTO


class GenericSnapshotProvider:
    def __init__(self, snapshot: dict):
        self.snapshot = snapshot or {}

    async def fetch_departments(self) -> list[DeptDTO]:
        out = []
        for d in self.snapshot.get("depts") or []:
            out.append(
                DeptDTO(
                    external_id=str(d["external_id"]),
                    name=d["name"],
                    parent_external_id=d.get("parent_external_id"),
                    leader_external_id=d.get("leader_external_id"),
                )
            )
        return out

    async def fetch_users(self) -> list[UserDTO]:
        out = []
        for u in self.snapshot.get("users") or []:
            out.append(
                UserDTO(
                    external_id=str(u["external_id"]),
                    name=u.get("name") or "",
                    email=u.get("email"),
                    mobile=u.get("mobile"),
                    dept_external_ids=list(u.get("dept_external_ids") or []),
                    employment=u.get("employment") or "active",
                    title=u.get("title"),
                )
            )
        return out
