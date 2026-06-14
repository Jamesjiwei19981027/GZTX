# WorkTodo - 工作待办提醒系统

简洁高效的工作待办管理系统，支持多端同步。

## 功能特性

- 任务管理：创建、编辑、删除、完成任务
- 分类管理：自定义任务分类
- 标签管理：为任务添加标签
- 提醒功能：支持多种提醒方式
- 日历视图：直观查看任务安排
- 微信小程序：移动端便捷使用
- PWA支持：可安装到桌面

## 技术栈

### 后端
- FastAPI + Python 3.11
- SQLAlchemy 2.0 (异步)
- PostgreSQL/SQLite
- JWT 认证
- APScheduler 任务调度

### 前端
- Vue 3 + TypeScript
- Vite + Pinia
- Element Plus
- PWA

### 小程序
- 微信小程序原生框架

## 快速开始

### 开发环境

```bash
# 克隆项目
git clone <repository-url>
cd worktodo

# 启动开发环境
docker-compose up
```

访问：
- 前端：http://localhost:3000
- 后端API：http://localhost:8000
- API文档：http://localhost:8000/docs

### 生产环境

```bash
# 构建并启动
docker-compose -f docker-compose.prod.yml up -d
```

## 项目结构

```
worktodo/
├── backend/          # FastAPI 后端
├── frontend/          # Vue3 前端
├── miniprogram/       # 微信小程序
├── nginx/             # Nginx 配置
├── docker-compose.yml
└── README.md
```

## 配置说明

### 环境变量

在后端目录创建 `.env` 文件：

```
SECRET_KEY=your-secret-key
DATABASE_URL=sqlite:///./worktodo.db
DEBUG=true
WX_APP_ID=your-appid
WX_APP_SECRET=your-appsecret
```

## License

MIT
