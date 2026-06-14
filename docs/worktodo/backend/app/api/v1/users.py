from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.dependencies import get_db, get_current_user
from app.core.security import get_password_hash, verify_password
from app.models.user import User
from app.schemas.user import UserResponse, UserUpdate, UserPasswordChange
from app.schemas.common import APIResponse

router = APIRouter(prefix="/users", tags=["用户"])


@router.get("/me", response_model=APIResponse)
def get_current_user_info(current_user: User = Depends(get_current_user)):
    """获取当前用户信息"""
    return APIResponse(
        code=200,
        message="success",
        data=UserResponse.model_validate(current_user).model_dump()
    )


@router.put("/me", response_model=APIResponse)
def update_current_user(
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """更新当前用户信息"""
    if data.nickname is not None:
        current_user.nickname = data.nickname
    if data.avatar_url is not None:
        current_user.avatar_url = data.avatar_url
    if data.notify_pref is not None:
        current_user.notify_pref = data.notify_pref

    db.commit()
    db.refresh(current_user)

    return APIResponse(
        code=200,
        message="success",
        data=UserResponse.model_validate(current_user).model_dump()
    )


@router.put("/me/password", response_model=APIResponse)
def change_password(
    data: UserPasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """修改密码"""
    if not current_user.password_hash:
        raise HTTPException(status_code=400, detail="未设置密码")

    if not verify_password(data.old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="原密码错误")

    current_user.password_hash = get_password_hash(data.new_password)
    db.commit()

    return APIResponse(code=200, message="密码修改成功")


@router.post("/me/bind-wx", response_model=APIResponse)
def bind_wx(
    code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """绑定微信"""
    # TODO: 调用微信接口获取 openid
    raise HTTPException(status_code=501, detail="微信绑定暂不可用")