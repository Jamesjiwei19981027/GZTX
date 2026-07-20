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


class VerifySendRequest(BaseModel):
    channel: str  # email | sms
    target: str


class VerifyConfirmRequest(BaseModel):
    channel: str
    target: str
    code: str


class WxPhoneBindRequest(BaseModel):
    code: str  # button open-type="getPhoneNumber" 返回的动态 code


@router.get("/me/verification", response_model=ResponseData)
async def get_verification_status(user: CurrentUser):
    """双验证状态（补验引导页用）"""
    return ResponseData(data={
        "email": user.email or "",
        "phone": user.phone or "",
        "email_verified": user.email_verified,
        "phone_verified": user.phone_verified,
        "is_verified": user.is_verified,
    })


@router.post("/me/verification/send-code", response_model=ResponseData)
async def send_bind_code(data: VerifySendRequest, db: DbSession, user: CurrentUser):
    """登录后补验/换绑：发送邮箱或短信验证码"""
    from app.services.verification import VerificationError, normalize_target, send_code

    channel = data.channel.strip().lower()
    try:
        target = normalize_target(channel, data.target)
        # 目标已被其他账号占用则拒绝
        if channel == "email":
            other = (
                await db.execute(select(User).where(User.email == target))
            ).scalar_one_or_none()
        else:
            other = (
                await db.execute(select(User).where(User.phone == target))
            ).scalar_one_or_none()
        if other and other.id != user.id:
            raise HTTPException(status_code=409, detail="该邮箱/手机号已被其他账号绑定")

        result = await send_code(
            db, channel=channel, target=target, purpose="bind", user_id=user.id
        )
    except VerificationError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return ResponseData(data=result, message="验证码已发送")


@router.post("/me/verification/confirm", response_model=ResponseData)
async def confirm_bind_code(data: VerifyConfirmRequest, db: DbSession, user: CurrentUser):
    """登录后补验/换绑：校验验证码并写入 email/phone + 验证时间"""
    from datetime import datetime

    from app.services.verification import VerificationError, consume_code, normalize_target

    channel = data.channel.strip().lower()
    try:
        target = normalize_target(channel, data.target)
        await consume_code(db, channel=channel, target=target, code=data.code, purpose="bind")
    except VerificationError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    if channel == "email":
        user.email = target
        user.email_verified_at = datetime.utcnow()
    else:
        user.phone = target
        user.phone_verified_at = datetime.utcnow()
    await db.flush()
    return ResponseData(
        message="验证成功",
        data={
            "email_verified": user.email_verified,
            "phone_verified": user.phone_verified,
            "is_verified": user.is_verified,
        },
    )


@router.post("/me/bind-phone-wx", response_model=ResponseData)
async def bind_phone_via_wechat(data: WxPhoneBindRequest, db: DbSession, user: CurrentUser):
    """小程序 getPhoneNumber 授权绑定手机号（视同已验证）。

    开发联调：DEBUG=true 时 code 可用 "fake:13800000000" 直接注入号码。
    """
    from datetime import datetime

    import httpx

    phone: str | None = None
    if settings.DEBUG and data.code.startswith("fake:"):
        phone = data.code.split(":", 1)[1].strip()
    else:
        async with httpx.AsyncClient() as client:
            token_resp = await client.get(
                "https://api.weixin.qq.com/cgi-bin/token",
                params={
                    "grant_type": "client_credential",
                    "appid": settings.WX_APP_ID,
                    "secret": settings.WX_APP_SECRET,
                },
            )
            access_token = token_resp.json().get("access_token")
            if not access_token:
                raise HTTPException(status_code=502, detail="获取微信凭证失败")
            phone_resp = await client.post(
                "https://api.weixin.qq.com/wxa/business/getuserphonenumber",
                params={"access_token": access_token},
                json={"code": data.code},
            )
            body = phone_resp.json()
            if body.get("errcode") != 0:
                raise HTTPException(status_code=502, detail="微信手机号授权失败")
            phone = (body.get("phone_info") or {}).get("purePhoneNumber")

    if not phone:
        raise HTTPException(status_code=422, detail="未获取到手机号")

    other = (
        await db.execute(select(User).where(User.phone == phone))
    ).scalar_one_or_none()
    if other and other.id != user.id:
        raise HTTPException(status_code=409, detail="该手机号已被其他账号绑定")

    user.phone = phone
    user.phone_verified_at = datetime.utcnow()
    await db.flush()
    return ResponseData(
        message="手机号绑定成功",
        data={
            "phone": phone,
            "phone_verified": True,
            "is_verified": user.is_verified,
        },
    )


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
