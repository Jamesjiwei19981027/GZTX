from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(50), nullable=False)
    color = Column(String(7), default="#409EFF", nullable=False)
    icon = Column(String(50), nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    is_default = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", backref="categories")
    tasks = relationship("Task", back_populates="category")

    def __repr__(self):
        return f"<Category {self.name}>"