"""Agent Runtime（P1：FakeLLM 澄清 + 工具鉴权 + 只读工具；阶段 3：记忆 + 知识召回注入）"""
import re
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.agent import AgentDefinition, AgentMessage, AgentSession
from app.models.project import Project
from app.models.tree import TreeNode
from app.services.acl import AclService
from app.services.knowledge.search import search_chunks

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


def _source_label(item: dict) -> str:
    """知识块来源展示：wiki:{id} / file:{id}，附 meta 中的标题/文件名/页码（若有）。"""
    meta = item.get("meta") or {}
    source_id = item.get("source_id")
    st = item.get("source_type")
    if st == "wiki_entry":
        label = f"wiki:{source_id}"
    elif st == "evidence_file":
        label = f"file:{source_id}"
    else:
        label = f"{st}:{source_id}"
    extras = []
    title = meta.get("title") or meta.get("original_name")
    if title:
        extras.append(str(title))
    page = meta.get("page") if meta.get("page") is not None else meta.get("page_no")
    if page is not None:
        extras.append(f"第{page}页")
    if extras:
        label = "{}（{}）".format(label, " · ".join(extras))
    return label


def _retrieval_meta(items: list[dict]) -> list[dict]:
    """写入助手消息 meta_json["retrieval"] 的召回明细（文本截断前 100 字）。"""
    return [
        {
            "chunk_id": c["chunk_id"],
            "source": _source_label(c),
            "score": c["score"],
            "text": (c["chunk_text"] or "")[:100],
        }
        for c in items
    ]


def _retrieval_system_block(items: list[dict]) -> str:
    """召回注入的 system 块：逐条标注来源，供 LLM 参考并可在回答中引用。"""
    lines = ["以下是项目知识库中可能相关的资料（含来源），回答时可参考并注明来源："]
    for i, c in enumerate(items, start=1):
        lines.append(f"{i}. [{_source_label(c)}] {c['chunk_text']}")
    return "\n".join(lines)


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
            if not qtext:
                return {"ok": True, "tool": tool_name, "data": {"items": []}}
            # SQLite FTS5 查询失败时检索层会内部 rollback 再降级 LIKE：
            # 先提交本 session 已有写入（如 chat 刚落的用户消息），防止被一并回滚。
            await db.commit()
            chunks = await search_chunks(
                db, company_id=company_id, project_id=project.id, query=qtext
            )
            return {
                "ok": True,
                "tool": tool_name,
                "data": {
                    "items": [
                        {
                            "chunk_id": c["chunk_id"],
                            "chunk_text": (c["chunk_text"] or "")[:200],
                            "source_type": c["source_type"],
                            "source_id": c["source_id"],
                            "source": _source_label(c),
                            "node_id": c["node_id"],
                            "score": c["score"],
                        }
                        for c in chunks
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

    async def _load_history(
        self, db: AsyncSession, session: AgentSession, *, before_id: int
    ) -> list[AgentMessage]:
        """装载最近 AGENT_HISTORY_LIMIT 条历史（不含当前这句 user）：
        按 id 倒序取再正序排；摘要已覆盖的消息（<= summary_upto_message_id）不再进上下文。"""
        stmt = select(AgentMessage).where(
            AgentMessage.session_id == session.id,
            AgentMessage.id < before_id,
        )
        if session.summary_upto_message_id:
            stmt = stmt.where(AgentMessage.id > session.summary_upto_message_id)
        stmt = stmt.order_by(AgentMessage.id.desc()).limit(settings.AGENT_HISTORY_LIMIT)
        rows = (await db.execute(stmt)).scalars().all()
        return list(reversed(rows))

    async def _maybe_update_summary(
        self,
        db: AsyncSession,
        *,
        session: AgentSession,
        llm,
        chat_completion,
        meta: dict,
    ) -> None:
        """滚动摘要：summary_upto_message_id 之后的消息超过阈值时用 LLM 压缩更新。
        任何异常静默吞掉（meta 记 summary_error），绝不阻断对话。"""
        try:
            upto = session.summary_upto_message_id or 0
            n = (
                await db.execute(
                    select(func.count())
                    .select_from(AgentMessage)
                    .where(
                        AgentMessage.session_id == session.id,
                        AgentMessage.id > upto,
                    )
                )
            ).scalar() or 0
            if int(n) <= settings.AGENT_SUMMARY_THRESHOLD:
                return
            rows = (
                await db.execute(
                    select(AgentMessage)
                    .where(
                        AgentMessage.session_id == session.id,
                        AgentMessage.id > upto,
                    )
                    .order_by(AgentMessage.id.asc())
                )
            ).scalars().all()
            lines = [
                f"{m.role}: {m.content}" for m in rows if m.role in ("user", "assistant")
            ]
            old_summary = session.summary_text or "（无）"
            prompt = (
                "把旧摘要与新增消息压缩为 300 字以内中文要点，"
                "保留任务、结论、关键数字与未决事项。\n"
                f"旧摘要：{old_summary}\n"
                "新增消息：\n" + "\n".join(lines)
            )
            r = await chat_completion(
                llm,
                messages=[
                    {"role": "system", "content": "你是对话摘要助手，只输出摘要正文。"},
                    {"role": "user", "content": prompt},
                ],
            )
            if r.get("ok") and r.get("content"):
                session.summary_text = str(r["content"]).strip()
                session.summary_upto_message_id = rows[-1].id if rows else upto
                await db.flush()
            else:
                meta["summary_error"] = str(r.get("error") or "summary_failed")
        except Exception as e:
            meta["summary_error"] = str(e)

    async def chat(
        self,
        db: AsyncSession,
        *,
        session: AgentSession,
        user_text: str,
    ) -> AgentMessage:
        user_msg = AgentMessage(session_id=session.id, role="user", content=user_text)
        db.add(user_msg)
        await db.flush()
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
            # 项目会话：先做知识召回（LLM 与 Fake 路径都记 meta，仅 LLM 路径注入 prompt）。
            # 会话本来就是本人发起，这里仍防御性校验 progress.read（检索层不做 ACL）。
            retrieval_items: list[dict] | None = None
            if pid and uid and cid:
                try:
                    if await self.acl.can(
                        db, uid, cid, "progress.read", project_id=pid
                    ):
                        # SQLite FTS5 失败时检索层会内部 rollback 再降级 LIKE：
                        # 先提交刚落的用户消息（含上游 flush 的会话行），防止被一并回滚。
                        await db.commit()
                        retrieval_items = await search_chunks(
                            db, company_id=cid, project_id=pid, query=text
                        )
                except Exception as e:
                    retrieval_items = []
                    meta["retrieval_error"] = str(e)
            if retrieval_items is not None:
                meta["retrieval"] = _retrieval_meta(retrieval_items)

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
                    messages: list[dict] = [{"role": "system", "content": system_prompt}]
                    if session.summary_text:
                        messages.append(
                            {
                                "role": "system",
                                "content": f"以下是此前对话的摘要：{session.summary_text}",
                            }
                        )
                    if retrieval_items:
                        messages.append(
                            {
                                "role": "system",
                                "content": _retrieval_system_block(retrieval_items),
                            }
                        )
                    # 历史消息（role user/assistant 原样，system 跳过；当前这句 user 不重复）
                    history = await self._load_history(db, session, before_id=user_msg.id)
                    for m in history:
                        if m.role in ("user", "assistant"):
                            messages.append({"role": m.role, "content": m.content})
                    messages.append({"role": "user", "content": text})
                    r = await chat_completion(llm, messages=messages)
                    if r.get("ok") and r.get("content"):
                        reply = str(r["content"]).strip()
                        meta["llm"] = {
                            "provider": r.get("provider"),
                            "source": llm.source,
                        }
                        used_llm = True
                        # 对话完成后（LLM 路径）滚动摘要，失败静默不阻断
                        await self._maybe_update_summary(
                            db,
                            session=session,
                            llm=llm,
                            chat_completion=chat_completion,
                            meta=meta,
                        )
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
