"""
用户相关接口
"""
import re
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select

from app.core.dependencies import CurrentUser, DbSession
from app.core.security import verify_password, get_password_hash
from app.core.config import settings
from app.models.user import User
from app.schemas.user import UserUpdate, PasswordChange, UserDetail
from app.schemas.common import ResponseData

router = APIRouter(prefix="/users", tags=["用户"])


class BindEmailRequest(BaseModel):
    email: EmailStr


@router.get("/me", response_model=ResponseData)
async def get_me(user: CurrentUser):
    """获取当前用户信息"""
    return ResponseData(data=UserDetail.model_validate(user).model_dump())


@router.put("/me", response_model=ResponseData)
async def update_me(data: UserUpdate, db: DbSession, user: CurrentUser):
    """更新当前用户信息"""
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(user, key, value)

    await db.flush()
    return ResponseData(data=UserDetail.model_validate(user).model_dump())


@router.put("/me/password", response_model=ResponseData)
async def change_password(data: PasswordChange, db: DbSession, user: CurrentUser):
    """修改密码"""
    if not user.password_hash or not verify_password(data.old_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="原密码错误",
        )

    user.password_hash = get_password_hash(data.new_password)
    return ResponseData(message="密码修改成功")


@router.post("/me/bind-wx", response_model=ResponseData)
async def bind_wx(data: dict, db: DbSession, user: CurrentUser):
    """绑定微信"""
    code = data.get("code")
    if not code:
        raise HTTPException(status_code=400, detail="缺少微信授权码")

    from app.core.config import settings
    import httpx

    async with httpx.AsyncClient() as client:
        url = "https://api.weixin.qq.com/sns/jscode2session"
        params = {
            "appid": settings.WX_APP_ID,
            "secret": settings.WX_APP_SECRET,
            "js_code": code,
            "grant_type": "authorization_code",
        }
        resp = await client.get(url, params=params)
        wx_data = resp.json()

    openid = wx_data.get("openid")
    if not openid:
        raise HTTPException(status_code=401, detail="微信授权失败")

    # 检查 openid 是否已被绑定
    result = await db.execute(select(User).where(User.wx_openid == openid))
    existing = result.scalar_one_or_none()
    if existing and existing.id != user.id:
        raise HTTPException(status_code=409, detail="该微信已被其他账号绑定")

    user.wx_openid = openid
    user.wx_unionid = wx_data.get("unionid")

    return ResponseData(message="绑定成功")


@router.post("/email/bind", response_model=ResponseData)
async def bind_user_email(data: BindEmailRequest, db: DbSession, user: CurrentUser):
    """绑定用户邮箱用于接收邮件回复（不限邮箱类型）"""
    # Basic email format validation (already done by EmailStr)
    user.email = data.email
    return ResponseData(message="邮箱绑定成功", data={"email": data.email})


@router.get("/email/status", response_model=ResponseData)
async def get_email_status(db: DbSession, user: CurrentUser):
    """获取邮箱绑定状态"""
    return ResponseData(data={
        "email": user.email or "",
        "imap_configured": bool(
            user.email
            and settings.IMAP_USER
            and settings.IMAP_PASSWORD
        )
    })
