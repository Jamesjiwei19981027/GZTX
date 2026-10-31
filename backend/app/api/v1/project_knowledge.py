"""Shared project catalog and explicitly authorized personal AI summary flow."""
from typing import Annotated

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.api.v1.personal_knowledge import EntryCreate
from app.core.dependencies import CurrentUser, DbSession
from app.schemas.common import ResponseData
from app.services.personal_knowledge import entry_dto
from app.services.project_knowledge import (
    generate_summary, member_list, owned_summary, page_dto, require_access,
    save_summary, set_grant, shared_pages, summary_dto,
)

router = APIRouter(prefix="/projects/{project_id}/knowledge-space", tags=["项目知识空间"])


class GrantBody(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    can_summarize: bool


class SummaryBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    page_ids: list[Annotated[int, Field(strict=True, gt=0)]] = Field(min_length=1, max_length=20)
    instruction: str = Field(default="", max_length=2000)

    @field_validator("page_ids")
    @classmethod
    def unique_ids(cls, value):
        return list(dict.fromkeys(value))


class SummarySave(EntryCreate):
    body_text: str = Field(max_length=2000000)
    tags: list[str] = Field(max_length=50)


@router.get("")
async def catalog(project_id: int, db: DbSession, user: CurrentUser):
    """获取项目知识空间"""
    project, permissions = await require_access(db, project_id, user.id)
    pages = await shared_pages(db, project)
    members = await member_list(db, project) if permissions["can_manage_grants"] else []
    return ResponseData(data={"scope": {"company_id": project.company_id, "project_id": project.id,
        "owner_user_id": user.id}, "pages": [page_dto(page) for page in pages],
        "permissions": permissions, "members": members})


@router.put("/grants/{user_id}")
async def update_grant(project_id: int, user_id: int, body: GrantBody, db: DbSession, user: CurrentUser):
    """设置成员的项目知识空间权限"""
    result = await set_grant(db, project_id, user.id, user_id, body.can_summarize)
    await db.commit()
    return ResponseData(data=result)


@router.post("/summaries")
async def create_summary(project_id: int, body: SummaryBody, db: DbSession, user: CurrentUser):
    """请智能体总结项目知识"""
    draft = await generate_summary(db, project_id, user, body.page_ids, body.instruction)
    await db.commit()
    await db.refresh(draft)
    return ResponseData(data=summary_dto(draft))


@router.get("/summaries/{summary_id}")
async def get_summary(project_id: int, summary_id: int, db: DbSession, user: CurrentUser):
    """获取项目知识总结结果"""
    project, _ = await require_access(db, project_id, user.id)
    row = await owned_summary(db, project, user.id, summary_id)
    return ResponseData(data=summary_dto(row))


@router.post("/summaries/{summary_id}/save")
async def confirm_save(project_id: int, summary_id: int, body: SummarySave, db: DbSession, user: CurrentUser):
    """确认把总结沉淀进个人知识库"""
    entry, already_saved = await save_summary(db, project_id, user, summary_id,
        title=body.title, body_text=body.body_text, tags=body.tags)
    await db.commit()
    await db.refresh(entry)
    return ResponseData(data={"entry": entry_dto(entry), "already_saved": already_saved})
