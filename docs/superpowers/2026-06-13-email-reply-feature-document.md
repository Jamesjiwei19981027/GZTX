# 邮件回复功能 - 完整方案文档

> **日期：** 2026-06-13
> **状态：** 审核修订版（v4），补充 completion_comment 冲突、Message-ID/threading 实现细节、IMAP 并发锁、Reminder 创建字段说明

---

## 这个功能是干嘛的？

就是一个**自动客服邮箱**。

你不用登录网站，直接回复邮件，系统帮你完成任务操作。

---

## 举个例子

**你收到邮件：**
> 任务提醒：周三提交报告
> 回复此邮件可直接操作任务

**你回复：**
> 完成

**系统自动：**
1. 把"周三提交报告"任务标记为已完成
2. 发一封确认邮件告诉你"已标记完成"

---

## 你可以回复的命令

| 你写 | 系统帮你做 |
|------|----------|
| `完成` | 把任务标已完成 |
| `取消` | 软删除任务（可恢复） |
| `回复 已收到` | 在任务 completion_comment 里记录"已收到" |
| `提醒 明天 10:00 每天 3次` | 明天10:00开始，每天提醒1次，连续3天（共3次） |
| `提醒 明天 10:00 每天 3次 备注：需要跟进` | 同上，并附加备注"需要跟进" |

**说明：** `提醒` 命令的"备注"部分是可选的。
**次数语义**：`次数`表示**总提醒次数**，不是每天的提醒次数。例如 `每天 3次` = 每天提醒1次，连续提醒3天（共3次）。为避免歧义，建议用户使用以下写法：
- `提醒 明天 10:00 每天 3次` → 每天1次，共3次（连续3天）
- `提醒 明天 10:00 每周 4次` → 每周1次，共4次（连续4周）
- 如需"每天提醒3次"（即一天内早中晚各一次），暂不支持，需登录系统设置

**中英文都支持**：`完成` 和 `done` 效果一样，`取消` 和 `cancel` 也一样。

**无法识别时**：整段邮件内容会作为备注记录到任务中。

---

## 完整流程图

```
1. 系统发送提醒邮件给用户
   发件人：Flow 生产力 <系统邮箱>
   主题：任务提醒：xxx
   回复地址：reply-{task_id}-{签名}@系统域名       <-- [风险项 R1]
                            |
                     用户回复邮件
                            v
2. 系统定时去邮箱取新邮件（APScheduler，每 5 分钟）
   通过 IMAP 协议连接邮箱
   搜索 UNSEEN 邮件 → 处理后标记 SEEN             <-- [修复项 F1]
                            |
                            v
3. 身份校验                                         <-- [新增 S1]
   校验邮件签名，确认回复者有权操作该任务
   校验失败 → 发错误邮件，不执行操作
                            |
                            v
4. 解析邮件内容
   去掉邮件签名、引用原文（> 开头的行）              <-- [修复项 F2]
   取第一行有效文本
   判断命令类型（完成/取消/回复/提醒）
                            |
                            v
5. 幂等检查                                         <-- [新增 S2]
   同一任务 + 同一命令 → 30 分钟内不重复执行
                            |
                            v
6. 执行对应操作
   完成 → TaskService.complete_task(task, db)
   取消 → TaskService.soft_delete_task(task, db)   <-- [修复项 F3]
   回复 → 更新 task.completion_comment
   提醒 → 创建新 Reminder 记录
                            |
                            v
7. 保存回复记录 + 更新 Task 统计字段
   EmailReplyRecord 表记录本次交互
   task.email_reply_count += 1
   task.last_reply_at = now
   task.last_reply_command = "done"
                            |
                            v
8. 发送确认邮件
   内容：执行结果 + 任务标题 + 当前状态
   如果有新提醒 → 显示提醒时间和频次
```

---

## [审核新增] 风险项与修复项清单

### 风险项（必须在开发前确认）

| 编号 | 风险 | 说明 | 建议方案 |
|------|------|------|---------|
| **R1** | QQ 邮箱不支持 `+` 别名 | `reply+task123@qq.com` 无法投递，QQ 邮箱不支持 Gmail 风格的 `+` 标签 | **方案 A（推荐）**：使用自有域名，配置 MX 记录指向 QQ 企业邮箱或第三方收件服务；**方案 B**：改用唯一 Token 格式如 `reply-{task_id}-{hash}@域名`，配合域名 Catch-all 收件 |
| **R2** | 安全风险：无身份校验 | 任何人猜到 `reply-{id}@domain` 就能操控别人任务 | 回复地址中加入 HMAC 签名：`reply-{task_id}-{hmac[:16]}@domain`（16 hex = 64-bit），收件时校验签名 |
| **R3** | 邮件域名缺失 | 当前 `.env` 没有配置收发件域名，仅有 QQ 邮箱 SMTP | 需要准备一个域名并配置 MX 记录，或在 MVP 阶段降级为"只支持手动转发" |
| **R4** | 时间估算偏乐观 | 自然语言时间解析（"明天 10:00"→datetime）和 IMAP 边界处理都是复杂工作 | 建议将总估时调整为 3-4 小时；或使用 `dateparser` 库简化时间解析 |

### 修复项（已在修订版方案中解决）

| 编号 | 原问题 | 修复说明 |
|------|--------|---------|
| **F1** | IMAP UNSEEN 标记不可靠 | 处理完邮件后立即标记为 SEEN（`\Seen` flag），避免重复处理 |
| **F2** | 邮件签名/引用干扰解析 | 解析前过滤掉 `>` 开头的引用行、`--` 签名分隔线、`On ... wrote:` 模式 |
| **F3** | "取消"语义不明 | 明确使用 `soft_delete_task`（软删除），与现有系统一致 |
| **F4** | API 调用签名不匹配 | 文档中 `task_service.complete_task(task_id, user_id)` 改为实际的 `TaskService.complete_task(task, db)`，需先查询 Task 对象 |
| **F5** | `add_reply_note` 方法不存在 | 改为直接更新 `task.completion_comment` 字段，或在 `TaskService` 中新增 `add_note` 静态方法 |
| **F6** | IMAP/SMTP 凭据混淆 | `.env` 中的 `SMTP_USER`/`SMTP_PASSWORD` 是发件用的，IMAP 收件需要独立配置 `IMAP_USER`/`IMAP_PASSWORD` |
| **F7** | `tasks/` 目录不存在 | 现有项目无 `app/tasks/` 目录，定时任务应注册在 `main.py` 的 APScheduler 中 |
| **F8** | `parsed_params` 存字符串 | 应使用 SQLAlchemy JSON 类型存储，便于后续查询 |
| **F9** | 缺少数据库迁移 | 新增 `email_reply_records` 表和 Task 扩展字段需要 Alembic 迁移脚本 |

---

## 技术方案

### 接收邮件：IMAP 方式

| 项目 | 说明 |
|------|------|
| 协议 | IMAP over SSL |
| 地址 | imap.qq.com（QQ 邮箱）/ imap.exmail.qq.com（企业邮箱） |
| 端口 | 993 |
| 检查频率 | 每 5 分钟一次（通过 APScheduler interval 触发器） |
| 凭据 | IMAP 授权码（独立于 SMTP 发件密码） |
| 处理方式 | 取 UNSEEN 邮件 → 处理 → 标记 SEEN |
| 并发保护 | 使用 asyncio.Lock 防止上一轮未完成时下一轮重叠 |
| 客户端兼容 | 需兼容 quoted-printable 和 base64 编码的邮件正文 |

**为什么用 IMAP？**
QQ 邮箱个人版不支持邮件转发到网站（Webhook），只能主动拉取。

**与现有架构的整合：**
现有项目的定时任务使用 `main.py` 中的 APScheduler（`AsyncIOScheduler`），已有 `check_reminders` 每分钟运行一次。邮件检查任务应以相同方式注册，而不是创建新的 `tasks/` 目录。

### 备份方案（暂不实现）

接入 SendGrid / Mailgun 入站邮件解析，配置 MX 记录指向第三方服务，支持邮件直接推送到网站 Webhook，更可靠。

---

## 邮件路由机制（修订）

### 发送方（提醒邮件）

现有 `utils/email.py` 的 `build_reminder_email()` 已生成 HTML 提醒邮件。需要修改：

1. 在 `build_reminder_email()` 中增加 `Reply-To` 头部，格式为：
   ```
   Reply-To: reply-{task_id}-{hmac_signature}@{EMAIL_REPLY_DOMAIN}
   ```
2. HMAC 签名使用独立的 `EMAIL_REPLY_SECRET` 计算（不复用 JWT 的 SECRET_KEY），防止伪造：
   ```python
   import hmac, hashlib
   sig = hmac.new(EMAIL_REPLY_SECRET.encode(), str(task_id).encode(), hashlib.sha256).hexdigest()[:16]
   reply_to = f"reply-{task_id}-{sig}@{EMAIL_REPLY_DOMAIN}"
   ```

### 接收方（用户回复）

- 用户回复邮件到 `reply-{task_id}-{sig}@domain.com`
- 系统通过 IMAP 从邮箱取回邮件
- 从收件地址提取 `task_id`，校验 `sig` 确认合法性
- 校验通过后执行操作

### 多用户邮件路由（扩展说明）

**当前设计支持多用户共存**，通过以下机制区分：

| 步骤 | 处理逻辑 |
|------|---------|
| 1 | 所有用户共用一个 IMAP 邮箱和一个域名邮箱 |
| 2 | 任务ID 通过 HMAC 签名编码到邮件地址中，每个任务的回复地址唯一 |
| 3 | 收到邮件后，通过 HMAC 签名校验确认任务归属（防止伪造 task_id） |
| 4 | 通过 task_id 查询 user_id，再查询用户的绑定邮箱 |
| 5 | 校验发件人邮箱是否与绑定邮箱匹配 |
| 6 | 校验失败：不执行操作，发送"操作未授权"错误邮件 |

**任务转移处理（远期，当前版本不实现）：**
- 当前系统不支持任务在用户间转移，此处仅做设计预留
- 如未来实现：HMAC 签名关联原始 task_id，不随用户转移；任务转移后，原回复地址仍有效（指向新归属用户）

### [待确认] 域名配置

| 方案 | 说明 | 工作量 |
|------|------|--------|
| 自有域名 + QQ 企业邮箱 | 配置域名 MX 记录指向腾讯企业邮箱，系统 IMAP 连接企业邮箱取件 | 中（需域名+企业邮箱开通） |
| 自有域名 + Catch-all 转发 | 域名配置 Catch-all 转发到 QQ 个人邮箱，系统从 QQ 邮箱 IMAP 取件 | 低（仅需域名 DNS 配置） |
| SendGrid Inbound Parse | 域名 MX 指向 SendGrid，SendGrid 通过 Webhook 推送到系统 | 低（但依赖外部服务） |

---

## 命令解析规则（修订）

### 判断逻辑

1. 取邮件纯文本内容
2. **过滤干扰内容**：去掉 `>` 开头的引用行、`--` 签名分隔线之后的内容、`On ... wrote:` 模式
3. 取第一行有效文本作为命令行
4. 首段为命令标识符（大小写不敏感，中英文均可）

### 命令表格

| 命令 | 中文 | 英文 | 参数 | 实际调用 |
|------|------|------|------|---------|
| 完成 | `完成` | `done` | 无 | `TaskService.complete_task(task, db)` |
| 取消 | `取消` | `cancel` | 无 | `TaskService.soft_delete_task(task, db)` |
| 回复 | `回复 <内容>` | `note <内容>` | content: string | 追加到 `task.completion_comment` |
| 提醒 | `提醒 <时间> <频次> <次数> [备注：xxx]` | `remind ...` | time, freq, count, note? | 创建 `Reminder` 记录（见下方说明） |

**注意 `completion_comment` 字段复用问题：**
该字段当前被任务完成审核流程（`PATCH /tasks/{id}/complete`）使用，记录用户完成时的评价。邮件回复的 `note` 命令也会写入此字段，可能导致覆盖。建议改为**追加模式**（用换行符拼接），或在 Task 模型中新增独立的 `email_notes` Text 字段。MVP 阶段可先用追加模式，后续迭代再分离。

**提醒命令的 Reminder 创建细节：**
`remind` 命令创建新的 `Reminder` 记录时，需要填充以下字段：

| 字段 | 值来源 |
|------|--------|
| `task_id` | 从回复地址解析 |
| `user_id` | 从 task 查询 |
| `remind_at` | 由 dateparser 解析时间字符串得到的 datetime |
| `remind_type` | `3`（custom） |
| `notify_channels` | 读取用户 `notify_pref` 中已启用的通道，默认 `"email"` |
| `is_sent` | `False` |

如需支持"每天 N 次"等重复提醒，需要创建多个 Reminder 记录（如 count=3 则创建 3 条，remind_at 依次递增），或在 Reminder 模型中增加 `recurrence_rule` 字段。**建议 MVP 阶段**：为每次提醒创建独立的 Reminder 记录，不做重复提醒。

### 提醒命令的时间解析

**这是技术难点之一。** "明天 10:00"、"1小时后"、"下周一" 等自然语言需要转换为具体的 datetime 对象。

| 方案 | 库 | 说明 |
|------|-----|------|
| **推荐** | `dateparser` | `dateparser.parse("明天 10:00", languages=["zh"])` → datetime 对象。支持中文，需 pip install |
| 备选 | `parsedatetime` | 仅支持英文自然语言 |
| 最简单 | 正则 + 手动解析 | 只支持固定格式如 `YYYY-MM-DD HH:MM`、`Xh`、`Xd`，不支持"明天"等 |

**建议 MVP 阶段**：先用 `dateparser` 库，如果安装有问题再降级为正则方案。

### 示例

| 用户回复 | 系统理解 |
|---------|---------|
| `完成` | 标记任务已完成 |
| `done` | 标记任务已完成 |
| `取消` | 软删除任务 |
| `回复 你好，已收到` | 记录备注"你好，已收到" |
| `note 你好` | 记录备注"你好" |
| `提醒 明天 10:00 每天 3次` | 明天10:00开始，每天提醒1次，连续提醒3天（共3次） |
| `提醒 明天 10:00 每天 3次 备注：需要跟进客户` | 同上，并附加备注"需要跟进客户" |
| `随便写点什么` | 无法识别命令，全文作为备注记录 |

---

## 邮件线程与确认邮件规则

### 邮件线程（ threading）

**建议：确认邮件使用 `References` 和 `In-Reply-To` 头，保持与原邮件同一线程。**

| 优点 | 说明 |
|------|------|
| 对话历史 | 用户在邮件客户端可以看到完整的提醒→回复→确认对话 |
| 便于查找 | 不需要另外搜索，一眼看到任务相关的所有邮件 |

**实现方式：**
- 发送提醒邮件时，生成唯一 `Message-ID`：`<task-{task_id}-{timestamp}@{EMAIL_REPLY_DOMAIN}>`
- 发送确认邮件时，设置 `In-Reply-To` 为原提醒邮件的 `Message-ID`
- 确认邮件自身也生成新的 `Message-ID`，便于后续回复继续串接

**现有代码冲突（必须修改）：**
当前 `build_reminder_email()` 生成的 HTML 底部有"此邮件由 WorkTodo 自动发送，**请勿回复**"。这与邮件回复功能直接冲突，必须改为引导文案，例如：

> 直接回复此邮件即可操作任务（支持：完成 / 取消 / 回复 xxx / 提醒 时间 频次 次数）

同时，现有 `ReminderService._send_email()` 未设置 `Message-ID` 头部（依赖 Python 自动生成的容器 hostname，不适合 threading）。需要改为手动设置可控的 `Message-ID`。

### 邮箱绑定验证流程

**MVP 阶段（简化）：**
- 用户在网站提交邮箱地址 → 直接绑定
- 不验证该邮箱是否属于用户

**完整版（后续实现）：**
| 步骤 | 说明 |
|------|------|
| 1 | 用户在网站提交邮箱地址 |
| 2 | 系统发送验证码到该邮箱 |
| 3 | 用户输入验证码 |
| 4 | 验证成功后绑定邮箱 |

---

## 确认邮件效果图

当你回复 `提醒 明天 10:00 每天 3次 备注：需要跟进` 后，你会收到：

```
主题：邮件回复确认：周三提交报告

已设置提醒：周三提交报告
提醒时间：2026-06-14 10:00
频次：每天提醒，连续3天（共3次）
备注：需要跟进

---
任务状态
标题：周三提交报告
状态：待办
截止时间：2026-06-17 18:00
```

**执行失败时：**

```
主题：邮件回复失败：周三提交报告

操作失败：任务不存在或已被删除。
如有问题请登录系统查看。
```

---

## 安全机制（新增）

| 机制 | 说明 |
|------|------|
| **HMAC 签名** | 回复地址包含 `hmac(task_id, EMAIL_REPLY_SECRET)` 前 **16** 位 hex（64-bit 安全性），收件时校验 |
| **权限校验** | 从 task_id 查出 user_id，确认邮件发件人是该用户绑定的邮箱 |
| **幂等保护** | 同一 task_id + command 在 30 分钟内不重复执行（基于 EmailReplyRecord 查询） |
| **速率限制** | 同一 task_id 每小时最多处理 10 封邮件 | 超限后静默忽略，记录日志，不发确认邮件 |

---

## 要写哪些代码？

| 序号 | 代码块 | 干嘛的 | 文件位置 | 与现有代码关系 |
|------|--------|--------|---------|---------------|
| 1 | 邮件记录表 | 记录"谁回复了什么邮件" | `models/email_reply_record.py` | **新增**，需要 Alembic 迁移 |
| 2 | 收邮件程序 | IMAP 取件 + 签名校验 | `services/email_receiver.py` | **新增**，使用 `imaplib` |
| 3 | 命令翻译器 | 解析邮件内容 + 时间解析 | `services/email_command_parser.py` | **新增**，依赖 `dateparser` 库 |
| 4 | 业务处理 | 执行实际操作 | `services/task_email_service.py` | **新增**，调用现有 `TaskService` |
| 5 | 任务表加字段 | 记录回复统计 | `models/task.py` | **修改**现有模型 + 迁移 |
| 6 | 定时调度 | 注册到 APScheduler | `main.py` | **修改**现有 APScheduler 注册 |
| 7 | 配置项 | IMAP + 域名配置 | `core/config.py` + `.env` | **修改**，新增 IMAP 配置项 |
| 8 | 提醒邮件改造 | 添加 Reply-To 头 + threading | `utils/email.py` | **修改** `build_reminder_email()` + 添加 `References`/`In-Reply-To` 头 |
| 9 | 网站 API | 邮箱绑定 + 状态查询 | `api/v1/users.py` | **修改**，扩展现有 channels API |
| 10 | 整体测试 | 集成测试 | `tests/test_email_integration.py` | **新增** |

**共 10 个代码块**，比原计划多了"提醒邮件改造"（添加 Reply-To 头部 + threading 支持）。

---

## 代码块之间的依赖关系

```
第7块（配置项）← 最先做，其他都依赖配置
    |
    +→ 第1块（邮件记录表 + 迁移）
    +→ 第5块（任务表加字段 + 迁移）
    |
    +→ 第2块（收邮件程序）← 需要第7块
    +→ 第3块（命令翻译器）← 需要安装 dateparser
    +→ 第8块（提醒邮件改造）← 需要第7块（域名配置）
    |
    +→ 第4块（业务处理）← 需要第1、3、5块
    |
    +→ 第6块（定时调度）← 需要第2、4块，修改 main.py
    |
    +→ 第9块（网站API）← 需要第7块
    |
    +→ 第10块（整体测试）← 需要前面所有
```

**可并行的组合**：第1+5+7 可并行，第2+3+8 可并行。

---

## 配置项（修订）

### `.env` 新增项

```bash
# === IMAP 收件配置（独立于 SMTP 发件配置）===
IMAP_HOST=imap.qq.com
IMAP_PORT=993
IMAP_USER=1248880631@qq.com
IMAP_PASSWORD=你的IMAP授权码

# === 邮件回复域名 ===
EMAIL_REPLY_DOMAIN=yourdomain.com
EMAIL_REPLY_SECRET=随机字符串用于签名校验

# === 邮件检查间隔 ===
EMAIL_CHECK_INTERVAL=300
```

### `config.py` 新增项

```python
# IMAP settings (separate from SMTP)
IMAP_HOST: str = "imap.qq.com"
IMAP_PORT: int = 993
IMAP_USER: Optional[str] = None
IMAP_PASSWORD: Optional[str] = None
EMAIL_CHECK_INTERVAL: int = 300

# Reply-to domain
EMAIL_REPLY_DOMAIN: Optional[str] = None
EMAIL_REPLY_SECRET: Optional[str] = None
```

**注意**：IMAP 凭据与 SMTP 凭据是独立的。QQ 邮箱的 IMAP 授权码可能与 SMTP 授权码不同，需要在 QQ 邮箱设置中分别开启。

---

## 数据模型（修订）

### EmailReplyRecord（新增）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer PK | 主键 |
| task_id | Integer FK → tasks.id | 关联任务，索引 |
| user_id | Integer FK → users.id | 关联用户，索引 |
| command | String(50) | 解析出的命令（done/cancel/note/remind） |
| raw_content | Text | 邮件原始内容（截断 2000 字符） |
| parsed_params | **JSON** | 解析后的参数（修复：使用 JSON 类型而非字符串） |
| reply_type | String(20) | success / failure |
| error_message | String(500) | 错误信息 |
| created_at | DateTime | 创建时间，索引（用于幂等查询） |

### Task 模型扩展

| 字段 | 类型 | 说明 |
|------|------|------|
| email_reply_count | Integer, default=0 | 邮件回复次数 |
| last_reply_at | DateTime, nullable | 最后一次邮件回复时间 |
| last_reply_command | String(50), nullable | 最后一次执行的命令 |

---

## 怎么做？

每个代码块的执行步骤：

| 步骤 | 干嘛 |
|------|------|
| 1 | 先写测试 |
| 2 | 跑测试看报错（预期失败） |
| 3 | 写代码让测试通过 |
| 4 | 再跑测试确认 |
| 5 | 提交代码 |

**注意：**
- 第8块（提醒邮件改造）需同时支持 Reply-To 和 threading，修改 `build_reminder_email()` 时注意保持接口兼容
- 确认邮件使用 `In-Reply-To` 引用原邮件 `Message-ID`，并生成新的 `Message-ID` 供下次回复使用
- 现有 `build_reminder_email()` 底部写有"请勿回复"，需要改为引导用户直接回复操作

---

## 要准备什么？

### 必须准备

| 准备项 | 说明 | 怎么做 |
|--------|------|--------|
| QQ 邮箱 IMAP 授权码 | 用于收邮件 | QQ 邮箱设置 → 账户 → 开启 IMAP → 生成授权码 |
| 自有域名 | 用于 Reply-To 地址 | 需要配置 DNS（MX 或 CNAME） |

### 可选准备

| 准备项 | 说明 |
|--------|------|
| QQ 企业邮箱 | 域名 MX 指向企业邮箱更稳定 |
| SendGrid 账号 | 备份方案：Inbound Parse Webhook |

---

## 预计多久做完？（修订）

| 阶段 | 内容 | 原估算 | 修订估算 | 说明 |
|------|------|--------|---------|------|
| 第7块 | 配置项 | - | 10 min | 简单 |
| 第1+5块 | 数据模型 + 迁移 | - | 25 min | 需要 Alembic 迁移 |
| 第2块 | IMAP 收件 | - | 40 min | IMAP 边界多，需要充分测试 |
| 第3块 | 命令解析 + 时间解析 | - | 40 min | dateparser 集成 + 中文测试 |
| 第8块 | 提醒邮件改造 | - | 25 min | 添加 Reply-To + Message-ID + threading + 修改"请勿回复"文案 |
| 第4块 | 业务处理 | - | 30 min | 调用现有 TaskService |
| 第6块 | 定时调度 | - | 15 min | 注册 APScheduler |
| 第9块 | 网站 API | - | 20 min | 扩展现有 channels API |
| 第10块 | 集成测试 | - | 25 min | 端到端测试 |
| **总计** | | **1.5-2h** | **4-4.5h** | 增加了 IMAP 边界、时间解析、安全校验、threading、字段冲突处理 |

---

## 错误处理（修订）

| 场景 | 处理方式 |
|------|---------|
| 解析失败（无法识别命令） | 邮件全文作为备注记录，确认邮件提示"无法识别命令，已记录为备注" |
| 任务不存在 | 发送错误邮件"任务不存在或已被删除" |
| HMAC 签名校验失败 | 发送错误邮件"操作未授权"，记录安全日志 |
| IMAP 连接失败 | 记录日志，不中断调度，下次重试 |
| IMAP 连接超时 | 30 秒超时，记录日志 |
| IMAP 检查重叠 | 上一轮未结束时下一轮跳过（asyncio.Lock），记录 warning 日志 |
| 邮件内容为空 | 忽略，不处理 |
| 用户未绑定邮箱 | 忽略 |
| 幂等冲突（30分钟内重复） | 跳过执行，不发送确认邮件 |
| 速率限制超限 | 静默忽略，记录日志，不发送确认邮件（防止攻击者试探） |
| 邮件编码异常 | 兼容 quoted-printable / base64 / 7bit，使用 `errors="replace"` 解码 |
| 提醒时间解析失败 | 发送错误邮件"无法理解时间格式，请使用如 明天 10:00 或 2026-06-15 10:00" |

---

## 监控与运维（新增）

| 项目 | 说明 |
|------|------|
| 日志 | 所有邮件处理流程打印 `[EmailReply]` 前缀日志，便于排查 |
| 统计 | EmailReplyRecord 表可作为运营数据，统计回复成功率 |
| 告警 | IMAP 连续 3 次连接失败时，发送告警邮件给管理员 |
| 清理 | 定期清理 90 天前的 EmailReplyRecord（可在后续版本实现） |

---

## 相关文档

| 文档 | 位置 |
|------|------|
| 设计文档 | `docs/superpowers/specs/2026-06-13-email-reply-design.md` |
| 实现计划 | `docs/superpowers/plans/2026-06-13-email-reply-feature.md` |
| 本文档（修订版） | `docs/superpowers/2026-06-13-email-reply-feature-document.md` |

---

## 下一步

确认方案后，按依赖关系开始开发：

1. **第一步**：确认域名方案（R1/R3）→ 配置 DNS
2. **第二步**：配置项 + 数据模型（第7、1、5块）
3. **第三步**：核心代码（第2、3、8块可并行）
4. **第四步**：业务处理 + 调度（第4、6块）
5. **第五步**：API + 测试（第9、10块）

**开发前必须确认的问题：**

- [ ] 域名方案选哪种？（自有域名 + 企业邮箱 / Catch-all / SendGrid）
- [ ] QQ 邮箱 IMAP 授权码是否已获取？
- [x] 是否需要在 MVP 阶段支持多用户？**已确认**：支持多用户，通过 HMAC 签名区分任务归属
- [ ] `dateparser` 库是否可安装到 Docker 环境？
- [ ] 确认邮件是否需要 threading？（建议需要，影响 `email.py` 的 `build_reminder_email()` 实现）
- [ ] MVP 阶段邮箱绑定是否需要验证码验证？（建议不需要，简化处理）
- [ ] `completion_comment` 字段冲突：邮件 note 和任务完成审核共用同一字段，MVP 用追加模式还是新增独立字段？
- [ ] 提醒命令创建多条重复 Reminder 时，是一次性创建还是按需动态生成？（建议 MVP 一次性创建）
