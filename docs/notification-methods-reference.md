# 通知方式实现方案参考

本文档整理了主流产品实现 5 种通知方式的技术方案，供后续接入参考。

---

## 1. 网页弹窗（web_popup）

### 技术方案

W3C Push API + Notification API + Service Worker

### 实现流程

1. 前端请求 Notification 权限（`Notification.requestPermission()`）
2. 前端用 VAPID 公钥订阅 Push API，获取 subscription endpoint
3. 将 subscription 发送到后端保存
4. 后端用 pywebpush 库向 subscription endpoint 发送推送
5. Service Worker 接收 push 事件，调用 `self.registration.showNotification()` 显示通知

### 本项目现状

`backend/app/utils/web_push.py` 已实现 pywebpush 发送逻辑，`backend/app/api/v1/notifications.py` 有订阅接口，但该路由未在 main.py 中注册。

### 待办

- 在 main.py 中注册 notifications 路由
- 前端添加 Service Worker（`public/sw.js`）
- 前端添加订阅管理逻辑（请求权限、订阅、取消订阅）
- 生成 VAPID 密钥对

### 关键代码示例

后端发送推送：
```python
from pywebpush import webpush

def send_web_push(subscription_info, message, vapid_private_key):
    webpush(
        subscription_info=subscription_info,
        data=json.dumps(message),
        vapid_private_key=vapid_private_key,
        vapid_claims={"sub": "mailto:admin@example.com"},
    )
```

前端 Service Worker：
```javascript
self.addEventListener('push', (event) => {
  const data = event.data.json()
  self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icon.png',
    badge: '/badge.png',
    tag: data.tag || 'default',
  })
})
```

---

## 2. 邮件提醒（email）

### 技术方案

SMTP 或第三方邮件服务（SendGrid / 阿里云邮件推送 / 腾讯企业邮）

### 实现流程

1. 后端配置 SMTP 服务器（settings.py 中已有配置）
2. 使用 aiosmtplib 或同步 smtplib 发送
3. 使用 HTML 模板美化邮件内容

### 本项目现状

`backend/app/services/reminder_service.py` 的 `_send_email` 方法已实现 SMTP 发送。

### 待办

- 配置 SMTP 环境变量（SMTP_HOST、SMTP_PORT、SMTP_USER、SMTP_PASSWORD）
- 添加邮件 HTML 模板
- 考虑使用 aiosmtplib 替代同步 smtplib 以支持异步发送

### 关键代码示例

```python
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

async def send_email_async(to: str, subject: str, html_body: str):
    msg = MIMEMultipart('alternative')
    msg['From'] = settings.SMTP_USER
    msg['To'] = to
    msg['Subject'] = subject
    msg.attach(MIMEText(html_body, 'html'))

    await aiosmtplib.send(
        msg,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER,
        password=settings.SMTP_PASSWORD,
        use_tls=True,
    )
```

---

## 3. 微信提醒（wechat）

### 技术方案选择

- 公众号模板消息：用户关注公众号 → 获取 openid → 调用模板消息接口
- 小程序订阅消息：用户在小程序内授权 → 获取 openid → 调用 subscribeMessage.send
- 企业微信应用消息：配置企业微信应用 → 调用消息发送接口

### 推荐方案

公众号模板消息（覆盖面最广，无需小程序）

### 实现流程

1. 配置微信公众号 AppID/Secret
2. 用户绑定微信（本项目 auth.py 已有 wx-login 接口）
3. 获取用户 openid
4. 调用 `POST https://api.weixin.qq.com/cgi-bin/message/template/send` 发送模板消息

### 本项目现状

`backend/app/utils/wechat.py` 已有 subscribe message 发送逻辑。

### 待办

- 配置微信 AppID/Secret
- 用户绑定流程（已有 wx-login，需扩展保存 openid）
- 消息模板配置（在公众号后台创建模板）

### 关键代码示例

```python
import httpx

async def send_wechat_template(openid: str, template_id: str, data: dict):
    # 先获取 access_token
    token_url = f"https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={APPID}&secret={SECRET}"
    async with httpx.AsyncClient() as client:
        resp = await client.get(token_url)
        access_token = resp.json()['access_token']

        # 发送模板消息
        send_url = f"https://api.weixin.qq.com/cgi-bin/message/template/send?access_token={access_token}"
        payload = {
            "touser": openid,
            "template_id": template_id,
            "data": data,
        }
        resp = await client.post(send_url, json=payload)
        return resp.json()
```

---

## 4. 短信提醒（sms）

### 技术方案选择

- 阿里云短信：国内主流，0.045元/条，需签名和模板审核
- 腾讯云短信：类似阿里云
- Twilio：国际通用

### 推荐方案

阿里云短信服务（国内送达率最高）

### 实现流程

1. 注册阿里云短信服务，申请签名和模板
2. 安装 `alibabacloud-dysmsapi20170525` SDK
3. 后端调用 `SendSms` 接口
4. 用户需在设置中绑定手机号

### 本项目现状

`reminder_service.py` 的 `_send_sms` 是 mock/stub，需接入真实短信服务。

### 待办

- 注册阿里云短信服务，获取 AccessKeyId/Secret
- 申请短信签名和模板
- 用户绑定手机号功能
- 实现 `_send_sms` 真实发送

### 关键代码示例

```python
from alibabacloud_dysmsapi20170525.client import Client as DysmsapiClient
from alibabacloud_tea_openapi import models as open_api_models

def send_sms(phone: str, template_code: str, template_params: dict):
    config = open_api_models.Config(
        access_key_id=settings.ALIYUN_ACCESS_KEY_ID,
        access_key_secret=settings.ALIYUN_ACCESS_KEY_SECRET,
        endpoint='dysmsapi.aliyuncs.com',
    )
    client = DysmsapiClient(config)
    from alibabacloud_dysmsapi20170525 import models as dysmsapi_models
    req = dysmsapi_models.SendSmsRequest(
        phone_numbers=phone,
        sign_name='烂笔头PM',
        template_code=template_code,
        template_param=json.dumps(template_params),
    )
    resp = client.send_sms(req)
    return resp.body
```

---

## 5. 闹钟提醒（alarm）

### 技术方案

浏览器内实现 — Web Audio API 生成闹钟音 + Notification API 弹窗 + 页面闪烁

### 实现流程

1. 前端 Service Worker 或页面定时器检查到提醒时间
2. 播放闹钟音频（Web Audio API 生成振荡器音或播放音频文件）
3. 同时显示浏览器通知
4. 页面标题闪烁（如 "(🔔) 有新提醒 — 烂笔头PM"）
5. 持续响铃直到用户交互关闭

### 实现方式

纯前端实现，不需要后端参与。在 App.vue 或全局组件中添加定时器检查逻辑。

### 待办

- 在 App.vue 添加全局提醒检查定时器
- 实现 Web Audio API 闹钟音生成
- 实现页面标题闪烁
- 添加提醒弹窗组件

### 关键代码示例

Web Audio API 闹钟音：
```typescript
function playAlarm() {
  const audioContext = new AudioContext()
  const oscillator = audioContext.createOscillator()
  const gain = audioContext.createGain()

  oscillator.connect(gain)
  gain.connect(audioContext.destination)

  oscillator.type = 'sine'
  oscillator.frequency.value = 800
  gain.gain.setValueAtTime(0.3, audioContext.currentTime)

  // 间歇响铃
  oscillator.start()
  let isPlaying = true
  const interval = setInterval(() => {
    if (isPlaying) {
      gain.gain.setValueAtTime(0, audioContext.currentTime)
    } else {
      gain.gain.setValueAtTime(0.3, audioContext.currentTime)
    }
    isPlaying = !isPlaying
  }, 500)

  // 用户交互后停止
  document.addEventListener('click', () => {
    clearInterval(interval)
    oscillator.stop()
  }, { once: true })
}
```

页面标题闪烁：
```typescript
let titleInterval: number
const originalTitle = document.title

function startTitleBlink() {
  let isNotifTitle = false
  titleInterval = setInterval(() => {
    document.title = isNotifTitle ? originalTitle : '🔔 有新提醒 — 烂笔头PM'
    isNotifTitle = !isNotifTitle
  }, 1000)
}

function stopTitleBlink() {
  clearInterval(titleInterval)
  document.title = originalTitle
}
```

---

## 统一调度器

### 关键缺失

后端 `ReminderService.check_and_send_reminders` 逻辑已完整，但 APScheduler 没有注册这个任务。

### 待办

在 `main.py` 的 lifespan 中添加：

```python
scheduler.add_job(
    ReminderService.check_and_send_reminders,
    trigger='interval',
    minutes=1,
    id='check_reminders',
    args=[db_session_factory]
)
```

---

## 通知渠道命名统一

当前存在命名不一致：
- 前端使用：web_popup, email, wechat, sms, alarm
- 后端 service 使用：web_push, email, sms, desktop, wx, app

建议统一为前端命名规范：web_popup, email, wechat, sms, alarm
