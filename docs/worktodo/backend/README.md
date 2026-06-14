# WorkTodo Backend

FastAPI + SQLAlchemy 工作待办提醒系统后端

## 快速开始

```bash
# 安装依赖
pip install -r requirements.txt

# 启动服务
python -m app.main
# 或
uvicorn app.main:app --reload

# API 文档
# http://localhost:8000/docs
```

## 环境变量

在 `.env` 文件中设置：

```
SECRET_KEY=your-secret-key
DATABASE_URL=sqlite:///./worktodo.db
DEBUG=true
```

## 主要接口

- `POST /api/v1/auth/register` - 注册
- `POST /api/v1/auth/login` - 登录
- `GET /api/v1/tasks` - 任务列表
- `POST /api/v1/tasks` - 创建任务
- `GET /api/v1/categories` - 分类列表
- `GET /api/v1/reminders/today` - 今日提醒