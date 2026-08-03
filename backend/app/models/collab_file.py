"""Binary files shared through collaboration channels and conversations."""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.sql import func

from app.db.base import Base


class CollabFile(Base):
    __tablename__ = "collab_files"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    scope_type = Column(String(16), nullable=False, index=True)  # channel|conversation
    scope_id = Column(Integer, nullable=False, index=True)
    message_id = Column(Integer, nullable=True, index=True)
    storage_key = Column(String(500), nullable=False, unique=True)
    original_name = Column(String(255), nullable=False)
    mime_type = Column(String(255), nullable=False, default="application/octet-stream")
    size_bytes = Column(Integer, nullable=False)
    sha256 = Column(String(64), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

