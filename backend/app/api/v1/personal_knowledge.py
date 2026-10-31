"""Authenticated owner's private Wiki; a manager has no ownership override."""
from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select

from app.api.deps_collab import assert_company_write
from app.core.dependencies import CurrentUser, DbSession
from app.models.personal_knowledge import PersonalKnowledgeEntry, PersonalKnowledgeLink
from app.schemas.common import ResponseData
from app.services.personal_knowledge import (
    delete_entry, entry_dto, link_dto, owned_entry, owned_link,
    require_personal_scope, scoped, sync_personal_knowledge,
)
from app.services.knowledge_assistant import ConfirmedSuggestion, suggest_relationships, apply_relationships

router = APIRouter(prefix="/projects/{project_id}/personal-knowledge", tags=["个人知识空间"])


class Position(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    x: float = Field(ge=-1000000, le=1000000)
    y: float = Field(ge=-1000000, le=1000000)


class EntryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=300)
    body_text: str = Field(default="", max_length=2000000)
    tags: list[str] = Field(default_factory=list, max_length=50)

    @field_validator("title")
    @classmethod
    def valid_title(cls, value):
        if not value.strip():
            raise ValueError("标题不能为空")
        return value.strip()

    @field_validator("tags")
    @classmethod
    def valid_tags(cls, value):
        if any(len(tag) > 100 for tag in value):
            raise ValueError("标签过长")
        return list(dict.fromkeys(tag.strip() for tag in value if tag.strip()))


class EntryPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, min_length=1, max_length=300)
    body_text: str | None = Field(default=None, max_length=2000000)
    tags: list[str] | None = Field(default=None, max_length=50)
    position: Position | None = None

    @field_validator("title")
    @classmethod
    def valid_title(cls, value):
        if value is None or not value.strip():
            raise ValueError("标题不能为空")
        return value.strip()

    @field_validator("body_text", "tags")
    @classmethod
    def non_null(cls, value):
        if value is None:
            raise ValueError("此字段不能为空")
        return value

    @field_validator("tags")
    @classmethod
    def valid_tags(cls, value):
        return EntryCreate.valid_tags(value)


class LinkCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_entry_id: int = Field(gt=0)
    target_entry_id: int = Field(gt=0)
    label: str = Field(default="", max_length=200)


class LinkPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: str = Field(max_length=200)


class AssistRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    entry_ids: list[int] | None = Field(default=None, max_length=80)


class ApplyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    suggestions: list[ConfirmedSuggestion] = Field(min_length=1, max_length=40)


async def access(db, project_id, user, *, write=False):
    project = await require_personal_scope(db, project_id, user.id)
    if write:
        await assert_company_write(db, project.company_id, feature="project_tree")
    return project


@router.get("")
async def catalog(project_id: int, db: DbSession, user: CurrentUser):
    """获取我的个人知识空间"""
    project = await access(db, project_id, user)
    rows = (await db.execute(select(PersonalKnowledgeEntry).where(
        *scoped(PersonalKnowledgeEntry, project.company_id, project.id, user.id),
        PersonalKnowledgeEntry.is_deleted.is_(False)).order_by(PersonalKnowledgeEntry.id))).scalars().all()
    ids = {row.id for row in rows}
    links = (await db.execute(select(PersonalKnowledgeLink).where(
        *scoped(PersonalKnowledgeLink, project.company_id, project.id, user.id)).order_by(PersonalKnowledgeLink.id))).scalars().all()
    return ResponseData(data={"scope": {"company_id": project.company_id,
        "project_id": project.id, "owner_user_id": user.id},
        "entries": [entry_dto(row) for row in rows],
        "links": [link_dto(row) for row in links if row.source_entry_id in ids and row.target_entry_id in ids]})


@router.post("/entries")
async def create_entry(project_id: int, body: EntryCreate, db: DbSession, user: CurrentUser):
    """新建个人知识条目"""
    project = await access(db, project_id, user, write=True)
    row = PersonalKnowledgeEntry(company_id=project.company_id, project_id=project.id,
        owner_user_id=user.id, title=body.title, body_text=body.body_text, tags_json=body.tags)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return ResponseData(data=entry_dto(row))


@router.patch("/entries/{entry_id}")
async def patch_entry(project_id: int, entry_id: int, body: EntryPatch, db: DbSession, user: CurrentUser):
    """修改个人知识条目"""
    project = await access(db, project_id, user, write=True)
    row = await owned_entry(db, project, user.id, entry_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, {"tags": "tags_json", "position": "position_json"}.get(field, field), value)
    await db.commit()
    await db.refresh(row)
    return ResponseData(data=entry_dto(row))


@router.delete("/entries/{entry_id}")
async def remove_entry(project_id: int, entry_id: int, db: DbSession, user: CurrentUser):
    """删除个人知识条目"""
    project = await access(db, project_id, user, write=True)
    await delete_entry(db, project, user.id, entry_id)
    await db.commit()
    return ResponseData(data={"id": entry_id, "is_deleted": True})


@router.post("/sync")
async def sync(project_id: int, db: DbSession, user: CurrentUser):
    """同步项目资料到个人知识空间"""
    project = await access(db, project_id, user, write=True)
    result = await sync_personal_knowledge(db, project, user.id)
    await db.commit()
    return ResponseData(data=result)


@router.post("/links")
async def create_link(project_id: int, body: LinkCreate, db: DbSession, user: CurrentUser):
    """新建个人知识关联"""
    project = await access(db, project_id, user, write=True)
    await owned_entry(db, project, user.id, body.source_entry_id)
    await owned_entry(db, project, user.id, body.target_entry_id)
    duplicate = await db.scalar(select(PersonalKnowledgeLink.id).where(
        *scoped(PersonalKnowledgeLink, project.company_id, project.id, user.id),
        PersonalKnowledgeLink.source_entry_id == body.source_entry_id,
        PersonalKnowledgeLink.target_entry_id == body.target_entry_id))
    if duplicate is not None:
        raise HTTPException(status_code=409, detail="这条关联已经存在")
    row = PersonalKnowledgeLink(company_id=project.company_id, project_id=project.id,
        owner_user_id=user.id, **body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return ResponseData(data=link_dto(row))


@router.post("/assist")
async def assist(project_id: int, body: AssistRequest, db: DbSession, user: CurrentUser):
    """请 AI 整理个人知识"""
    project = await access(db, project_id, user, write=True)
    return ResponseData(data=await suggest_relationships(db, project, user, body.entry_ids))


@router.post("/assist/apply")
async def apply_assist(project_id: int, body: ApplyRequest, db: DbSession, user: CurrentUser):
    """采纳 AI 整理结果"""
    project = await access(db, project_id, user, write=True)
    result = await apply_relationships(db, project, user.id, body.suggestions)
    await db.commit()
    return ResponseData(data=result)


@router.patch("/links/{link_id}")
async def patch_link(project_id: int, link_id: int, body: LinkPatch, db: DbSession, user: CurrentUser):
    """修改个人知识关联"""
    project = await access(db, project_id, user, write=True)
    row = await owned_link(db, project, user.id, link_id)
    row.label = body.label
    await db.commit()
    await db.refresh(row)
    return ResponseData(data=link_dto(row))


@router.delete("/links/{link_id}")
async def remove_link(project_id: int, link_id: int, db: DbSession, user: CurrentUser):
    """删除个人知识关联"""
    project = await access(db, project_id, user, write=True)
    row = await owned_link(db, project, user.id, link_id)
    await db.delete(row)
    await db.commit()
    return ResponseData(data={"id": link_id, "is_deleted": True})
