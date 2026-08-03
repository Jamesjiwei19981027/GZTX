# WorkTodo 剩余能力闭环设计

> 本设计承接 `docs/UI设计稿-正式前端-后端缺口对照清单_Codex接手.md`，并遵循现有“真实 API 数据、无 mock 回退、权限由后端决定”的约束。

## 目标

把清单中仍标记为“部分实现”的可落地能力补成可验证闭环：通知设置独立入口、协作收件箱状态动作、任务责任人展示、消息二进制附件/表情/活动、SMTP/LLM 配置体验，以及可选的浏览器通话信令。外部 Gmail/IMAP 与 WebRTC 的运行依赖必须显式配置；未配置时只能显示不可用原因，不能生成假数据。

## 方案

1. **通知与收件箱**：抽出可复用的 `NotificationSettingsPanel`，新增 `notifications` 视图；协作收件箱增加 archive/delete/unread 状态，保留软删除审计。通知转换任务时传入来源、通知 ID 和原文上下文，集成卡片显示权限/配置状态。
2. **任务责任链**：新增任务-用户多对多表，个人任务默认归属创建者，项目任务可由项目成员设置 primary/collaborator；任务 DTO 一次返回 assignees，Kanban/Tasks/Drawer 复用同一映射，后端校验公司与项目成员资格。
3. **消息附件与活动**：新增统一 `collab_files` 存储元数据表，文件内容复用现有本地/object storage 路由；频道消息和私信创建支持 multipart 上传后再写消息，下载时重新执行会话/公司/频道成员 ACL。活动气泡使用已有 audit/activity API，并在没有数据时显示空状态。
4. **通话信令**：增加受认证保护的 WebSocket 房间信令，只转发 offer/answer/ICE，不保存媒体；前端提供 voice/video 面板和结束动作。ICE server 列表从配置读取，未配置时仍允许局域网/浏览器默认候选，但在 UI 明示生产需 STUN/TURN。
5. **外部邮件适配器**：复用 `EmailReceiver`，增加只读 headers/body 查询与同步状态接口，所有 IMAP 访问在后台/显式操作触发；无 IMAP 凭证返回 503 配置提示。外部邮件不混入协作通知表，不改变已有任务回复闭环。

## 数据流与错误处理

- 所有写入先通过当前用户、公司成员、项目成员 ACL，再写数据库；跨租户 ID 返回 403/404，不泄露存在性。
- 上传限制沿用 20 MiB、扩展名白名单和 `UPLOAD_DIR`/对象存储绑定；数据库事务失败时删除已写入的临时文件。
- WebSocket 连接断开、房间不存在、凭证缺失均返回结构化错误并清理内存房间；媒体失败不影响聊天消息。
- 前端请求失败保留当前页面和错误横幅，不注入演示记录；通知/邮件/LLM 配置的密钥只显示 `has_*`，空值不覆盖已有密钥。

## 验收

- 后端新增迁移在空 SQLite 与现有开发库上都能升级到 head；新增 API 至少覆盖正常路径、越权、缺配置和重复操作。
- Web lint/typecheck/build 与针对性前端断言通过；浏览器检查通知入口、收件箱动作、消息上传/下载、设置保存和通话降级文案。
- Flutter 继续只加载 WebView 入口，Flutter analyze/test/debug APK 全部通过。
- Docker Compose 重建后，API health/docs、Nginx、Vite、迁移 head 和关键受保护 API 均可验证。

## 明确边界

- 语音/视频媒体本身依赖浏览器和 STUN/TURN，不在后端保存媒体流。
- IMAP/Gmail 需要用户/部署凭证和网络访问；开发环境没有凭证时只展示配置引导。
- 不实现前端直连 Gemini；LLM 始终走后端个人/公司配置与降级策略。
