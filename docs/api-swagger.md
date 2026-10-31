# 接口文档（Swagger）使用与上线说明

后端所有接口（当前 244 个、29 个分组）都会自动出现在 Swagger 文档里，新增接口无需手工维护。

## 访问地址

| 环境 | 地址 | 说明 |
|------|------|------|
| 本地开发（Docker） | `http://localhost/docs`，或直连后端 `http://localhost:8010/docs` | `DEBUG=true` 时默认开启，无需文档账号 |
| 线上 / 测试环境 | `https://<你的域名>/docs` | 默认关闭；按下节开启 |

同一位置还有：`/redoc`（只读的排版版文档）和 `/openapi.json`（原始接口描述文件，可导入 Postman / Apifox）。

## 在线调试步骤

1. 打开 `/docs`；线上环境会先弹出浏览器登录框，填文档账号（`API_DOCS_USERNAME` / `API_DOCS_PASSWORD`）。
2. 右上角 **Authorize** → 填业务账号（用户名、邮箱或手机号均可）与密码 → Authorize。
   背后调用 `POST /api/v1/auth/token`，拿到令牌后所有请求自动带 `Authorization: Bearer ...`；刷新页面不丢失。
3. 展开接口 → **Try it out** → 填参数 → **Execute**，下方显示真实请求地址、耗时与返回。
4. 顶部 **Servers** 下拉可切换要调用的环境。跨环境调用时，目标环境的 `CORS_ORIGINS` 必须放行当前文档站点，否则浏览器会拦截。

> 令牌 15 分钟过期，过期后重新 Authorize 即可。

## 线上开启

在服务器的 `.env` 中加入后重启 `docker compose -f docker-compose.prod.yml up -d`：

```env
EXPOSE_API_DOCS=true
API_DOCS_USERNAME=apidocs
API_DOCS_PASSWORD=<≥12 位随机串>
API_DOCS_SERVERS=https://<线上域名>|线上,https://<测试域名>|测试
```

- **不设或设成弱密码，生产后端会拒绝启动**：文档会暴露全部接口结构，必须加门禁。
- 文档账号只用于打开文档页面；调用接口仍需业务账号令牌，原有权限规则不变。
- 国内访问 jsdelivr 不稳定时，把 `API_DOCS_ASSET_BASE` 换成可用的 swagger-ui-dist 镜像地址（该地址下需要有 `swagger-ui-bundle.js` 与 `swagger-ui.css`）。
- Nginx 已转发 `/docs`、`/redoc`、`/openapi.json`（`nginx/default.prod.conf`）；`/api/v1/auth/token` 与登录接口共用同一套限流。

## 完整性保障

`backend/tests/test_api_docs.py` 在 CI 中检查：

- 每个接口都有中文标题，并归入已登记说明的分组；
- 直接收 JSON 对象（未声明模型）的 7 个接口在文档中有字段说明；
- Authorize 表单登录能拿到令牌并调用受保护接口；
- 文档门禁与生产启动门禁生效。

新增接口时：给处理函数写一句中文文档字符串（首句即 Swagger 标题），并在 router 上使用已登记的中文分组名；若新增分组，在 `backend/app/core/api_docs.py` 的 `TAGS_METADATA` 中登记。

## 已知局限

- 大多数接口的返回体是统一信封 `{code, message, data}`，文档里 `data` 显示为任意结构，没有逐字段说明；具体字段以 Try it out 的真实返回为准。
