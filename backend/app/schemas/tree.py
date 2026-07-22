"""树节点 schema"""
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class AssigneeIn(BaseModel):
    user_id: int
    role_key: str = "primary"


class NodeCreate(BaseModel):
    parent_id: Optional[int] = None
    node_type_key: str = "work_item"
    title: str
    description: Optional[str] = None
    due_at: Optional[datetime] = None
    start_at: Optional[datetime] = None
    milestone_at: Optional[datetime] = None
    allow_clear_text_progress: bool = False
    sort_order: int = 0
    assignees: list[AssigneeIn] = Field(default_factory=list)


class NodePatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_at: Optional[datetime] = None
    start_at: Optional[datetime] = None
    milestone_at: Optional[datetime] = None
    allow_clear_text_progress: Optional[bool] = None
    sort_order: Optional[int] = None
    node_type_key: Optional[str] = None
    # progress_json forbidden — not in model


class NodeMove(BaseModel):
    new_parent_id: Optional[int] = None
    sort_order: int = 0


class AssigneesPut(BaseModel):
    assignees: list[AssigneeIn]
