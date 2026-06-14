"""
数据库基类 - 声明式基类
"""
from sqlalchemy.orm import DeclarativeBase, MappedAsDataclass


class Base(DeclarativeBase):
    """SQLAlchemy 声明式基类"""
    pass
