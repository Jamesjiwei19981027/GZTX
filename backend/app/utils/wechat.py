"""WeChat notification utility (Mini Program / Official Account)."""

import json
from typing import Optional

import requests

from app.core.config import settings


def get_access_token() -> Optional[str]:
    """Get WeChat access token."""
    if not settings.WX_APP_ID or not settings.WX_APP_SECRET:
        return None

    url = "https://api.weixin.qq.com/cgi-bin/token"
    params = {
        "grant_type": "client_credential",
        "appid": settings.WX_APP_ID,
        "secret": settings.WX_APP_SECRET
    }

    try:
        resp = requests.get(url, params=params, timeout=10)
        data = resp.json()
        return data.get("access_token")
    except Exception as e:
        print(f"[WECHAT] Failed to get access token: {e}")
        return None


def send_subscribe_message(
    openid: str,
    template_id: str,
    data: dict,
    page: Optional[str] = None
) -> bool:
    """Send WeChat Mini Program subscribe message.

    Args:
        openid: User's WeChat OpenID
        template_id: Message template ID
        data: Template data dict
        page: Jump page path

    Returns:
        True if sent successfully
    """
    access_token = get_access_token()
    if not access_token:
        return False

    url = f"https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token={access_token}"

    payload = {
        "touser": openid,
        "template_id": template_id,
        "data": data
    }
    if page:
        payload["page"] = page

    try:
        resp = requests.post(url, json=payload, timeout=10)
        result = resp.json()
        if result.get("errcode") == 0:
            print(f"[WECHAT] Subscribe message sent to {openid}")
            return True
        else:
            print(f"[WECHAT] Failed: {result}")
            return False
    except Exception as e:
        print(f"[WECHAT] Error: {e}")
        return False


def send_template_message(
    openid: str,
    template_id: str,
    data: dict,
    url: Optional[str] = None
) -> bool:
    """Send WeChat Official Account template message.

    Args:
        openid: User's WeChat OpenID
        template_id: Template ID
        data: Template data
        url: Click URL

    Returns:
        True if sent successfully
    """
    access_token = get_access_token()
    if not access_token:
        return False

    api_url = f"https://api.weixin.qq.com/cgi-bin/message/template/send?access_token={access_token}"

    payload = {
        "touser": openid,
        "template_id": template_id,
        "data": data
    }
    if url:
        payload["url"] = url

    try:
        resp = requests.post(api_url, json=payload, timeout=10)
        result = resp.json()
        if result.get("errcode") == 0:
            print(f"[WECHAT] Template message sent to {openid}")
            return True
        else:
            print(f"[WECHAT] Failed: {result}")
            return False
    except Exception as e:
        print(f"[WECHAT] Error: {e}")
        return False


def build_reminder_template_data(task_title: str, due_time: str) -> dict:
    """Build WeChat template message data for task reminder.

    Returns:
        Template data dict
    """
    return {
        "thing1": {"value": task_title[:20]},  # 任务名称
        "time2": {"value": due_time},  # 截止时间
        "thing3": {"value": "请及时处理"}  # 备注
    }
