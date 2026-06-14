# 邮件回复功能设计

> **状态：** 已同步至 v4
> **日期：** 2026-06-13

## 功能概述

用户收到任务提醒邮件后，无需登录系统，直接回复邮件即可完成以下操作：
- 标记任务完成
- 取消任务
- 添加回复备注
- 设置新的提醒（可附加备注）

系统自动解析邮件内容并执行对应操作，然后发送确认邮件告知用户结果。

---

## 整体流程

```
用户收到任务提醒邮件（包含回复地址 reply-{task_id}-{hmac_signature}@{EMAIL_REPLY_DOMAIN}）
    |
用户回复邮件到 reply-{task_id}-{hmac_signature}@{EMAIL_REPLY_DOMAIN}
    |
系统通过 IMAP 从邮箱拉取新邮件（APScheduler 定时任务，间隔 EMAIL_CHECK_INTERVAL）
    |
验证 HMAC 签名，提取 task_id
    |
验证发件人身份（sender email 须匹配任务负责人的绑定邮箱）
    |
幂等性检查（同一 task_id + 命令 30 分钟内不重复处理）
    |
频率限制检查（同一 task_id 每小时最多 10 封）
    |
解析邮件内容，提取命令和参数
    |
执行业务操作（标记完成/取消/记录备注/设置新提醒）
    |
发送确认邮件给用户（包含执行结果 + 任务状态 + 新提醒时间）
    |
标记邮件为 \Seen，防止重复处理
```

---

## 邮件地址格式

### 格式定义

```
reply-{task_id}-{hmac_signature}@{EMAIL_REPLY_DOMAIN}
```

| 组成部分 | 说明 |
|---------|------|
| `reply` | 固定前缀 |
| `task_id` | 任务 ID（整数） |
| `hmac_signature` | HMAC 签名，用于安全校验 |
| `EMAIL_REPLY_DOMAIN` | 配置的回复邮件域名 |

### HMAC 签名生成

```python
hmac_signature = hmac.new(
    EMAIL_REPLY_SECRET.encode(),
    str(task_id).encode(),
    hashlib.sha256
).hexdigest()[:16]  # 16 hex chars = 64-bit
```

### 为什么不用 `+` 别名

QQ 邮箱不支持 `+alias` 格式（即 `reply+taskXXX@域名.com` 无法投递），因此采用 `reply-{task_id}-{hmac_signature}@{EMAIL_REPLY_DOMAIN}` 格式，通过独立域名 + 地址前缀路由实现多任务区分。

---

## 安全机制

| 机制 | 实现方式 | 说明 |
|------|---------|------|
| HMAC 签名 | `hmac(task_id, EMAIL_REPLY_SECRET).hexdigest()[:16]` | 防止伪造回复地址，签名不对则拒绝处理 |
| 身份验证 | 验证发件人邮箱 == 任务负责人绑定邮箱 | 防止非任务相关人员伪造回复 |
| 幂等保护 | 同一 task_id + 命令 30 分钟内不重复执行 | 防止 IMAP 重复拉取导致重复操作 |
| 频率限制 | 同一 task_id 每小时最多 10 封邮件 | 防止滥用或死循环 |

---

## 多用户邮件路由机制

多人共用同一回复域名时，通过以下 6 步实现精确路由：

| 步骤 | 操作 | 说明 |
|------|------|------|
| 1 | 用户回复邮件至 `reply-{task_id}-{hmac}@domain` | 邮件投递到 EMAIL_REPLY_DOMAIN 对应邮箱 |
| 2 | APScheduler 定时触发 IMAP 检查 | 按 EMAIL_CHECK_INTERVAL 间隔执行 |
| 3 | IMAP 拉取未处理邮件（asyncio.Lock 防止并发） | 获取 asyncio.Lock 后才执行，否则跳过本轮 |
| 4 | 解析收件地址，提取 task_id 和 hmac_signature | 正则匹配 `reply-(\d+)-([a-f0-9]{16})@` |
| 5 | 验证 HMAC 签名 + 发件人身份 | 签名不匹配或身份不符则拒绝，发送错误邮件 |
| 6 | 执行命令，发送确认邮件，标记 \Seen | 处理完成后标记已读防止重新处理 |

---

## 命令解析规则

### 判断逻辑

- 解析邮件纯文本内容（去掉签名等干扰内容）
- 取第一行作为命令行，按空格分隔
- 首段为命令标识符（大写不敏感，同时支持中英文）

### 命令表格

| 命令 | 格式 | 说明 |
|------|------|------|
| 完成 | `完成` 或 `done` | 标记任务已完成 |
| 取消 | `取消` 或 `cancel` | 取消任务 |
| 回复 | `回复 <内容>` 或 `note <内容>` | 将内容记录到任务备注 |
| 提醒 | `提醒 <时间> <频次> <次数> <备注>` | 设置新提醒 + 备注（备注可选） |

### remind 命令参数说明

| 参数 | 格式示例 | 说明 |
|------|---------|------|
| 时间 | `tomorrow`、`1h`、`2026-06-15 10:00`、`1小时`、`明天下午3点` | 自然语言时间（推荐使用 dateparser 库解析中文时间表达） |
| 频次 | `每天`、`每周`、`每小时`、`daily`、`weekly` | 自然语言频次 |
| 次数 | `3`、`5` | 数字 |
| 备注 | `备注：这是关于报告的补充` | 可选，备注内容 |

### 示例

| 用户回复 | 系统理解 |
|---------|---------|
| `完成` | 标记任务已完成 |
| `done` | 标记任务已完成 |
| `取消` | 取消任务 |
| `回复 你好，已收到` | 记录备注"你好，已收到" |
| `note 你好` | 记录备注"你好" |
| `提醒 明天 10:00 每天 3次` | 设置提醒，明天10点开始，每天提醒，共3次 |
| `提醒 明天 10:00 每天 3次 备注：需要跟进客户` | 设置提醒 + 备注"需要跟进客户" |

### 命令无法识别时

- 将邮件全文作为备注记录到任务

---

## 确认邮件内容

| 信息 | 说明 |
|------|------|
| 1. 执行结果 | 成功/失败 + 执行了什么命令 |
| 2. 任务状态摘要 | 任务标题、当前状态、截止时间 |
| 3. 新提醒时间 | 如果执行了 remind 命令，显示提醒时间+频次+次数 |
| 4. 备注内容 | 如果提供了备注内容，显示备注 |

---

## 邮件线程（Threading）

为确保确认邮件与原始提醒邮件在同一线程中显示，发送确认邮件时需设置以下头部：

| Header | 值 | 说明 |
|--------|---|------|
| Message-ID | `<{unique_id}@{EMAIL_REPLY_DOMAIN}>` | 每封邮件唯一标识 |
| In-Reply-To | 原始提醒邮件的 Message-ID | 标记为对原邮件的回复 |
| References | 原始提醒邮件的 Message-ID | 辅助邮件客户端识别线程 |

### Message-ID 生成

```python
import uuid
message_id = f"<{uuid.uuid4().hex}@{EMAIL_REPLY_DOMAIN}>"
```

提醒邮件发送时记录其 Message-ID，确认邮件发送时通过 In-Reply-To 和 References 关联回原邮件线程。

---

## "请勿回复"文本冲突与修复

### 问题

`build_reminder_email()` 模板中包含"请勿回复此邮件"的引导文字，这与邮件回复功能的设计意图矛盾——用户应当通过回复提醒邮件来操作任务。

### 修复方案

将 `build_reminder_email()` 中的"请勿回复"文案修改为引导用户回复操作的说明，例如：

```
直接回复此邮件即可操作任务：
- 回复"完成"标记任务已完成
- 回复"取消"取消任务
- 回复"回复 <内容>"添加备注
- 回复"提醒 <时间> <频次> <次数>"设置新提醒
```

---

## completion_comment 字段冲突

### 问题

`note` 命令和任务完成审核（completion review）共用 `completion_comment` 字段。如果用户先通过邮件回复添加了备注，后续任务完成时 completion review 可能覆盖该字段内容。

### MVP 方案

采用 **追加模式（append）**：新的 comment 追加到已有内容后面，而非覆盖。

```python
if task.completion_comment:
    task.completion_comment = task.completion_comment + "\n" + new_comment
else:
    task.completion_comment = new_comment
```

### 后续迭代

考虑为 `completion_comment` 拆分为独立字段，或引入 `TaskComment` 模型支持多条评论。

---

## 提醒创建字段详情

当用户通过邮件回复 `提醒` 命令创建新提醒时，系统创建 Reminder 记录，字段如下：

| 字段 | 值 / 来源 | 说明 |
|------|----------|------|
| task_id | 从回复地址提取 | 关联的任务 ID |
| user_id | 任务负责人 ID | 提醒归属用户 |
| remind_at | dateparser 解析结果 | 提醒触发时间，推荐使用 `dateparser` 库解析中文自然语言时间（如"明天下午3点"、"后天上午10点"） |
| remind_type | `3` | 邮件回复创建的提醒类型标识 |
| notify_channels | 用户偏好设置 | 从用户的通知偏好中读取（如 email、push、wechat 等） |
| is_sent | `False` | 初始状态为未发送 |

### dateparser 库

推荐使用 `dateparser` 库解析中文时间表达：

```python
import dateparser

# 支持多种中文时间表达
dateparser.parse("明天下午3点", languages=["zh"])
dateparser.parse("后天上午10点", languages=["zh"])
dateparser.parse("1小时后", languages=["zh"])
dateparser.parse("下周一 9:00", languages=["zh"])
```

---

## 数据模型

### EmailReplyRecord（新增）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| task_id | int | 关联任务ID |
| user_id | int | 关联用户ID |
| command | string | 解析出的命令（done/cancel/note/remind） |
| raw_content | text | 邮件原始内容（截断至 2000 字符，防止超长邮件占用存储） |
| parsed_params | JSON | 解析后的参数（JSON 类型，支持灵活结构） |
| reply_type | string | 回复类型：success/failure |
| error_message | string | 错误信息（如果有） |
| created_at | datetime | 创建时间 |

### Task 模型扩展（新增字段）

| 字段 | 类型 | 说明 |
|------|------|------|
| email_reply_count | int | 邮件回复次数 |
| last_reply_at | datetime | 最后一次邮件回复时间 |
| last_reply_command | string | 最后一次执行的命令 |

---

## 核心组件

| 组件 | 文件路径 | 职责 |
|------|---------|------|
| EmailReceiver | `app/services/email_receiver.py` | IMAP 连接邮箱，拉取新邮件 |
| EmailCommandParser | `app/services/email_command_parser.py` | 解析邮件内容，提取命令和参数 |
| TaskEmailService | `app/services/task_email_service.py` | 根据命令执行业务操作 |
| EmailSender | `app/utils/email.py`（复用） | 发送确认邮件 |
| EmailReplyRecord | `app/models/email_reply_record.py` | 记录邮件交互历史 |
| 定时任务注册 | `main.py` 中通过 APScheduler 注册 | 定时触发 IMAP 检查和处理流程 |

### 定时任务注册

定时任务不在独立的 `tasks/` 目录下，而是在 `main.py` 中通过 APScheduler 注册：

```python
# main.py 中注册
scheduler.add_job(
    func=check_and_process_emails,
    trigger="interval",
    minutes=EMAIL_CHECK_INTERVAL,  # 默认 5 分钟
    id="email_reply_check",
    replace_existing=True,
)
```

---

## IMAP 处理细节

### \Seen 标记

处理完一封邮件后，立即标记为 `\Seen`，防止下次 IMAP 拉取时重复处理：

```python
imap_conn.store(email_uid, "+FLAGS", "\\Seen")
```

### 并发锁（asyncio.Lock）

使用 `asyncio.Lock` 防止多轮定时任务重叠执行：

```python
_check_lock = asyncio.Lock()

async def check_and_process_emails():
    if _check_lock.locked():
        logger.info("Previous IMAP check still running, skipping this round")
        return
    async with _check_lock:
        # 拉取邮件、解析、执行、确认
        ...
```

### IMAP 连接超时

设置 30 秒超时，防止连接卡死：

```python
imap_conn = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT, timeout=30)
```

---

## 错误处理

| 场景 | 处理方式 |
|------|---------|
| 解析失败（无法识别命令） | 邮件全文作为备注记录 |
| 任务不存在 | 发送错误邮件告知用户 |
| IMAP 连接失败 | 记录日志，下次重试 |
| IMAP 连接超时 | 30 秒超时后断开，记录日志，下次重试 |
| IMAP 检查重叠 | 上一轮仍在运行时跳过本轮（asyncio.Lock），记录日志 |
| 邮件内容为空 | 忽略，不处理 |
| 用户未绑定邮箱 | 忽略，发邮件告知需绑定 |
| HMAC 签名验证失败 | 发送错误邮件告知地址无效，记录安全日志（含发件人、地址、时间） |
| 身份验证失败（发件人不匹配） | 发送错误邮件告知无权限操作该任务，记录安全日志 |
| 幂等冲突（30 分钟内重复） | 跳过处理，不发送确认邮件，记录日志 |
| 频率限制超出（每小时 >10 封） | 静默忽略，不发送确认邮件，记录日志 |
| 邮件编码异常 | 支持 quoted-printable / base64 / 7bit 编码，使用 `errors="replace"` 解码 |
| 时间解析失败 | 发送错误邮件，附带支持的时间格式说明 |

---

## 配置项（config.py）

| 配置项 | 说明 | 示例值 |
|--------|------|--------|
| IMAP_HOST | IMAP 服务器地址 | `imap.qq.com` |
| IMAP_PORT | IMAP 端口（SSL） | `993` |
| IMAP_USER | IMAP 邮箱账号（与 SMTP 独立配置） | `your@qq.com` |
| IMAP_PASSWORD | IMAP 授权码（与 SMTP 独立配置） | `授权码` |
| EMAIL_REPLY_DOMAIN | 回复邮件域名 | `yourdomain.com` |
| EMAIL_REPLY_SECRET | HMAC 签名密钥 | 随机生成的安全字符串 |
| EMAIL_CHECK_INTERVAL | IMAP 检查间隔（分钟） | `5` |

> **注意：** IMAP 凭据（`IMAP_USER` / `IMAP_PASSWORD`）与 SMTP 发送凭据分开配置，因为接收邮箱和发送邮箱可能是不同的账号。

---

## 监控与运维

### 日志记录

| 日志级别 | 场景 |
|---------|------|
| INFO | 每轮 IMAP 检查开始/结束、邮件处理成功、命令执行结果 |
| WARNING | IMAP 连接超时、幂等跳过、频率限制触发、编码异常 |
| ERROR | HMAC 签名验证失败、身份验证失败、IMAP 连接失败、业务操作异常 |

### 统计指标

建议记录以下指标，便于后续接入监控系统：

| 指标 | 说明 |
|------|------|
| 每轮检查邮件数 | 单次 IMAP 拉取到的新邮件数量 |
| 命令执行分布 | done / cancel / note / remind 各命令执行次数 |
| 错误率 | HMAC 失败、身份验证失败、解析失败等错误计数 |
| 处理延迟 | 从邮件接收到确认发送的耗时 |

### 告警规则

| 告警条件 | 级别 | 说明 |
|---------|------|------|
| IMAP 连接连续失败 3 次 | CRITICAL | 邮件接收完全中断 |
| HMAC 失败率 > 10% | WARNING | 可能存在地址伪造攻击 |
| 单轮处理耗时 > 5 分钟 | WARNING | 可能积压过多或性能异常 |

### 数据清理

`EmailReplyRecord` 表数据随时间增长，建议：
- 保留最近 90 天的完整记录
- 超过 90 天的记录归档或清理（保留摘要）
- 定期统计 `raw_content` 字段存储占用

---

## 实现方案

### 方案 B：IMAP 监控（主方案）

- 通过 `main.py` 的 APScheduler 定时任务，每 `EMAIL_CHECK_INTERVAL` 分钟连接邮箱 IMAP
- 检查收件箱中新邮件（未读 / 未标记 \Seen）
- 解析收件地址 `reply-{task_id}-{hmac_signature}@{EMAIL_REPLY_DOMAIN}` 提取 task_id
- 验证 HMAC 签名和发件人身份
- 幂等性和频率限制检查
- 处理流程：取件 -> 安全校验 -> 解析 -> 执行 -> 确认 -> 标记 \Seen

### 方案 C：第三方邮件服务（备份方案）

- 使用 SendGrid / Mailgun 入站邮件解析
- 配置 MX 记录指向第三方服务
- 优点：更可靠，无需 IMAP
- 缺点：增加外部依赖

---

## 待确认的问题

- [ ] QQ 邮箱 IMAP 授权码如何获取（需用户操作）
- [ ] 邮件域名的 MX 记录如何配置，EMAIL_REPLY_DOMAIN 域名方案确认（独立域名 vs 子域名）
- [ ] dateparser 库是否已在项目依赖中可用，或需新增安装
- [ ] 邮件线程功能确认：提醒邮件是否已生成 Message-ID 并存储，以便确认邮件关联
- [ ] completion_comment 追加模式是否满足 MVP 需求，还是需要在 MVP 阶段就拆分字段
- [ ] MVP 阶段邮件绑定策略：用户邮箱绑定是手动配置还是从现有用户信息中读取
- [ ] 提醒创建策略：remind_type=3 是否需要与现有提醒类型枚举对齐，notify_channels 字段格式确认
