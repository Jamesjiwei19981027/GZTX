"""
通用响应模型
"""
from typing import Any, Optional, Generic, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


class ResponseBase(BaseModel):
    """统一响应格式"""
    code: int = 200
    message: str = "success"


class ResponseData(ResponseBase):
    """带数据的响应"""
    data: Any = None


class PaginatedData(BaseModel):
    """分页数据"""
    items: list
    total: int
    page: int
    page_size: int
    total_pages: int


class PaginatedResponse(ResponseBase):
    """分页响应"""
    data: PaginatedData


class ErrorResponse(BaseModel):
    """错误响应"""
    code: int
    message: str
    detail: Optional[dict] = None


class PaginationParams(BaseModel):
    """分页参数"""
    page: int = 1
    page_size: int = 20
