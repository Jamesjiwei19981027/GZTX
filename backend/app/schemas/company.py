"""公司 / 成员 / License 请求响应模型"""
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class CompanyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=100)
    policy_preset: Optional[str] = "standard"


class LicenseUpload(BaseModel):
    license_payload: str
    signature: str


class PolicyPatch(BaseModel):
    policy_preset: Optional[str] = None
    policy_json: Optional[dict[str, Any]] = None
    login_methods: Optional[dict[str, bool]] = None


class MembershipPatch(BaseModel):
    is_org_leader: Optional[bool] = None
    is_super_admin: Optional[bool] = None
    # 成员状态：active 启用 / disabled 停用（removed 只能走 DELETE 移除接口）
    status: Optional[Literal["active", "disabled"]] = None
    employment_status: Optional[str] = None
    title: Optional[str] = None


class SaasOpenBody(BaseModel):
    name: str
    slug: str
    plan_code: str = "standard"


class MembershipDTO(BaseModel):
    user_id: int
    username: str = ""
    nickname: Optional[str] = None
    status: str
    employment_status: str
    is_super_admin: bool
    is_org_leader: bool
    org_unit_id: Optional[int] = None
    title: Optional[str] = None


class CompanyDTO(BaseModel):
    id: int
    name: str
    slug: str
    status: str
    policy_preset: Optional[str] = None
    policy: Optional[dict[str, Any]] = None
    entitlement: Optional[dict[str, Any]] = None
    login_methods: Optional[dict[str, bool]] = None
    my_membership: Optional[dict[str, Any]] = None
    created_at: Optional[datetime] = None
