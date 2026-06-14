# 04 - API 接口设计文档

> 本文档定义工作待办提醒系统的 RESTful API 接口规范，包括认证授权、请求响应格式和具体接口定义。

---

## 一、接口设计规范

### 1.1 基础信息

| 项目 | 说明 |
|------|------|
| 协议 | HTTPS |
| 数据格式 | JSON |
| 字符编码 | UTF-8 |
| 日期格式 | ISO 8601（`2026-05-28T15:30:00+08:00`）|
| 接口版本 | v1（URL前缀 `/api/v1`）|

### 1.2 请求规范

**请求头**：
```http
Content-Type: application/json
Authorization: Bearer <access_token>
Accept: application/json
```

**分页参数**：
| 参数 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| page | int | 页码 | 1 |
| page_size | int | 每页数量 | 20 |

**排序参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| sort_by | string | 排序字段 |
| sort_order | string | asc/desc |

### 1.3 响应规范

**成功响应**：
```json
{
  "code": 200,
  "message": "success",
  "data": { ... }
}
```

**分页响应**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "items": [ ... ],
    "total": 100,
    "page": 1,
    "page_size": 20,
    "total_pages": 5
  }
}
```

**错误响应**：
```json
{
  "code": 400,
  "message": "请求参数错误",
  "detail": {
    "field": "title",
    "error": "标题不能为空"
  }
}
```

### 1.4 HTTP 状态码

| 状态码 | 含义 | 使用场景 |
|--------|------|---------|
| 200 | OK | 请求成功 |
| 201 | Created | 资源创建成功 |
| 204 | No Content | 删除成功，无返回内容 |
| 400 | Bad Request | 请求参数错误 |
| 401 | Unauthorized | 未认证或Token过期 |
| 403 | Forbidden | 无权限访问 |
| 404 | Not Found | 资源不存在 |
| 409 | Conflict | 资源冲突（如重复创建）|
| 422 | Unprocessable Entity | 业务逻辑错误 |
| 429 | Too Many Requests | 请求过于频繁 |
| 500 | Internal Server Error | 服务器内部错误 |

---

## 二、认证授权

### 2.1 登录接口

#### 账号密码登录

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "username": "john_doe",
  "password": "your_password"
}
```

**响应**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
    "token_type": "bearer",
    "expires_in": 900,
    "user": {
      "id": 1,
      "username": "john_doe",
      "nickname": "John",
      "avatar_url": "https://..."
    }
  }
}
```

#### 微信登录（小程序）

```http
POST /api/v1/auth/wx-login
Content-Type: application/json

{
  "code": "wx_auth_code_from_wx_login"
}
```

**响应**：同账号密码登录

### 2.2 刷新 Token

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**响应**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "expires_in": 900
  }
}
```

### 2.3 注册接口

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "username": "john_doe",
  "password": "your_password",
  "email": "john@example.com",
  "nickname": "John"
}
```

### 2.4 登出接口

```http
POST /api/v1/auth/logout
Authorization: Bearer <access_token>
```

---

## 三、用户接口

### 3.1 获取当前用户信息

```http
GET /api/v1/users/me
Authorization: Bearer <access_token>
```

**响应**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 1,
    "username": "john_doe",
    "email": "john@example.com",
    "nickname": "John",
    "avatar_url": "https://...",
    "notify_pref": {
      "email_enabled": true,
      "web_push_enabled": true,
      "wx_subscribe_enabled": true,
      "daily_digest_time": "08:00",
      "default_remind_before": 15
    },
    "created_at": "2026-05-28T10:00:00+08:00"
  }
}
```

### 3.2 更新用户信息

```http
PUT /api/v1/users/me
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "nickname": "John Doe",
  "avatar_url": "https://new-avatar.jpg",
  "notify_pref": {
    "email_enabled": true,
    "daily_digest_time": "09:00"
  }
}
```

### 3.3 修改密码

```http
PUT /api/v1/users/me/password
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "old_password": "current_password",
  "new_password": "new_password"
}
```

### 3.4 绑定微信

```http
POST /api/v1/users/me/bind-wx
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "code": "wx_auth_code"
}
```

---

## 四、任务接口

### 4.1 获取任务列表

```http
GET /api/v1/tasks?page=1&page_size=20&status=0&priority=2&category_id=1&tag_ids=1,2&due_date_from=2026-05-28&due_date_to=2026-06-28&sort_by=due_date&sort_order=asc
Authorization: Bearer <access_token>
```

**查询参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| status | int | 状态筛选：0=待办, 1=进行中, 2=已完成 |
| priority | int | 优先级筛选：0=低, 1=中, 2=高 |
| category_id | int | 分类筛选 |
| tag_ids | string | 标签筛选，逗号分隔 |
| due_date_from | string | 截止日期开始 |
| due_date_to | string | 截止日期结束 |
| search | string | 标题/描述搜索关键词 |
| is_recurring | bool | 是否重复任务 |
| include_deleted | bool | 是否包含已删除 |

**响应**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "items": [
      {
        "id": 1,
        "title": "完成项目文档",
        "description": "编写API接口文档",
        "priority": 2,
        "priority_label": "高",
        "status": 0,
        "status_label": "待办",
        "due_date": "2026-05-28T18:00:00+08:00",
        "due_date_relative": "今天",
        "is_overdue": false,
        "category": {
          "id": 1,
          "name": "工作",
          "color": "#409EFF"
        },
        "tags": [
          {
            "id": 1,
            "name": "紧急",
            "color": "#F56C6C"
          }
        ],
        "reminders": [
          {
            "id": 1,
            "remind_at": "2026-05-28T17:00:00+08:00",
            "is_sent": false
          }
        ],
        "is_recurring": false,
        "created_at": "2026-05-28T09:00:00+08:00"
      }
    ],
    "total": 50,
    "page": 1,
    "page_size": 20,
    "total_pages": 3
  }
}
```

### 4.2 获取今日待办

```http
GET /api/v1/tasks/today
Authorization: Bearer <access_token>
```

**响应**：任务列表（同 4.1）

### 4.3 获取任务详情

```http
GET /api/v1/tasks/{task_id}
Authorization: Bearer <access_token>
```

### 4.4 创建任务

```http
POST /api/v1/tasks
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "title": "完成项目文档",
  "description": "编写API接口文档",
  "priority": 2,
  "category_id": 1,
  "tag_ids": [1, 2],
  "due_date": "2026-05-28T18:00:00+08:00",
  "reminders": [
    {
      "remind_at": "2026-05-28T17:00:00+08:00",
      "remind_type": 0
    }
  ],
  "is_recurring": false
}
```

**请求体字段**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string | 是 | 任务标题，1-200字 |
| description | string | 否 | 任务描述，最多500字 |
| priority | int | 否 | 优先级，默认1 |
| category_id | int | 否 | 分类ID，默认分类 |
| tag_ids | array | 否 | 标签ID数组 |
| due_date | string | 否 | 截止日期 |
| reminders | array | 否 | 提醒设置 |
| is_recurring | bool | 否 | 是否重复，默认false |
| recurrence_rule | object | 否 | 重复规则（is_recurring=true时必填）|

### 4.5 更新任务

```http
PUT /api/v1/tasks/{task_id}
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "title": "更新后的标题",
  "priority": 1,
  "status": 1
}
```

### 4.6 标记任务完成

```http
PATCH /api/v1/tasks/{task_id}/complete
Authorization: Bearer <access_token>
```

**响应**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 1,
    "status": 2,
    "completed_at": "2026-05-28T14:30:00+08:00"
  }
}
```

### 4.7 取消任务完成

```http
PATCH /api/v1/tasks/{task_id}/uncomplete
Authorization: Bearer <access_token>
```

### 4.8 删除任务

```http
DELETE /api/v1/tasks/{task_id}
Authorization: Bearer <access_token>
```

### 4.9 批量操作

#### 批量完成

```http
PATCH /api/v1/tasks/batch/complete
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "task_ids": [1, 2, 3]
}
```

#### 批量删除

```http
DELETE /api/v1/tasks/batch
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "task_ids": [1, 2, 3]
}
```

### 4.10 获取任务统计

```http
GET /api/v1/tasks/stats?period=today
Authorization: Bearer <access_token>
```

**查询参数**：
- `period`: today/week/month/year

**响应**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "total": 10,
    "completed": 5,
    "pending": 3,
    "in_progress": 2,
    "overdue": 1,
    "completion_rate": 0.5,
    "by_priority": {
      "high": { "total": 3, "completed": 2 },
      "medium": { "total": 5, "completed": 2 },
      "low": { "total": 2, "completed": 1 }
    },
    "by_category": [
      {
        "category_id": 1,
        "category_name": "工作",
        "total": 6,
        "completed": 3
      }
    ]
  }
}
```

---

## 五、分类接口

### 5.1 获取分类列表

```http
GET /api/v1/categories
Authorization: Bearer <access_token>
```

**响应**：
```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": 1,
      "name": "工作",
      "color": "#409EFF",
      "icon": "work",
      "sort_order": 0,
      "task_count": 15,
      "is_default": true
    }
  ]
}
```

### 5.2 创建分类

```http
POST /api/v1/categories
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "新项目",
  "color": "#409EFF",
  "icon": "folder",
  "sort_order": 1
}
```

### 5.3 更新分类

```http
PUT /api/v1/categories/{category_id}
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "更新名称",
  "color": "#67C23A"
}
```

### 5.4 删除分类

```http
DELETE /api/v1/categories/{category_id}?move_to=1
Authorization: Bearer <access_token>
```

**查询参数**：
- `move_to`: 将该分类下的任务移动到的分类ID

### 5.5 排序分类

```http
PUT /api/v1/categories/reorder
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "category_ids": [2, 1, 3, 4]
}
```

---

## 六、标签接口

### 6.1 获取标签列表

```http
GET /api/v1/tags
Authorization: Bearer <access_token>
```

### 6.2 创建标签

```http
POST /api/v1/tags
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "新标签",
  "color": "#409EFF"
}
```

### 6.3 更新标签

```http
PUT /api/v1/tags/{tag_id}
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "更新标签",
  "color": "#67C23A"
}
```

### 6.4 删除标签

```http
DELETE /api/v1/tags/{tag_id}
Authorization: Bearer <access_token>
```

---

## 七、提醒接口

### 7.1 获取提醒列表

```http
GET /api/v1/reminders?is_sent=false&from=2026-05-28&to=2026-05-29
Authorization: Bearer <access_token>
```

### 7.2 创建提醒

```http
POST /api/v1/reminders
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "task_id": 1,
  "remind_at": "2026-05-28T17:00:00+08:00",
  "remind_type": 0
}
```

### 7.3 删除提醒

```http
DELETE /api/v1/reminders/{reminder_id}
Authorization: Bearer <access_token>
```

### 7.4 获取今日提醒概览

```http
GET /api/v1/reminders/today
Authorization: Bearer <access_token>
```

**响应**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "upcoming": [
      {
        "id": 1,
        "task_id": 1,
        "task_title": "完成项目文档",
        "remind_at": "2026-05-28T17:00:00+08:00",
        "remind_type": 0,
        "time_until": "30分钟后"
      }
    ],
    "sent_today": 3,
    "total_today": 5
  }
}
```

---

## 八、微信小程序专用接口

### 8.1 获取小程序配置

```http
GET /api/v1/wx/config
```

**响应**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "app_id": "wx..."
  }
}
```

### 8.2 发送订阅消息

```http
POST /api/v1/wx/subscribe-message
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "template_id": "template_id",
  "page": "pages/index/index",
  "data": {
    "thing1": { "value": "完成项目文档" },
    "time2": { "value": "2026年05月28日 18:00" }
  }
}
```

### 8.3 获取用户订阅状态

```http
GET /api/v1/wx/subscribe-status
Authorization: Bearer <access_token>
```

---

## 九、系统接口

### 9.1 健康检查

```http
GET /api/v1/health
```

**响应**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "status": "healthy",
    "version": "1.0.0",
    "timestamp": "2026-05-28T15:30:00+08:00",
    "uptime": 3600
  }
}
```

### 9.2 获取API文档

FastAPI 自动生成：
- Swagger UI: `/docs`
- ReDoc: `/redoc`
- OpenAPI JSON: `/openapi.json`

---

## 十、错误码定义

| 错误码 | 说明 | HTTP状态码 |
|--------|------|-----------|
| 200 | 成功 | 200 |
| 400 | 请求参数错误 | 400 |
| 401 | 未认证 | 401 |
| 403 | 无权限 | 403 |
| 404 | 资源不存在 | 404 |
| 409 | 资源冲突 | 409 |
| 422 | 业务逻辑错误 | 422 |
| 429 | 请求过于频繁 | 429 |
| 500 | 服务器内部错误 | 500 |
| 1001 | 用户名已存在 | 409 |
| 1002 | 邮箱已注册 | 409 |
| 1003 | 用户名或密码错误 | 401 |
| 1004 | Token已过期 | 401 |
| 1005 | Token无效 | 401 |
| 2001 | 任务不存在 | 404 |
| 2002 | 任务已完成 | 422 |
| 2003 | 无权操作此任务 | 403 |
| 3001 | 分类不存在 | 404 |
| 3002 | 不能删除默认分类 | 422 |
| 4001 | 微信登录失败 | 401 |
| 4002 | 未绑定微信 | 422 |

---

## 十一、限流策略

| 接口类型 | 限流规则 |
|---------|---------|
| 登录/注册 | 5次/分钟/IP |
| 普通API | 100次/分钟/用户 |
| 批量操作 | 10次/分钟/用户 |
| 公开接口 | 60次/分钟/IP |

---

> 下一篇：[05-开发计划与里程碑.md](./05-开发计划与里程碑.md)
