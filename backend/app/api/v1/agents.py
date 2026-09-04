"""智能体 API（P1 最小）"""
from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps_collab import assert_company_write
from app.core.collab_errors import CollabError, fail
from app.core.dependencies import CurrentUser, DbSession, CollaborationUser
from app.models.agent import AgentDefinition, AgentSession
from app.models.company import Company, CompanyMembership
from app.schemas.common import ResponseData
from app.services.agent_runtime import AgentQuotaExceeded, AgentRuntime
from app.services.entitlement import EntitlementService

router = APIRouter(prefix="/agents", tags=["agents"])
runtime = AgentRuntime()

DEFAULT_SYSTEM_PROMPT = (
    "你是 WorkTodo 协作助手。简洁中文回答。用户可用 [node:ID] 引用节点。"
)


class AgentCreate(BaseModel):
    company_id: int
    name: str = Field(..., min_length=1, max_length=200)
    scene: str = "general"
    system_prompt: str | None = Field(default=None, max_length=4000)


class AgentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    scene: str | None = Field(default=None, max_length=64)
    system_prompt: str | None = Field(default=None, max_length=4000)


class ChatBody(BaseModel):
    company_id: int
    project_id: int | None = None
    agent_definition_id: int | None = None
    channel: str = "web"
    message: str


def _agent_dto(a: AgentDefinition) -> dict:
    cfg = a.config_json if isinstance(a.config_json, dict) else {}
    return {
        "id": a.id,
        "name": a.name,
        "kind": a.kind,
        "scene": a.scene,
        "owner_user_id": a.owner_user_id,
        "system_prompt": cfg.get("system_prompt") or DEFAULT_SYSTEM_PROMPT,
    }


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


async def _get_owned_agent(
    db, agent_id: int, user_id: int
) -> AgentDefinition | None:
    agent = await db.get(AgentDefinition, agent_id)
    if not agent or agent.is_deleted:
        return None
    if agent.owner_user_id != user_id and agent.kind == "user_created":
        return None
    if agent.kind != "user_created":
        # 公司级智能体暂不允许普通成员改
        return None
    return agent


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
            system_prompt=body.system_prompt,
        )
    except AgentQuotaExceeded:
        return fail(409, 40902, "自创智能体超过 5 个")
    await db.commit()
    await db.refresh(agent)
    return ResponseData(data=_agent_dto(agent))


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
    # 个人智能体：仅展示自己创建的 + 公司级（非 user_created）
    visible = [
        a
        for a in rows
        if a.kind != "user_created" or a.owner_user_id == user.id
    ]
    return ResponseData(data={"items": [_agent_dto(a) for a in visible]})


@router.patch("/{agent_id}")
async def update_agent(
    agent_id: int, body: AgentUpdate, db: DbSession, user: CurrentUser
):
    agent = await _get_owned_agent(db, agent_id, user.id)
    if not agent:
        return fail(404, 40400, "智能体不存在或无权修改")
    if not await _member(db, agent.company_id, user.id):
        return fail(403, 40302, "非本公司成员")
    try:
        await assert_company_write(db, agent.company_id, feature="agents")
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)

    if body.name is not None:
        agent.name = body.name.strip()
    if body.scene is not None:
        agent.scene = body.scene.strip() or "general"
        cfg = dict(agent.config_json or {})
        from app.services.agent_runtime import SCENE_TOOLS

        cfg["tools"] = SCENE_TOOLS.get(agent.scene, SCENE_TOOLS["general"])
        agent.config_json = cfg
        flag_modified(agent, "config_json")
    if body.system_prompt is not None:
        cfg = dict(agent.config_json or {})
        prompt = body.system_prompt.strip()
        cfg["system_prompt"] = prompt or DEFAULT_SYSTEM_PROMPT
        agent.config_json = cfg
        flag_modified(agent, "config_json")

    await db.commit()
    await db.refresh(agent)
    return ResponseData(data=_agent_dto(agent))


@router.delete("/{agent_id}")
async def delete_agent(agent_id: int, db: DbSession, user: CurrentUser):
    agent = await _get_owned_agent(db, agent_id, user.id)
    if not agent:
        return fail(404, 40400, "智能体不存在或无权删除")
    if not await _member(db, agent.company_id, user.id):
        return fail(403, 40302, "非本公司成员")
    try:
        await assert_company_write(db, agent.company_id, feature="agents")
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    agent.is_deleted = True
    await db.commit()
    return ResponseData(data={"id": agent_id, "deleted": True})


@router.post("/chat")
async def agent_chat(body: ChatBody, db: DbSession, user: CollaborationUser):
    if not await _member(db, body.company_id, user.id):
        return fail(403, 40302, "非本公司成员")
    if not await _unlocked_feature(db, body.company_id, "agents"):
        return fail(403, 40312, "功能未开通: agents 或 License 无效")
    if body.agent_definition_id:
        agent = await db.get(AgentDefinition, body.agent_definition_id)
        if (
            not agent
            or agent.is_deleted
            or agent.company_id != body.company_id
            or (agent.kind == "user_created" and agent.owner_user_id != user.id)
        ):
            return fail(404, 40400, "智能体不存在或无权使用")
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
