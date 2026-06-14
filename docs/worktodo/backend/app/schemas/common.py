from pydantic import BaseModel
from typing import Any, Optional


class APIResponse(BaseModel):
    code: int = 200
    message: str = "success"
    data: Optional[Any] = None


class PaginatedResponse(BaseModel):
    code: int = 200
    message: str = "success"
    data: Optional[dict] = None