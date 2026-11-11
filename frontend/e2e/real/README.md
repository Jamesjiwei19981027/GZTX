# 真后端点测用例

不打桩、直连真后端的 Playwright 用例，用于上线前“全按钮点测”：每个按钮验证点了有反应、数据落到正确层级、读取处真的生效。

| 目录 | 范围 |
|---|---|
| A-account-admin | 登录、邀请注册、个人设置、企业管理、团队与通知、提醒生效 |
| B-project-axis | 项目、人轴、工作树规则、任务 |
| C-progress-report | 记录进展、材料确认、汇报、消息收件箱、通知与知识 |
| D-mobile-web | 手机网页（375×812） |
| E-person-card | 人员卡片自定义 |

## 前置环境

- 独立的点测环境（Docker Compose，nginx 暴露 8097），注册模式“仅受邀 + 邮箱验证码”，登录限流关闭。
- 邮件捕获 mailpit（8025），公司发信指向它，所有邮件不外发。
- 超管账号写在本机文件里（`AUDIT_ADMIN_USER` / `AUDIT_ADMIN_PASSWORD` / `AUDIT_ADMIN_EMAIL`），用环境变量 `AUDIT_CRED_FILE` 指定路径；该文件不入库。
- C 区先运行一次 `node e2e/real/C-progress-report/setup.mjs` 生成本机状态。

## 运行

```bash
cd frontend
E2E_REAL=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:8097 npx playwright test e2e/real/A-account-admin --reporter=line
```

用例会在公司 1 下创建带区域前缀（A-、B-…）的测试数据；改公司级配置的用例结束时会恢复基线。`d10-crawl` 为长时间爬取，按需单独运行。
