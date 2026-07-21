"""Agent Runtime（P1：FakeLLM 澄清 + 工具鉴权 + 只读工具）"""
import re
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import AgentDefinition, AgentMessage, AgentSession
from app.models.project import Project
from app.models.tree import TreeNode
from app.models.wiki import ProjectWikiEntry
from app.services.acl import AclService

MAX_USER_CREATED = 5

# 场景默认可用工具（高风险需 confirmed）
SCENE_TOOLS = {
    "general": ["get_node", "wiki_search", "list_my_project_links"],
    "progress_update": ["get_node", "wiki_search", "send_notify"],
    "pm": ["get_node", "wiki_search", "send_notify", "nudge_member"],
}

HIGH_RISK_TOOLS = {"send_notify"}

ALLOWED_DELEGATION_ACTIONS = frozenset(
    {
        "progress.read",
        "progress.write_formal",
        "evidence.read",
        "evidence.submit",
        "tree.edit_subtree",
        "wiki.manual_write",
        "review.read",
        "review.confirm",
        "progress.nudge",
        "project.read",
    }
)


class AgentQuotaExceeded(Exception):
    pass


class AgentRuntime:
    def __init__(self):
        self.acl = AclService()

    async def count_user_created(self, db: AsyncSession, company_id: int, user_id: int) -> int:
        q = await db.execute(
            select(func.count())
            .select_from(AgentDefinition)
            .where(
                AgentDefinition.company_id == company_id,
                AgentDefinition.owner_user_id == user_id,
                AgentDefinition.kind == "user_created",
                AgentDefinition.is_deleted.is_(False),
            )
        )
        return int(q.scalar() or 0)

    async def create_user_agent(
        self,
        db: AsyncSession,
        *,
        company_id: int,
        user_id: int,
        name: str,
        scene: str = "general",
        system_prompt: str | None = None,
    ) -> AgentDefinition:
        n = await self.count_user_created(db, company_id, user_id)
        if n >= MAX_USER_CREATED:
            raise AgentQuotaExceeded("自创智能体超过 5 个")
        cfg: dict = {"tools": SCENE_TOOLS.get(scene, SCENE_TOOLS["general"])}
        if system_prompt and system_prompt.strip():
            cfg["system_prompt"] = system_prompt.strip()
        agent = AgentDefinition(
            company_id=company_id,
            owner_user_id=user_id,
            kind="user_created",
            name=name,
            scene=scene,
            config_json=cfg,
        )
        db.add(agent)
        await db.flush()
        return agent

    def authorize_tool(self, *, channel: str, tool_name: str) -> bool:
        """微信通道禁止交材料相关工具。"""
        if channel == "wechat" and tool_name in (
            "submit_evidence",
            "upload_evidence_file",
            "evidence.submit",
        ):
            return False
        return True

    async def invoke_tool(
        self,
        db: AsyncSession,
        *,
        channel: str,
        tool_name: str,
        args: dict,
        confirmed: bool = False,
        user_id: int | None = None,
        company_id: int | None = None,
        session_project_id: int | None = None,
    ) -> dict:
        if not self.authorize_tool(channel=channel, tool_name=tool_name):
            return {"ok": False, "error": "tool_forbidden_on_channel", "tool": tool_name}
        if tool_name in HIGH_RISK_TOOLS and not confirmed:
            return {
                "ok": False,
                "need_confirmation": True,
                "tool": tool_name,
                "message": "高风险操作需 confirmed=true",
            }
        if tool_name == "get_node":
            node_id = args.get("node_id")
            if not node_id:
                return {"ok": False, "error": "node_id_required"}
            if user_id is None or company_id is None:
                return {"ok": False, "error": "auth_context_required"}
            node = await db.get(TreeNode, int(node_id))
            if not node or node.is_deleted:
                return {"ok": False, "error": "node_not_found"}
            if node.company_id != company_id:
                return {"ok": False, "error": "node_not_found"}
            if session_project_id is not None and node.project_id != session_project_id:
                return {"ok": False, "error": "node_out_of_session_scope"}
            if not await self.acl.can(
                db,
                user_id,
                company_id,
                "progress.read",
                project_id=node.project_id,
                node_id=node.id,
            ):
                return {"ok": False, "error": "forbidden"}
            return {
                "ok": True,
                "tool": tool_name,
                "data": {
                    "id": node.id,
                    "title": node.title,
                    "progress_json": node.progress_json,
                    "project_id": node.project_id,
                },
            }
        if tool_name == "wiki_search":
            project_id = args.get("project_id") or session_project_id
            qtext = (args.get("q") or args.get("query") or "").strip()
            if not project_id:
                return {"ok": False, "error": "project_id_required"}
            if user_id is None or company_id is None:
                return {"ok": False, "error": "auth_context_required"}
            project = await db.get(Project, int(project_id))
            if not project or project.company_id != company_id:
                return {"ok": False, "error": "project_not_found"}
            if not await self.acl.can(
                db, user_id, company_id, "progress.read", project_id=project.id
            ):
                return {"ok": False, "error": "forbidden"}
            stmt = select(ProjectWikiEntry).where(
                ProjectWikiEntry.project_id == int(project_id)
            )
            if qtext:
                stmt = stmt.where(
                    ProjectWikiEntry.title.ilike(f"%{qtext}%")
                    | ProjectWikiEntry.body_text.ilike(f"%{qtext}%")
                )
            rows = (await db.execute(stmt.limit(10))).scalars().all()
            return {
                "ok": True,
                "tool": tool_name,
                "data": {
                    "items": [
                        {"id": w.id, "title": w.title, "body_text": (w.body_text or "")[:200]}
                        for w in rows
                    ]
                },
            }
        if tool_name == "send_notify":
            return {
                "ok": True,
                "tool": tool_name,
                "data": {"enqueued": True, "user_ids": args.get("user_ids") or []},
            }
        if tool_name == "nudge_member":
            return {"ok": True, "tool": tool_name, "data": {"nudged": args.get("user_id")}}
        if tool_name == "list_my_project_links":
            return {"ok": True, "tool": tool_name, "data": {"items": []}}
        return {"ok": False, "error": f"unknown_tool:{tool_name}"}

    async def chat(
        self,
        db: AsyncSession,
        *,
        session: AgentSession,
        user_text: str,
    ) -> AgentMessage:
        db.add(AgentMessage(session_id=session.id, role="user", content=user_text))
        text = user_text.strip()
        meta: dict = {}
        uid = session.user_id
        cid = session.company_id
        pid = session.project_id

        # 工具意图：/tool get_node node_id=1
        tool_match = re.match(
            r"^/tool\s+(\w+)(?:\s+(.+))?$", text, re.IGNORECASE
        )
        if tool_match:
            tool_name = tool_match.group(1)
            raw_args = tool_match.group(2) or ""
            args: dict = {}
            for part in raw_args.split():
                if "=" in part:
                    k, v = part.split("=", 1)
                    args[k] = int(v) if v.isdigit() else v
            if "confirmed" in args:
                conf = str(args.pop("confirmed")).lower() in ("1", "true", "yes")
            else:
                conf = False
            result = await self.invoke_tool(
                db,
                channel=session.channel,
                tool_name=tool_name,
                args=args,
                confirmed=conf,
                user_id=uid,
                company_id=cid,
                session_project_id=pid,
            )
            meta["tool_result"] = result
            reply = f"工具 {tool_name}：{result}"
        else:
            # 个人 LLM > 公司 LLM > env > 本地逻辑
            used_llm = False
            try:
                from app.models.user import User
                from app.services.llm_settings import chat_completion, resolve_llm

                chat_user = None
                if uid:
                    chat_user = await db.get(User, uid)
                llm = await resolve_llm(db, company_id=cid, user=chat_user)
                if llm.use_for_agent and llm.is_usable() and llm.provider != "fake":
                    system_prompt = (
                        "你是 WorkTodo 协作助手。简洁中文回答。"
                        "用户可用 [node:ID] 引用节点。"
                    )
                    if session.agent_definition_id:
                        agent_def = await db.get(
                            AgentDefinition, session.agent_definition_id
                        )
                        if agent_def and isinstance(agent_def.config_json, dict):
                            custom = (agent_def.config_json.get("system_prompt") or "").strip()
                            if custom:
                                system_prompt = custom
                    r = await chat_completion(
                        llm,
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": text},
                        ],
                    )
                    if r.get("ok") and r.get("content"):
                        reply = str(r["content"]).strip()
                        meta["llm"] = {
                            "provider": r.get("provider"),
                            "source": llm.source,
                        }
                        used_llm = True
            except Exception as e:
                meta["llm_error"] = str(e)

            if not used_llm:
                # Fake / 本地：若信息不足则澄清，否则回声；尝试解析 [node:N]
                node_m = re.search(r"\[node:(\d+)\]", text)
                if node_m and self.authorize_tool(channel=session.channel, tool_name="get_node"):
                    tr = await self.invoke_tool(
                        db,
                        channel=session.channel,
                        tool_name="get_node",
                        args={"node_id": int(node_m.group(1))},
                        user_id=uid,
                        company_id=cid,
                        session_project_id=pid,
                    )
                    meta["tool_result"] = tr
                    if tr.get("ok"):
                        d = tr["data"]
                        pj = d.get("progress_json") or {}
                        # 反斜杠不能出现在 Python<3.12 的 f-string 表达式内（部署镜像为 3.11）
                        stripped_text = re.sub(r"\[node:\d+\]\s*", "", text)
                        reply = (
                            f"（助手）节点「{d['title']}」正式进度："
                            f"{pj.get('status', '-')} {pj.get('percent', '')}%。"
                            f"原文：{stripped_text}"
                        )
                    else:
                        reply = f"（助手）无法读取节点：{tr.get('error')}"
                elif len(text) < 8:
                    reply = f"已收到：{text}。请补充节点 ID 与完成度（FakeLLM 澄清桩）。"
                else:
                    reply = f"（助手）已理解：{text}"

        if not self.authorize_tool(channel=session.channel, tool_name="submit_evidence"):
            reply += " [当前通道禁止提交材料工具]"
        msg = AgentMessage(
            session_id=session.id, role="assistant", content=reply, meta_json=meta or None
        )
        db.add(msg)
        await db.flush()
        return msg
