"""组织同步 Provider 协议"""
from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class DeptDTO:
    external_id: str
    name: str
    parent_external_id: str | None = None
    leader_external_id: str | None = None


@dataclass
class UserDTO:
    external_id: str
    name: str
    email: str | None = None
    mobile: str | None = None
    dept_external_ids: list[str] = field(default_factory=list)
    employment: str = "active"  # active|left
    title: str | None = None
    union_id: str | None = None


class OrgSyncProvider(Protocol):
    async def fetch_departments(self) -> list[DeptDTO]: ...
    async def fetch_users(self) -> list[UserDTO]: ...
