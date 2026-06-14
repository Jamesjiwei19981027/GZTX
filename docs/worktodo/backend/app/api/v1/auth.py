from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.dependencies import get_db, get_current_user
from app.core.security import verify_password, get_password_hash, create_access_token, create_refresh_token, verify_token
from app.core.config import settings
from app.models.user import User
from app.models.category import Category
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, RefreshRequest, WXLoginRequest
from app.schemas.common import APIResponse
from app.schemas.user import UserResponse
from datetime import timedelta

router = APIRouter(prefix="/auth", tags=["认证"])


@router.post("/register", response_model=APIResponse)
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    """注册新用户"""
    # 检查用户名是否存在
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(status_code=409, detail="用户名已存在")

    # 检查邮箱是否存在
    if data.email and db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=409, detail="邮箱已注册")

    # 创建用户
    user = User(
        username=data.username,
        password_hash=get_password_hash(data.password),
        email=data.email,
        nickname=data.nickname,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # 创建默认分类
    default_categories = [
        Category(user_id=user.id, name="工作", color="#409EFF", icon="work", sort_order=0, is_default=True),
        Category(user_id=user.id, name="个人", color="#67C23A", icon="user", sort_order=1),
        Category(user_id=user.id, name="学习", color="#E6A23C", icon="book", sort_order=2),
        Category(user_id=user.id, name="重要", color="#F56C6C", icon="star", sort_order=3),
    ]
    for cat in default_categories:
        db.add(cat)
    db.commit()

    return APIResponse(code=201, message="注册成功")


@router.post("/login", response_model=APIResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    """账号密码登录"""
    user = db.query(User).filter(User.username == data.username).first()
    if not user or not verify_password(data.password, user.password_hash or ""):
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="用户已被禁用")

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    return APIResponse(
        code=200,
        message="success",
        data={
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "user": {
                "id": user.id,
                "username": user.username,
                "nickname": user.nickname,
                "avatar_url": user.avatar_url,
            }
        }
    )


@router.post("/refresh", response_model=APIResponse)
def refresh_token(data: RefreshRequest, db: Session = Depends(get_db)):
    """刷新Token"""
    payload = verify_token(data.refresh_token, "refresh")
    if not payload:
        raise HTTPException(status_code=401, detail="Token无效")

    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="用户不存在或已禁用")

    access_token = create_access_token({"sub": str(user.id)})

    return APIResponse(
        code=200,
        message="success",
        data={
            "access_token": access_token,
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        }
    )


@router.post("/logout", response_model=APIResponse)
def logout(current_user: User = Depends(get_current_user)):
    """登出"""
    return APIResponse(code=200, message="登出成功")


@router.post("/wx-login", response_model=APIResponse)
def wx_login(data: WXLoginRequest, db: Session = Depends(get_db)):
    """微信登录"""
    # 微信登录需要配置 WX_APP_ID 和 WX_APP_SECRET
    if not settings.WX_APP_ID or not settings.WX_APP_SECRET:
        raise HTTPException(status_code=501, detail="微信登录未配置")

    # TODO: 调用微信接口获取 openid
    # 这里简化处理，实际需要调用微信接口
    raise HTTPException(status_code=501, detail="微信登录暂不可用")