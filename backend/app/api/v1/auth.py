"""
认证相关接口
"""
from fastapi import APIRouter, HTTPException, status

from app.core.dependencies import DbSession
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.models.user import User
from app.schemas.user import (
    UserRegister,
    UserLogin,
    WxLogin,
    RefreshToken,
    TokenResponse,
    UserBasic,
)
from app.schemas.common import ResponseData

router = APIRouter(prefix="/auth", tags=["认证"])


@router.post("/register", response_model=ResponseData, status_code=status.HTTP_201_CREATED)
async def register(data: UserRegister, db: DbSession):
    """用户注册"""
    from sqlalchemy import select

    # 检查用户名是否已存在
    result = await db.execute(select(User).where(User.username == data.username))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="用户名已存在",
        )

    # 检查邮箱是否已存在
    if data.email:
        result = await db.execute(select(User).where(User.email == data.email))
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="邮箱已注册",
            )

    # 创建用户
    user = User(
        username=data.username,
        password_hash=get_password_hash(data.password),
        email=data.email,
        nickname=data.nickname or data.username,
    )
    db.add(user)
    await db.flush()

    # 创建默认分类
    from app.models.category import Category
    default_categories = [
        Category(user_id=user.id, name="工作", color="#409EFF", icon="work", is_default=True, sort_order=0),
        Category(user_id=user.id, name="个人", color="#67C23A", icon="user", sort_order=1),
        Category(user_id=user.id, name="学习", color="#E6A23C", icon="book", sort_order=2),
        Category(user_id=user.id, name="重要", color="#F56C6C", icon="star", sort_order=3),
    ]
    db.add_all(default_categories)

    # 生成 Token
    access_token = create_access_token(data={"sub": user.id})
    refresh_token = create_refresh_token(data={"sub": user.id})

    return ResponseData(
        data=TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=900,
            user=UserBasic.model_validate(user),
        )
    )


@router.post("/login", response_model=ResponseData)
async def login(data: UserLogin, db: DbSession):
    """用户登录"""
    from sqlalchemy import select

    result = await db.execute(select(User).where(User.username == data.username))
    user = result.scalar_one_or_none()

    if not user or not user.password_hash or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户已被禁用",
        )

    access_token = create_access_token(data={"sub": user.id})
    refresh_token = create_refresh_token(data={"sub": user.id})

    return ResponseData(
        data=TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=900,
            user=UserBasic.model_validate(user),
        )
    )


@router.post("/wx-login", response_model=ResponseData)
async def wx_login(data: WxLogin, db: DbSession):
    """微信登录"""
    from sqlalchemy import select
    from app.core.config import settings
    import httpx

    # 调用微信接口获取 openid
    async with httpx.AsyncClient() as client:
        url = "https://api.weixin.qq.com/sns/jscode2session"
        params = {
            "appid": settings.WX_APP_ID,
            "secret": settings.WX_APP_SECRET,
            "js_code": data.code,
            "grant_type": "authorization_code",
        }
        resp = await client.get(url, params=params)
        wx_data = resp.json()

    openid = wx_data.get("openid")
    if not openid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="微信登录失败",
        )

    # 查找或创建用户
    result = await db.execute(select(User).where(User.wx_openid == openid))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            username=f"wx_{openid[:8]}",
            wx_openid=openid,
            wx_unionid=wx_data.get("unionid"),
            nickname="微信用户",
        )
        db.add(user)
        await db.flush()

        # 创建默认分类
        from app.models.category import Category
        default_categories = [
            Category(user_id=user.id, name="工作", color="#409EFF", icon="work", is_default=True, sort_order=0),
            Category(user_id=user.id, name="个人", color="#67C23A", icon="user", sort_order=1),
            Category(user_id=user.id, name="学习", color="#E6A23C", icon="book", sort_order=2),
            Category(user_id=user.id, name="重要", color="#F56C6C", icon="star", sort_order=3),
        ]
        db.add_all(default_categories)

    access_token = create_access_token(data={"sub": user.id})
    refresh_token = create_refresh_token(data={"sub": user.id})

    return ResponseData(
        data=TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=900,
            user=UserBasic.model_validate(user),
        )
    )


@router.post("/refresh", response_model=ResponseData)
async def refresh_token(data: RefreshToken):
    """刷新 Token"""
    payload = decode_token(data.refresh_token)

    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token无效或已过期",
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token无效",
        )

    access_token = create_access_token(data={"sub": user_id})

    return ResponseData(
        data={
            "access_token": access_token,
            "expires_in": 900,
        }
    )


@router.post("/logout", response_model=ResponseData)
async def logout():
    """登出（客户端删除 Token 即可）"""
    return ResponseData(message="登出成功")
