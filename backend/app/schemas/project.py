"""项目相关 schema"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    company_id: int


class AssignPmBody(BaseModel):
    user_id: int


class ProjectPatch(BaseModel):
    """修改项目：名称 / 负责人（PM），只传要改的字段"""
    name: Optional[str] = Field(default=None, max_length=200)
    pm_user_id: Optional[int] = None


class FinalOwnerPositionBody(BaseModel):
    """终责卡片沿主干方向的偏移量（像素，非负）"""
    along_delta: int = Field(ge=0, le=100000)


class PullMemberBody(BaseModel):
    user_id: int
    mode: str = "pull"


class InviteBody(BaseModel):
    user_id: Optional[int] = None
    email: Optional[str] = None


class ImportPreviewBody(BaseModel):
    task_ids: list[int]
    parent_node_id: Optional[int] = None


class ImportConfirmBody(BaseModel):
    confirm_token: str
