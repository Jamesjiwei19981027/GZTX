# WorkTodo 剩余能力闭环实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 根据剩余缺口设计，把通知、收件箱、任务责任、消息附件/活动、通话信令和外部邮件适配器实现为可验证的真实能力。

**Architecture:** FastAPI 继续是唯一业务真源；新增表通过 Alembic 迁移，SQLite 开发库保持幂等兼容。React 只消费 `/api/v1`，Flutter 继续 WebView；WebSocket 只做 WebRTC 信令，不承载媒体。

**Tech Stack:** FastAPI、SQLAlchemy async、Alembic、SQLite/PostgreSQL、React 19/TypeScript/Vite、WebSocket、Flutter WebView、Docker Compose。

---

### Task 1: 通知独立入口与 SMTP/LLM 配置闭环

**Files:**
- Create: `frontend/src/components/views/NotificationSettingsView.tsx`
- Create: `frontend/src/components/views/NotificationSettingsPanel.tsx`
- Modify: `frontend/src/types.ts`, `frontend/src/components/Sidebar.tsx`, `frontend/src/App.tsx`
- Modify: `frontend/src/components/views/SettingsView.tsx`, `frontend/src/api/notifications.ts`
- Test: `frontend/scripts/test-notification-settings.ts`

- [ ] 将当前 Settings 通知表单抽成 `NotificationSettingsPanel`，保留相同的 `AppSettings.notifications` 输入/输出，并在 profile/settings 入口复用。
- [ ] 增加 `notifications` ViewMode、桌面导航项和移动端可达入口；`App.tsx` 渲染独立页面，不改变原有 Settings 路径。
- [ ] 在通知页增加 SMTP 主机/端口/账号/发件人、LLM provider/base URL/model/开关表单；读取 `/notifications/smtp-config` 与 `/notifications/llm-config`，保存用 PUT，空密码不覆盖已有密钥。
- [ ] 增加“测试邮件/测试推送/测试 LLM”按钮，显示后端错误与未配置原因，禁止把 API key 渲染到 DOM。
- [ ] 运行 `cd frontend; npm run lint; npm run build; node scripts/test-notification-settings.ts`。

### Task 2: 协作收件箱状态动作与任务上下文

**Files:**
- Modify: `backend/app/models/notify.py`, `backend/app/api/v1/bindings.py`, `backend/app/api/v1/shell.py`
- Create: `backend/alembic/versions/fb0c1d2e3f4a_collab_inbox_state.py`
- Modify: `frontend/src/api/shell.ts`, `frontend/src/components/views/InboxView.tsx`, `frontend/src/App.tsx`
- Test: `backend/tests/collab/test_collab_inbox_state.py`

- [ ] 为 `collab_inbox` 增加 `archived_at/deleted_at`，查询默认排除 deleted，筛选支持 archived；写接口执行当前用户/公司成员 ACL。
- [ ] 新增 `PUT /notifications/collab/{id}/state`，body 支持 `{read, archived}`；新增 `DELETE /notifications/collab/{id}` 只做软删除；重复请求幂等。
- [ ] 收件箱增加“归档/恢复/删除/标未读”按钮和状态筛选，列表与详情保持同步。
- [ ] “转为任务”传递 `source_message_id`、通知正文、发件人和附件 URL，创建任务后可回到原通知上下文。
- [ ] 运行新增测试、现有 collab 测试和前端构建。

### Task 3: 任务责任人持久化与看板展示

**Files:**
- Create: `backend/app/models/task_assignment.py`
- Modify: `backend/app/models/__init__.py`, `backend/app/models/task.py`, `backend/app/api/v1/tasks.py`, `backend/app/schemas/task.py`
- Create: `backend/alembic/versions/fc1d2e3f4a5b_task_assignments.py`
- Modify: `frontend/src/api/backend.ts`, `frontend/src/api/mappers.ts`, `frontend/src/types.ts`, `frontend/src/components/views/KanbanView.tsx`, `frontend/src/components/modals/NewTaskModal.tsx`, `frontend/src/components/modals/TaskDetailDrawer.tsx`, `frontend/src/App.tsx`
- Test: `backend/tests/collab/test_task_assignments.py`

- [ ] 建立 `(task_id,user_id,role_key)` 唯一关系，创建时 owner 自动 primary；项目任务只允许当前公司/项目 active member。
- [ ] 在任务 create/update DTO 中支持 `assignee_user_ids`，返回带姓名/头像/角色的 `assignees`，旧客户端继续使用单个 `assignee` 映射。
- [ ] NewTaskModal/Drawer 提供项目成员多选与移除，个人任务显示创建者且不可越权指派。
- [ ] Kanban/Tasks/Dashboard 用头像叠层显示多人和 `+N`，无负责人显示明确“未指派”。
- [ ] 运行越权、重复、删除与 DTO 回归测试，并完成 Web 构建。

### Task 4: 消息二进制附件、表情与活动气泡

**Files:**
- Create: `backend/app/models/collab_file.py`
- Modify: `backend/app/models/__init__.py`, `backend/app/api/v1/shell.py`
- Create: `backend/alembic/versions/fd2e3f4a5b6c_collab_files.py`
- Modify: `frontend/src/api/shell.ts`, `frontend/src/components/views/MessagesView.tsx`, `frontend/src/types.ts`
- Test: `backend/tests/collab/test_collab_files.py`, `frontend/scripts/test-messages-contract.ts`

- [ ] 新增频道/私信消息文件表，字段包含 owner、scope、message_id、storage_key、original_name、mime、size、sha256；复用 `UPLOAD_DIR` 和扩展名/20 MiB 限制。
- [ ] 新增 multipart 上传、列表、下载接口，下载前校验当前用户仍是公司/会话/频道成员；消息发送支持 `file_ids`，旧 URL 元数据继续兼容。
- [ ] MessagesView 增加隐藏 file input、上传进度/失败提示、文件卡片下载和 emoji quick picker；发送按钮只在消息/附件至少一项时可用。
- [ ] About Tab 加载 `/users/me/activity` 或频道范围 activity，按系统/任务/消息类型渲染气泡，空数据显示空状态。
- [ ] 运行文件越权、类型/大小限制、删除关联与消息回归测试。

### Task 5: WebRTC 信令与外部邮件适配器

**Files:**
- Create: `backend/app/api/v1/calls.py`, `backend/app/services/call_registry.py`
- Modify: `backend/app/main.py`, `backend/app/core/config.py`, `docker-compose.yml`, `docker-compose.prod.yml`
- Create: `backend/tests/collab/test_calls.py`
- Create: `backend/app/api/v1/external_mail.py`, `backend/app/models/external_mail.py`
- Create: `backend/alembic/versions/fe3f4a5b6c7d_external_mail.py`
- Modify: `frontend/src/api/shell.ts`, `frontend/src/components/views/MessagesView.tsx`, `frontend/src/components/views/InboxView.tsx`
- Test: `backend/tests/test_external_mail.py`

- [ ] WebSocket `/api/v1/calls/ws/{conversation_id}` 校验 Bearer token、会话成员和公司状态，转发 join/offer/answer/ice/leave，清理断线成员。
- [ ] MessagesView 增加语音/视频呼叫面板、权限拒绝和 STUN/TURN 缺失提示；不上传/保存媒体。
- [ ] 外部邮件 API 使用 `EmailReceiver` 读取受限数量的 headers/body，凭证缺失返回 503；同步结果只写独立表，不污染协作通知。
- [ ] InboxView 增加“外部邮件（需配置）”明确状态和只读详情；归档/删除动作只对已同步的外邮记录执行软状态更新。
- [ ] 对 WebSocket ACL、断线清理、IMAP 缺配置、解析失败和外部邮件越权补测试；未配置环境的默认 UI 必须是可操作引导。

### Task 6: 清单、验证与发布

**Files:**
- Modify: `docs/UI设计稿-正式前端-后端缺口对照清单_Codex接手.md`, `README.md`, `启动指导文档.md`
- Test/commands: backend pytest, frontend lint/build/scripts, Flutter test/analyze/build, Docker Compose smoke

- [ ] 逐行更新清单，只把有命令或运行证据的条目标为 ✅；外部服务缺配置时保留 🟨 并写明启动方式。
- [ ] 运行 `python -m compileall -q backend/app`、后端全量测试、前端检查、Flutter 检查、Alembic 空库升级。
- [ ] `docker compose build backend frontend`、`docker compose up -d backend frontend nginx`，验证 health/docs/Nginx/Vite、迁移 head 和关键受保护 API。
- [ ] `git diff --check`、审查 staged diff，提交并推送 `app`；最终报告提交哈希、运行命令和剩余外部凭证。
