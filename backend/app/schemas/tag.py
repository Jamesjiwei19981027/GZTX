from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field


class TagBase(BaseModel):
    """Base tag schema."""
    name: str = Field(..., min_length=1, max_length=30)
    color: str = Field(default="#67C23A", max_length=7)


class TagCreate(TagBase):
    """Schema for creating a tag."""
    pass


class TagUpdate(BaseModel):
    """Schema for updating a tag."""
    name: Optional[str] = Field(None, min_length=1, max_length=30)
    color: Optional[str] = None


class TagResponse(BaseModel):
    """Schema for tag response."""
    id: int
    name: str
    color: str
    created_at: datetime

    class Config:
        from_attributes = True