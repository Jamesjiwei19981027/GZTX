from typing import Optional
from datetime import datetime
from pydantic import BaseModel


class AttachmentResponse(BaseModel):
    """Schema for attachment response."""
    id: int
    task_id: int
    original_name: str
    file_size: int
    mime_type: str
    download_url: str
    created_at: datetime

    class Config:
        from_attributes = True
