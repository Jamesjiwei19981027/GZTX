"""树节点 · 节点类型 · 指派"""
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    JSON,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.db.base import Base


def default_progress_json(template: str) -> dict:
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    if template == "person":
        return {
            "template": "person",
            "updated_at": now,
            "last_record_id": None,
        }
    if template == "work_item":
        return {
            "template": "work_item",
            "status": "not_started",
            "percent": 0,
            "checklist": [],
            "updated_at": now,
            "last_record_id": None,
        }
    if template == "milestone":
        return {
            "template": "milestone",
            "status": "not_reached",
            "updated_at": now,
            "last_record_id": None,
        }
    return {
        "template": "scope",
        "summary": {
            "total_work_items": 0,
            "done": 0,
            "blocked": 0,
            "milestones_reached": 0,
            "milestones_total": 0,
            "rollupon": "child_work_items",
        },
        "updated_at": now,
        "last_record_id": None,
    }


class NodeType(Base):
    __tablename__ = "node_types"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    key = Column(String(64), nullable=False)
    name = Column(String(100), nullable=False)
    behavior_template = Column(String(32), nullable=False)
    config_json = Column(JSON, nullable=True)


class TreeNode(Base):
    __tablename__ = "tree_nodes"
    __table_args__ = (
        # 人轴整棵读：where project_id=? and is_deleted=false order by sort_order
        Index("ix_tree_nodes_project_live", "project_id", "is_deleted", "sort_order"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    parent_id = Column(Integer, ForeignKey("tree_nodes.id"), nullable=True, index=True)
    node_type_id = Column(Integer, ForeignKey("node_types.id"), nullable=False)
    title = Column(String(300), nullable=False)
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    path = Column(String(500), nullable=False, default="/")
    depth = Column(Integer, nullable=False, default=0)
    start_at = Column(DateTime(timezone=True), nullable=True)
    due_at = Column(DateTime(timezone=True), nullable=True)
    milestone_at = Column(DateTime(timezone=True), nullable=True)
    allow_clear_text_progress = Column(Boolean, default=False, nullable=False)
    progress_json = Column(JSON, nullable=False, default=dict)
    is_deleted = Column(Boolean, default=False, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class NodeAssignment(Base):
    __tablename__ = "node_assignments"
    __table_args__ = (
        UniqueConstraint("node_id", "user_id", "role_key", name="uq_node_assignee_role"),
    )

    id = Column(Integer, primary_key=True)
    node_id = Column(Integer, ForeignKey("tree_nodes.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    role_key = Column(String(32), nullable=False, default="primary")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
