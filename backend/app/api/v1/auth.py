"""
认证相关接口
"""
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.security import OAuth2PasswordRequestForm

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
    LogoutRequest,
    TokenResponse,
    UserBasic,
)
from app.schemas.common import ResponseData

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["认证"])


INVITE_ONLY_DETAIL = "当前仅支持受邀注册，请向管理员索取邀请链接"
INVITE_EMAIL_MISMATCH_DETAIL = "请使用收到邀请的邮箱注册"


def _is_invite_only() -> bool:
    from app.core.config import settings

    return (settings.REGISTRATION_MODE or "").strip().lower() == "invite_only"


async def _invitation_email_mismatch(db, token: str, email: str | None) -> bool:
    """邀请令牌本身有效（待处理、未过期），但邀请指定了邮箱且与所填邮箱不一致。"""
    if not (token or "").strip():
        return False
    if await _find_valid_invitation(db, token, email) is not None:
        return False
    # 忽略邮箱再查一次：能查到说明令牌有效，失败原因只可能是邮箱不匹配
    probe = await _find_valid_invitation(db, token, None, check_email=False)
    if probe is None or not probe.invitee_email:
        return False
    return (email or "").strip().lower() != probe.invitee_email.strip().lower()


async def _find_valid_invitation(db, token: str, email: str | None, *, check_email: bool = True):
    """返回有效邀请（pending、未过期、邀请邮箱与 email 一致），否则 None。"""
    from datetime import datetime, timezone

    from sqlalchemy import select

    from app.models.project import ProjectInvitation
    from app.utils.datetime import as_utc

    token = (token or "").strip()
    if not token:
        return None
    inv = (
        await db.execute(select(ProjectInvitation).where(ProjectInvitation.token == token))
    ).scalar_one_or_none()
    if not inv or inv.status != "pending":
        return None
    if inv.expires_at and as_utc(inv.expires_at) < datetime.now(timezone.utc):
        return None
    if inv.invitee_email and check_email:
        if (email or "").strip().lower() != inv.invitee_email.strip().lower():
            return None
    return inv


@router.get("/registration-config", response_model=ResponseData)
async def get_registration_config(db: DbSession, company_id: int | None = Query(None, ge=1)):
    """获取注册配置（匿名，供前端决定是否显示注册入口及表单项）"""
    from app.core.config import settings
    from app.models.company import Company
    from app.services.login_methods import login_enabled
    from app.services.policy_presets import DEFAULT_LOGIN_METHODS
    from sqlalchemy import select

    company = await db.get(Company, company_id) if company_id is not None else None
    if company_id is not None and company is None:
        raise HTTPException(status_code=404, detail='企业不存在')
    if company_id is None and settings.DEPLOY_MODE == 'single_company':
        companies = list((await db.scalars(select(Company))).all())
        company = next((item for item in companies if item.slug == settings.DEFAULT_COMPANY_SLUG), None)
        if company is None and len(companies) == 1:
            company = companies[0]
    # 匿名接口只输出已知开关；不能透出凭据或整个企业配置。
    methods = (*DEFAULT_LOGIN_METHODS, 'oidc', 'saml')
    login_methods = {key: login_enabled(company, key) if company else bool(DEFAULT_LOGIN_METHODS.get(key, False)) for key in methods}

    return ResponseData(
        data={
            "mode": settings.REGISTRATION_MODE,
            "phone_required": settings.PHONE_VERIFICATION_REQUIRED,
              "login_methods": login_methods,
        }
    )


@router.post("/send-code", response_model=ResponseData)
async def send_verification_code(data: dict, db: DbSession, request: Request):
    """注册/登录发送邮箱或短信验证码（匿名可调）。

    body: {channel: email|sms, target, purpose?: register|login|reset_password}
    - register（默认）：目标必须未注册
    - login：目标必须已注册
    - reset_password：忘记密码。为防账号枚举，目标是否注册、是否过于频繁都返回同样的成功提示
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
    if purpose not in ("register", "login", "reset_password"):
        raise HTTPException(status_code=422, detail="purpose 必须是 register、login 或 reset_password")
    target = data.get("target") or ""
    try:
        target = normalize_target(channel, target)
        validate_target(channel, target)
    except VerificationError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    if _is_invite_only() and purpose == "register":
        inv = await _find_valid_invitation(
            db, data.get("invite_token") or "", target if channel == "email" else None
        )
        if inv is None:
            if channel == "email" and await _invitation_email_mismatch(
                db, data.get("invite_token") or "", target
            ):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=INVITE_EMAIL_MISMATCH_DETAIL)
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=INVITE_ONLY_DETAIL)

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
    if purpose == "reset_password":
        # 防账号枚举：不存在 / 频繁 / 发送失败都与成功同样回应，不泄露该账号是否存在
        generic = ResponseData(
            data={"sent": True, "resend_after": 60},
            message="如果该账号存在，验证码已发送，请查收",
        )
        if not exists or not exists.is_active:
            return generic
        try:
            await send_code(db, channel=channel, target=target, purpose=purpose, user_id=exists.id)
        except VerificationError as e:
            logger.info("[ResetPassword] send_code skipped: %s", e)
        return generic
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

    # 邀请校验：invite_only 必须有效邀请；open 模式带了有效邀请则注册后自动加入
    valid_invitation = None
    if data.invite_token or _is_invite_only():
        valid_invitation = await _find_valid_invitation(db, data.invite_token or "", data.email)
        if valid_invitation is None and await _invitation_email_mismatch(db, data.invite_token or "", data.email):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=INVITE_EMAIL_MISMATCH_DETAIL)
        if valid_invitation is None and _is_invite_only():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=INVITE_ONLY_DETAIL)

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

    # 邀请有效时，自动接受邀请加入项目
    project_id = None
    if valid_invitation:
        from app.services.project_service import ProjectService

        psvc = ProjectService()
        member = await psvc.accept_invitation(db, valid_invitation.token, user.id)
        project_id = member.project_id

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
    if project_id is not None:
        payload["project_id"] = project_id
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


SUSPENDED_DETAIL = "您的账号已被所在公司停用或移出，请联系公司管理员恢复后再登录"


async def _assert_not_suspended(db, user: User) -> None:
    """只要用户有公司成员身份、且没有任何一个是「启用且在职」，就给出明确提示。

    没有任何公司身份的个人用户不受影响（个人待办照常使用）。
    """
    from sqlalchemy import select

    from app.models.company import CompanyMembership

    rows = (
        await db.execute(
            select(CompanyMembership.status, CompanyMembership.employment_status).where(
                CompanyMembership.user_id == user.id
            )
        )
    ).all()
    if rows and not any(st == "active" and emp == "active" for st, emp in rows):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=SUSPENDED_DETAIL)


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
    await _assert_not_suspended(db, user)

    from app.services.login_methods import enforce_user_login_method
    await enforce_user_login_method(db, user.id, "password")
    return _issue_tokens(user)


@router.post("/token")
async def oauth2_token(
    db: DbSession,
    request: Request,
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
):
    """表单登录换令牌（OAuth2 标准格式，供 Swagger 右上角 Authorize 使用）

    与 /auth/login 同一套校验与限流；返回体不套统一信封，以符合 OAuth2 规范。
    业务客户端请继续使用 /auth/login。
    """
    from app.services.rate_limit import enforce_login

    await enforce_login(db, request, form.username)
    user = await _find_user_by_identifier(db, form.username)
    if not user or not user.password_hash or not verify_password(form.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="账号或密码错误")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="用户已被禁用")
    from app.services.login_methods import enforce_user_login_method
    await enforce_user_login_method(db, user.id, "password")
    await _assert_not_suspended(db, user)
    return {
        "access_token": create_access_token(data={"sub": user.id}),
        "token_type": "bearer",
        "refresh_token": create_refresh_token(data={"sub": user.id}),
        "expires_in": 900,
    }


@router.post("/reset-password", response_model=ResponseData)
async def reset_password(data: dict, db: DbSession, request: Request):
    """忘记密码：凭验证码设新密码。body: {channel, target, code, new_password}

    验证码错误/过期/账号不存在统一提示，防账号枚举；验证码错误次数有上限（consume_code）；
    成功后撤销该账号全部已登录会话。
    """
    from datetime import datetime, timezone

    from sqlalchemy import select

    from app.services.rate_limit import enforce_login
    from app.services.verification import VerificationError, consume_code, normalize_target

    channel = (data.get("channel") or "").strip().lower()
    if channel not in ("email", "sms"):
        raise HTTPException(status_code=422, detail="channel 必须是 email 或 sms")
    try:
        target = normalize_target(channel, data.get("target") or "")
    except VerificationError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    code = (data.get("code") or "").strip()
    new_password = data.get("new_password") or ""
    if not target or not code:
        raise HTTPException(status_code=422, detail="请填写完整的账号与验证码")
    if len(new_password) < 6:
        raise HTTPException(status_code=422, detail="密码长度不能少于6个字符")

    await enforce_login(db, request, target)

    column = User.email if channel == "email" else User.phone
    user = (await db.execute(select(User).where(column == target))).scalar_one_or_none()
    generic_error = "验证码错误或已过期，请重新获取"
    if user is None or not user.is_active:
        raise HTTPException(status_code=422, detail=generic_error)
    try:
        await consume_code(db, channel=channel, target=target, code=code, purpose="reset_password")
    except VerificationError as e:
        raise HTTPException(status_code=422, detail=generic_error) from e

    user.password_hash = get_password_hash(new_password)
    user.sessions_revoked_at = datetime.now(timezone.utc)
    await db.flush()
    return ResponseData(message="密码已重置，请使用新密码登录")


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
    await _assert_not_suspended(db, user)

    from app.services.login_methods import enforce_user_login_method
    await enforce_user_login_method(db, user.id, "password")

    try:
        await consume_code(db, channel=channel, target=target, code=code, purpose="login")
    except VerificationError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    return _issue_tokens(user)


@router.post("/wx-login", response_model=ResponseData)
async def wx_login(data: WxLogin, db: DbSession, request: Request):
    """微信登录"""
    from sqlalchemy import select
    from app.core.config import settings
    import httpx

    from app.services.rate_limit import enforce_wx_login

    await enforce_wx_login(db, request)

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


# 轮换宽限期（秒）：旧 jti 撤销后的这段时间内允许重放，
# 避免多端并发刷新 / 响应丢失时把用户误踢下线。
REFRESH_GRACE_SECONDS = 60


def _as_utc(dt):
    """SQLite 存回来的 DateTime 是 naive（按 UTC 写入），PG 是 aware；统一成 aware UTC 再比较。"""
    from datetime import timezone

    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _refresh_token_expiry(payload: dict):
    """从 JWT exp 取撤销记录的保留期限；异常兜底为配置的 refresh 有效期。"""
    from datetime import datetime, timedelta, timezone

    from app.core.config import settings

    exp = payload.get("exp")
    if exp:
        return datetime.fromtimestamp(exp, tz=timezone.utc)
    return datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)


async def _purge_expired_revocations(db, now) -> None:
    """顺手清理已过期的撤销记录（token 本身过期后记录就没意义了）。"""
    from sqlalchemy import delete

    from app.models.revoked_token import RevokedRefreshToken

    await db.execute(
        delete(RevokedRefreshToken).where(RevokedRefreshToken.expires_at < now)
    )


@router.post("/refresh", response_model=ResponseData)
async def refresh_token(data: RefreshToken, db: DbSession, request: Request):
    """刷新 Token（轮换）：撤销旧 refresh token，同时签发新 access + refresh。

    - 带 jti 的 token：已被 logout 撤销 → 401；已被轮换撤销且超过 60 秒宽限期 → 401；
      宽限期内重放 → 放行并再发一套新令牌（多端/并发竞态保护）。
    - 无 jti 的存量 token（老客户端）：过渡期直接放行，但新发的 token 一律带 jti。
    """
    from datetime import datetime, timezone

    from sqlalchemy import select
    from sqlalchemy.exc import IntegrityError

    from app.core.config import settings
    from app.models.revoked_token import RevokedRefreshToken
    from app.services.rate_limit import enforce_refresh

    await enforce_refresh(db, request)

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

    now = datetime.now(timezone.utc)
    await _purge_expired_revocations(db, now)

    # 删号 / 强制下线：整批 refresh token 按签发时间失效，不依赖逐个 jti 撤销
    from app.core.security import token_revoked_for_user
    from app.models.user import User as UserModel

    holder = await db.get(UserModel, int(user_id))
    if holder is None or not holder.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token已失效，请重新登录",
        )
    if token_revoked_for_user(payload, holder.sessions_revoked_at):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token已失效，请重新登录",
        )

    jti = payload.get("jti")
    if jti:
        row = (
            await db.execute(
                select(RevokedRefreshToken).where(RevokedRefreshToken.jti == jti)
            )
        ).scalar_one_or_none()
        if row is not None:
            in_grace = (
                row.reason == "rotated"
                and (now - _as_utc(row.revoked_at)).total_seconds() <= REFRESH_GRACE_SECONDS
            )
            if not in_grace:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token已失效，请重新登录",
                )
        else:
            db.add(
                RevokedRefreshToken(
                    jti=jti,
                    user_id=int(user_id),
                    reason="rotated",
                    revoked_at=now,
                    expires_at=_refresh_token_expiry(payload),
                )
            )
            try:
                await db.flush()
            except IntegrityError:
                # 并发请求刚撤销了同一 jti：等同宽限期内重放，放行
                await db.rollback()

    access_token = create_access_token(data={"sub": user_id})
    new_refresh_token = create_refresh_token(data={"sub": user_id})

    return ResponseData(
        data={
            "access_token": access_token,
            "refresh_token": new_refresh_token,
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        }
    )


@router.post("/logout", response_model=ResponseData)
async def logout(db: DbSession, data: LogoutRequest | None = None):
    """登出。可选携带 {refresh_token}：撤销其 jti（立即失效，无宽限期）；
    不携带则保持客户端删除 Token 的旧语义。"""
    from datetime import datetime, timezone

    from sqlalchemy import select

    from app.models.revoked_token import RevokedRefreshToken

    token = (data.refresh_token if data else None) or ""
    if token:
        payload = decode_token(token)
        if (
            payload is not None
            and payload.get("type") == "refresh"
            and payload.get("jti")
            and payload.get("sub") is not None
        ):
            now = datetime.now(timezone.utc)
            jti = payload["jti"]
            row = (
                await db.execute(
                    select(RevokedRefreshToken).where(RevokedRefreshToken.jti == jti)
                )
            ).scalar_one_or_none()
            if row is not None:
                # 已因轮换被撤销：升级为 logout，取消宽限期
                row.reason = "logout"
                row.revoked_at = now
            else:
                db.add(
                    RevokedRefreshToken(
                        jti=jti,
                        user_id=int(payload["sub"]),
                        reason="logout",
                        revoked_at=now,
                        expires_at=_refresh_token_expiry(payload),
                    )
                )
            await db.flush()
    return ResponseData(message="登出成功")
