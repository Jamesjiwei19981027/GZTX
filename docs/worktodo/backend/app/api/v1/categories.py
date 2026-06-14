from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.dependencies import get_db, get_current_user
from app.models.user import User
from app.models.category import Category
from app.models.task import Task
from app.schemas.category import CategoryCreate, CategoryUpdate, CategoryResponse, CategoryReorderRequest
from app.schemas.common import APIResponse

router = APIRouter(prefix="/categories", tags=["分类"])


@router.get("", response_model=APIResponse)
def get_categories(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取分类列表"""
    categories = db.query(Category).filter(
        Category.user_id == current_user.id
    ).order_by(Category.sort_order).all()

    items = []
    for cat in categories:
        task_count = db.query(Task).filter(
            Task.category_id == cat.id,
            Task.is_deleted == False
        ).count()
        items.append({
            "id": cat.id,
            "name": cat.name,
            "color": cat.color,
            "icon": cat.icon,
            "sort_order": cat.sort_order,
            "task_count": task_count,
            "is_default": cat.is_default,
            "created_at": cat.created_at
        })

    return APIResponse(code=200, message="success", data=items)


@router.post("", response_model=APIResponse)
def create_category(
    data: CategoryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """创建分类"""
    category = Category(
        user_id=current_user.id,
        name=data.name,
        color=data.color,
        icon=data.icon,
        sort_order=data.sort_order
    )
    db.add(category)
    db.commit()
    db.refresh(category)

    return APIResponse(code=201, message="创建成功", data={
        "id": category.id,
        "name": category.name,
        "color": category.color,
        "icon": category.icon,
        "sort_order": category.sort_order,
        "task_count": 0,
        "is_default": category.is_default,
        "created_at": category.created_at
    })


@router.put("/{category_id}", response_model=APIResponse)
def update_category(
    category_id: int,
    data: CategoryUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """更新分类"""
    category = db.query(Category).filter(
        Category.id == category_id,
        Category.user_id == current_user.id
    ).first()

    if not category:
        raise HTTPException(status_code=404, detail="分类不存在")

    if data.name is not None:
        category.name = data.name
    if data.color is not None:
        category.color = data.color
    if data.icon is not None:
        category.icon = data.icon

    db.commit()
    db.refresh(category)

    task_count = db.query(Task).filter(
        Task.category_id == category.id,
        Task.is_deleted == False
    ).count()

    return APIResponse(code=200, message="更新成功", data={
        "id": category.id,
        "name": category.name,
        "color": category.color,
        "icon": category.icon,
        "sort_order": category.sort_order,
        "task_count": task_count,
        "is_default": category.is_default,
        "created_at": category.created_at
    })


@router.delete("/{category_id}", response_model=APIResponse)
def delete_category(
    category_id: int,
    move_to: int = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """删除分类"""
    category = db.query(Category).filter(
        Category.id == category_id,
        Category.user_id == current_user.id
    ).first()

    if not category:
        raise HTTPException(status_code=404, detail="分类不存在")

    if category.is_default:
        raise HTTPException(status_code=422, detail="不能删除默认分类")

    # 获取默认分类
    if move_to:
        target = db.query(Category).filter(
            Category.id == move_to,
            Category.user_id == current_user.id
        ).first()
    else:
        target = db.query(Category).filter(
            Category.user_id == current_user.id,
            Category.is_default == True
        ).first()

    if not target:
        raise HTTPException(status_code=404, detail="目标分类不存在")

    # 移动任务
    db.query(Task).filter(Task.category_id == category_id).update(
        {Task.category_id: target.id}, synchronize_session=False
    )

    db.delete(category)
    db.commit()

    return APIResponse(code=204, message="删除成功")


@router.put("/reorder", response_model=APIResponse)
def reorder_categories(
    data: CategoryReorderRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """排序分类"""
    for idx, cat_id in enumerate(data.category_ids):
        cat = db.query(Category).filter(
            Category.id == cat_id,
            Category.user_id == current_user.id
        ).first()
        if cat:
            cat.sort_order = idx

    db.commit()

    return APIResponse(code=200, message="排序成功")