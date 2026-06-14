from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    original_name = Column(String(500), nullable=False)
    stored_name = Column(String(500), nullable=False)  # UUID-based filename on disk
    file_size = Column(Integer, nullable=False)  # bytes
    mime_type = Column(String(200), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    task = relationship("Task", backref="attachments")
    user = relationship("User", backref="attachments")

    def __repr__(self):
        return f"<Attachment(id={self.id}, name='{self.original_name[:30]}')>"
