# 「继续跟进」功能审核报告

> **日期：** 2026-06-13
> **审核人角色：** 资深产品经理 + 技术总监
> **审核范围：** Docker服务启动要求对话全文 + 对话中产生的代码改动
> **审核方法：** 逐条对照代码库现状审计
> **补充审核：** 2026-06-13（v2），补充遗漏的功能性问题、用户体验问题、技术风险
> **深度审核：** 2026-06-13（v3），逐条代码验证、修正事实错误、补充 C6/M8/M9 等 7 项新问题
> **v4 补充：** 2026-06-13，M8 数据迁移方案、C6 批量删除清理、小程序端适配、M9 产品设计、邮件回复功能联动

---

## 一、对话中产生的需求清单

| 编号 | 需求 | 对话中的实现状态 | 本次审核结论 |
|------|------|----------------|-------------|
| R1 | 选择「继续跟进」后可选提醒时间 | TaskCompleteDialog.vue 已有 | **组件未被使用（死代码）** |
| R2 | 选择「继续跟进」后可选提醒方式 | TaskCompleteDialog.vue 已有 | **组件未被使用（死代码）** |
| R3 | 继续跟进后任务保留在列表 | 后端 complete_task 已分支处理 | **逻辑正确，但前端未发送关键字段** |
| R4 | 后端服务全部 Docker 启动 | docker-compose.yml 已配置 | **基本正确，PostgreSQL 空跑** |
| R5 | Docker 端口映射 | 5173:3000 已修正 | **正确** |
| R6 | Vite 代理用 Docker 服务名 | VITE_PROXY_TARGET 已配 | **正确** |
| R7 | 数据库补齐缺失列 | ALTER TABLE 已执行 | **DB 正确，但迁移文件未同步** |
| R8 | 提醒发送后邮件通知用户 | ReminderService 已实现多渠道发送 | **C5：email 通道依赖 SMTP 配置；web_push 订阅仅存内存** |

---

## 二、严重问题（必须在上线前修复）

### C1：TaskCompleteDialog.vue 是死代码，从未被任何文件引用

`TaskCompleteDialog.vue` 包含了完整的跟进 UI（提醒时间选择器、提醒方式下拉框、表单校验），但**整个前端没有任何文件 import 它**。

实际的完成评价 UI 是 `TaskDetailView.vue` 中内嵌的 `<el-dialog>`（约 418-460 行），而这个内嵌对话框**缺少提醒时间选择器和提醒方式选择器**。

**影响：** 用户选择「继续跟进」时，无法自定义提醒时间和方式，后端只能用默认值（明天 + web_push）。

**修复方案：**
- 方案 A（推荐）：把 `TaskDetailView.vue` 的内嵌完成对话框替换为引入 `TaskCompleteDialog.vue` 组件
- 方案 B：给 `TaskDetailView.vue` 的内嵌对话框补上提醒时间选择器和提醒方式选择器

---

### C2：Alembic 迁移文件缺少 5 个列 + 1 张表

当前数据库 schema 与模型匹配（因为手动执行过 ALTER TABLE），但迁移文件 `001_initial.py` 没有包含这些改动：

| 表 | 缺少的列 | 影响 |
|---|---|---|
| tasks | completion_rate, completion_comment, needs_follow_up, follow_up_reason | 全新部署会崩溃 |
| reminders | notify_channels | 全新部署会崩溃 |
| attachments | **整张表不存在** | 附件功能完全不可用 |

更严重的是：
- `alembic_version` 表不存在，说明 **Alembic 从未被执行过**
- `main.py` 的 `Base.metadata.create_all()` 才是真正的建表机制
- `alembic/env.py` 没有 import `attachment` 模型，即使执行 `alembic revision --autogenerate` 也不会检测到 attachments 表

**影响：** 任何人在新环境用 `alembic upgrade head` 部署，会得到一个不完整的数据库，首次完成任务就会报 `OperationalError`。

**修复方案：**
1. 在 `alembic/env.py` 中补上 `from app.models import attachment`
2. 生成新的迁移文件：`alembic revision --autogenerate -m "add completion fields and attachments"`
3. 或者废弃当前迁移，重新 `alembic revision --autogenerate` 生成完整的 initial migration

---

### C3：TaskDetailView.vue 的 handleComplete 不发送 follow_up_remind_at

`TaskDetailView.vue`（约 1013-1028 行）的 `handleComplete` 函数：

```typescript
await taskStore.completeTask(task.value.id, {
  completion_rate: completeForm.value.rate,
  completion_comment: completeForm.value.comment,
  needs_follow_up: completeForm.value.needsFollowUp,
  follow_up_reason: completeForm.value.followUpReason || undefined
  // 缺少: follow_up_remind_at
  // 缺少: follow_up_notify_channels
})
```

**影响：** 后端 `complete_task` 接口收到 `needs_follow_up=True` 但没有时间，只能用默认值 `datetime.now() + timedelta(days=1)`。用户无法控制跟进提醒时间。

---

### C4（补充）：提醒渠道无法自定义，默认 web_push 可能无效

`TaskCompleteRequest` 的 schema 定义（tasks.py 第 467 行）：
```python
follow_up_notify_channels: Optional[str] = "web_push"
```

`complete_task` 中的 fallback 逻辑（第 510 行）：
```python
notify_channels = request.follow_up_notify_channels or "web_push"
```

> **v2 审核修正：** v2 版本误将默认值写为 `"email"`，实际代码中默认值为 `"web_push"`。

由于 `TaskDetailView.vue` 的内嵌完成对话框没有提醒渠道选择器（见 C1），用户无法自定义渠道，始终使用默认的 `"web_push"`。但 web_push 存在严重可靠性问题：

- **订阅信息仅存内存**（`web_push.py` 第 9 行：`_subscriptions: dict[int, list[dict]] = {}`），服务器重启后所有订阅丢失
- 如果 `VAPID_PRIVATE_KEY` 未在 `.env` 中配置，web push 静默失败（返回 `False`）
- 如果用户没有活跃的浏览器订阅，推送也会静默失败
- **没有 fallback 机制**：web_push 失败后不会尝试其他渠道

**影响：** 用户选择"继续跟进"后，提醒走 web_push，但服务器重启或用户未订阅时，提醒永远不会送达。

**修复方案：**
1. 短期：web_push 失败时 fallback 到 email（需要确认 SMTP 已配置）
2. 中期：将 push 订阅持久化到数据库（而非内存字典）
3. 长期：前端补上渠道选择器（见 C1 修复），让用户选择最可靠的渠道
4. MVP 阶段可在 UI 上明确告知用户"当前仅支持浏览器推送，请保持订阅"

---

### C5（补充）：提醒发送流程已实现但存在多个薄弱环节

**已验证的实现路径：**

1. `main.py` 第 52 行：APScheduler 每 1 分钟执行 `check_reminders()`
2. `reminder_service.py` 第 25-81 行 `check_and_send_reminders()`：
   - 使用 `datetime.now(timezone.utc)` 获取当前时间（注意：与 `tasks.py` 中的 naive datetime 不一致，见 M8）
   - 查询 `is_sent=False AND remind_at <= now` 的所有提醒
   - 按 `notify_channels` 字段（逗号分隔）分渠道发送
   - 发送成功后标记 `is_sent=True` 并记录 `sent_at`
3. `_send_by_channel()` 支持 6 种渠道：email、web_push、sms、desktop、wx、app
4. **email 通道已完整实现**（`_send_email` 第 121-169 行）：先查用户 `notify_pref` 中的 SMTP 配置，fallback 到全局 `.env` 设置。如果都未配置则返回 `False`
5. `build_reminder_email()` 生成 HTML 邮件模板（`email.py` 第 69-98 行）

**关键问题：**

| 环节 | 状态 | 风险 |
|------|------|------|
| email 发送 | 代码完整，依赖 SMTP 配置 | `SMTP_USER` / `SMTP_PASSWORD` 默认 `None`，不配 `.env` 就不工作 |
| web_push 发送 | 代码完整，依赖 VAPID + 订阅 | 订阅存内存（见 C4），重启丢失 |
| sms 发送 | **stub 实现**，始终返回 `False` | 不可用 |
| desktop 发送 | 调用 `send_web_push`，与 web_push 相同 | 同 web_push |
| wx 发送 | 需要 `wx_openid` + `template_id` | 配置复杂，大多数用户不可用 |
| app 发送 | 调用 `jpush.send_push` | 需要极光推送账号 |
| 端到端测试 | **不存在** | 无法自动验证发送是否成功 |

**更关键的问题：** 提醒发送后，系统没有任何后续动作——任务状态不变、前端无通知、无"提醒已发送"的用户反馈（见 M9）。

**修复方案：**
1. 确认 `.env` 中 SMTP 已配置，手动触发一次 `check_reminders()` 验证 email 端到端流程
2. 补充自动化测试 mock 验证发送逻辑
3. 提醒发送后更新任务状态或在 `notifications` API 中记录，让前端能展示提醒历史

---

### C6（v3 补充）：uncomplete_task 不清理跟进状态和提醒

`tasks.py` 第 534-562 行的 `uncomplete_task`：

```python
task.status = 0
task.completed_at = None
db.commit()
```

该端点存在三个问题：
1. **不清理跟进标记**：`needs_follow_up`、`follow_up_reason` 保持不变。任务回到待办状态但带着"需要跟进"的标记，语义混乱
2. **不取消跟进提醒**：`complete_task` 创建的 `remind_type=3` 跟进提醒（`is_sent=False`）不会被取消，到期后仍会发送通知
3. **不重置完成评价**：`completion_rate`、`completion_comment` 保持不变

同样，`batch_complete_tasks`（第 590-608 行）执行批量 `UPDATE {status: 2, completed_at: now}` 时：
- 不检查被批量完成的任务是否有 `needs_follow_up=True`
- 不取消已有的跟进提醒
- 这些提醒在任务完成后仍会触发，用户收到已完成任务的跟进通知

**影响：** 取消完成后收到旧跟进提醒；批量完成后收到已结项任务的跟进提醒。

**修复方案：**
1. `uncomplete_task` 中增加清理逻辑：
```python
task.needs_follow_up = False
task.follow_up_reason = None
task.completion_rate = None
task.completion_comment = None
# 取消未发送的跟进提醒
db.query(Reminder).filter(
    Reminder.task_id == task_id,
    Reminder.remind_type == 3,
    Reminder.is_sent == False
).update({Reminder.is_sent: True})
```
2. `batch_complete_tasks` 中增加提醒清理：对所有被批量完成的任务，取消未发送的跟进提醒
3. **`batch_delete_tasks` 也需要清理**：对所有被删除的任务，取消未发送的跟进提醒，防止删除后仍收到已删除任务的提醒

**【v4 补充】批量删除清理逻辑：**
```python
def batch_delete_tasks(task_ids: list[int], db: Session):
    """批量删除任务时，同时取消未发送的跟进提醒"""
    # 取消未发送的跟进提醒
    db.query(Reminder).filter(
        Reminder.task_id.in_(task_ids),
        Reminder.remind_type == 3,  # follow-up
        Reminder.is_sent == False
    ).update({Reminder.is_sent: True})

    # 执行批量删除
    db.query(Task).filter(Task.id.in_(task_ids)).update({Task.deleted_at: datetime.now(timezone.utc)})
    db.commit()
```

---

## 三、重要问题（应在近期迭代中修复）

### M1：taskStore.completeTask() 始终显示「任务已完成」

`stores/task.ts` 第 81 行：
```typescript
notifyFeedback('🎉 任务已完成', `「${res.data.data.title}」已标记为完成！`)
```

当 `needs_follow_up=True` 时，任务实际是 status=1（进行中），此时提示「已标记为完成」会误导用户。

**修复：** 检查返回的 task.status，如果是 1 则显示「已设置跟进提醒，任务继续保留」。

---

### M2：后端使用 naive datetime，但列声明为 timezone=True

`tasks.py` 的 `complete_task` 中：
- `datetime.now()` 用于 `completed_at`（无时区信息）
- `datetime.now() + timedelta(days=1)` 用于默认跟进提醒时间（无时区信息）

而 `Task.completed_at` 和 `Reminder.remind_at` 都声明为 `DateTime(timezone=True)`。存储 naive datetime 到 timezone-aware 列会导致跨时区比较出错。

**修复：** 改用 `datetime.now(timezone.utc)` 或带北京时区的 `datetime.now(tz=timezone(timedelta(hours=8)))`。

---

### M6（补充）：用户如何查看和管理"继续跟进"任务

审核报告聚焦代码质量，但缺少对用户实际使用流程的分析。经代码验证，问题比预期更严重：

**后端 API 层：**
- `get_tasks` 端点（第 109-193 行）**不支持 `needs_follow_up` 查询参数**，无法通过 API 筛选跟进任务
- 支持的筛选维度仅有：status、priority、category_id、tag_ids、due_date、search、is_recurring

**前端列表层：**
- `TaskListView.vue` 的筛选器只有 状态 / 优先级 / 分类 三个维度，无任何跟进相关筛选
- `TaskItem.vue`（任务卡片组件）完全没有 `needs_follow_up` 的视觉指示——跟进任务与普通任务外观完全相同
- `TaskQueryParams` 类型定义（`types/index.ts`）也没有 `needs_follow_up` 字段

**前端类型定义：**
- `Task` 接口包含 `needs_follow_up` 和 `follow_up_reason`，但**缺少 `follow_up_remind_at` 和 `follow_up_notify_channels`** 字段
- 即使后端返回了提醒时间，前端 TypeScript 也无法安全访问

**仅有的一处展示：**
- `TaskDetailView.vue` 第 93-99 行有黄色"需要跟进"横幅，但只有用户主动点进任务详情页才能看到

**影响：** 用户设置了跟进提醒后，无法在列表中找到自己的待跟进任务，也无法区分哪些任务需要跟进。

**修复方案：**
1. 后端 `get_tasks` 增加 `needs_follow_up` 查询参数
2. `TaskItem.vue` 为 `needs_follow_up=True` 的任务添加视觉标记（如黄色角标或图标）
3. 前端筛选栏增加"待跟进"快捷入口（`status=1 + needs_follow_up=True`）
4. `types/index.ts` 的 Task 接口补充 `follow_up_remind_at` 和 `follow_up_notify_channels` 字段
5. 提醒触发后，任务状态变更的通知逻辑

**【v4 补充】微信小程序端适配（待确认）：**
- 小程序不支持 web_push，继续跟进应 fallback 到 wx（微信订阅消息）
- 需要确认 `notify_pref.wx_subscribe_enabled` 是否已实现
- 小程序的任务列表同样需要"待跟进"视觉标记
- 小程序的 completeTask API 需要支持 `follow_up_remind_at` 和 `follow_up_notify_channels` 字段
- **当前审核未覆盖小程序端，建议单独评估**

---

### M7（补充）：dateparser 解析中文时间的时区问题（邮件回复功能相关）

> **v3 审核说明：** `dateparser` 库不在「继续跟进」功能的代码路径中，而是计划用于**邮件回复功能**（参见 `email-reply-feature-document.md`）中解析中文自然语言时间（如"明天下午三点"）。跟进功能使用前端 `el-date-picker` 选择时间，不涉及 dateparser。但两个功能共享 `Reminder.remind_at`（`DateTime(timezone=True)`）列，因此时区问题会交叉影响。

`dateparser.parse("明天 10:00", languages=["zh"])` 的行为：
- 返回的 datetime 对象**通常不带时区信息**（naive datetime）
- 具体行为取决于 `dateparser` 版本和 `PREFER_DATES_FROM` 等设置
- 如果存入 `Reminder.remind_at`（`DateTime(timezone=True)`），会遇到与 M2/M8 相同的时区问题

**影响：** 邮件回复功能创建提醒时，如果 dateparser 返回 naive datetime，存入后与 `reminder_service.py` 的 `datetime.now(timezone.utc)` 比较会产生偏差（见 M8）。

**修复方案：**
1. 测试 `dateparser.parse()` 返回值是否带 tzinfo
2. 如果不带，手动附加北京时区：`result.replace(tzinfo=timezone(timedelta(hours=8)))`
3. 建议在邮件回复功能中统一封装一个 `parse_chinese_datetime()` 工具函数，确保输出始终带时区

---

### M3：complete_task 端点存在 N+1 查询

`complete_task` 查询 Task 时没有使用 `joinedload`：
```python
task = db.query(Task).filter(Task.id == task_id, Task.user_id == current_user.id).first()
```

后续 `build_task_response(task)` 会访问 `task.category`、`task.tags`、`task.reminders`，每个触发一次额外的 lazy-load 查询。

**修复：** 查询时加上 `.options(joinedload(Task.category), joinedload(Task.tags), joinedload(Task.reminders))`。

---

### M4：complete_task 不校验 follow_up_remind_at 是否在未来

前端（`TaskCompleteDialog.vue`）有校验，但该组件是死代码。实际使用的 `TaskDetailView.vue` 内嵌对话框没有提醒时间选择器，后端也不做校验。如果传入一个过去的时间，会创建一条立即过期的提醒。

**修复：** 后端加一行：
```python
if request.follow_up_remind_at and request.follow_up_remind_at < datetime.now():
    raise HTTPException(status_code=422, detail="跟进提醒时间不能早于当前时间")
```

---

### M5：TaskCompleteDialog.vue 时区硬编码 +08:00

第 179 行：
```typescript
data.follow_up_remind_at = form.follow_up_remind_at + '+08:00'
```

如果未来有其他时区的用户使用，提醒时间会偏差。

**修复：** 使用 `dayjs().format('Z')` 或 `Intl.DateTimeFormat().resolvedOptions().timeZone` 动态获取时区偏移。

---

### M8（v3 补充）：check_and_send_reminders 中 naive/aware datetime 比较产生时区偏移

`reminder_service.py` 第 30 行使用 timezone-aware 的 UTC 时间：
```python
now = datetime.now(timezone.utc)  # 2026-06-14 02:00:00+00:00
```

但 `complete_task`（tasks.py 第 509 行）创建的跟进提醒使用 naive 本地时间：
```python
follow_up_at = request.follow_up_remind_at or (datetime.now() + timedelta(days=1))
# 存储为: 2026-06-14 10:00:00（无时区信息）
```

SQLite 将 datetime 存为字符串。查询 `Reminder.remind_at <= now` 变成字符串比较：
- 存储值：`"2026-06-14 10:00:00"`（naive，代表北京时间）
- 查询值：`"2026-06-14 02:00:00+00:00"`（UTC，等于北京时间 10:00）
- 字符串比较结果：`"10:00:00"` > `"02:00:00"`，提醒**不会触发**

实际上要等 UTC 时间走到 `10:00:00`（即北京时间 18:00）时才会触发，**延迟了 8 小时**。

> **注意：** 此问题不仅限于跟进提醒。`tasks.py` 中至少有 8 处使用 `datetime.now()`（naive），包括 `completed_at`、`deleted_at`、`today_start` 等。

**影响：** 跟进提醒比用户期望的时间晚 8 小时触发（假设服务器在 UTC+8 时区）。

**修复方案：**
1. `complete_task` 中改用 `datetime.now(timezone.utc)` 或 `datetime.now(tz=timezone(timedelta(hours=8)))`
2. 前端发送 `follow_up_remind_at` 时带上时区偏移（如 `2026-06-14T10:00:00+08:00`）
3. 全局搜索 `datetime.now()` 并统一为 timezone-aware 版本
4. **【v4 补充】数据迁移**：现有 naive datetime 数据的迁移脚本（见下方）

**【v4 补充】现有数据迁移方案：**

如果数据库中已有大量 naive datetime 格式的提醒时间，直接改代码后需要一次数据迁移：

```python
# 将 reminders 表中所有 naive datetime 转换为 timezone-aware
# 假设现有数据都是北京时间 (+08:00)
from sqlalchemy import text
from app.db.session import SessionLocal

def migrate_naive_datetimes_to_utc():
    """迁移所有 naive datetime 到 timezone-aware UTC"""
    db = SessionLocal()
    try:
        # 迁移 reminders 表
        result = db.execute(text("""
            UPDATE reminders
            SET remind_at = datetime(remind_at, '+8 hours')
            WHERE remind_at NOT LIKE '%+%'
            AND remind_at NOT LIKE '%Z'
        """))
        db.commit()
        print(f"Migrated {result.rowcount} reminder records")

        # 同样处理 tasks 表中的 completed_at、deleted_at 等
        result2 = db.execute(text("""
            UPDATE tasks
            SET completed_at = datetime(completed_at, '+8 hours')
            WHERE completed_at NOT LIKE '%+%'
            AND completed_at IS NOT NULL
        """))
        db.commit()
        print(f"Migrated {result2.rowcount} task completed_at records")

    finally:
        db.close()
```

**注意：**
- 迁移前应先备份数据库
- 迁移脚本只执行一次，执行后应删除
- 迁移完成后，原 naive datetime 数据会被当作北京时间转换为 UTC

---

### M9（v3 补充）：提醒触发后无后续动作——任务状态不变、前端无通知

当跟进提醒到期触发后，`check_and_send_reminders()` 仅执行以下操作：
- 发送通知（email / web_push 等）
- 标记 `reminder.is_sent = True`

**但没有任何后续动作：**

1. **任务状态不变**：跟进任务仍然是 status=1（进行中），不会自动变更
2. **前端无通知**：`notifications` API 只管理 web_push 订阅和 email 测试，不记录已发送的提醒
3. **跟进提醒 vs 普通提醒无法区分**：`remind_type=3`（follow-up）在提醒列表中与普通 `remind_type=0`（before deadline）外观相同，邮件模板也不包含跟进上下文（仅显示"任务即将到期"）
4. **无"延后跟进"功能**：用户收到提醒后无法一键延后到下一个时间
5. **无跟进次数追踪**：系统不记录任务被跟进过几次、下次跟进时间

**影响：** 用户收到提醒邮件后，需要手动找到任务并再次点"完成+继续跟进"来设置下一次提醒，操作繁琐且缺乏上下文。

**修复方案：**
1. 提醒发送后在 `notifications` API 中创建一条通知记录，前端可轮询展示
2. 跟进提醒的邮件模板增加"跟进原因"和"上次跟进时间"等上下文
3. 考虑增加"延后跟进"按钮（一键创建新的跟进提醒）

**【v4 补充】产品设计建议：**
1. 提醒触发后，任务状态保持不变（status=1），除非用户主动操作
2. 确认邮件增加快捷操作引导（如"回复 `提醒 明天 10:00` 即可设置新提醒"）
3. 考虑增加"下次跟进时间"字段，用户可一键设置延后
4. 提醒邮件模板应显示：任务标题 + 跟进原因 + 最近一次跟进时间 + 快捷回复示例

---

## 四、次要问题（可后续优化）

### m1：docker-compose.yml 中 PostgreSQL 服务空跑

后端用的是 SQLite（`DATABASE_URL=sqlite:///data/worktodo.db`），`db` 服务运行 PostgreSQL 但不被任何服务连接，白白占用约 200MB 内存。

**建议：** 注释掉或移除 `db` 服务，或切换到 PostgreSQL 以获得更好的并发支持。

---

### m2：completed_at 在跟进场景下语义模糊

当 `needs_follow_up=True` 时，`task.status = 1`（进行中），但 `completed_at` 既没有设置也没有清空。这个字段表示「任务完成时间」，但任务并未真正完成。

**建议：** 跟进场景下不设置 `completed_at`，只有真正完成（status=2）时才设置。当前代码已经是这样做的，但建议在注释中说明设计意图。

---

### m4（补充）：测试覆盖缺失

审核报告没有提到自动化测试：
- `test_complete_task` 是否覆盖了 `needs_follow_up=True` 的场景？
- `test_send_reminder` 是否真正验证了邮件发送（mock vs 真实发送）？
- 继续跟进功能的端到端测试存在吗？

**建议：** 补充以下测试用例：
- `test_complete_task_with_follow_up` — 验证 needs_follow_up=True 时的默认值设置
- `test_complete_task_rejects_past_remind_at` — 验证 M4 的时间校验
- `test_reminder_service_send_email` — 验证 email 通道的实际发送

---

### m5（补充）：对话中的 AI 排查过程暴露了架构风险

对话中 AI 花了大量时间排查 Docker 引擎 500 错误、端口映射不对、代理不通、数据库缺列等问题。这些问题的根因是：

| 根因 | 说明 |
|------|------|
| 缺少健康检查 | docker-compose.yml 没有 `healthcheck` 配置，无法自动检测服务是否就绪 |
| 端口配置分散 | Vite 端口在 `vite.config.ts`，映射在 `docker-compose.yml`，两者不一致时很难发现 |
| 无自动迁移 | `create_all()` 只能建表不能改表，ALTER TABLE 全靠手动 |
| 缺少启动验证 | 后端启动时不校验必要表结构是否完整 |

**建议：**
1. 给 docker-compose.yml 的 backend 和 frontend 加 `healthcheck`
2. 统一端口配置（推荐在 `.env` 中定义，两边引用）
3. 切换到正式 Alembic 迁移流程，废弃 `create_all()`

---

### m6（v3 补充）：Web Push 订阅仅存内存，服务器重启后丢失

`web_push.py` 第 9 行：
```python
_subscriptions: dict[int, list[dict]] = {}
```

所有用户的 Web Push 订阅存储在一个模块级字典中，没有持久化。这意味着：
- Docker 容器重启后所有订阅丢失
- 后端 uvicorn reload 后订阅丢失
- 多进程部署时订阅不共享

**建议：** 创建 `push_subscriptions` 表，将订阅持久化到数据库。短期可在 `notifications` API 的 `/subscribe` 端点中同时写入数据库。

---

### m7（v3 补充）：前端 Task 类型定义缺少跟进相关字段

`types/index.ts` 的 `Task` 接口包含 `needs_follow_up` 和 `follow_up_reason`，但缺少：
- `follow_up_remind_at?: string` — 下次跟进提醒时间
- `follow_up_notify_channels?: string` — 跟进提醒渠道

虽然后端 `build_task_response` 不直接返回这两个字段（提醒信息通过 `reminders` 数组返回），但前端缺少从 reminders 中识别跟进提醒（`remind_type=3`）的类型支持。

**建议：** 在 Task 接口中增加 `remind_type` 枚举说明，或添加 `next_follow_up_at?: string` 计算字段。

---

## 五、对话中做得好的地方（v3 更新）

1. **及时报告问题**：Docker 引擎 500 错误时立即向用户报告，没有陷入死循环
2. **端到端验证**：创建任务 → 完成评价 → 验证列表的完整测试流程
3. **Docker 热更新**：利用 volume mount + uvicorn --reload 避免重建镜像
4. **问题定位思路清晰**：从日志 → 根因 → 修复 → 验证的流程正确
5. **代码审核全面**：C1-C3 覆盖了关键的死代码和集成问题
6. **ReminderService 多渠道架构**（v3 补充）：`_send_by_channel` 支持 6 种渠道且结构清晰，email 通道实现完整
7. **APScheduler 定时检查**（v3 补充）：每分钟轮询提醒的机制简单可靠，代码路径清晰

---

## 六、修复优先级排序（v3 更新）

| 优先级 | 编号 | 问题 | 工作量 |
|--------|------|------|--------|
| P0 | C1 | TaskCompleteDialog 是死代码 | 30 min（引入组件或补全内嵌对话框） |
| P0 | C2 | Alembic 迁移不完整 | 20 min（重新生成迁移） |
| P0 | C3 | handleComplete 不发送提醒时间 | 10 min（补字段） |
| P0 | C5 | 提醒发送流程多个环节不可靠 | 30 min（验证 email + 修复 web_push 持久化） |
| P0 | C6 | uncomplete/batch 不清理跟进提醒 | 15 min（增加清理逻辑） |
| P1 | M1 | 完成提示文案不区分跟进 | 10 min |
| P1 | M2 | naive datetime（全局） | 15 min |
| P1 | M3 | N+1 查询 | 5 min |
| P1 | M4 | 不校验提醒时间 | 5 min |
| P1 | M6 | 用户无法管理待跟进任务 | 30 min（后端加 filter + 前端加标记和筛选） |
| P1 | M8 | naive/aware 时区比较偏差 8 小时 | 20 min（统一 timezone-aware） |
| P1 | M9 | 提醒触发后无后续动作 | 30 min（通知记录 + 邮件模板改进） |
| P2 | C4 | 提醒渠道无法自定义 + web_push 不可靠 | 20 min（fallback 机制 + 渠道选择器） |
| P2 | m1 | PostgreSQL 空跑 | 5 min |
| P2 | m5 | 架构风险（healthcheck 等） | 1-2 h |
| P2 | m6 | Web Push 订阅内存存储 | 30 min（持久化到数据库） |
| P2 | m7 | Task 类型定义缺少跟进字段 | 5 min |
| P3 | M7 | dateparser 时区问题（邮件回复功能） | 待验证（发现新风险） |
| P3 | m4 | 测试覆盖缺失 | 1-2 h |
| P3 | 小程序适配 | 微信小程序端待跟进任务支持 | 待定 |

**总计修复 P0+P1 约 3.5-4 小时（v2 估计 2-2.5 小时，v3 新增 C6、M8、M9 后工作量增加）。**

**v4 补充工作量：**
- M8 数据迁移脚本：15 min（需编写和验证）
- C6 批量删除清理：5 min
- 小程序端适配：待定（需单独评估）

---

## 七、下一步行动建议（v4 更新）

1. **立即**：修复 C1+C3（让跟进功能真正可用——引入组件或补全内嵌对话框）
2. **立即**：修复 C2（生成完整 Alembic 迁移，确保可重复部署）
3. **立即**：修复 C6（uncomplete/batch 操作清理跟进提醒，避免幽灵通知）
4. **立即**：修复 C5（配置 `.env` SMTP 参数，手动触发一次 check_reminders 验证 email 端到端流程）
5. **本轮迭代**：修复 M8 + 数据迁移（统一 `datetime.now()` → `datetime.now(timezone.utc)`，消除 8 小时偏差）
6. **本轮迭代**：修复 M1-M4、M6、M9（提升代码质量和用户体验）
7. **下轮迭代**：处理 C4（渠道 fallback）、m6（web_push 持久化）、m7（类型定义）
8. **小程序适配**：单独评估小程序端的继续跟进功能支持（待定）
9. **长期规划**：m5（架构优化）、m4（测试补充）、M7（dateparser 验证——邮件回复功能前置）

---

## 八、与邮件回复功能的联动设计（v4 补充）

「继续跟进」功能和「邮件回复」功能有以下关联：

| 关联点 | 说明 |
|--------|------|
| Reminder 复用 | 两者创建的 Reminder 应共用同一张表，remind_type 区分来源 |
| remind_type 定义 | 0=截止前提醒，1=自定义，2=重复，**3=继续跟进**，**4=邮件回复** |
| 发送逻辑复用 | 共用 `ReminderService._send_by_channel()` |
| 邮件模板 | 继续跟进用 `build_reminder_email()`，邮件回复用 `build_confirmation_email()` |
| 时区问题交叉 | 两个功能共用 `Reminder.remind_at`（DateTime timezone=True），M8 的时区修复对两者都生效 |

**设计建议：**
- 继续跟进和邮件回复的 remind_type 不冲突，但需在文档中明确区分
- 注意 M9：两种提醒触发后都需要"后续动作"
- 建议在 `notifications` 表中统一记录所有提醒触发历史
- 邮件回复功能的时间解析（M7）需要带时区的 datetime 输出，与 M8 的修复方案一致

**提醒类型的完整定义：**

| remind_type | 来源 | 说明 |
|-------------|------|------|
| 0 | 系统（截止前提醒） | 任务截止前自动创建 |
| 1 | 用户自定义 | 用户手动创建的提醒 |
| 2 | 重复任务 | 周期性任务自动创建 |
| 3 | 继续跟进 | 用户选择"继续跟进"后创建 |
| 4 | 邮件回复 | 用户通过邮件回复的 `提醒` 命令创建 |
