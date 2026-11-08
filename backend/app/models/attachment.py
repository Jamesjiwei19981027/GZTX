from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.types import UTCDateTime


class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    original_name = Column(String(500), nullable=False)
    stored_name = Column(String(500), nullable=False)  # UUID-based filename on disk
    file_size = Column(Integer, nullable=False)  # bytes
    mime_type = Column(String(200), nullable=False)
    created_at = Column(UTCDateTime(), server_default=func.now(), nullable=False)

    # Relationships
    task = relationship("Task", backref="attachments")
    user = relationship("User", backref="attachments")

    def __repr__(self):
        return f"<Attachment(id={self.id}, name='{self.original_name[:30]}')>"


class AttachmentDownloadTicket(Base):
    """附件下载一次性票据。

    浏览器 `<a download>` / `<img src>` 无法带 Authorization 头，旧实现允许
    `?token=<access_token>`，等于把可访问全部接口的凭据写进 URL——会进浏览器历史、
    Referer 与反代日志。改为：先用正常鉴权换一张短时一次性票据，只能下这一个附件。
    """

    __tablename__ = "attachment_download_tickets"

    id = Column(Integer, primary_key=True)
    # 只存 sha256，落库泄露也换不出可用票据
    token_hash = Column(String(64), nullable=False, unique=True)
    attachment_id = Column(
        Integer, ForeignKey("attachments.id", ondelete="CASCADE"), nullable=False
    )
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    expires_at = Column(DateTime, nullable=False, index=True)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(UTCDateTime(), server_default=func.now())
