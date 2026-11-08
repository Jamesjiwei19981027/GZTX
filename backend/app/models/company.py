"""
公司租户 · License · 成员 · SaaS 开通
"""
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    DateTime,
    ForeignKey,
    JSON,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.types import UTCDateTime


class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    status = Column(String(32), nullable=False, default="pending_license")
    deploy_hint = Column(String(32), nullable=True)
    policy_json = Column(JSON, nullable=False, default=dict)
    policy_preset = Column(String(32), nullable=True)
    entitlement_json = Column(JSON, nullable=False, default=dict)
    login_methods_json = Column(JSON, nullable=True)
    created_at = Column(UTCDateTime(), server_default=func.now())
    updated_at = Column(UTCDateTime(), onupdate=func.now())


class CompanyLicense(Base):
    __tablename__ = "company_licenses"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    license_payload = Column(Text, nullable=False)
    signature = Column(Text, nullable=False)
    valid_from = Column(UTCDateTime(), nullable=True)
    valid_to = Column(UTCDateTime(), nullable=True)
    features_json = Column(JSON, nullable=True)
    created_at = Column(UTCDateTime(), server_default=func.now())


class CompanyMembership(Base):
    __tablename__ = "company_memberships"
    __table_args__ = (UniqueConstraint("company_id", "user_id", name="uq_company_user"),)

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String(32), nullable=False, default="active")
    is_super_admin = Column(Boolean, default=False, nullable=False)
    is_org_leader = Column(Boolean, default=False, nullable=False)
    employment_status = Column(String(32), nullable=False, default="active")
    org_unit_id = Column(Integer, nullable=True)
    external_user_id = Column(String(128), nullable=True)
    title = Column(String(100), nullable=True)
    created_at = Column(UTCDateTime(), server_default=func.now())


class ServiceActivation(Base):
    """SaaS 线上开通记录"""
    __tablename__ = "service_activations"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    plan_code = Column(String(64), nullable=False, default="standard")
    status = Column(String(32), nullable=False, default="active")
    valid_from = Column(UTCDateTime(), nullable=True)
    valid_to = Column(UTCDateTime(), nullable=True)
    entitlement_override_json = Column(JSON, nullable=True)
    created_at = Column(UTCDateTime(), server_default=func.now())


class OrgUnit(Base):
    """组织单元（部门）"""
    __tablename__ = "org_units"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    parent_id = Column(Integer, ForeignKey("org_units.id"), nullable=True)
    leader_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    external_id = Column(String(128), nullable=True)
    source = Column(String(32), nullable=False, default="manual")  # wecom|dingtalk|feishu|manual|generic
    path = Column(String(1000), nullable=False, default="/")
    created_at = Column(UTCDateTime(), server_default=func.now())
