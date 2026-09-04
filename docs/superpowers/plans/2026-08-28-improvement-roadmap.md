# 改进任务全量路线图（2026-08-28）

> 依据：2026-08-28 五份模块盘点（后端 / Web / APP / 小程序 / 文档基建）+ 三份深挖评审
> （后端与基建、三端前端、产品与推广）。本文档是本轮改进的仓库真源计划。
> 勾选状态随实施进度更新。

## 阶段依赖

- 阶段 1（假功能清理）与阶段 3（安全 P0）可并行起步
- 阶段 2（协作闭环）依赖阶段 1 的映射层修正
- 阶段 5（试用体验）依赖阶段 2；阶段 7（推广物料）依赖阶段 5 的品牌/门禁定调
- 阶段 4（数据正确性）、阶段 6（性能）相对独立，按序推进

## 阶段 1：假功能清理（快赢）

- [ ] 子任务持久化：后端 `tasks.parent_task_id` 已有列，打通创建/更新 API；
      `frontend/src/api/mappers.ts` 不再恒返回 `subtasks: []`，详情抽屉编辑写回
- [ ] 删报表假指标：`ReportsView.tsx` 硬编码 +14%、写死「Q3 季度」，改为真实计算或删除
- [ ] 主题色生效：`settings.accent` 接通 `index.css` CSS 变量；默认主色对齐品牌蓝 `#0058BE`
- [ ] Urgent 优先级：前端去掉该档（后端仅 0/1/2，不做迁移），修正 mappers 静默折叠
- [ ] 文案：Navbar「重置演示」改「重新同步」；`index.html` 标题与 `i18n.appTitle` 去 Flow 改品牌名

## 阶段 2：协作闭环打通（核心路径）

- [ ] Web 创建公司/项目 UI：boot 无公司时引导创建，接后端已有 `POST /companies`、`POST /projects`
- [ ] 邀请接受落地页：最小路由（`?invite=token`），登录/注册后调 `invitations/{token}/accept` 直达项目
- [ ] 被指派人可见性：`backend/app/api/v1/tasks.py` 读路径改 owner OR active assignee；附件 ACL 对齐
- [ ] 空状态 CTA：MessagesView/TeamView 无公司时主按钮改「创建公司/邀请同事」
- [ ] 验收：后端 assignee 可见性 pytest 用例

## 阶段 3：安全 P0

- [ ] token 不进 URL：附件下载改短时一次性票据；通话 WS 改首帧鉴权
- [ ] HMAC 加长且可撤销：ICS 订阅改 per-user 落库 token 可重置；邮件 Reply-To 签名加长
- [ ] 附件白名单剔除 `.html/.svg/.js` + 强制 `Content-Disposition: attachment` + `nosniff`
- [ ] 删号撤销全部 refresh jti、清 `wx_openid`
- [ ] Web Push 单一真源：发送只读 DB，删 JSON 文件双写
- [ ] 限流补面：refresh / wx-login / 上传 / ICS / test-send；`TRUST_PROXY_HEADERS` 默认 False（compose 显式开）；`requests` 依赖补齐

## 阶段 4：数据正确性

- [ ] due_date 三端契约：后端出参带 UTC 时区（Z），入参任意时区归一 UTC；Web/小程序/APP 统一本地渲染、UTC 提交
- [ ] 任务分页：boot 不再单页 200 截断，循环拉取并在 UI 明示截断
- [ ] settings 回写门闩：`prefsHydrated` 标志，boot 完成前禁止 `putUiPrefs`/`updateMe`
- [ ] MessagesView 请求竞态：requestId 守卫
- [ ] 后端可靠性：提醒成功才标 `is_sent`；`notify_jobs` 原子认领

## 阶段 5：试用体验

- [ ] 验证门禁分级：个人任务仅邮箱验证，协作功能才要求手机（VerifyGate + 后端分级）
- [ ] 首登引导 + 一键示例人轴（3 人 + 2 事项 + 终责）
- [ ] 侧栏收口：通知中心并入设置、次级入口（报表/团队/回收站）归入「更多」，主项 ≤8
- [ ] 最小深链：`?view=` / `?taskId=` 进 history，刷新保持、可分享
- [ ] 快速添加增强：`#标签` 与 `p0/p1/p2` 优先级语法

## 阶段 6：性能

- [ ] 后端：`User/Category/Tag` 关系去 `selectin`；人轴树批量取 type+assignees 消 2N+1；
      补索引与唯一约束（Alembic 迁移，含去重）
- [ ] 前端：boot 请求并行；Navbar/Sidebar/任务行 memo + 回调稳定化；长列表 content-visibility；
      vite `manualChunks` 分包
- [ ] presence 改可见性驱动（visible=online、hidden/unload=offline）；消息可见时轻轮询

## 阶段 7：推广物料

- [ ] 品牌统一：烂笔头PM（中）+ WorkTodo（英），清除 Flow 残留
- [ ] README 拆「产品介绍 / 用户指南 / 部署指南」结构 + 一页静态 landing（`landing/index.html`）
- [ ] 小程序正式 AppID + 真域名 + 图标（AppID / 域名 / 图标素材需产品方提供，代码侧留位）
- [ ] License 对外口径定稿（草案写入 README，待产品方确认）

## 已确认的决策默认

- 子任务走持久化而非下线；Urgent 档前端移除，不做后端迁移
- due_date 统一 UTC 带时区，客户端本地渲染
- 个人使用只要求邮箱验证，协作要求双验证
- 品牌定为烂笔头PM / WorkTodo，弃用 Flow

## 执行约束与验收门禁

- 分支模型：本轮为跨端联动改动，按 CLAUDE.md 在 `main` 基准上实施，合入后各端分支快进同步
- 每阶段门禁：`pytest -q`、`npm run lint && npm test`、`flutter analyze && flutter test`（涉及 app/ 时）
- 涉运行行为改动用 `docker compose up -d --build` 重启验证
