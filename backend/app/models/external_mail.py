"""Mail records synchronized from an explicitly configured external IMAP inbox."""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from app.db.base import Base


class ExternalMail(Base):
    __tablename__ = "external_mails"
    __table_args__ = (
        UniqueConstraint("company_id", "provider", "external_id", name="uq_external_mail_identity"),
    )

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    synced_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    provider = Column(String(32), nullable=False, default="imap")
    external_id = Column(String(500), nullable=False)
    from_address = Column(String(500), nullable=True)
    to_addresses = Column(JSON, nullable=False, default=list)
    subject = Column(String(500), nullable=True)
    headers_json = Column(JSON, nullable=False, default=dict)
    body_text = Column(Text, nullable=False, default="")
    state = Column(String(16), nullable=False, default="active", index=True)  # active|archived|deleted
    received_at = Column(DateTime(timezone=True), nullable=True)
    synced_at = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())

