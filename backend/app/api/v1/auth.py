"""
认证相关接口
"""
import logging

from fastapi import APIRouter, HTTPException, Request, status

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

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["认证"])


@router.post("/send-code", response_model=ResponseData)
async def send_verification_code(data: dict, db: DbSession, request: Request):
    """注册/登录发送邮箱或短信验证码（匿名可调）。

    body: {channel: email|sms, target, purpose?: register|login}
    - register（默认）：目标必须未注册
    - login：目标必须已注册
    """
    from sqlalchemy import select

    from app.services.verification import (
        VerificationError,
        normalize_target,
        send_code,
        validate_target,
    )

    channel = (data.get("channel") or "").strip().lower()
    purpose = (data.get("purpose") or "register").strip().lower()
    if purpose not in ("register", "login"):
        raise HTTPException(status_code=422, detail="purpose 必须是 register 或 login")
    target = data.get("target") or ""
    try:
        target = normalize_target(channel, target)
        validate_target(channel, target)
    except VerificationError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    from app.services.rate_limit import enforce_send_code

    await enforce_send_code(db, request, target)

    if channel == "email":
        exists = (
            await db.execute(select(User).where(User.email == target))
        ).scalar_one_or_none()
    else:
        exists = (
            await db.execute(select(User).where(User.phone == target))
        ).scalar_one_or_none()

    label = "邮箱" if channel == "email" else "手机号"
    if purpose == "register" and exists:
        raise HTTPException(status_code=409, detail=f"{label}已注册")
    if purpose == "login" and not exists:
        raise HTTPException(status_code=404, detail=f"该{label}未注册")

    try:
        result = await send_code(db, channel=channel, target=target, purpose=purpose)
    except VerificationError as e:
        raise HTTPException(status_code=429, detail=str(e)) from e
    return ResponseData(data=result, message="验证码已发送")


@router.post("/register", response_model=ResponseData, status_code=status.HTTP_201_CREATED)
async def register(data: UserRegister, db: DbSession):
    """用户注册；须邮箱+手机双验证码；single_company 下自动加入 DEFAULT_COMPANY_SLUG。"""
    from sqlalchemy import select

    from app.core.config import settings
    from app.services.register_join import RegisterJoinError, try_join_default_company
    from app.services.verification import (
        VerificationError,
        consume_code,
        normalize_target,
    )

    # 检查用户名是否已存在
    result = await db.execute(select(User).where(User.username == data.username))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="用户名已存在",
        )

    phone = normalize_target("sms", data.phone or "")

    # 注册只验邮箱（降低表单摩擦）；手机在登录后受限态引导绑定
    if settings.REGISTER_VERIFICATION_REQUIRED:
        if not data.email or not data.email_code:
            raise HTTPException(status_code=422, detail="需要邮箱及邮箱验证码")

    # 检查邮箱是否已存在
    if data.email:
        result = await db.execute(select(User).where(User.email == data.email))
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="邮箱已注册",
            )

    # 检查手机号是否已存在
    if phone:
        result = await db.execute(select(User).where(User.phone == phone))
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="手机号已注册",
            )

    # 核销邮箱验证码（失败即拒绝，用户未创建）；手机码为可选（提供则一并核销）
    email_verified_at = None
    phone_verified_at = None
    if settings.REGISTER_VERIFICATION_REQUIRED:
        from datetime import datetime

        try:
            await consume_code(
                db, channel="email", target=str(data.email), code=data.email_code or ""
            )
            email_verified_at = datetime.utcnow()
            if phone and data.phone_code:
                await consume_code(
                    db, channel="sms", target=phone, code=data.phone_code
                )
                phone_verified_at = datetime.utcnow()
        except VerificationError as e:
            raise HTTPException(status_code=422, detail=str(e)) from e

    # 创建用户
    user = User(
        username=data.username,
        password_hash=get_password_hash(data.password),
        email=data.email,
        phone=phone or None,
        email_verified_at=email_verified_at,
        phone_verified_at=phone_verified_at,
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
    await db.flush()

    join_info = {"joined": False, "company_id": None, "company_slug": None, "reason": ""}
    jr = None
    try:
        jr = await try_join_default_company(db, user)
        join_info = {
            "joined": jr.joined,
            "company_id": jr.company_id,
            "company_slug": jr.company_slug,
            "reason": jr.reason,
        }
    except RegisterJoinError as e:
        # 配额已满：回滚用户创建，返回明确业务错误
        await db.rollback()
        raise HTTPException(status_code=e.http_status, detail=e.message) from e

    # 欢迎邮件（失败不阻断注册；生产未配 SMTP 时 channel 返回 False 并打 error）
    if user.email:
        try:
            from app.services.notify.channels import send_welcome_email

            company_name = ""
            if jr and jr.joined and jr.company_id:
                from app.models.company import Company

                co = await db.get(Company, jr.company_id)
                company_name = (co.name if co else "") or (jr.company_slug or "")
            await send_welcome_email(
                user,
                company_name=company_name,
                company_slug=(jr.company_slug if jr else "") or "",
                db=db,
                company_id=(jr.company_id if jr else None),
            )
        except Exception:
            logger.exception(
                "welcome email failed user_id=%s", getattr(user, "id", None)
            )

    # 生成 Token
    access_token = create_access_token(data={"sub": user.id})
    refresh_token = create_refresh_token(data={"sub": user.id})

    token_data = TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=900,
        user=UserBasic.model_validate(user),
    )
    # 扩展字段：公司加入结果（前端可选展示）
    payload = token_data.model_dump()
    payload["company_join"] = join_info
    return ResponseData(data=payload)


async def _find_user_by_identifier(db, identifier: str) -> User | None:
    """按用户名 / 邮箱 / 手机号查找用户"""
    from sqlalchemy import or_, select

    ident = (identifier or "").strip()
    if not ident:
        return None
    result = await db.execute(
        select(User).where(
            or_(
                User.username == ident,
                User.email == ident.lower(),
                User.phone == ident,
            )
        ).limit(1)
    )
    return result.scalar_one_or_none()


def _issue_tokens(user: User) -> ResponseData:
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
async def login(data: UserLogin, db: DbSession, request: Request):
    """密码登录；username 字段兼容用户名 / 邮箱 / 手机号"""
    from app.services.rate_limit import enforce_login

    await enforce_login(db, request, data.username)
    user = await _find_user_by_identifier(db, data.username)

    if not user or not user.password_hash or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="账号或密码错误",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户已被禁用",
        )

    return _issue_tokens(user)


@router.post("/login-code", response_model=ResponseData)
async def login_with_code(data: dict, db: DbSession, request: Request):
    """验证码登录。body: {channel: email|sms, target, code}"""
    from sqlalchemy import select

    from app.services.rate_limit import enforce_login
    from app.services.verification import (
        VerificationError,
        consume_code,
        normalize_target,
    )

    channel = (data.get("channel") or "").strip().lower()
    if channel not in ("email", "sms"):
        raise HTTPException(status_code=422, detail="channel 必须是 email 或 sms")
    target = normalize_target(channel, data.get("target") or "")
    code = (data.get("code") or "").strip()
    if not target or not code:
        raise HTTPException(status_code=422, detail="请填写完整的账号与验证码")

    await enforce_login(db, request, target)

    if channel == "email":
        q = await db.execute(select(User).where(User.email == target))
    else:
        q = await db.execute(select(User).where(User.phone == target))
    user = q.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="该邮箱/手机号未注册")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="用户已被禁用")

    try:
        await consume_code(db, channel=channel, target=target, code=code, purpose="login")
    except VerificationError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    return _issue_tokens(user)


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
        await db.flush()

        # 与密码注册一致：single_company 下尝试加入默认公司
        try:
            from app.services.register_join import RegisterJoinError, try_join_default_company

            await try_join_default_company(db, user)
        except RegisterJoinError as e:
            await db.rollback()
            raise HTTPException(status_code=e.http_status, detail=e.message) from e

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
