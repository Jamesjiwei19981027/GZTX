"""
依赖注入模块
"""
from typing import Annotated, AsyncGenerator

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import decode_token, token_revoked_for_user
from app.db.session import get_db
from app.models.user import User

# OAuth2 密码模式；tokenUrl 指向表单登录接口，Swagger 的 Authorize 才能直接换到令牌
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """获取当前认证用户"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无法验证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_token(token)
    if payload is None:
        raise credentials_exception

    # 检查 token 类型
    token_type = payload.get("type")
    if token_type != "access":
        raise credentials_exception

    user_id_str = payload.get("sub")
    if user_id_str is None:
        raise credentials_exception

    try:
        user_id: int = int(user_id_str)
    except (ValueError, TypeError):
        raise credentials_exception

    from sqlalchemy import select
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户已被禁用",
        )

    # 删号 / 强制下线后，已签发但未过期的 access token 必须立刻失效
    if token_revoked_for_user(payload, user.sessions_revoked_at):
        raise credentials_exception

    return user


async def get_email_verified_user(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    """要求完成邮箱验证；个人任务不再要求手机号验证。

    手机验证只用于公司/项目等协作写操作，由 ``get_collaboration_user``
    统一承载，避免把个人待办的基础路径也锁在手机号门槛之后。
    """
    if settings.REGISTER_VERIFICATION_REQUIRED and not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": 40320, "message": "请先完成邮箱验证"},
        )
    return user


async def get_collaboration_user(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    """要求邮箱已验证（若启用手机验证则额外要求手机验证），用于创建或变更协作资源。"""
    if settings.REGISTER_VERIFICATION_REQUIRED:
        if not user.email_verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": 40320, "message": "请先完成邮箱验证"},
            )
        if settings.PHONE_VERIFICATION_REQUIRED and not user.phone_verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": 40320, "message": "协作功能需要完成手机验证"},
            )
    return user


# 兼容旧调用点：逐步迁移到语义明确的 EmailVerifiedUser / CollaborationUser。
async def get_verified_user(
    user: Annotated[User, Depends(get_collaboration_user)],
) -> User:
    return user


# 类型别名，简化依赖注入
CurrentUser = Annotated[User, Depends(get_current_user)]
EmailVerifiedUser = Annotated[User, Depends(get_email_verified_user)]
CollaborationUser = Annotated[User, Depends(get_collaboration_user)]
VerifiedUser = CollaborationUser
DbSession = Annotated[AsyncSession, Depends(get_db)]
