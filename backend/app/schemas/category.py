from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


class CategoryBase(BaseModel):
    """Base category schema."""
    name: str = Field(..., min_length=1, max_length=50)
    color: str = Field(default="#409EFF", max_length=7)
    icon: Optional[str] = None
    sort_order: int = 0


class CategoryCreate(CategoryBase):
    """Schema for creating a category."""
    pass


class CategoryUpdate(BaseModel):
    """Schema for updating a category."""
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    color: Optional[str] = None
    icon: Optional[str] = None


class CategoryResponse(BaseModel):
    """Schema for category response."""
    id: int
    name: str
    color: str
    icon: Optional[str] = None
    sort_order: int
    is_default: bool
    task_count: Optional[int] = 0

    class Config:
        from_attributes = True


class CategoryReorderRequest(BaseModel):
    """Schema for reordering categories."""
    category_ids: List[int]