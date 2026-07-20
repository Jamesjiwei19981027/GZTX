"""项目相关 schema"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    company_id: int


class AssignPmBody(BaseModel):
    user_id: int


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
