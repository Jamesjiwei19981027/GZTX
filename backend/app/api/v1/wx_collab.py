"""微信协作通道：可聊可更新，不可交材料"""
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.collab_errors import CollabError
from app.core.dependencies import CurrentUser, DbSession
from app.models.agent import AgentSession
from app.models.company import CompanyMembership
from app.models.project import Project
from app.schemas.common import ResponseData
from app.services.agent_runtime import AgentRuntime
from sqlalchemy import select

router = APIRouter(prefix="/wx/collab", tags=["小程序协作"])
runtime = AgentRuntime()


class WxCollabChatBody(BaseModel):
    project_id: int | None = None
    node_id: int | None = None
    message: str | None = None
    media_id: str | None = None
    company_id: int | None = None


@router.post("/chat", response_model=ResponseData)
async def wx_collab_chat(body: WxCollabChatBody, db: DbSession, user: CurrentUser):
    """小程序端协作对话"""
    text = (body.message or "").strip()
    if not text and body.media_id:
        # ASR 桩：语音 media → 文本
        from app.services.asr.builtin import BuiltinAsr

        text = await BuiltinAsr().transcribe(body.media_id.encode(), "audio/amr")
        if not text:
            text = f"[voice:{body.media_id}]"
    if not text:
        raise CollabError(422, 42200, "消息不能为空")

    company_id = body.company_id
    if not company_id and body.project_id:
        project = await db.get(Project, body.project_id)
        if project:
            company_id = project.company_id
    if not company_id:
        # fallback: first active membership
        mq = await db.execute(
            select(CompanyMembership).where(
                CompanyMembership.user_id == user.id,
                CompanyMembership.status == "active",
            ).limit(1)
        )
        m = mq.scalar_one_or_none()
        if not m:
            raise CollabError(403, 40302, "非本公司成员")
        company_id = m.company_id
    else:
        mq = await db.execute(
            select(CompanyMembership).where(
                CompanyMembership.company_id == company_id,
                CompanyMembership.user_id == user.id,
                CompanyMembership.status == "active",
            )
        )
        if not mq.scalar_one_or_none():
            raise CollabError(403, 40302, "非本公司成员")

    session = AgentSession(
        company_id=company_id,
        project_id=body.project_id,
        agent_definition_id=None,
        user_id=user.id,
        channel="wechat",
        title=f"wx:{body.node_id or 'general'}",
    )
    db.add(session)
    await db.flush()

    if body.node_id:
        text = f"[node:{body.node_id}] {text}"

    msg = await runtime.chat(db, session=session, user_text=text)
    await db.commit()
    return ResponseData(
        data={
            "session_id": session.id,
            "channel": "wechat",
            "reply": {
                "id": msg.id,
                "role": msg.role,
                "content": msg.content,
            },
            "tools_blocked": ["submit_evidence", "upload_evidence_file"],
        }
    )
