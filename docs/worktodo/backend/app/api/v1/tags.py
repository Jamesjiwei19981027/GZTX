from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.dependencies import get_db, get_current_user
from app.models.user import User
from app.models.tag import Tag, TaskTag
from app.schemas.tag import TagCreate, TagUpdate, TagResponse
from app.schemas.common import APIResponse

router = APIRouter(prefix="/tags", tags=["标签"])


@router.get("", response_model=APIResponse)
def get_tags(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取标签列表"""
    tags = db.query(Tag).filter(Tag.user_id == current_user.id).all()

    items = [
        {
            "id": t.id,
            "name": t.name,
            "color": t.color,
            "created_at": t.created_at
        }
        for t in tags
    ]

    return APIResponse(code=200, message="success", data=items)


@router.post("", response_model=APIResponse)
def create_tag(
    data: TagCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """创建标签"""
    # 检查是否已存在同名标签
    existing = db.query(Tag).filter(
        Tag.user_id == current_user.id,
        Tag.name == data.name
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="标签已存在")

    tag = Tag(
        user_id=current_user.id,
        name=data.name,
        color=data.color
    )
    db.add(tag)
    db.commit()
    db.refresh(tag)

    return APIResponse(code=201, message="创建成功", data={
        "id": tag.id,
        "name": tag.name,
        "color": tag.color,
        "created_at": tag.created_at
    })


@router.put("/{tag_id}", response_model=APIResponse)
def update_tag(
    tag_id: int,
    data: TagUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """更新标签"""
    tag = db.query(Tag).filter(
        Tag.id == tag_id,
        Tag.user_id == current_user.id
    ).first()

    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")

    if data.name is not None:
        tag.name = data.name
    if data.color is not None:
        tag.color = data.color

    db.commit()
    db.refresh(tag)

    return APIResponse(code=200, message="更新成功", data={
        "id": tag.id,
        "name": tag.name,
        "color": tag.color,
        "created_at": tag.created_at
    })


@router.delete("/{tag_id}", response_model=APIResponse)
def delete_tag(
    tag_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """删除标签"""
    tag = db.query(Tag).filter(
        Tag.id == tag_id,
        Tag.user_id == current_user.id
    ).first()

    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")

    # 删除标签关联
    db.query(TaskTag).filter(TaskTag.tag_id == tag_id).delete()

    db.delete(tag)
    db.commit()

    return APIResponse(code=204, message="删除成功")