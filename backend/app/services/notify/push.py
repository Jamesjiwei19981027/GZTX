"""极光 REST v3。所有失败均降级，绝不输出凭据、响应正文或异常文本。"""
import logging
from datetime import datetime, timezone
import httpx
from sqlalchemy import select, update
from app.core.config import settings
from app.models.push_device import PushDevice
from app.services.notify_pref_gate import channel_enabled
from app.services.notify.channels import render_template, email_subject

logger = logging.getLogger(__name__)


def http_client():
    return httpx.AsyncClient(timeout=10.0)


def notification_extras(template_key, payload):
    # 只复用站内通知的类型和对象定位字段，避免把业务数据/凭据暴露到系统通知。
    extras = {'template_key': template_key}
    for key in ('project_id', 'package_id', 'node_id', 'report_id', 'task_id'):
        value = payload.get(key)
        if isinstance(value, (int, str)) and not isinstance(value, bool):
            extras[key] = value
    return extras


async def send_push_channel(db, user, template_key, payload):
    if not settings.jpush_enabled or not user or not user.is_active or not channel_enabled(user.notify_pref, 'push'):
        return True
    try:
        devices = list((await db.execute(select(PushDevice).where(
            PushDevice.user_id == user.id, PushDevice.disabled_at.is_(None)
        ).order_by(PushDevice.id))).scalars().all())
        if not devices:
            return True
        all_ok = True
        # REST v3 audience.registration_id 每次最多 1000 个。
        for start in range(0, len(devices), 1000):
            batch = devices[start:start + 1000]
            extras = notification_extras(template_key, payload)
            alert = render_template(template_key, payload)
            body = {
                'platform': sorted({d.platform for d in batch}),
                'audience': {'registration_id': [d.registration_id for d in batch]},
                'notification': {
                    'android': {'title': email_subject(template_key, payload), 'alert': alert, 'extras': extras},
                    'ios': {'alert': alert, 'extras': extras},
                },
                'options': {
                    'apns_production': settings.JPUSH_APNS_PRODUCTION,
                    # 协作事务/待办属于系统消息，不用于营销。
                    # https://docs.jiguang.cn/jpush/server/push/rest_api_v3_push
                    # https://docs.jiguang.cn/jpush/practice/important_notification_delivery
                    # classification 优先适配厂商分类；未审批的 channel_id 不伪造。
                    'classification': 1,
                    'third_party_channel': {
                        'xiaomi': {'distribution': 'secondary_push'},
                        'huawei': {'distribution': 'secondary_push', 'importance': 'NORMAL'},
                        'honor': {'distribution': 'secondary_push', 'importance': 'NORMAL'},
                        'oppo': {'distribution': 'secondary_push'},
                        'vivo': {'distribution': 'secondary_push', 'classification': 1, 'category': 'TODO'},
                    },
                },
            }
            async with http_client() as client:
                response = await client.post('https://api.jpush.cn/v3/push', json=body,
                    auth=httpx.BasicAuth(settings.JPUSH_APP_KEY.strip(), settings.JPUSH_MASTER_SECRET.strip()))
            if response.is_success:
                continue
            all_ok = False
            try:
                code = int(response.json().get('error', {}).get('code', 0))
            except (ValueError, TypeError, AttributeError):
                code = 0
            logger.warning('[notify.push] send failed status=%s code=%s', response.status_code, code)
            # 文档 1011：不存在满足条件的推送目标。只停用本次请求仍属于此用户的 rid。
            # 1003 等参数错误不能证明任一 rid 失效，不能停用整个账号的设备。
            if code == 1011:
                now = datetime.now(timezone.utc)
                await db.execute(update(PushDevice).where(
                    PushDevice.user_id == user.id,
                    PushDevice.registration_id.in_([d.registration_id for d in batch]),
                ).values(disabled_at=now))
        return all_ok
    except Exception:
        logger.warning('[notify.push] send failed')
        return False
