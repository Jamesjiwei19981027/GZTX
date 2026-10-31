"""树节点 schema"""
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class AssigneeIn(BaseModel):
    user_id: int
    role_key: str = "primary"


class ResponsibilityPermissions(BaseModel):
    evidence_submit: Literal["inherit", "members", "responsible", "disabled"] = "inherit"
    allow_add_subordinates: bool = True
    allow_add_work_items: bool = True
    channel_access: bool = False


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
    node_origin: Optional[Literal["project", "subordinate"]] = None
    responsibility_permissions: ResponsibilityPermissions = Field(default_factory=ResponsibilityPermissions)


class NodePatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_at: Optional[datetime] = None
    start_at: Optional[datetime] = None
    milestone_at: Optional[datetime] = None
    allow_clear_text_progress: Optional[bool] = None
    sort_order: Optional[int] = None
    node_type_key: Optional[str] = None
    assignees: Optional[list[AssigneeIn]] = None
    responsibility_permissions: Optional[ResponsibilityPermissions] = None
    # progress_json forbidden — not in model


class NodeMove(BaseModel):
    new_parent_id: Optional[int] = None
    sort_order: int = 0


class AssigneesPut(BaseModel):
    assignees: list[AssigneeIn]
