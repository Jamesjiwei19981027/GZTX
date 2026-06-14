"""
标签模型
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base

# 任务-标签 多对多关联表
task_tags = Table(
    "task_tags",
    Base.metadata,
    Column("task_id", Integer, ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Tag(Base):
    """标签表"""
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(30), nullable=False)
    color = Column(String(7), nullable=False, default="#67C23A")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # 关系
    user = relationship("User", back_populates="tags")
    tasks = relationship("Task", secondary=task_tags, back_populates="tags", lazy="selectin")

    def __repr__(self):
        return f"<Tag(id={self.id}, name='{self.name}')>"
