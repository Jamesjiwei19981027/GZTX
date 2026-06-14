from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, get_current_user
from app.core.config import settings
from app.models.user import User
from app.schemas.common import ResponseModel

router = APIRouter(prefix="/wx", tags=["微信小程序"])


@router.get("/config", response_model=ResponseModel)
async def get_wx_config():
    """Get WeChat mini program config (appid only, no secret)."""
    if not settings.WX_APP_ID:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": 500, "message": "微信配置未设置"}
        )

    return ResponseModel(
        data={
            "app_id": settings.WX_APP_ID
        }
    )


@router.post("/subscribe-message", response_model=ResponseModel)
async def send_subscribe_message(
    message_data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send WeChat subscribe message."""
    from app.services.wx_service import WXService

    if not current_user.wx_openid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": 4002, "message": "未绑定微信"}
        )

    template_id = message_data.get("template_id")
    page = message_data.get("page")
    data = message_data.get("data")

    if not template_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": 400, "message": "缺少template_id"}
        )

    wx_service = WXService()
    success = await wx_service.send_subscribe_message(
        openid=current_user.wx_openid,
        template_id=template_id,
        page=page,
        data=data
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": 500, "message": "消息发送失败"}
        )

    return ResponseModel(message="消息发送成功")


@router.get("/subscribe-status", response_model=ResponseModel)
async def get_subscribe_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's WeChat subscription status."""
    # In a real app, this would check against a stored subscription status
    # For now, we just check if the user has a wx_openid
    return ResponseModel(
        data={
            "wx_bound": current_user.wx_openid is not None,
            "subscription_enabled": current_user.notify_pref.get("wx_subscribe_enabled", False)
                if current_user.notify_pref else False
        }
    )