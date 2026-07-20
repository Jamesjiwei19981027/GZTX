"""ASR / Storage / Model 绑定"""
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, JSON

from app.db.base import Base


class AsrBinding(Base):
    __tablename__ = "asr_bindings"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # null=公司默认
    provider_id = Column(String(64), nullable=False)  # builtin|cloud:xxx|customer:xxx
    config_json = Column(JSON, nullable=True)
    is_default = Column(Boolean, default=False)


class StorageBinding(Base):
    __tablename__ = "storage_bindings"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    provider_id = Column(String(64), nullable=False)  # local|s3|customer
    config_json = Column(JSON, nullable=True)
    is_default = Column(Boolean, default=True)


class ModelBinding(Base):
    __tablename__ = "model_bindings"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    provider_id = Column(String(64), nullable=False)
    config_json = Column(JSON, nullable=True)
    is_default = Column(Boolean, default=False)
