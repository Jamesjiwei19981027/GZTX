"""证据 / 进度 schema"""
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class EvidenceReviewBody(BaseModel):
    decision: Literal["adopted", "rejected"]
    reason: Optional[str] = None


class EvidenceSubmit(BaseModel):
    summary_text: Optional[str] = None
    structured: Optional[dict[str, Any]] = None
    links: Optional[list[dict[str, Any]]] = None
    file_ids: list[int] = Field(default_factory=list)
    supersedes_package_id: Optional[int] = None
    # Remix UI：证据类型 + 外链（落入 structured/links，无需改表）
    evidence_kind: Optional[str] = None  # commit|document|figma|log|delivery
    external_url: Optional[str] = None


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
