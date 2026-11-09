"""企业身份绑定及短期登录事务；不创建用户或公司成员。"""
from sqlalchemy import Boolean, Column, ForeignKey, Integer, JSON, String, UniqueConstraint
from app.db.base import Base
from app.db.types import UTCDateTime


class SsoBinding(Base):
    __tablename__ = "sso_bindings"
    __table_args__ = (
        UniqueConstraint("company_id", "provider", "issuer", "external_id", name="uq_sso_subject"),
        UniqueConstraint("company_id", "provider", "issuer", "user_id", name="uq_sso_member"),
    )
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    provider = Column(String(32), nullable=False)
    issuer = Column(String(255), nullable=False, default="")
    external_id = Column(String(255), nullable=False)


class SsoLoginAttempt(Base):
    __tablename__ = "sso_login_attempts"
    state_hash = Column(String(64), primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    provider = Column(String(32), nullable=False)
    browser_hash = Column(String(64), nullable=False)
    nonce = Column(String(128), nullable=False)
    return_to = Column(String(2048), nullable=False, default="/")
    code_challenge = Column(String(128), nullable=True)
    expires_at = Column(UTCDateTime(), nullable=False, index=True)
    consumed_at = Column(UTCDateTime(), nullable=True)
    ticket_hash = Column(String(64), unique=True, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    ticket_expires_at = Column(UTCDateTime(), nullable=True)
    completed_at = Column(UTCDateTime(), nullable=True)


class OrgDirectoryPerson(Base):
    """通讯录人员独立于登录账号；未受邀人员不会获得任何权限。"""
    __tablename__ = "org_directory_people"
    __table_args__ = (UniqueConstraint("company_id", "source", "external_id", name="uq_org_directory_person"),)
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    source = Column(String(32), nullable=False)
    external_id = Column(String(128), nullable=False)
    union_id = Column(String(255), nullable=True)
    name = Column(String(200), nullable=False)
    email = Column(String(255), nullable=True)
    mobile = Column(String(32), nullable=True)
    title = Column(String(100), nullable=True)
    dept_external_ids = Column(JSON, nullable=False, default=list)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    synced_at = Column(UTCDateTime(), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
