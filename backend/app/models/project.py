"""项目 · 成员 · 邀请"""
from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    JSON,
)
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.types import UTCDateTime


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    status = Column(String(32), nullable=False, default="draft")
    pm_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    # 终责卡片沿主干方向的偏移量（人轴画布）。
    # 曾经只存在客户端本地（Web localStorage / APP SharedPreferences），
    # 导致 PM 拖完别人看不到、换设备就丢，"仅 PM 可拖"的规则也没有服务端承载。
    final_owner_along_delta = Column(Integer, nullable=False, default=0, server_default="0")
    archive_policy_json = Column(JSON, nullable=True)
    card_template_json = Column(JSON, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(UTCDateTime(), server_default=func.now())
    updated_at = Column(UTCDateTime(), onupdate=func.now())
    archived_at = Column(UTCDateTime(), nullable=True)


class ProjectMember(Base):
    __tablename__ = "project_members"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    role = Column(String(32), nullable=False, default="member")
    joined_at = Column(UTCDateTime(), server_default=func.now())
    left_at = Column(UTCDateTime(), nullable=True)


class ProjectInvitation(Base):
    __tablename__ = "project_invitations"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    invitee_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    invitee_email = Column(String(200), nullable=True)
    token = Column(String(64), unique=True, nullable=False)
    status = Column(String(32), nullable=False, default="pending")
    expires_at = Column(UTCDateTime(), nullable=True)
    created_at = Column(UTCDateTime(), server_default=func.now())
