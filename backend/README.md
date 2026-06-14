# Worktodo Backend API

工作待办提醒系统的后端API服务，基于 FastAPI 构建。

## 技术栈

- **框架**: FastAPI + Uvicorn
- **数据库**: SQLite (开发) / PostgreSQL (生产)
- **ORM**: SQLAlchemy 2.0
- **数据校验**: Pydantic v2
- **认证**: JWT (python-jose) + bcrypt
- **任务调度**: APScheduler
- **数据库迁移**: Alembic

## 项目结构

```
backend/
├── app/
│   ├── api/v1/        # API路由
│   │   ├── auth.py    # 认证接口
│   │   ├── users.py   # 用户接口
│   │   ├── tasks.py   # 任务接口
│   │   ├── categories.py  # 分类接口
│   │   ├── tags.py    # 标签接口
│   │   ├── reminders.py   # 提醒接口
│   │   └── wx.py      # 微信小程序接口
│   ├── core/          # 核心配置
│   │   ├── config.py  # 应用配置
│   │   ├── security.py   # 安全工具
│   │   └── dependencies.py    # 依赖注入
│   ├── models/        # SQLAlchemy模型
│   ├── schemas/       # Pydantic schemas
│   ├── services/      # 业务逻辑
│   ├── utils/         # 工具函数
│   └── main.py        # 应用入口
├── alembic/           # 数据库迁移
├── tests/             # 测试
└── requirements.txt   # 依赖
```

## 快速开始

### 1. 安装依赖

```bash
cd backend
pip install -r requirements.txt
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，并根据需要修改配置：

```bash
cp .env.example .env
```

### 3. 初始化数据库

```bash
# 创建数据目录
mkdir -p data

# 运行数据库迁移
alembic upgrade head
```

### 4. 启动服务

```bash
# 开发模式 (热重载)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 生产模式
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

### 5. 访问API文档

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## API 接口

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/auth/register | 用户注册 |
| POST | /api/v1/auth/login | 用户登录 |
| POST | /api/v1/auth/refresh | 刷新Token |
| POST | /api/v1/auth/logout | 登出 |
| POST | /api/v1/auth/wx-login | 微信登录 |

### 用户

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/users/me | 获取当前用户 |
| PUT | /api/v1/users/me | 更新用户信息 |
| PUT | /api/v1/users/me/password | 修改密码 |
| POST | /api/v1/users/me/bind-wx | 绑定微信 |

### 任务

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/tasks | 获取任务列表 |
| POST | /api/v1/tasks | 创建任务 |
| GET | /api/v1/tasks/{id} | 获取任务详情 |
| PUT | /api/v1/tasks/{id} | 更新任务 |
| DELETE | /api/v1/tasks/{id} | 删除任务 |
| PATCH | /api/v1/tasks/{id}/complete | 完成任务 |
| PATCH | /api/v1/tasks/{id}/uncomplete | 取消完成 |
| GET | /api/v1/tasks/today | 获取今日待办 |
| GET | /api/v1/tasks/stats | 获取任务统计 |
| PATCH | /api/v1/tasks/batch/complete | 批量完成 |
| DELETE | /api/v1/tasks/batch | 批量删除 |

### 分类

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/categories | 获取分类列表 |
| POST | /api/v1/categories | 创建分类 |
| PUT | /api/v1/categories/{id} | 更新分类 |
| DELETE | /api/v1/categories/{id} | 删除分类 |
| PUT | /api/v1/categories/reorder | 排序分类 |

### 标签

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/tags | 获取标签列表 |
| POST | /api/v1/tags | 创建标签 |
| PUT | /api/v1/tags/{id} | 更新标签 |
| DELETE | /api/v1/tags/{id} | 删除标签 |

### 提醒

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/reminders | 获取提醒列表 |
| POST | /api/v1/reminders | 创建提醒 |
| DELETE | /api/v1/reminders/{id} | 删除提醒 |
| GET | /api/v1/reminders/today | 获取今日提醒 |

### 微信小程序

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/wx/config | 获取配置 |
| POST | /api/v1/wx/subscribe-message | 发送订阅消息 |
| GET | /api/v1/wx/subscribe-status | 获取订阅状态 |

## 运行测试

```bash
pytest tests/ -v
```

## Docker 部署

```bash
# 构建镜像
docker build -t worktodo-backend .

# 运行容器
docker run -d -p 8000:8000 --name worktodo-backend worktodo-backend
```

## 数据库迁移

```bash
# 创建新迁移
alembic revision --autogenerate -m "描述"

# 应用迁移
alembic upgrade head

# 回滚
alembic downgrade -1
```