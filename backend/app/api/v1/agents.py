"""智能体 API（P1 最小）"""
from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps_collab import assert_company_write
from app.core.collab_errors import CollabError, fail
from app.core.dependencies import CurrentUser, DbSession, VerifiedUser
from app.models.agent import AgentDefinition, AgentSession
from app.models.company import Company, CompanyMembership
from app.schemas.common import ResponseData
from app.services.agent_runtime import AgentQuotaExceeded, AgentRuntime
from app.services.entitlement import EntitlementService

router = APIRouter(prefix="/agents", tags=["agents"])
runtime = AgentRuntime()


class AgentCreate(BaseModel):
    company_id: int
    name: str = Field(..., min_length=1, max_length=200)
    scene: str = "general"


class ChatBody(BaseModel):
    company_id: int
    project_id: int | None = None
    agent_definition_id: int | None = None
    channel: str = "web"
    message: str


async def _member(db, company_id: int, user_id: int) -> CompanyMembership | None:
    return (
        await db.execute(
            select(CompanyMembership).where(
                CompanyMembership.company_id == company_id,
                CompanyMembership.user_id == user_id,
                CompanyMembership.status == "active",
            )
        )
    ).scalar_one_or_none()


async def _unlocked_feature(db, company_id: int, feature: str) -> Company | None:
    company = await db.get(Company, company_id)
    if not company:
        return None
    svc = EntitlementService()
    if not svc.is_company_unlocked(company):
        return None
    if not svc.has_feature(company, feature):
        return None
    return company


@router.post("")
async def create_agent(body: AgentCreate, db: DbSession, user: CurrentUser):
    if not await _member(db, body.company_id, user.id):
        return fail(403, 40302, "非本公司成员")
    try:
        await assert_company_write(db, body.company_id, feature="agents")
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    try:
        agent = await runtime.create_user_agent(
            db,
            company_id=body.company_id,
            user_id=user.id,
            name=body.name,
            scene=body.scene,
        )
    except AgentQuotaExceeded:
        return fail(409, 40902, "自创智能体超过 5 个")
    await db.commit()
    await db.refresh(agent)
    return ResponseData(
        data={
            "id": agent.id,
            "name": agent.name,
            "kind": agent.kind,
            "scene": agent.scene,
        }
    )


@router.get("")
async def list_agents(company_id: int, db: DbSession, user: CurrentUser):
    if not await _member(db, company_id, user.id):
        return fail(403, 40302, "非本公司成员")
    if not await _unlocked_feature(db, company_id, "agents"):
        return fail(403, 40312, "功能未开通: agents 或 License 无效")
    rows = (
        await db.execute(
            select(AgentDefinition).where(
                AgentDefinition.company_id == company_id,
                AgentDefinition.is_deleted.is_(False),
            )
        )
    ).scalars().all()
    return ResponseData(
        data={
            "items": [
                {"id": a.id, "name": a.name, "kind": a.kind, "scene": a.scene}
                for a in rows
            ]
        }
    )


@router.post("/chat")
async def agent_chat(body: ChatBody, db: DbSession, user: VerifiedUser):
    if not await _member(db, body.company_id, user.id):
        return fail(403, 40302, "非本公司成员")
    if not await _unlocked_feature(db, body.company_id, "agents"):
        return fail(403, 40312, "功能未开通: agents 或 License 无效")
    session = AgentSession(
        company_id=body.company_id,
        project_id=body.project_id,
        agent_definition_id=body.agent_definition_id,
        user_id=user.id,
        channel=body.channel or "web",
        title=body.message[:40],
    )
    db.add(session)
    await db.flush()
    msg = await runtime.chat(db, session=session, user_text=body.message)
    await db.commit()
    return ResponseData(
        data={
            "session_id": session.id,
            "reply": msg.content,
            "channel": session.channel,
            "tool_submit_evidence_allowed": runtime.authorize_tool(
                channel=session.channel, tool_name="submit_evidence"
            ),
        }
    )
