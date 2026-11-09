"""「记录进展」存为汇报草稿：把一段文字追加进成员本人的汇报草稿。

之前的落点是智能体对话，用户在「我的汇报」里看不到任何东西。现在：

- 追加到本人在该项目下的当前草稿（没有就新建），草稿出现在「我的汇报」；
- 同时把原文写成该成员的 AI 输入（user 消息），让「生成 AI 草稿」仍能引用它。
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.agent import AgentMessage
from app.models.report import AgentReport, AgentReportSource
from app.services.hierarchical_reporting import (
    _ensure_agent_session,
    create_member_report_draft,
    ensure_member_agent_binding,
)


async def append_progress_note_to_draft(
    db: AsyncSession, *, project_id: int, user_id: int, text: str,
    attachments: list[dict] | None = None,
) -> AgentReport:
    note = (text or "").strip()
    if not note:
        raise ValueError("note_empty")
    binding = await ensure_member_agent_binding(db, project_id=project_id, user_id=user_id)
    await db.flush()
    draft = await create_member_report_draft(db, binding_id=binding.id, author_user_id=user_id)

    session = await _ensure_agent_session(db, binding=binding, user_id=user_id)
    message = AgentMessage(
        session_id=session.id,
        role="user",
        content=note,
        meta_json={"from": "record_progress", "report_id": draft.id, **({"attachments": attachments} if attachments else {})},
    )
    db.add(message)
    await db.flush()

    local_now = datetime.now(timezone.utc) + timedelta(hours=settings.USER_TIMEZONE_OFFSET)
    line = f"- {local_now:%m-%d %H:%M} {note}"
    draft.summary_text = f"{draft.summary_text}\n{line}".strip() if draft.summary_text else line
    db.add(
        AgentReportSource(
            report_id=draft.id,
            source_type="agent_message",
            source_id=message.id,
            excerpt=note[:500],
            metadata_json={"project_id": project_id, "role": "user", "from": "record_progress", **({"attachments": attachments} if attachments else {})},
        )
    )
    await db.flush()
    return draft
