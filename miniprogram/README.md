# 工作待办提醒小程序

微信小程序版本的待办任务管理应用，支持任务管理、日历视图、提醒通知等功能。

## 项目结构

```
miniprogram/
├── pages/
│   ├── index/           # 首页（任务列表）
│   ├── task-detail/     # 任务详情
│   ├── task-edit/       # 新建/编辑任务
│   ├── calendar/         # 日历视图
│   └── settings/        # 设置页面
├── components/
│   ├── task-item/       # 任务项组件
│   └── category-picker/  # 分类选择器组件
├── utils/
│   ├── request.js       # HTTP 请求封装
│   └── date.js          # 日期工具函数
├── assets/
│   └── icons/          # TabBar 图标
├── app.js              # 应用入口
├── app.json            # 应用配置
├── app.wxss            # 全局样式
└── project.config.json  # 项目配置
```

## 导入到微信开发者工具

1. 下载并安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)

2. 打开微信开发者工具，点击「导入项目」

3. 选择项目目录：`E:\gongzuotix\miniprogram`

4. 填写 AppID（可使用测试号 `wx0000000000000000`，或申请自己的 AppID）

5. 点击「确认导入」

6. 编译运行即可在模拟器中预览

## 配置后端 API

当前开发环境 API 地址配置在 `utils/request.js` 中：

```javascript
const API_BASE = 'http://localhost:8000/api/v1';
```

如需修改为实际后端地址，请编辑该文件。

生产环境部署时，请将 API 地址改为实际的服务器地址，并使用 HTTPS 协议。

## 功能特性

- 微信登录认证
- 任务 CRUD 操作
- 优先级管理（高/中/低）
- 分类和标签管理
- 日历视图
- 任务筛选（全部/待办/已完成）
- 下拉刷新
- 响应式布局

## 开发说明

- 框架：微信小程序原生框架
- 样式：Flex 布局 + rpx 响应式单位
- 优先级颜色：
  - 高优先级：#F56C6C（红色）
  - 中优先级：#E6A23C（橙色）
  - 低优先级：#67C23A（绿色）
- 逾期任务显示红色文字提示

## 相关文档

- [技术架构设计](../../docs/02-技术架构设计.md)
- [API 接口设计](../../docs/04-API接口设计.md)
- [开发计划与里程碑](../../docs/05-开发计划与里程碑.md)