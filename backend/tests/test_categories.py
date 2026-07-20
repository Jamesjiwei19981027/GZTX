import pytest
from httpx import AsyncClient

from app.models.category import Category


@pytest.mark.asyncio
async def test_create_category(client: AsyncClient, auth_headers, test_user):
    """Test category creation."""
    response = await client.post(
        "/api/v1/categories",
        headers=auth_headers,
        json={
            "name": "新分类",
            "color": "#F56C6C",
            "icon": "folder"
        }
    )
    assert response.status_code == 201
    data = response.json()
    assert data["code"] == 200
    assert data["data"]["name"] == "新分类"
    assert data["data"]["color"] == "#F56C6C"


@pytest.mark.asyncio
async def test_get_categories(client: AsyncClient, auth_headers, test_user, db_session):
    """Test getting category list."""
    for i, (name, color) in enumerate([("工作", "#409EFF"), ("个人", "#67C23A")]):
        cat = Category(
            user_id=test_user.id,
            name=name,
            color=color,
            sort_order=i,
            is_default=i == 0
        )
        db_session.add(cat)
    await db_session.commit()

    response = await client.get(
        "/api/v1/categories",
        headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 200
    assert len(data["data"]) == 2


@pytest.mark.asyncio
async def test_update_category(client: AsyncClient, auth_headers, test_user, db_session):
    """Test category update."""
    category = Category(
        user_id=test_user.id,
        name="原始名称",
        color="#409EFF",
        sort_order=0,
        is_default=True
    )
    db_session.add(category)
    await db_session.commit()
    await db_session.refresh(category)

    response = await client.put(
        f"/api/v1/categories/{category.id}",
        headers=auth_headers,
        json={
            "name": "更新后的名称",
            "color": "#67C23A"
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["name"] == "更新后的名称"
    assert data["data"]["color"] == "#67C23A"


@pytest.mark.asyncio
async def test_delete_category(client: AsyncClient, auth_headers, test_user, db_session):
    """Test category deletion."""
    default_cat = Category(
        user_id=test_user.id,
        name="默认分类",
        color="#409EFF",
        sort_order=0,
        is_default=True
    )
    other_cat = Category(
        user_id=test_user.id,
        name="可删除分类",
        color="#67C23A",
        sort_order=1,
        is_default=False
    )
    db_session.add(default_cat)
    db_session.add(other_cat)
    await db_session.commit()
    await db_session.refresh(other_cat)

    response = await client.delete(
        f"/api/v1/categories/{other_cat.id}",
        headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "删除成功"


@pytest.mark.asyncio
async def test_cannot_delete_default_category(client: AsyncClient, auth_headers, test_user, db_session):
    """Test that default category cannot be deleted."""
    category = Category(
        user_id=test_user.id,
        name="默认分类",
        color="#409EFF",
        sort_order=0,
        is_default=True
    )
    db_session.add(category)
    await db_session.commit()
    await db_session.refresh(category)

    response = await client.delete(
        f"/api/v1/categories/{category.id}",
        headers=auth_headers
    )
    assert response.status_code == 422
    data = response.json()
    assert "默认分类" in data["detail"]


@pytest.mark.asyncio
async def test_reorder_categories(client: AsyncClient, auth_headers, test_user, db_session):
    """Test category reordering."""
    cats = []
    for i, name in enumerate(["分类1", "分类2", "分类3"]):
        cat = Category(
            user_id=test_user.id,
            name=name,
            color="#409EFF",
            sort_order=i,
            is_default=i == 0
        )
        db_session.add(cat)
        cats.append(cat)
    await db_session.commit()
    for cat in cats:
        await db_session.refresh(cat)

    # Reorder: [3, 1, 2]
    category_ids = [cats[2].id, cats[0].id, cats[1].id]

    response = await client.put(
        "/api/v1/categories/reorder",
        headers=auth_headers,
        json={"category_ids": category_ids}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "排序更新成功"
