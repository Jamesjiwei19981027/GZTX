"""委托授权 grants"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Text
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.types import UTCDateTime


class DelegationGrant(Base):
    __tablename__ = "delegation_grants"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    grantor_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    grantee_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    actions_json = Column(JSON, nullable=False, default=list)  # e.g. ["project.read", "member.pull"]
    status = Column(String(32), nullable=False, default="active")  # active|revoked|expired
    valid_from = Column(UTCDateTime(), server_default=func.now())
    valid_to = Column(UTCDateTime(), nullable=True)
    reason = Column(Text, nullable=True)
    created_at = Column(UTCDateTime(), server_default=func.now())
    revoked_at = Column(UTCDateTime(), nullable=True)
