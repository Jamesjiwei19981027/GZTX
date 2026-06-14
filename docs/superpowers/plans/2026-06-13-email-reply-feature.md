# 邮件回复功能实现计划（已同步至 v4）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 实现邮件回复功能，用户无需登录系统即可通过回复邮件完成标记完成/取消任务/添加备注/设置新提醒操作

**架构：** IMAP 定时拉取邮箱新邮件 → 解析命令 → 执行业务操作 → 发送确认邮件

**技术栈：** FastAPI + SQLAlchemy + IMAP (imaplib) + APScheduler + dateparser + 现有 email.py

**预估总时间：** 4 ~ 4.5 小时

---

## 文件结构

```
backend/app/
├── core/
│   └── config.py                   # 修改：添加 IMAP / 邮件回复配置项
├── models/
│   ├── email_reply_record.py       # 新增：邮件回复记录模型
│   └── task.py                     # 修改：添加邮件回复统计字段
├── services/
│   ├── email_receiver.py           # 新增：IMAP 邮件拉取服务
│   ├── email_command_parser.py     # 新增：邮件命令解析器（使用 dateparser）
│   └── task_email_service.py       # 新增：任务邮件服务（编排层）
├── api/v1/
│   └── users.py 或 notifications.py # 修改：扩展已有路由，添加邮件绑定
├── main.py                         # 修改：注册 APScheduler 定时任务
└── utils/
    └── email.py                    # 修改：提醒邮件添加 Reply-To / Message-ID
```

> 注意：不存在 `tasks/` 目录，定时任务直接注册到 `main.py` 的 APScheduler 中。

---

## 任务执行顺序与依赖关系

```
阶段 1（并行）：Task 1（配置）+ Task 2（数据模型）+ Task 3（任务模型扩展）
    ↓
阶段 2（并行）：Task 4（IMAP 收件）+ Task 5（命令解析）+ Task 6（提醒邮件改造）
    ↓
阶段 3：Task 7（业务编排层）← 依赖 Task 2, 5, 6
    ↓
阶段 4：Task 8（定时调度）← 依赖 Task 4, 7
    ↓
阶段 5：Task 9（API）+ Task 10（集成测试）← 依赖全部
```

---

## Task 1: 更新配置文件

**预估时间：** 10 分钟

**文件：**
- 修改：`backend/app/core/config.py`

- [ ] **Step 1: 添加配置项**

在 `Settings` 类中添加以下配置项：

```python
# ===== 邮件回复功能配置 =====

# IMAP 收件配置（注意：与 SMTP 发件配置独立）
IMAP_HOST: str = "imap.qq.com"
IMAP_PORT: int = 993
IMAP_USER: Optional[str] = None
IMAP_PASSWORD: Optional[str] = None

# 邮件检查间隔（秒）
EMAIL_CHECK_INTERVAL: int = 300  # 默认 5 分钟

# 邮件回复域名（用于生成 Reply-To 地址）
EMAIL_REPLY_DOMAIN: str = "yourdomain.com"

# HMAC 签名密钥（用于验证 Reply-To 地址合法性）
EMAIL_REPLY_SECRET: str = "change-me-to-a-random-secret"
```

> **重要：** IMAP 凭据（`IMAP_USER` / `IMAP_PASSWORD`）与 SMTP 发件凭据是**独立的**，不要混淆。`.env` 文件中需要分别配置。

- [ ] **Step 2: 在 .env.example 中添加示例**

```bash
# IMAP（收件）
IMAP_HOST=imap.qq.com
IMAP_PORT=993
IMAP_USER=your_email@qq.com
IMAP_PASSWORD=your_imap_auth_code

# 邮件回复
EMAIL_CHECK_INTERVAL=300
EMAIL_REPLY_DOMAIN=yourdomain.com
EMAIL_REPLY_SECRET=your-hmac-secret-key
```

- [ ] **Step 3: 验证配置加载**

```bash
cd backend && python -c "from app.core.config import settings; print(settings.IMAP_HOST, settings.IMAP_PORT, settings.EMAIL_REPLY_DOMAIN)"
```

Expected: `imap.qq.com 993 yourdomain.com`

- [ ] **Step 4: 提交**

```bash
git add backend/app/core/config.py backend/.env.example
git commit -m "feat: add IMAP and email reply configuration"
```

---

## Task 2: 创建邮件回复记录模型 + 数据库迁移

**预估时间：** 25 分钟

**文件：**
- 创建：`backend/app/models/email_reply_record.py`
- 创建：`backend/tests/test_email_reply_record.py`
- 生成：Alembic 迁移脚本

- [ ] **Step 1: 写测试**

```python
"""测试 EmailReplyRecord 模型"""
from app.models.email_reply_record import EmailReplyRecord


def test_email_reply_record_create():
    """测试基本创建"""
    record = EmailReplyRecord(
        task_id=1,
        user_id=1,
        command="done",
        raw_content="完成",
        reply_type="success"
    )
    assert record.task_id == 1
    assert record.command == "done"
    assert record.reply_type == "success"


def test_email_reply_record_with_parsed_params():
    """测试 parsed_params 为 JSON/dict 类型"""
    record = EmailReplyRecord(
        task_id=1,
        user_id=1,
        command="remind",
        raw_content="提醒 明天 10:00 每天 3次",
        parsed_params={"time": "明天 10:00", "frequency": "每天", "count": 3},
        reply_type="success"
    )
    assert record.parsed_params == {"time": "明天 10:00", "frequency": "每天", "count": 3}


def test_email_reply_record_with_error():
    """测试错误记录"""
    record = EmailReplyRecord(
        task_id=1,
        user_id=1,
        command="unknown",
        raw_content="随便写点什么",
        reply_type="failure",
        error_message="无法识别命令"
    )
    assert record.reply_type == "failure"
    assert record.error_message == "无法识别命令"


def test_raw_content_truncation():
    """测试 raw_content 截断（最大 2000 字符）"""
    long_content = "x" * 3000
    record = EmailReplyRecord(
        task_id=1,
        user_id=1,
        command="note",
        raw_content=long_content[:2000],
        reply_type="success"
    )
    assert len(record.raw_content) == 2000
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd backend && pytest tests/test_email_reply_record.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.models.email_reply_record'`

- [ ] **Step 3: 写模型代码**

```python
"""邮件回复记录模型"""
from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, ForeignKey
from sqlalchemy.sql import func
from app.db.base import Base


class EmailReplyRecord(Base):
    __tablename__ = "email_reply_records"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    command = Column(String(50), nullable=False)
    # raw_content 截断至 2000 字符存储
    raw_content = Column(Text, nullable=False)
    # parsed_params 使用 JSON 类型，直接存储 dict
    parsed_params = Column(JSON, nullable=True)
    reply_type = Column(String(20), nullable=False, default="success")
    error_message = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self):
        return f"<EmailReplyRecord(task_id={self.task_id}, command={self.command})>"
```

> **关键变更（v4）：**
> - `parsed_params` 使用 `Column(JSON, nullable=True)` 而非 `Column(Text)`，可直接存取 dict
> - `raw_content` 应在写入时截断至 2000 字符
> - `created_at` 使用 `DateTime(timezone=True)` + `server_default=func.now()`

- [ ] **Step 4: 运行测试验证通过**

```bash
cd backend && pytest tests/test_email_reply_record.py -v
```

Expected: PASS

- [ ] **Step 5: 生成 Alembic 迁移**

```bash
cd backend && alembic revision --autogenerate -m "add email_reply_records table"
cd backend && alembic upgrade head
```

- [ ] **Step 6: 提交**

```bash
git add backend/app/models/email_reply_record.py backend/tests/test_email_reply_record.py
git add backend/alembic/versions/
git commit -m "feat: add EmailReplyRecord model with JSON parsed_params and migration"
```

---

## Task 3: 添加任务模型扩展字段

**预估时间：** 包含在 Task 2 的 25 分钟内

**文件：**
- 修改：`backend/app/models/task.py`
- 修改：`backend/app/schemas/task.py`（如有需要）

- [ ] **Step 1: 写测试**

```python
"""测试 Task 模型的邮件回复字段"""
def test_task_email_fields():
    from app.models.task import Task
    assert hasattr(Task, "email_reply_count")
    assert hasattr(Task, "last_reply_at")
    assert hasattr(Task, "last_reply_command")
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd backend && pytest tests/test_tasks.py::test_task_email_fields -v
```

Expected: FAIL — `AttributeError`

- [ ] **Step 3: 修改 Task 模型**

在 `backend/app/models/task.py` 的 Task 模型中，在现有字段后添加：

```python
# 邮件回复统计字段
email_reply_count = Column(Integer, default=0, nullable=False)
last_reply_at = Column(DateTime(timezone=True), nullable=True)
last_reply_command = Column(String(50), nullable=True)
```

- [ ] **Step 4: 生成 Alembic 迁移**

```bash
cd backend && alembic revision --autogenerate -m "add email reply fields to tasks"
cd backend && alembic upgrade head
```

- [ ] **Step 5: 运行测试验证通过**

```bash
cd backend && pytest tests/test_tasks.py::test_task_email_fields -v
```

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add backend/app/models/task.py backend/alembic/versions/
git commit -m "feat: add email reply tracking fields to Task model"
```

---

## Task 4: 创建 IMAP 邮件拉取服务

**预估时间：** 40 分钟

**文件：**
- 创建：`backend/app/services/email_receiver.py`
- 创建：`backend/tests/test_email_receiver.py`

- [ ] **Step 1: 写测试**

```python
"""测试 EmailReceiver"""
import pytest
from app.services.email_receiver import EmailReceiver


def test_email_receiver_init():
    """测试初始化使用正确的配置名"""
    receiver = EmailReceiver()
    # 配置项使用 settings.IMAP_HOST / IMAP_PORT
    assert receiver.imap_host is not None
    assert receiver.imap_port == 993


def test_extract_task_id_with_hmac():
    """测试从 reply-{task_id}-{sig}@domain 格式提取 task_id"""
    receiver = EmailReceiver()

    # 合法签名
    import hmac, hashlib
    from app.core.config import settings
    task_id = 42
    sig = hmac.new(
        settings.EMAIL_REPLY_SECRET.encode(),
        str(task_id).encode(),
        hashlib.sha256
    ).hexdigest()[:16]
    to_addr = f"reply-{task_id}-{sig}@{settings.EMAIL_REPLY_DOMAIN}"

    result = receiver.extract_task_id(to_addr)
    assert result == 42


def test_extract_task_id_invalid_signature():
    """测试签名不匹配时返回 None"""
    receiver = EmailReceiver()
    from app.core.config import settings
    to_addr = f"reply-42-invalidsignature00@{settings.EMAIL_REPLY_DOMAIN}"
    result = receiver.extract_task_id(to_addr)
    assert result is None


def test_extract_task_id_malformed():
    """测试格式错误地址返回 None"""
    receiver = EmailReceiver()
    assert receiver.extract_task_id("") is None
    assert receiver.extract_task_id("not-a-reply@domain.com") is None
    assert receiver.extract_task_id("reply-abc-def@domain.com") is None


def test_filter_email_quotes():
    """测试过滤邮件引用和签名"""
    receiver = EmailReceiver()
    raw_body = """完成

> 这是引用内容
> 也是引用

On 2026-06-13, someone wrote:
> more quotes

-- 
这是签名档
"""
    filtered = receiver.filter_email_body(raw_body)
    assert filtered.strip() == "完成"


def test_decode_quoted_printable():
    """测试 quoted-printable 解码"""
    receiver = EmailReceiver()
    # =E4=BD=A0=E5=A5=BD 是 "你好" 的 QP 编码
    decoded = receiver.decode_body_payload(
        payload=b"=E4=BD=A0=E5=A5=BD",
        encoding="quoted-printable",
        charset="utf-8"
    )
    assert decoded == "你好"


def test_decode_base64():
    """测试 base64 解码"""
    receiver = EmailReceiver()
    import base64
    encoded = base64.b64encode("完成".encode("utf-8"))
    decoded = receiver.decode_body_payload(
        payload=encoded,
        encoding="base64",
        charset="utf-8"
    )
    assert decoded == "完成"


@pytest.fixture
def mock_imap(mocker):
    return mocker.patch("imaplib.IMAP4_SSL")


def test_fetch_new_emails_marks_seen(mock_imap):
    """测试拉取邮件后标记为已读"""
    mock_conn = mock_imap.return_value
    mock_conn.select.return_value = ("OK", [b"1"])
    mock_conn.search.return_value = ("OK", [b"1"])
    mock_conn.fetch.return_value = (
        "OK",
        [(b"1 (RFC822 {100})", b"From: test@example.com\r\nTo: reply-1-abc@domain.com\r\n\r\n完成")]
    )
    receiver = EmailReceiver()
    emails = receiver.fetch_new_emails()
    # 验证 STORE 被调用以标记 \Seen
    mock_conn.store.assert_called()
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd backend && pytest tests/test_email_receiver.py -v
```

Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: 写服务代码**

```python
"""IMAP 邮件拉取服务"""
import imaplib
import email
import hmac
import hashlib
import base64
import quopri
import re
from email.parser import Parser
from email.header import decode_header
from typing import List, Dict, Optional
from app.core.config import settings


class EmailReceiver:
    def __init__(self):
        self.imap_host = settings.IMAP_HOST
        self.imap_port = settings.IMAP_PORT
        self.username = settings.IMAP_USER
        self.password = settings.IMAP_PASSWORD
        self.reply_domain = settings.EMAIL_REPLY_DOMAIN
        self.reply_secret = settings.EMAIL_REPLY_SECRET

    def connect(self) -> imaplib.IMAP4_SSL:
        """连接 IMAP 服务器"""
        if not self.username or not self.password:
            raise ValueError("IMAP credentials not configured (IMAP_USER / IMAP_PASSWORD)")
        conn = imaplib.IMAP4_SSL(self.imap_host, self.imap_port)
        conn.login(self.username, self.password)
        return conn

    def fetch_new_emails(self, folder: str = "INBOX") -> List[Dict]:
        """拉取未读邮件，处理后标记为已读"""
        emails = []
        try:
            conn = self.connect()
            conn.select(folder)

            # 搜索未读邮件
            status, message_ids = conn.search(None, "UNSEEN")
            if status != "OK":
                conn.logout()
                return emails

            msg_id_list = message_ids[0].split()
            for msg_id in msg_id_list:
                email_data = self._fetch_single_email(conn, msg_id)
                if email_data:
                    emails.append(email_data)
                # 处理完成后标记为已读 (\Seen)
                conn.store(msg_id, "+FLAGS", "\\Seen")

            conn.logout()
        except Exception as e:
            print(f"[EmailReceiver] Failed to fetch emails: {e}")

        return emails

    def _fetch_single_email(self, conn: imaplib.IMAP4_SSL, msg_id: bytes) -> Optional[Dict]:
        """拉取单封邮件"""
        try:
            status, data = conn.fetch(msg_id, "(RFC822)")
            if status != "OK":
                return None

            raw_email = data[0][1]
            msg = Parser().parsestr(raw_email.decode("utf-8", errors="replace"))

            from_addr = self._decode_header_value(msg.get("From", ""))
            to_addr = msg.get("To", "")
            subject = self._decode_header_value(msg.get("Subject", ""))
            body = self._extract_body(msg)
            # 过滤引用、签名等
            filtered_body = self.filter_email_body(body)

            return {
                "message_id": msg.get("Message-ID", msg_id.decode()),
                "from": from_addr,
                "to": to_addr,
                "subject": subject,
                "body": filtered_body,
                "raw": raw_email.decode("utf-8", errors="replace")[:2000]
            }
        except Exception as e:
            print(f"[EmailReceiver] Failed to fetch email {msg_id}: {e}")
            return None

    def _extract_body(self, msg) -> str:
        """提取邮件正文，支持 quoted-printable 和 base64 解码"""
        body = ""
        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                if content_type == "text/plain":
                    body = self._decode_part(part)
                    break
        else:
            body = self._decode_part(msg)
        return body

    def _decode_part(self, part) -> str:
        """解码邮件 part，支持多种 Content-Transfer-Encoding"""
        payload = part.get_payload(decode=False)
        encoding = part.get("Content-Transfer-Encoding", "7bit").lower()
        charset = part.get_content_charset() or "utf-8"

        if isinstance(payload, str):
            payload = payload.encode("utf-8")

        return self.decode_body_payload(payload, encoding, charset)

    def decode_body_payload(self, payload: bytes, encoding: str, charset: str) -> str:
        """根据编码方式解码邮件正文 payload"""
        try:
            if encoding == "quoted-printable":
                decoded = quopri.decodestring(payload)
            elif encoding == "base64":
                decoded = base64.b64decode(payload)
            else:
                decoded = payload
            return decoded.decode(charset, errors="replace")
        except Exception as e:
            print(f"[EmailReceiver] decode error ({encoding}/{charset}): {e}")
            return payload.decode("utf-8", errors="replace")

    def filter_email_body(self, body: str) -> str:
        """过滤邮件引用、签名和 On...wrote 模式"""
        if not body:
            return ""

        lines = body.split("\n")
        filtered = []
        for line in lines:
            # 过滤引用行（以 > 开头）
            if line.strip().startswith(">"):
                continue
            # 过滤签名分隔线（独立的 -- ）
            if line.strip() == "--":
                break
            # 过滤 "On ... wrote:" 模式（常见于英文邮件回复）
            if re.match(r"^On .+ wrote:\s*$", line.strip()):
                break
            filtered.append(line)

        return "\n".join(filtered).strip()

    def extract_task_id(self, to_addr: str) -> Optional[int]:
        """
        从回复地址提取任务 ID，并验证 HMAC 签名
        地址格式: reply-{task_id}-{signature}@{EMAIL_REPLY_DOMAIN}
        签名算法: hmac.new(SECRET, str(task_id), sha256).hexdigest()[:16]
        """
        if not to_addr:
            return None
        try:
            # 提取 @ 前面的 local part
            local_part = to_addr.split("@")[0]
            # 格式: reply-{task_id}-{sig}
            if not local_part.startswith("reply-"):
                return None
            parts = local_part.split("-")
            if len(parts) != 3:
                return None
            task_id = int(parts[1])
            provided_sig = parts[2]

            # HMAC 签名验证
            expected_sig = hmac.new(
                self.reply_secret.encode(),
                str(task_id).encode(),
                hashlib.sha256
            ).hexdigest()[:16]

            if not hmac.compare_digest(provided_sig, expected_sig):
                print(f"[EmailReceiver] HMAC signature mismatch for task_id={task_id}")
                return None

            return task_id
        except (ValueError, IndexError) as e:
            print(f"[EmailReceiver] extract_task_id error: {e}")
            return None

    def generate_reply_address(self, task_id: int) -> str:
        """生成带 HMAC 签名的回复地址"""
        sig = hmac.new(
            self.reply_secret.encode(),
            str(task_id).encode(),
            hashlib.sha256
        ).hexdigest()[:16]
        return f"reply-{task_id}-{sig}@{self.reply_domain}"

    def _decode_header_value(self, value: str) -> str:
        """解码邮件头（支持 RFC 2047 编码）"""
        if not value:
            return ""
        decoded_parts = decode_header(value)
        result = []
        for part, charset in decoded_parts:
            if isinstance(part, bytes):
                result.append(part.decode(charset or "utf-8", errors="replace"))
            else:
                result.append(part)
        return "".join(result)
```

> **关键变更（v4）：**
> - 配置名使用 `settings.IMAP_HOST` / `IMAP_PORT` / `IMAP_USER` / `IMAP_PASSWORD`
> - 地址格式改为 `reply-{task_id}-{sig}@domain`（非旧版 `reply+task{id}@domain`）
> - 新增 HMAC 签名验证
> - 处理后标记邮件为 `\Seen`
> - 支持 quoted-printable / base64 解码
> - 过滤邮件引用（`>`）、签名（`--`）和 `On ... wrote:` 模式

- [ ] **Step 4: 运行测试验证通过**

```bash
cd backend && pytest tests/test_email_receiver.py -v
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/services/email_receiver.py backend/tests/test_email_receiver.py
git commit -m "feat: add EmailReceiver with HMAC verification, quote filtering, and multi-encoding support"
```

---

## Task 5: 创建邮件命令解析器（含 dateparser 时间解析）

**预估时间：** 40 分钟

**文件：**
- 创建：`backend/app/services/email_command_parser.py`
- 创建：`backend/tests/test_email_command_parser.py`

- [ ] **Step 1: 安装依赖**

```bash
cd backend && pip install dateparser
```

在 `requirements.txt` 中添加：

```
dateparser>=1.1.0
```

- [ ] **Step 2: 写测试**

```python
"""测试 EmailCommandParser"""
from app.services.email_command_parser import EmailCommandParser


def test_parse_done():
    parser = EmailCommandParser()
    result = parser.parse("完成")
    assert result["command"] == "done"
    assert result["params"] == {}


def test_parse_done_english():
    parser = EmailCommandParser()
    result = parser.parse("done")
    assert result["command"] == "done"


def test_parse_cancel():
    parser = EmailCommandParser()
    result = parser.parse("取消")
    assert result["command"] == "cancel"


def test_parse_note():
    parser = EmailCommandParser()
    result = parser.parse("回复 你好，已收到")
    assert result["command"] == "note"
    assert result["params"]["content"] == "你好，已收到"


def test_parse_note_english():
    parser = EmailCommandParser()
    result = parser.parse("note 你好")
    assert result["command"] == "note"


def test_parse_remind():
    parser = EmailCommandParser()
    result = parser.parse("提醒 明天 10:00 每天 3次")
    assert result["command"] == "remind"
    # dateparser 解析后的结果应包含时间信息
    assert "time" in result["params"]
    assert result["params"]["frequency"] == "每天"
    assert result["params"]["count"] == 3


def test_parse_remind_with_note():
    parser = EmailCommandParser()
    result = parser.parse("提醒 明天 10:00 每天 3次 备注：需要跟进")
    assert result["command"] == "remind"
    assert result["params"]["note"] == "需要跟进"


def test_parse_unknown():
    parser = EmailCommandParser()
    result = parser.parse("随便写点什么")
    assert result["command"] == "note"
    assert result["params"]["content"] == "随便写点什么"


def test_parse_with_email_quotes_filtered():
    """测试带邮件引用的内容会被先过滤"""
    parser = EmailCommandParser()
    content = """完成

> 原始消息内容
> 更多引用

On 2026-06-13, admin wrote:
> 提醒你完成任务"""
    result = parser.parse(content)
    assert result["command"] == "done"


def test_parse_remind_time_with_dateparser():
    """测试 dateparser 解析中文时间"""
    parser = EmailCommandParser()
    result = parser.parse("提醒 后天下午3点 每周")
    assert result["command"] == "remind"
    # time 字段应该是 dateparser 解析后的 ISO 格式或 datetime 对象
    assert result["params"]["time"] is not None
```

- [ ] **Step 3: 运行测试验证失败**

```bash
cd backend && pytest tests/test_email_command_parser.py -v
```

Expected: FAIL

- [ ] **Step 4: 写解析器代码**

```python
"""邮件命令解析器（使用 dateparser 进行时间解析）"""
import re
import dateparser
from typing import Dict, Optional


class EmailCommandParser:
    """邮件命令解析器"""

    COMMAND_MAP = {
        "完成": "done",
        "done": "done",
        "取消": "cancel",
        "cancel": "cancel",
        "回复": "note",
        "note": "note",
        "提醒": "remind",
        "remind": "remind",
    }

    def parse(self, content: str) -> Dict:
        """解析邮件内容，返回命令和参数"""
        if not content:
            return {"command": "note", "params": {"content": ""}}

        # 先过滤邮件引用和签名，再解析命令
        cleaned = self._filter_quotes_and_signatures(content)

        if not cleaned:
            return {"command": "note", "params": {"content": ""}}

        # 提取第一行作为命令
        lines = cleaned.strip().split("\n")
        first_line = lines[0].strip()

        # 按空格分割，首段为命令关键词
        parts = first_line.split(" ", 1)
        cmd = parts[0]
        rest = parts[1] if len(parts) > 1 else ""

        # 查找命令
        command = self.COMMAND_MAP.get(cmd)

        if command is None:
            # 无法识别命令，整段内容作为备注
            return {"command": "note", "params": {"content": cleaned.strip()}}

        # 根据命令解析参数
        params = self._parse_params(command, rest)

        return {"command": command, "params": params}

    def _filter_quotes_and_signatures(self, content: str) -> str:
        """过滤邮件引用、签名和 On...wrote 模式（在命令解析前调用）"""
        if not content:
            return ""
        lines = content.split("\n")
        filtered = []
        for line in lines:
            if line.strip().startswith(">"):
                continue
            if line.strip() == "--":
                break
            if re.match(r"^On .+ wrote:\s*$", line.strip()):
                break
            filtered.append(line)
        return "\n".join(filtered).strip()

    def _parse_params(self, command: str, rest: str) -> Dict:
        """根据命令类型解析参数"""
        if command in ("done", "cancel"):
            return {}
        if command == "note":
            return {"content": rest.strip()}
        if command == "remind":
            return self._parse_remind_params(rest)
        return {}

    def _parse_remind_params(self, rest: str) -> Dict:
        """解析 remind 命令参数（使用 dateparser 进行时间解析）"""
        params = {}
        if not rest:
            return params

        # 匹配备注部分：备注：xxx / note: xxx
        note_match = re.search(r"备注[：:]\s*(.+)$", rest)
        if note_match:
            params["note"] = note_match.group(1).strip()
            rest = rest[:note_match.start()].strip()

        # 匹配频次：每天 / 每周 / 每月 / daily / weekly / monthly
        freq_match = re.search(r"(每天|每周|每月|daily|weekly|monthly)", rest, re.IGNORECASE)
        if freq_match:
            params["frequency"] = freq_match.group(1)
            rest = rest[:freq_match.start()] + rest[freq_match.end():]

        # 匹配次数：N次 / N times
        count_match = re.search(r"(\d+)\s*[次c]", rest)
        if count_match:
            params["count"] = int(count_match.group(1))
            rest = rest[:count_match.start()] + rest[count_match.end():]

        # 剩余部分作为时间字符串，使用 dateparser 解析
        time_str = rest.strip()
        if time_str:
            parsed_time = dateparser.parse(time_str, languages=["zh"])
            if parsed_time:
                params["time"] = parsed_time.isoformat()
            else:
                # dateparser 无法解析时，保留原始字符串
                params["time"] = time_str

        return params
```

> **关键变更（v4）：**
> - 使用 `dateparser.parse(time_str, languages=["zh"])` 替代手动正则解析时间
> - 解析命令前先调用 `_filter_quotes_and_signatures()` 过滤邮件引用和签名

- [ ] **Step 5: 运行测试验证通过**

```bash
cd backend && pytest tests/test_email_command_parser.py -v
```

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add backend/app/services/email_command_parser.py backend/tests/test_email_command_parser.py
git add backend/requirements.txt
git commit -m "feat: add EmailCommandParser with dateparser time parsing and quote filtering"
```

---

## Task 6: 提醒邮件改造（Reply-To + Message-ID + 操作说明）

**预估时间：** 25 分钟

**文件：**
- 修改：`backend/app/utils/email.py`（`build_reminder_email` 函数）

- [ ] **Step 1: 写测试**

```python
"""测试提醒邮件改造"""
from app.utils.email import build_reminder_email
from app.core.config import settings
import hmac
import hashlib


def test_reminder_email_has_reply_to():
    """测试提醒邮件包含带 HMAC 签名的 Reply-To"""
    msg = build_reminder_email(
        task_id=42,
        task_title="测试任务",
        remind_message="该完成任务了"
    )
    reply_to = msg.get("Reply-To")
    assert reply_to is not None

    # 验证 Reply-To 地址格式
    sig = hmac.new(
        settings.EMAIL_REPLY_SECRET.encode(),
        b"42",
        hashlib.sha256
    ).hexdigest()[:16]
    expected = f"reply-42-{sig}@{settings.EMAIL_REPLY_DOMAIN}"
    assert reply_to == expected


def test_reminder_email_has_message_id():
    """测试提醒邮件包含 Message-ID"""
    msg = build_reminder_email(
        task_id=42,
        task_title="测试任务",
        remind_message="该完成任务了"
    )
    message_id = msg.get("Message-ID")
    assert message_id is not None
    # 格式: <task-{task_id}-{timestamp}@{EMAIL_REPLY_DOMAIN}>
    assert "task-42-" in message_id
    assert settings.EMAIL_REPLY_DOMAIN in message_id


def test_reminder_email_instructions():
    """测试提醒邮件包含操作说明（取代旧的'请勿回复'）"""
    msg = build_reminder_email(
        task_id=42,
        task_title="测试任务",
        remind_message="该完成任务了"
    )
    body = msg.get_payload(decode=True).decode("utf-8") if msg.get_payload() else str(msg)
    # 应包含操作说明文字
    assert "直接回复此邮件即可操作任务" in body
    assert "请勿回复" not in body
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd backend && pytest tests/test_reminder_email.py -v
```

Expected: FAIL

- [ ] **Step 3: 修改 build_reminder_email 函数**

在 `backend/app/utils/email.py` 中找到 `build_reminder_email` 函数（或新增），修改为：

```python
"""邮件工具函数"""
import hmac
import hashlib
import time
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import settings


def build_reminder_email(task_id: int, task_title: str, remind_message: str) -> MIMEMultipart:
    """
    构建提醒邮件，包含：
    - Reply-To 头（带 HMAC 签名地址）
    - Message-ID 头（用于确认邮件引用）
    - 操作说明文字（取代旧的"请勿回复"）
    """
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"提醒：{task_title}"

    # 生成 Message-ID: <task-{task_id}-{timestamp}@{EMAIL_REPLY_DOMAIN}>
    timestamp = int(time.time())
    message_id = f"<task-{task_id}-{timestamp}@{settings.EMAIL_REPLY_DOMAIN}>"
    msg["Message-ID"] = message_id

    # 生成 Reply-To 地址（带 HMAC 签名）
    sig = hmac.new(
        settings.EMAIL_REPLY_SECRET.encode(),
        str(task_id).encode(),
        hashlib.sha256
    ).hexdigest()[:16]
    reply_to_addr = f"reply-{task_id}-{sig}@{settings.EMAIL_REPLY_DOMAIN}"
    msg["Reply-To"] = reply_to_addr

    # 邮件正文
    text_body = f"""{remind_message}

---
任务：{task_title}

直接回复此邮件即可操作任务（支持：完成 / 取消 / 回复 xxx / 提醒 时间 频次 次数）
"""

    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    return msg
```

> **关键变更（v4）：**
> - 新增 `Reply-To` 头，值为 HMAC 签名的回复地址
> - 新增 `Message-ID` 头，格式 `<task-{task_id}-{timestamp}@{domain}>`
> - "请勿回复"改为操作说明：`直接回复此邮件即可操作任务（支持：完成 / 取消 / 回复 xxx / 提醒 时间 频次 次数）`

- [ ] **Step 4: 运行测试验证通过**

```bash
cd backend && pytest tests/test_reminder_email.py -v
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/utils/email.py backend/tests/test_reminder_email.py
git commit -m "feat: add Reply-To with HMAC, Message-ID, and operation instructions to reminder email"
```

---

## Task 7: 创建任务邮件服务（编排层）

**预估时间：** 30 分钟

**文件：**
- 创建：`backend/app/services/task_email_service.py`
- 创建：`backend/tests/test_task_email_service.py`

- [ ] **Step 1: 写测试**

```python
"""测试 TaskEmailService"""
import pytest
from datetime import datetime, timedelta
from app.services.task_email_service import TaskEmailService
from app.models.email_reply_record import EmailReplyRecord
from app.models.task import Task
from app.models.user import User


def test_process_done_command(mocker, db_session):
    """测试处理完成命令"""
    # Mock TaskService.complete_task(task, db) 签名
    mock_task = Task(id=1, title="测试任务", user_id=1, status=0)
    mock_complete = mocker.patch(
        "app.services.task_email_service.TaskService.complete_task",
        return_value=mock_task
    )
    service = TaskEmailService()
    result = service.process_email_reply(
        task_id=1,
        sender_email="user@example.com",
        raw_content="完成",
        db=db_session
    )
    assert result["success"] is True
    assert result["command"] == "done"


def test_process_cancel_uses_soft_delete(mocker, db_session):
    """测试取消命令使用 soft_delete_task 而非 delete_task"""
    mock_task = Task(id=1, title="测试任务", user_id=1, status=0)
    mock_soft_delete = mocker.patch(
        "app.services.task_email_service.TaskService.soft_delete_task",
        return_value=mock_task
    )
    service = TaskEmailService()
    result = service.process_email_reply(
        task_id=1,
        sender_email="user@example.com",
        raw_content="取消",
        db=db_session
    )
    assert result["success"] is True
    assert result["command"] == "cancel"
    mock_soft_delete.assert_called_once()


def test_process_note_updates_completion_comment(mocker, db_session):
    """测试回复命令直接追加到 task.completion_comment"""
    mock_task = Task(id=1, title="测试任务", user_id=1, status=0, completion_comment=None)
    mocker.patch(
        "app.services.task_email_service.TaskService.get_task",
        return_value=mock_task
    )
    mocker.patch("app.services.task_email_service.send_email")
    service = TaskEmailService()
    result = service.process_email_reply(
        task_id=1,
        sender_email="user@example.com",
        raw_content="回复 你好，已收到",
        db=db_session
    )
    assert result["success"] is True
    assert result["command"] == "note"
    # 验证 completion_comment 被追加
    assert "你好，已收到" in mock_task.completion_comment


def test_idempotent_protection(mocker, db_session):
    """测试幂等保护：30分钟内相同 task_id + command 不重复处理"""
    # 插入一条近期记录
    recent_record = EmailReplyRecord(
        task_id=1, user_id=1, command="done",
        raw_content="完成", reply_type="success",
        created_at=datetime.utcnow()
    )
    db_session.add(recent_record)
    db_session.commit()

    service = TaskEmailService()
    result = service.process_email_reply(
        task_id=1,
        sender_email="user@example.com",
        raw_content="完成",
        db=db_session
    )
    assert result["success"] is False
    assert "重复" in result["message"]


def test_rate_limiting(mocker, db_session):
    """测试频率限制：1小时内同一 task_id 最多 10 条"""
    for i in range(10):
        record = EmailReplyRecord(
            task_id=1, user_id=1, command="note",
            raw_content=f"备注{i}", reply_type="success",
            created_at=datetime.utcnow()
        )
        db_session.add(record)
    db_session.commit()

    service = TaskEmailService()
    result = service.process_email_reply(
        task_id=1,
        sender_email="user@example.com",
        raw_content="回复 新备注",
        db=db_session
    )
    assert result["success"] is False
    assert "频率" in result["message"]


def test_sender_email_verification(mocker, db_session):
    """测试发件人邮箱验证：sender 必须匹配 task.user_id 对应的 user.email"""
    mock_task = Task(id=1, title="测试任务", user_id=1, status=0)
    mocker.patch(
        "app.services.task_email_service.TaskService.get_task",
        return_value=mock_task
    )
    mock_user = User(id=1, email="real_owner@example.com")
    mocker.patch(
        "app.services.task_email_service.get_user_by_id",
        return_value=mock_user
    )

    service = TaskEmailService()
    # 发件人邮箱不匹配
    result = service.process_email_reply(
        task_id=1,
        sender_email="wrong@example.com",
        raw_content="完成",
        db=db_session
    )
    assert result["success"] is False
    assert "邮箱" in result["message"]
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd backend && pytest tests/test_task_email_service.py -v
```

Expected: FAIL

- [ ] **Step 3: 写服务代码**

```python
"""任务邮件服务（编排层）"""
import json
import time
from datetime import datetime, timedelta
from typing import Dict, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func as sql_func
from app.services.email_command_parser import EmailCommandParser
from app.services.email_receiver import EmailReceiver
from app.models.email_reply_record import EmailReplyRecord
from app.models.task import Task
from app.models.user import User
from app.utils.email import send_email
from app.core.config import settings


class TaskEmailService:
    """处理邮件回复的业务编排层"""

    def __init__(self):
        self.parser = EmailCommandParser()
        self.receiver = EmailReceiver()

    def process_email_reply(
        self,
        task_id: int,
        sender_email: str,
        raw_content: str,
        db: Session,
        original_message_id: Optional[str] = None
    ) -> Dict:
        """
        处理邮件回复的完整流程：
        1. 发件人验证
        2. 幂等检查
        3. 频率限制
        4. 解析命令
        5. 执行业务
        6. 记录回复
        7. 发送确认邮件
        """
        from app.services.task_service import TaskService
        task_service = TaskService()

        # --- 查询任务 ---
        task = task_service.get_task(task_id)
        if not task:
            return {"success": False, "command": None, "message": "任务不存在"}

        user_id = task.user_id

        # --- 发件人邮箱验证 ---
        user = self._get_user_by_id(user_id, db)
        if not user or not user.email:
            return {"success": False, "command": None, "message": "用户邮箱未配置"}
        if user.email.lower() != sender_email.lower():
            return {
                "success": False,
                "command": None,
                "message": f"发件人邮箱不匹配：任务所属用户邮箱为 {user.email}"
            }

        # --- 幂等保护：30分钟内相同 task_id + command 不重复处理 ---
        parsed = self.parser.parse(raw_content)
        command = parsed["command"]
        params = parsed["params"]

        is_duplicate = self._check_idempotent(task_id, command, db)
        if is_duplicate:
            return {
                "success": False,
                "command": command,
                "message": "重复操作：30分钟内已处理过相同命令"
            }

        # --- 频率限制：1小时内同一 task_id 最多 10 条 ---
        is_rate_limited = self._check_rate_limit(task_id, db)
        if is_rate_limited:
            return {
                "success": False,
                "command": command,
                "message": "频率限制：1小时内已处理超过10条回复"
            }

        # --- 执行业务命令 ---
        result = self._execute_command(task, db, command, params, task_service)

        # --- 记录邮件回复 ---
        self._save_reply_record(
            task_id=task_id,
            user_id=user_id,
            command=command,
            raw_content=raw_content[:2000] if raw_content else "",
            params=params,
            result=result,
            db=db
        )

        # --- 更新 Task 模型统计字段 ---
        task.email_reply_count = (task.email_reply_count or 0) + 1
        task.last_reply_at = datetime.utcnow()
        task.last_reply_command = command
        db.commit()

        # --- 发送确认邮件 ---
        if user.email:
            self._send_confirmation_email(
                user_email=user.email,
                task_id=task_id,
                task_title=task.title,
                command=command,
                result=result,
                params=params,
                original_message_id=original_message_id
            )

        return result

    def _get_user_by_id(self, user_id: int, db: Session) -> Optional[User]:
        """查询用户"""
        return db.query(User).filter(User.id == user_id).first()

    def _check_idempotent(self, task_id: int, command: str, db: Session) -> bool:
        """检查30分钟内是否有相同 task_id + command 的记录"""
        thirty_min_ago = datetime.utcnow() - timedelta(minutes=30)
        count = db.query(EmailReplyRecord).filter(
            EmailReplyRecord.task_id == task_id,
            EmailReplyRecord.command == command,
            EmailReplyRecord.created_at >= thirty_min_ago,
            EmailReplyRecord.reply_type == "success"
        ).count()
        return count > 0

    def _check_rate_limit(self, task_id: int, db: Session) -> bool:
        """检查1小时内同一 task_id 是否超过10条"""
        one_hour_ago = datetime.utcnow() - timedelta(hours=1)
        count = db.query(EmailReplyRecord).filter(
            EmailReplyRecord.task_id == task_id,
            EmailReplyRecord.created_at >= one_hour_ago
        ).count()
        return count >= 10

    def _execute_command(
        self,
        task: Task,
        db: Session,
        command: str,
        params: Dict,
        task_service
    ) -> Dict:
        """执行命令"""
        if command == "done":
            # TaskService.complete_task(task, db) — 传入 Task 对象 + db session
            updated_task = task_service.complete_task(task, db)
            return {
                "success": True,
                "command": "done",
                "task": updated_task,
                "message": "任务已完成"
            }

        elif command == "cancel":
            # 使用 soft_delete_task，不使用 delete_task
            updated_task = task_service.soft_delete_task(task, db)
            return {
                "success": True,
                "command": "cancel",
                "task": updated_task,
                "message": "任务已取消"
            }

        elif command == "note":
            content = params.get("content", "")
            # 直接追加到 task.completion_comment（不存在 add_reply_note 方法）
            if task.completion_comment:
                task.completion_comment += f"\n{content}"
            else:
                task.completion_comment = content
            db.commit()
            return {
                "success": True,
                "command": "note",
                "task": task,
                "message": "备注已记录"
            }

        elif command == "remind":
            from app.services.reminder_service import ReminderService
            reminder_service = ReminderService()

            time_str = params.get("time", "")
            frequency = params.get("frequency", "")
            count = params.get("count", 1)
            note = params.get("note", "")

            reminder = reminder_service.create_reminder(
                task_id=task.id,
                user_id=task.user_id,
                remind_time_str=time_str,
                frequency=frequency,
                count=count,
                db=db
            )

            # 如果有备注，追加到 completion_comment
            if note:
                if task.completion_comment:
                    task.completion_comment += f"\n{note}"
                else:
                    task.completion_comment = note
                db.commit()

            return {
                "success": True,
                "command": "remind",
                "message": f"已设置提醒：{time_str} {frequency} {count}次",
                "reminder": reminder
            }

        return {"success": False, "command": command, "message": "未知命令"}

    def _save_reply_record(
        self,
        task_id: int,
        user_id: int,
        command: str,
        raw_content: str,
        params: Dict,
        result: Dict,
        db: Session
    ):
        """保存邮件回复记录（parsed_params 为 JSON 类型，直接传 dict）"""
        record = EmailReplyRecord(
            task_id=task_id,
            user_id=user_id,
            command=command,
            raw_content=raw_content,
            parsed_params=params,  # JSON 列，直接传 dict
            reply_type="success" if result.get("success") else "failure",
            error_message=result.get("message", "")[:500]
        )
        db.add(record)
        db.commit()

    def _send_confirmation_email(
        self,
        user_email: str,
        task_id: int,
        task_title: str,
        command: str,
        result: Dict,
        params: Dict,
        original_message_id: Optional[str] = None
    ):
        """
        发送确认邮件
        - 包含 Message-ID
        - 包含 In-Reply-To 引用原始提醒邮件的 Message-ID（实现邮件线程）
        """
        from email.mime.text import MIMEText
        import time as time_mod

        # 构建确认消息
        if command == "done":
            msg_body = f"已完成：{task_title}"
        elif command == "cancel":
            msg_body = f"已取消：{task_title}"
        elif command == "note":
            content = params.get("content", "")
            msg_body = f"已记录备注：{task_title}\n备注内容：{content}"
        elif command == "remind":
            time_str = params.get("time", "")
            frequency = params.get("frequency", "")
            count = params.get("count", 1)
            msg_body = f"已设置提醒：{task_title}\n提醒时间：{time_str}\n频次：{frequency} {count}次"
        else:
            msg_body = f"已处理：{task_title}"

        subject = f"邮件回复确认：{task_title}"

        msg = MIMEText(msg_body, "plain", "utf-8")
        msg["Subject"] = subject
        msg["To"] = user_email
        msg["From"] = settings.SMTP_FROM if hasattr(settings, "SMTP_FROM") else "noreply@" + settings.EMAIL_REPLY_DOMAIN

        # 生成确认邮件的 Message-ID
        timestamp = int(time_mod.time())
        msg["Message-ID"] = f"<confirm-{task_id}-{timestamp}@{settings.EMAIL_REPLY_DOMAIN}>"

        # In-Reply-To 引用原始提醒邮件的 Message-ID，实现邮件线程
        if original_message_id:
            msg["In-Reply-To"] = original_message_id
            msg["References"] = original_message_id

        send_email(user_email, subject, msg_body, msg=msg)
```

> **关键变更（v4）：**
> - `TaskService.complete_task(task, db)` — 传入 Task 对象 + db session，非 task_id + user_id
> - 取消使用 `soft_delete_task`，不用 `delete_task`
> - 备注直接追加 `task.completion_comment`（无 `add_reply_note` 方法）
> - 幂等保护：30分钟内相同 task_id + command 不重复处理
> - 频率限制：1小时内同一 task_id 最多 10 条回复
> - `parsed_params` 直接传 dict（列为 JSON 类型）
> - 发件人邮箱验证：query task.user_id -> user.email -> 对比 sender
> - 确认邮件包含 `Message-ID` 和 `In-Reply-To`（引用原始提醒邮件实现线程）

- [ ] **Step 4: 运行测试验证通过**

```bash
cd backend && pytest tests/test_task_email_service.py -v
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/services/task_email_service.py backend/tests/test_task_email_service.py
git commit -m "feat: add TaskEmailService with idempotent protection, rate limiting, sender verification, and email threading"
```

---

## Task 8: 注册定时邮件检查任务（main.py APScheduler）

**预估时间：** 15 分钟

**文件：**
- 修改：`backend/app/main.py`（注册 APScheduler 任务，参照 `check_reminders` 模式）

> **注意：** 不创建 `app/tasks/email_check.py`（该目录不存在）。定时任务直接注册到 `main.py` 的 APScheduler 中，参照已有的 `check_reminders` 写法。

- [ ] **Step 1: 写测试**

```python
"""测试邮件检查定时任务"""
import asyncio
from unittest.mock import AsyncMock, patch


def test_check_new_emails_function_exists():
    """测试 check_new_emails 函数存在于 main 模块"""
    from app.main import check_new_emails
    assert callable(check_new_emails)


def test_check_new_emails_with_lock(mocker):
    """测试使用 asyncio.Lock 防止并发执行"""
    # Mock 所有依赖
    mock_receiver = mocker.patch("app.main.EmailReceiver")
    mock_receiver.return_value.fetch_new_emails.return_value = []

    from app.main import check_new_emails
    # 调用不应抛错
    result = asyncio.get_event_loop().run_until_complete(check_new_emails())
    assert result is not None
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd backend && pytest tests/test_email_scheduler.py -v
```

Expected: FAIL — `ImportError: cannot import name 'check_new_emails'`

- [ ] **Step 3: 在 main.py 中添加定时任务**

在 `backend/app/main.py` 中，参照 `check_reminders` 的模式添加：

```python
# ===== 在文件顶部导入区添加 =====
import asyncio
from app.services.email_receiver import EmailReceiver
from app.services.task_email_service import TaskEmailService
from app.db.session import SessionLocal

# 邮件检查并发锁
_email_check_lock = asyncio.Lock()


# ===== 在 APScheduler 注册区域添加（与 check_reminders 同级） =====

async def check_new_emails():
    """
    定时检查新邮件并处理回复
    注册到 APScheduler，间隔由 settings.EMAIL_CHECK_INTERVAL 控制
    使用 asyncio.Lock() 防止并发执行
    """
    if _email_check_lock.locked():
        print("[EmailCheck] Previous check still running, skipping...")
        return {"status": "skipped", "reason": "previous_running"}

    async with _email_check_lock:
        processed = 0
        failed = 0

        try:
            receiver = EmailReceiver()
            service = TaskEmailService()
            emails = receiver.fetch_new_emails()

            for email_data in emails:
                try:
                    # 提取任务 ID
                    task_id = receiver.extract_task_id(email_data.get("to", ""))
                    if not task_id:
                        print(f"[EmailCheck] No valid task_id in to: {email_data.get('to')}")
                        continue

                    db = SessionLocal()
                    try:
                        result = service.process_email_reply(
                            task_id=task_id,
                            sender_email=email_data.get("from", ""),
                            raw_content=email_data.get("body", ""),
                            db=db,
                            original_message_id=email_data.get("message_id")
                        )
                        if result.get("success"):
                            processed += 1
                        else:
                            failed += 1
                            print(f"[EmailCheck] Process failed for task {task_id}: {result.get('message')}")
                    finally:
                        db.close()

                except Exception as e:
                    print(f"[EmailCheck] Failed to process email: {e}")
                    failed += 1

        except Exception as e:
            print(f"[EmailCheck] Task failed: {e}")

        result = {"processed": processed, "failed": failed}
        print(f"[EmailCheck] Completed: {result}")
        return result


# ===== 在 scheduler 注册处添加 =====
# scheduler.add_job(check_new_emails, 'interval', seconds=settings.EMAIL_CHECK_INTERVAL, id='check_new_emails')
```

> **关键变更（v4）：**
> - 直接注册在 `main.py` 的 APScheduler 中，不创建 `app/tasks/email_check.py`
> - 使用 `asyncio.Lock()` 防止并发执行
> - 遵循已有 `check_reminders` 的模式

- [ ] **Step 4: 运行测试验证通过**

```bash
cd backend && pytest tests/test_email_scheduler.py -v
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/main.py backend/tests/test_email_scheduler.py
git commit -m "feat: register email check scheduled task in main.py with asyncio.Lock"
```

---

## Task 9: 邮件配置 API（扩展现有路由）

**预估时间：** 20 分钟

**文件：**
- 修改：`backend/app/api/v1/users.py` 或 `backend/app/api/v1/notifications.py`（扩展已有路由文件）
- 创建：`backend/tests/test_email_api.py`

> **注意：** 不创建新的 `email_config.py`，而是在已有的 API 路由文件中添加邮件绑定端点。同时移除旧版 QQ 邮箱限制。

- [ ] **Step 1: 写测试**

```python
"""测试邮件绑定 API"""


def test_bind_email(client, auth_headers):
    """测试绑定邮箱"""
    response = client.post(
        "/api/v1/users/email/bind",
        json={"email": "test@example.com"},
        headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 200
    assert data["data"]["email"] == "test@example.com"


def test_bind_email_not_qq_only(client, auth_headers):
    """测试不再限制只能绑定 QQ 邮箱"""
    response = client.post(
        "/api/v1/users/email/bind",
        json={"email": "user@gmail.com"},
        headers=auth_headers
    )
    assert response.status_code == 200


def test_get_email_status(client, auth_headers):
    """测试获取邮箱绑定状态"""
    response = client.get(
        "/api/v1/users/email/status",
        headers=auth_headers
    )
    assert response.status_code == 200
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd backend && pytest tests/test_email_api.py -v
```

Expected: FAIL

- [ ] **Step 3: 在已有路由文件中添加端点**

在 `backend/app/api/v1/users.py`（或 `notifications.py`）中添加：

```python
# ===== 在已有文件中添加以下端点 =====

from pydantic import BaseModel
from app.core.config import settings


class BindEmailRequest(BaseModel):
    email: str


@router.post("/email/bind")
def bind_user_email(
    request: BindEmailRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """绑定用户邮箱用于接收邮件回复（不限邮箱类型）"""
    from app.models.user import User
    import re

    # 基本邮箱格式验证（不再限制 QQ 邮箱）
    if not re.match(r"[^@]+@[^@]+\.[^@]+", request.email):
        raise HTTPException(status_code=400, detail="邮箱格式不正确")

    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    user.email = request.email
    db.commit()

    return {
        "code": 200,
        "message": "邮箱绑定成功",
        "data": {"email": request.email}
    }


@router.get("/email/status")
def get_email_status(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """获取邮箱绑定状态"""
    from app.models.user import User

    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    return {
        "code": 200,
        "message": "success",
        "data": {
            "email": user.email or "",
            "imap_configured": bool(
                user.email
                and settings.IMAP_USER
                and settings.IMAP_PASSWORD
            )
        }
    }
```

> **关键变更（v4）：**
> - 扩展现有 `users.py` 或 `notifications.py`，不新建 `email_config.py`
> - 移除 `@qq.com` 限制，支持任意邮箱绑定

- [ ] **Step 4: 运行测试验证通过**

```bash
cd backend && pytest tests/test_email_api.py -v
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/api/v1/users.py backend/tests/test_email_api.py
git commit -m "feat: add email binding API in existing routes, remove QQ-only restriction"
```

---

## Task 10: 集成测试

**预估时间：** 25 分钟

**文件：**
- 创建：`backend/tests/test_email_integration.py`

- [ ] **Step 1: 写集成测试**

```python
"""邮件回复功能集成测试"""
import hmac
import hashlib
from app.core.config import settings
from app.services.email_receiver import EmailReceiver
from app.services.email_command_parser import EmailCommandParser
from app.services.task_email_service import TaskEmailService
from app.models.email_reply_record import EmailReplyRecord
from app.models.task import Task


def test_full_email_reply_flow_done(client, auth_headers, db_session, mocker):
    """完整流程：创建任务 → 模拟回复邮件 → 处理完成 → 验证状态"""
    # 1. Mock 邮件发送
    mocker.patch("app.services.task_email_service.send_email")

    # 2. 创建任务
    task_response = client.post(
        "/api/v1/tasks",
        json={"title": "集成测试-完成命令"},
        headers=auth_headers
    )
    assert task_response.status_code == 200
    task_id = task_response.json()["data"]["id"]

    # 3. 模拟处理邮件回复
    service = TaskEmailService()
    result = service.process_email_reply(
        task_id=task_id,
        sender_email="test@example.com",  # 需与用户邮箱匹配
        raw_content="完成",
        db=db_session
    )

    assert result["success"] is True
    assert result["command"] == "done"

    # 4. 验证 EmailReplyRecord 被创建
    records = db_session.query(EmailReplyRecord).filter(
        EmailReplyRecord.task_id == task_id
    ).all()
    assert len(records) >= 1
    assert records[0].command == "done"
    assert records[0].parsed_params == {}  # JSON 类型


def test_full_email_reply_flow_note(client, auth_headers, db_session, mocker):
    """完整流程：创建任务 → 回复添加备注 → 验证 completion_comment"""
    mocker.patch("app.services.task_email_service.send_email")

    task_response = client.post(
        "/api/v1/tasks",
        json={"title": "集成测试-备注命令"},
        headers=auth_headers
    )
    task_id = task_response.json()["data"]["id"]

    service = TaskEmailService()
    result = service.process_email_reply(
        task_id=task_id,
        sender_email="test@example.com",
        raw_content="回复 这是第一条备注",
        db=db_session
    )
    assert result["success"] is True
    assert result["command"] == "note"

    # 再追加一条
    result2 = service.process_email_reply(
        task_id=task_id,
        sender_email="test@example.com",
        raw_content="回复 这是第二条备注",
        db=db_session
    )
    assert result2["success"] is True


def test_hmac_reply_address_roundtrip():
    """测试 HMAC 签名地址的生成和解析闭环"""
    receiver = EmailReceiver()

    # 生成地址
    task_id = 99
    addr = receiver.generate_reply_address(task_id)

    # 解析回来
    extracted_id = receiver.extract_task_id(addr)
    assert extracted_id == task_id

    # 篡改签名后应失败
    tampered = addr.replace(addr.split("-")[-1].split("@")[0], "0" * 16)
    assert receiver.extract_task_id(tampered) is None


def test_command_parser_with_dateparser():
    """测试命令解析器 + dateparser 集成"""
    parser = EmailCommandParser()

    # 中文时间
    result = parser.parse("提醒 明天上午10点 每天 3次")
    assert result["command"] == "remind"
    assert result["params"]["time"] is not None
    assert result["params"]["frequency"] == "每天"
    assert result["params"]["count"] == 3


def test_reminder_email_has_reply_to_and_message_id():
    """测试提醒邮件包含 Reply-To 和 Message-ID"""
    from app.utils.email import build_reminder_email

    msg = build_reminder_email(
        task_id=42,
        task_title="测试任务",
        remind_message="该完成任务了"
    )

    reply_to = msg.get("Reply-To")
    message_id = msg.get("Message-ID")

    assert reply_to is not None
    assert "reply-42-" in reply_to
    assert message_id is not None
    assert "task-42-" in message_id


def test_confirmation_email_threading(mocker):
    """测试确认邮件包含 In-Reply-To 实现线程"""
    mocker.patch("app.services.task_email_service.send_email")

    from email.mime.text import MIMEText
    # 验证 _send_confirmation_email 传入了 In-Reply-To
    service = TaskEmailService()
    # 直接调用内部方法测试
    original_msg_id = "<task-42-12345@yourdomain.com>"

    # Mock send_email 以捕获参数
    mock_send = mocker.patch("app.services.task_email_service.send_email")
    service._send_confirmation_email(
        user_email="test@example.com",
        task_id=42,
        task_title="测试",
        command="done",
        result={"success": True},
        params={},
        original_message_id=original_msg_id
    )
    # 验证 send_email 被调用
    mock_send.assert_called_once()
```

- [ ] **Step 2: 运行集成测试**

```bash
cd backend && pytest tests/test_email_integration.py -v
```

Expected: PASS

- [ ] **Step 3: 运行全部邮件相关测试**

```bash
cd backend && pytest tests/test_email_reply_record.py tests/test_email_receiver.py tests/test_email_command_parser.py tests/test_reminder_email.py tests/test_task_email_service.py tests/test_email_scheduler.py tests/test_email_api.py tests/test_email_integration.py -v
```

Expected: ALL PASS

- [ ] **Step 4: 提交**

```bash
git add backend/tests/test_email_integration.py
git commit -m "feat: add email reply integration tests"
```

---

## 依赖关系图

```
阶段 1（并行）
┌─────────────────────────────────────────────┐
│ Task 1 (配置文件)                             │
│ Task 2 (EmailReplyRecord 模型 + 迁移)         │
│ Task 3 (Task 模型扩展字段)                     │
└─────────────────────────────────────────────┘
                    ↓
阶段 2（并行）
┌─────────────────────────────────────────────┐
│ Task 4 (IMAP 邮件拉取服务)                     │
│ Task 5 (邮件命令解析器 + dateparser)           │
│ Task 6 (提醒邮件改造)                          │
└─────────────────────────────────────────────┘
                    ↓
阶段 3
┌─────────────────────────────────────────────┐
│ Task 7 (TaskEmailService 编排层)              │
│   ← 依赖 Task 2 (模型)                       │
│   ← 依赖 Task 5 (解析器)                     │
│   ← 依赖 Task 6 (提醒邮件)                    │
└─────────────────────────────────────────────┘
                    ↓
阶段 4
┌─────────────────────────────────────────────┐
│ Task 8 (定时调度 main.py)                     │
│   ← 依赖 Task 4 (IMAP)                      │
│   ← 依赖 Task 7 (编排层)                     │
└─────────────────────────────────────────────┘
                    ↓
阶段 5
┌─────────────────────────────────────────────┐
│ Task 9  (邮件 API)                           │
│ Task 10 (集成测试) ← 依赖 Task 1~9           │
└─────────────────────────────────────────────┘
```

---

## 实现顺序总结

| 阶段 | 任务 | 并行 | 预估时间 |
|------|------|------|----------|
| 1 | Task 1（配置）+ Task 2（数据模型）+ Task 3（Task 扩展） | 可并行 | 25 min |
| 2 | Task 4（IMAP）+ Task 5（解析器）+ Task 6（提醒邮件） | 可并行 | 40 min |
| 3 | Task 7（编排层） | 串行 | 30 min |
| 4 | Task 8（定时调度） | 串行 | 15 min |
| 5 | Task 9（API）+ Task 10（集成测试） | 串行 | 45 min |

**总计：** 约 4 ~ 4.5 小时

---

**计划完成，所有任务已分解（已同步至 v4 主文档）。**

每个 Task 的步骤都是小步操作，完成后立即提交，保证小步前进、持续可验证。
