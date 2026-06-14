"""
标签相关接口
"""
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.dependencies import CurrentUser, DbSession
from app.models.tag import Tag
from app.schemas.task import TagCreate, TagUpdate, TagResponse
from app.schemas.common import ResponseData

router = APIRouter(prefix="/tags", tags=["标签"])


@router.get("", response_model=ResponseData)
async def get_tags(db: DbSession, user: CurrentUser):
    """获取标签列表"""
    result = await db.execute(
        select(Tag).where(Tag.user_id == user.id).order_by(Tag.created_at)
    )
    tags = result.scalars().all()

    return ResponseData(
        data=[TagResponse.model_validate(t).model_dump() for t in tags]
    )


@router.post("", response_model=ResponseData, status_code=status.HTTP_201_CREATED)
async def create_tag(data: TagCreate, db: DbSession, user: CurrentUser):
    """创建标签"""
    # 检查同名标签
    result = await db.execute(
        select(Tag).where(Tag.user_id == user.id, Tag.name == data.name)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="标签名称已存在")

    tag = Tag(user_id=user.id, name=data.name, color=data.color)
    db.add(tag)
    await db.flush()

    return ResponseData(data=TagResponse.model_validate(tag).model_dump())


@router.put("/{tag_id}", response_model=ResponseData)
async def update_tag(tag_id: int, data: TagUpdate, db: DbSession, user: CurrentUser):
    """更新标签"""
    result = await db.execute(
        select(Tag).where(Tag.id == tag_id, Tag.user_id == user.id)
    )
    tag = result.scalar_one_or_none()

    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(tag, key, value)

    return ResponseData(data=TagResponse.model_validate(tag).model_dump())


@router.delete("/{tag_id}", response_model=ResponseData)
async def delete_tag(tag_id: int, db: DbSession, user: CurrentUser):
    """删除标签"""
    result = await db.execute(
        select(Tag).where(Tag.id == tag_id, Tag.user_id == user.id)
    )
    tag = result.scalar_one_or_none()

    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")

    await db.delete(tag)

    return ResponseData(message="删除成功")
