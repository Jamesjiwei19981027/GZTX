"""
分类相关接口
"""
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.dependencies import CurrentUser, DbSession
from app.models.category import Category
from app.models.task import Task
from app.schemas.task import CategoryCreate, CategoryUpdate, CategoryResponse
from app.schemas.common import ResponseData

router = APIRouter(prefix="/categories", tags=["分类"])


@router.get("", response_model=ResponseData)
async def get_categories(db: DbSession, user: CurrentUser):
    """获取分类列表"""
    query = (
        select(Category)
        .where(Category.user_id == user.id)
        .order_by(Category.sort_order)
    )
    result = await db.execute(query)
    categories = result.scalars().all()

    # 获取每个分类的任务数量
    cat_responses = []
    for cat in categories:
        count_result = await db.execute(
            select(Task).where(Task.category_id == cat.id, Task.is_deleted == False)
        )
        task_count = len(count_result.scalars().all())
        cat_dict = CategoryResponse.model_validate(cat).model_dump()
        cat_dict["task_count"] = task_count
        cat_responses.append(cat_dict)

    return ResponseData(data=cat_responses)


@router.post("", response_model=ResponseData, status_code=status.HTTP_201_CREATED)
async def create_category(data: CategoryCreate, db: DbSession, user: CurrentUser):
    """创建分类"""
    category = Category(
        user_id=user.id,
        name=data.name,
        color=data.color,
        icon=data.icon,
        sort_order=data.sort_order,
    )
    db.add(category)
    await db.flush()

    return ResponseData(data=CategoryResponse.model_validate(category).model_dump())


@router.put("/{category_id}", response_model=ResponseData)
async def update_category(
    category_id: int, data: CategoryUpdate, db: DbSession, user: CurrentUser
):
    """更新分类"""
    result = await db.execute(
        select(Category).where(Category.id == category_id, Category.user_id == user.id)
    )
    category = result.scalar_one_or_none()

    if not category:
        raise HTTPException(status_code=404, detail="分类不存在")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(category, key, value)

    return ResponseData(data=CategoryResponse.model_validate(category).model_dump())


@router.delete("/{category_id}", response_model=ResponseData)
async def delete_category(
    category_id: int, db: DbSession, user: CurrentUser, move_to: int = None
):
    """删除分类"""
    result = await db.execute(
        select(Category).where(Category.id == category_id, Category.user_id == user.id)
    )
    category = result.scalar_one_or_none()

    if not category:
        raise HTTPException(status_code=404, detail="分类不存在")

    if category.is_default:
        raise HTTPException(status_code=422, detail="不能删除默认分类")

    # 将该分类下的任务移动到目标分类
    if move_to:
        target_result = await db.execute(
            select(Category).where(Category.id == move_to, Category.user_id == user.id)
        )
        if not target_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="目标分类不存在")
    else:
        # 移动到默认分类
        default_result = await db.execute(
            select(Category).where(
                Category.user_id == user.id, Category.is_default == True
            )
        )
        default_cat = default_result.scalar_one_or_none()
        move_to = default_cat.id if default_cat else None

    if move_to:
        task_result = await db.execute(
            select(Task).where(Task.category_id == category_id)
        )
        for task in task_result.scalars().all():
            task.category_id = move_to

    await db.delete(category)

    return ResponseData(message="删除成功")


@router.put("/reorder", response_model=ResponseData)
async def reorder_categories(data: dict, db: DbSession, user: CurrentUser):
    """排序分类"""
    category_ids = data.get("category_ids", [])
    for idx, cat_id in enumerate(category_ids):
        result = await db.execute(
            select(Category).where(Category.id == cat_id, Category.user_id == user.id)
        )
        category = result.scalar_one_or_none()
        if category:
            category.sort_order = idx

    return ResponseData(message="排序成功")
