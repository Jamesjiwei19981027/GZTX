# 烂笔头PM 微信小程序

「烂笔头PM」（系统代号 WorkTodo）的微信小程序端，定位为**轻量伴生端**：
专注登录、任务管理、日历视图与设置；项目树、人轴画布等项目协作功能请使用
Web 端或 APP（设置页提供「复制 Web 地址」引导）。

## 项目结构

```
miniprogram/
├── pages/
│   ├── index/           # 任务列表（tabBar）
│   ├── login/           # 微信一键登录
│   ├── task-detail/     # 任务详情
│   ├── task-edit/       # 新建/编辑任务
│   ├── calendar/        # 日历视图（tabBar）
│   └── settings/        # 设置（tabBar，含项目协作引导）
├── components/
│   ├── task-item/       # 任务项组件
│   └── category-picker/ # 分类选择器组件
├── utils/
│   ├── request.js       # HTTP 请求封装（信封解包 / 401 处理）
│   └── date.js          # 日期工具函数
├── assets/
│   └── icons/           # TabBar 图标
├── app.js               # 应用入口（baseUrl / webUrl 配置在此）
├── app.json             # 应用配置
├── app.wxss             # 全局样式
└── project.config.json  # 项目配置
```

## 导入到微信开发者工具

1. 下载并安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 打开微信开发者工具，点击「导入项目」，选择本目录（`miniprogram/`）
3. 填写 AppID（可使用测试号，或申请自己的 AppID）
4. 点击「确认导入」，编译运行即可在模拟器中预览

## 配置后端 API

API 基址配置在 `app.js` 的 `globalData.baseUrl`：

```javascript
globalData: {
  baseUrl: 'https://your-domain.com/api/v1',  // 后端 API 基址
  webUrl: '',  // Web 端地址（设置页「复制 Web 地址」用；留空取 baseUrl 域名部分）
  ...
}
```

**开发环境**：后端走 Docker Compose 时映射在宿主机 **8010** 端口，配置为
`http://localhost:8010/api/v1`（裸进程 `uvicorn` 调试默认是 8000）。
微信开发者工具需在「详情 → 本地设置」勾选**「不校验合法域名」**才能请求 http 地址。

**生产环境**：必须配置为 HTTPS 域名（如 `https://your-domain.com/api/v1`），
并在微信公众平台「开发管理 → 服务器域名」将该域名加入 request 合法域名列表。

## 功能特性

- 微信登录认证（`/auth/wx-login`，token 存 storage 并自动附带）
- 任务 CRUD、完成/删除操作
- 优先级管理（高/中/低）、分类和标签
- 日历月视图（按截止日期聚合）
- 通知偏好（邮件 / 微信订阅消息）与账号双验证（手机 / 邮箱）
- 下拉刷新；401 自动清理凭证并回登录页

## 开发说明

- 框架：微信小程序原生框架
- 后端响应统一为信封结构 `{code, message, data}`，页面从 `res.data` 取业务载荷
- 样式：Flex 布局 + rpx 响应式单位
- 优先级颜色：高 #F56C6C（红）/ 中 #E6A23C（橙）/ 低 #67C23A（绿）

## 相关文档

- [项目逻辑文档](../docs/项目逻辑文档.md)
- [技术架构设计](../docs/02-技术架构设计.md)
- [API 接口设计](../docs/04-API接口设计.md)
