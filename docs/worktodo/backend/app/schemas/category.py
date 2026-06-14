from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class CategoryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    color: str = "#409EFF"
    icon: Optional[str] = None
    sort_order: int = 0


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = None
    icon: Optional[str] = None


class CategoryResponse(BaseModel):
    id: int
    name: str
    color: str
    icon: Optional[str] = None
    sort_order: int
    task_count: int = 0
    is_default: bool
    created_at: datetime

    class Config:
        from_attributes = True


class CategoryReorderRequest(BaseModel):
    category_ids: list[int]