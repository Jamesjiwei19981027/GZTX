"""证据 / 进度 schema"""
from typing import Any, Optional

from pydantic import BaseModel, Field


class EvidenceSubmit(BaseModel):
    summary_text: Optional[str] = None
    structured: Optional[dict[str, Any]] = None
    links: Optional[list[dict[str, Any]]] = None
    file_ids: list[int] = Field(default_factory=list)
    supersedes_package_id: Optional[int] = None


class ReviewRequestBody(BaseModel):
    summary_text: Optional[str] = None
    case_type: str = "rejection_review"


class ReviewConfirmBody(BaseModel):
    decision: str  # confirmed | dismissed
    note: Optional[str] = None


class WikiCreate(BaseModel):
    title: str
    body_text: Optional[str] = None
    node_id: Optional[int] = None


class WikiPatch(BaseModel):
    title: Optional[str] = None
    body_text: Optional[str] = None
