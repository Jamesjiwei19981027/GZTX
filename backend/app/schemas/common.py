"""
通用响应模型
"""
from datetime import datetime
from typing import Annotated, Any, Optional, Generic, TypeVar
from pydantic import AfterValidator, BaseModel, PlainSerializer

from app.utils.datetime import to_naive_utc, to_utc_iso

T = TypeVar("T")

# 三端 datetime 契约：入参任意时区归一 UTC 落库（naive UTC），
# 出参一律带 `Z`，客户端负责本地渲染。
# AfterValidator 跑在 datetime 解析之后，字符串 `...+08:00` 与 aware datetime
# 都能拿到已解析的 aware 值再换算。
UTCDateTime = Annotated[
    datetime,
    AfterValidator(to_naive_utc),
    PlainSerializer(to_utc_iso, return_type=str, when_used="always"),
]


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
