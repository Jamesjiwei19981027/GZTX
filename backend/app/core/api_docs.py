"""
接口文档（Swagger / ReDoc / OpenAPI）

- 开关：`EXPOSE_API_DOCS`（未设置时跟随 DEBUG）。
- 生产开启时必须设置 `API_DOCS_PASSWORD`，文档页走 HTTP Basic 门禁（启动门禁见
  `Settings.validate_production_secrets`）；接口本身仍按原有 Bearer 令牌鉴权。
- 「服务器」下拉：始终含当前站点；`API_DOCS_SERVERS` 追加线上/测试地址。
- Swagger 右上角 Authorize 走 `/api/v1/auth/token`（表单登录），拿到令牌后
  所有「Try it out」自动带上 `Authorization: Bearer ...`。
"""
import re
import secrets
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from app.core.config import settings

DESCRIPTION = """
WorkTodo 后端全部接口。Web、APP、小程序与联调脚本共用同一套接口。

**在线调试步骤**

1. 右上角 **Authorize** → 填账号（用户名 / 邮箱 / 手机号）和密码 → Authorize。
2. 展开任意接口 → **Try it out** → 填参数 → **Execute**，下方即可看到真实返回。
3. 「Servers」下拉可切换调用的环境；跨域调用其他环境时，需要该环境的
   `CORS_ORIGINS` 放行当前文档站点。

**统一返回结构**

- 成功：`{"code": 200, "message": "success", "data": ...}`
- 业务失败：HTTP 状态码 4xx/5xx，正文 `{"code": 40300, "message": "原因", "data": null}`
- 参数校验失败：HTTP 422，正文为 FastAPI 默认的 `{"detail": [...]}`
- 未登录或令牌过期：HTTP 401，`{"detail": "..."}`；用 `/api/v1/auth/refresh` 换新令牌。

**时间约定**：所有时间字段均为 UTC（ISO 8601），由客户端按本地时区展示。
"""

# 展示顺序即 Swagger 分组顺序；名称必须与各 router 的 tags 一致
TAGS_METADATA: list[dict[str, str]] = [
    {"name": "系统", "description": "健康检查等系统接口"},
    {"name": "系统推送", "description": "推送启用状态与当前账号的安卓/苹果设备登记、注销"},
    {"name": "认证", "description": "注册、登录、验证码、刷新令牌；`/auth/token` 供 Swagger 授权使用"},
    {"name": "用户", "description": "当前用户资料、绑定、隐私与账号注销"},
    {"name": "任务", "description": "个人与项目任务、回收站、统计"},
    {"name": "分类", "description": "任务分类"},
    {"name": "标签", "description": "任务标签"},
    {"name": "提醒", "description": "任务提醒"},
    {"name": "通知", "description": "站内通知"},
    {"name": "通知可靠性", "description": "通知投递队列与重试"},
    {"name": "附件", "description": "任务附件上传下载"},
    {"name": "企业", "description": "企业开通、成员、策略、SMTP 与模型配置"},
    {"name": "组织架构", "description": "组织树、组织同步与登录方式"},
    {"name": "单点登录", "description": "第三方单点登录跳转与回调"},
    {"name": "项目", "description": "项目、成员、邀请、人轴工作树与批量导入"},
    {"name": "人轴节点与材料", "description": "人轴节点增删改移、负责人、材料提交与进度"},
    {"name": "委托授权", "description": "把系统内指定项目操作授权给他人，可设有效期与撤销"},
    {"name": "智能体", "description": "个人与项目智能体管理、对话"},
    {"name": "智能体汇报", "description": "智能体逐级汇报、汇总与领导层汇报"},
    {"name": "知识检索", "description": "项目资料全文检索"},
    {"name": "个人知识空间", "description": "个人知识条目、关联与 AI 整理"},
    {"name": "记录进展", "description": "记录进展页：写汇报、智能体建议与进展记录"},
    {"name": "项目知识空间", "description": "项目知识权限、智能体总结与沉淀"},
    {"name": "项目 AI 知识库", "description": "AI 生成的项目知识库草稿与发布"},
    {"name": "频道私聊与界面偏好", "description": "频道、私聊、文件、AI 聊天总结、在线状态与界面偏好"},
    {"name": "语音通话", "description": "语音通话、录音转写与 AI 总结"},
    {"name": "能力绑定与协作通知", "description": "存储 / 语音识别 / 模型绑定、语音转文字、协作通知"},
    {"name": "外部邮件", "description": "外部邮箱同步与邮件处理"},
    {"name": "微信小程序", "description": "小程序登录、订阅消息"},
    {"name": "小程序协作", "description": "小程序端协作对话"},
    {"name": "遥测", "description": "前端埋点事件上报"},
]


def _obj(props: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    schema: dict[str, Any] = {"type": "object", "properties": props}
    if required:
        schema["required"] = required
    return schema


_STR = {"type": "string"}

# 处理函数直接收 dict 的接口：只在文档里补字段说明，不改运行时校验行为
DICT_BODY_SCHEMAS: dict[tuple[str, str], dict[str, Any]] = {
    ("post", "/api/v1/auth/send-code"): _obj(
        {
            "channel": {"type": "string", "enum": ["email", "sms"], "description": "发送渠道"},
            "target": {"type": "string", "description": "邮箱或手机号"},
            "purpose": {"type": "string", "enum": ["register", "login", "reset_password"], "default": "register"},
        },
        ["channel", "target"],
    ),
    ("post", "/api/v1/auth/login-code"): _obj(
        {
            "channel": {"type": "string", "enum": ["email", "sms"]},
            "target": {"type": "string", "description": "邮箱或手机号"},
            "code": {"type": "string", "description": "收到的验证码"},
        },
        ["channel", "target", "code"],
    ),
    ("post", "/api/v1/auth/reset-password"): _obj(
        {
            "channel": {"type": "string", "enum": ["email", "sms"]},
            "target": {"type": "string", "description": "注册时使用的邮箱或手机号"},
            "code": {"type": "string", "description": "收到的验证码"},
            "new_password": {"type": "string", "description": "新密码（至少 6 位）"},
        },
        ["channel", "target", "code", "new_password"],
    ),
    ("put", "/api/v1/categories/reorder"): _obj(
        {"category_ids": {"type": "array", "items": {"type": "integer"}, "description": "按新顺序排列的分类 ID"}},
        ["category_ids"],
    ),
    ("post", "/api/v1/users/me/bind-wx"): _obj(
        {"code": {"type": "string", "description": "小程序 wx.login 拿到的 code"}}, ["code"]
    ),
    ("post", "/api/v1/wx/subscribe-message"): _obj(
        {
            "template_id": {"type": "string", "description": "订阅消息模板 ID"},
            "page": {"type": "string", "description": "点击消息后跳转的小程序页面"},
            "data": {"type": "object", "description": "模板字段，如 {\"thing1\": {\"value\": \"...\"}}"},
        },
        ["template_id"],
    ),
    ("put", "/api/v1/companies/{company_id}/smtp"): _obj(
        {
            "smtp_host": _STR,
            "smtp_port": {"type": "integer", "example": 465},
            "smtp_user": _STR,
            "smtp_password": {"type": "string", "description": "留空表示不修改"},
            "smtp_from": _STR,
        }
    ),
    ("put", "/api/v1/companies/{company_id}/llm"): _obj(
        {
            "provider": {"type": "string", "example": "openai_compatible", "description": "fake 为开发桩"},
            "base_url": _STR,
            "model": _STR,
            "api_key": {"type": "string", "description": "留空表示不修改"},
            "temperature": {"type": "number"},
            "max_tokens": {"type": "integer"},
            "enabled": {"type": "boolean"},
            "use_for_judge": {"type": "boolean"},
            "use_for_agent": {"type": "boolean"},
        }
    ),
}

_SUMMARY_CUT = re.compile(r"[；;。\n（(]")


def _summary_from_description(description: str) -> str:
    first = _SUMMARY_CUT.split(description.strip(), maxsplit=1)[0].strip().rstrip("：:，,")
    return first[:40]


def _servers() -> list[dict[str, str]]:
    servers = [{"url": "/", "description": "当前站点（同源调用）"}]
    for item in (settings.API_DOCS_SERVERS or "").split(","):
        item = item.strip()
        if not item:
            continue
        url, _, desc = item.partition("|")
        servers.append({"url": url.strip().rstrip("/"), "description": desc.strip() or url.strip()})
    return servers


def _post_process(schema: dict[str, Any]) -> None:
    for path, item in schema.get("paths", {}).items():
        for method, op in item.items():
            if not isinstance(op, dict):
                continue
            # 自动生成的 summary 是英文函数名；有中文说明时取首句作为标题
            if op.get("description"):
                op["summary"] = _summary_from_description(op["description"])
            body_schema = DICT_BODY_SCHEMAS.get((method, path))
            if body_schema:
                op["requestBody"] = {
                    "required": True,
                    "content": {"application/json": {"schema": body_schema}},
                }


def _docs_guard(credentials: HTTPBasicCredentials | None = Depends(HTTPBasic(auto_error=False))) -> None:
    password = settings.API_DOCS_PASSWORD
    if not password:
        return
    ok = credentials is not None and secrets.compare_digest(
        credentials.username.encode(), settings.API_DOCS_USERNAME.encode()
    ) & secrets.compare_digest(credentials.password.encode(), password.encode())
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="需要接口文档账号",
            headers={"WWW-Authenticate": 'Basic realm="api-docs"'},
        )


def setup_api_docs(app: FastAPI) -> None:
    """注册 /docs /redoc /openapi.json；未开启时什么都不挂。"""
    if not settings.expose_api_docs:
        return

    app.openapi_tags = TAGS_METADATA
    app.servers = _servers()
    app.description = DESCRIPTION
    base_openapi = app.openapi

    def openapi() -> dict[str, Any]:
        if app.openapi_schema:
            return app.openapi_schema
        schema = base_openapi()
        _post_process(schema)
        app.openapi_schema = schema
        return schema

    app.openapi = openapi  # type: ignore[method-assign]
    guard = [Depends(_docs_guard)]
    asset_base = settings.API_DOCS_ASSET_BASE.rstrip("/")

    @app.get("/openapi.json", include_in_schema=False, dependencies=guard)
    async def openapi_json():
        return JSONResponse(app.openapi())

    @app.get("/docs", include_in_schema=False, dependencies=guard)
    async def swagger_ui():
        return get_swagger_ui_html(
            openapi_url="/openapi.json",
            title=f"{app.title} 接口文档",
            swagger_js_url=f"{asset_base}/swagger-ui-bundle.js",
            swagger_css_url=f"{asset_base}/swagger-ui.css",
            swagger_ui_parameters={
                "persistAuthorization": True,
                "displayRequestDuration": True,
                "docExpansion": "none",
                "filter": True,
                "tryItOutEnabled": True,
            },
        )

    @app.get("/redoc", include_in_schema=False, dependencies=guard)
    async def redoc():
        return get_redoc_html(openapi_url="/openapi.json", title=f"{app.title} 接口文档")
