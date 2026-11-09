"""
用户相关接口
"""
import re
import os
import uuid
import mimetypes
from copy import deepcopy
from fastapi import APIRouter, HTTPException, Request, status, File, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy import select, update

from app.core.dependencies import CurrentUser, DbSession
from app.core.security import verify_password, get_password_hash
from app.core.config import settings
from app.models.user import User
from app.schemas.user import UserUpdate, PasswordChange, UserDetail
from app.schemas.common import ResponseData

router = APIRouter(prefix="/users", tags=["用户"])


class BindEmailRequest(BaseModel):
    email: EmailStr
    code: str  # 必须先走 /users/me/verification/send-code 拿码


class AccountDeleteRequest(BaseModel):
    password: str = ""
    confirmation: str


@router.get("/me", response_model=ResponseData)
async def get_me(user: CurrentUser):
    """获取当前用户信息"""
    return ResponseData(data=UserDetail.model_validate(user).model_dump())


def _merge_notify_pref(current_pref: dict | None, notify_pref: dict) -> dict:
    """字段级合并：只改传入的开关/静音时段，保留 SMTP/LLM 凭证与 ui 偏好。"""
    merged = deepcopy(current_pref or {})
    incoming_channels = notify_pref.get("channels")
    if incoming_channels is not None:
        channels = merged.setdefault("channels", {})
        for channel, values in incoming_channels.items():
            current = dict(channels.get(channel) or {})
            current.update(values or {})
            channels[channel] = current
    incoming_quiet_hours = notify_pref.get("quiet_hours")
    if incoming_quiet_hours is not None:
        quiet_hours = dict(merged.get("quiet_hours") or {})
        quiet_hours.update(incoming_quiet_hours or {})
        merged["quiet_hours"] = quiet_hours
    if "weekend_mute" in notify_pref:
        merged["weekend_mute"] = notify_pref["weekend_mute"]
    return merged


@router.put("/me", response_model=ResponseData)
async def update_me(data: UserUpdate, db: DbSession, user: CurrentUser):
    """更新当前用户信息"""
    from sqlalchemy.orm.attributes import flag_modified

    from app.services.notify_pref_lock import locked_pref_update

    update_data = data.model_dump(exclude_unset=True)
    notify_pref = update_data.pop("notify_pref", None)
    if notify_pref is None:
        for key, value in update_data.items():
            setattr(user, key, value)
        await db.flush()
        return ResponseData(data=UserDetail.model_validate(user).model_dump())

    # notify_pref 与 ui-prefs 共用一列：加锁重读后再合并并立即提交
    async with locked_pref_update(db, user):
        for key, value in update_data.items():
            setattr(user, key, value)
        user.notify_pref = _merge_notify_pref(user.notify_pref, notify_pref)
        flag_modified(user, "notify_pref")
        await db.commit()
    return ResponseData(data=UserDetail.model_validate(user).model_dump())


AVATAR_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
    "data",
    "avatars",
)


@router.post("/me/avatar", response_model=ResponseData)
async def upload_avatar(db: DbSession, user: CurrentUser, file: UploadFile = File(...)):
    """上传当前用户头像"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="请选择图片")
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in {".png", ".jpg", ".jpeg", ".gif", ".webp"}:
        raise HTTPException(status_code=400, detail="仅支持 png/jpg/gif/webp 图片")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="头像不能超过 5MB")
    os.makedirs(AVATAR_DIR, exist_ok=True)
    stored = f"{uuid.uuid4().hex}{ext}"
    with open(os.path.join(AVATAR_DIR, stored), "wb") as handle:
        handle.write(content)
    pref = dict(user.notify_pref or {})
    pref["avatar_file"] = stored
    user.notify_pref = pref
    user.avatar_url = f"/api/v1/users/{user.id}/avatar"
    from sqlalchemy.orm.attributes import flag_modified

    flag_modified(user, "notify_pref")
    await db.flush()
    return ResponseData(data={"avatar_url": user.avatar_url})


@router.get("/{user_id}/avatar")
async def get_avatar(user_id: int, db: DbSession):
    """获取指定用户头像"""
    user = await db.get(User, user_id)
    filename = user.notify_pref.get("avatar_file") if user and isinstance(user.notify_pref, dict) else None
    if not filename:
        raise HTTPException(status_code=404, detail="头像不存在")
    path = os.path.join(AVATAR_DIR, os.path.basename(filename))
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="头像不存在")
    return FileResponse(path, media_type=mimetypes.guess_type(path)[0] or "image/jpeg")


@router.get("/me/privacy", response_model=ResponseData)
async def get_privacy_summary(db: DbSession, user: CurrentUser):
    """查看当前用户的隐私数据概览"""
    from sqlalchemy import func
    from app.models.task import Task

    task_count = int((await db.execute(select(func.count()).select_from(Task).where(Task.user_id == user.id))).scalar() or 0)
    return ResponseData(data={
        "stored_data": {"tasks": task_count, "profile": True, "notification_preferences": True},
        "retention": "Tasks remain until you delete them or close the account.",
        "export_endpoint": "/api/v1/users/me/export",
        "delete_endpoint": "/api/v1/users/me/delete",
    })


@router.get("/me/export", response_model=ResponseData)
async def export_my_data(db: DbSession, user: CurrentUser):
    """导出当前用户的全部个人数据"""
    from app.models.task import Task

    rows = (await db.execute(select(Task).where(Task.user_id == user.id, Task.is_deleted.is_(False)).order_by(Task.id))).scalars().all()
    return ResponseData(data={
        "user": {"id": user.id, "username": user.username, "email": user.email, "nickname": user.nickname},
        "tasks": [{
            "id": task.id,
            "title": task.title,
            "description": task.description,
            "priority": task.priority,
            "status": task.status,
            "due_date": task.due_date.isoformat() if task.due_date else None,
            "created_at": task.created_at.isoformat() if task.created_at else None,
        } for task in rows],
    })


@router.get("/me/billing", response_model=ResponseData)
async def get_billing_summary(db: DbSession, user: CurrentUser):
    """查看当前用户的计费概览"""
    from app.models.company import Company, CompanyMembership, ServiceActivation

    membership = (await db.execute(select(CompanyMembership).where(
        CompanyMembership.user_id == user.id,
        CompanyMembership.status == "active",
    ).order_by(CompanyMembership.id).limit(1))).scalar_one_or_none()
    company = await db.get(Company, membership.company_id) if membership else None
    activation = None
    if company:
        activation = (await db.execute(select(ServiceActivation).where(
            ServiceActivation.company_id == company.id,
        ).order_by(ServiceActivation.id.desc()).limit(1))).scalar_one_or_none()
    return ResponseData(data={
        "company_id": company.id if company else None,
        "company_name": company.name if company else None,
        "plan_code": activation.plan_code if activation else None,
        "status": activation.status if activation else "personal",
        "managed_by": "company_admin" if company else "self",
    })


@router.post("/me/delete", response_model=ResponseData)
async def delete_my_account(data: AccountDeleteRequest, db: DbSession, user: CurrentUser):
    """注销当前账号"""
    if data.confirmation.strip().upper() != "DELETE":
        raise HTTPException(status_code=422, detail="请输入 DELETE 以确认")
    if user.password_hash and not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=400, detail="密码错误")

    from datetime import datetime, timezone

    from app.models.notify import PushSubscription
    from app.models.sso import OrgDirectoryPerson, SsoBinding

    user.is_active = False
    user.nickname = "已删除用户"
    user.email = None
    user.phone = None
    # 清微信标识：否则该 openid 仍绑在这条禁用账号上，本人重新注册后无法再绑，
    # 且 /wx/login 会继续命中这条已删除记录。
    user.wx_openid = None
    user.wx_unionid = None
    # 撤销外部身份绑定及通讯录到个人账户的链接，避免已注销用户的 IdP 身份永久占用。
    for binding in (await db.scalars(select(SsoBinding).where(SsoBinding.user_id == user.id))).all():
        await db.delete(binding)
    await db.execute(
        update(OrgDirectoryPerson)
        .where(OrgDirectoryPerson.user_id == user.id)
        .values(user_id=None)
    )
    # 撤销全部已签发会话（access + refresh 一起），并作废 ICS 订阅地址
    user.sessions_revoked_at = datetime.now(timezone.utc)
    user.calendar_feed_token = None
    # 推送订阅留着会继续往已删除账号的浏览器推
    for row in (
        await db.execute(
            select(PushSubscription).where(PushSubscription.user_id == user.id)
        )
    ).scalars().all():
        await db.delete(row)
    await db.flush()
    return ResponseData(data={"deleted": True}, message="账号已删除")


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
    """绑定用户邮箱用于接收邮件回复（不限邮箱类型）。

    必须携带 /users/me/verification/send-code 发出的验证码：换绑邮箱会改变
    提醒、每日摘要与邮件指令回执的投递地址，也会影响 is_verified 门禁，
    无码换绑等于允许把系统邮件投到任意未证实地址。
    """
    from datetime import datetime

    from app.services.verification import (
        VerificationError,
        consume_code,
        normalize_target,
    )

    target = normalize_target("email", data.email)
    other = (
        await db.execute(select(User).where(User.email == target))
    ).scalar_one_or_none()
    if other and other.id != user.id:
        raise HTTPException(status_code=409, detail="该邮箱已被其他账号绑定")

    try:
        await consume_code(db, channel="email", target=target, code=data.code, purpose="bind")
    except VerificationError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    user.email = target
    user.email_verified_at = datetime.utcnow()
    await db.flush()
    return ResponseData(message="邮箱绑定成功", data={"email": target})


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
async def send_bind_code(
    data: VerifySendRequest, db: DbSession, user: CurrentUser, request: Request
):
    """登录后补验/换绑：发送邮箱或短信验证码"""
    from app.services.rate_limit import enforce_send_code
    from app.services.verification import VerificationError, normalize_target, send_code

    channel = data.channel.strip().lower()
    try:
        target = normalize_target(channel, data.target)
        await enforce_send_code(db, request, target)
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
            "email": user.email or "",
            "phone": user.phone or "",
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
