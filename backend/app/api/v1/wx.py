"""
微信小程序相关接口
"""
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm.attributes import flag_modified

from app.core.config import settings
from app.core.dependencies import CurrentUser
from app.schemas.common import ResponseData

router = APIRouter(prefix="/wx", tags=["微信小程序"])


class WxSubscribePreference(BaseModel):
    enabled: bool
    template_ids: list[str] = Field(default_factory=list)


@router.get("/config", response_model=ResponseData)
async def get_wx_config():
    """获取微信小程序配置（仅 appid，不含 secret）"""
    if not settings.WX_APP_ID:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="微信配置未设置",
        )

    return ResponseData(data={"app_id": settings.WX_APP_ID})


@router.post("/subscribe-message", response_model=ResponseData)
async def send_subscribe_message(message_data: dict, user: CurrentUser):
    """发送微信订阅消息"""
    from app.services.wx_service import WXService

    if not user.wx_openid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="未绑定微信",
        )

    template_id = message_data.get("template_id")
    page = message_data.get("page")
    data = message_data.get("data")

    if not template_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="缺少 template_id",
        )

    wx_service = WXService()
    success = await wx_service.send_subscribe_message(
        openid=user.wx_openid,
        template_id=template_id,
        page=page,
        data=data,
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="消息发送失败",
        )

    return ResponseData(message="消息发送成功")


@router.get("/subscribe-status", response_model=ResponseData)
async def get_subscribe_status(user: CurrentUser):
    """获取用户微信绑定与订阅状态"""
    notify_pref = user.notify_pref or {}
    return ResponseData(
        data={
            "wx_bound": user.wx_openid is not None,
            "subscription_enabled": bool(notify_pref.get("wx_subscribe_enabled", False)),
        }
    )


@router.put("/subscribe-preference", response_model=ResponseData)
async def update_subscribe_preference(body: WxSubscribePreference, user: CurrentUser):
    """Persist the user's WeChat template-message preference."""
    if body.enabled and not user.wx_openid:
        raise HTTPException(status_code=422, detail="请先绑定微信")
    pref = dict(user.notify_pref or {})
    pref["wx_subscribe_enabled"] = bool(body.enabled)
    pref["wx_template_ids"] = [item.strip()[:128] for item in body.template_ids if item.strip()][:20]
    user.notify_pref = pref
    flag_modified(user, "notify_pref")
    return ResponseData(data={
        "wx_bound": user.wx_openid is not None,
        "subscription_enabled": bool(body.enabled),
        "template_ids": pref["wx_template_ids"],
    })
