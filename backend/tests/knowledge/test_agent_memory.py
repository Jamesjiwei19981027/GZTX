"""智能体记忆：历史进上下文 · 滚动摘要 · 摘要容错 · FakeLLM 路径 retrieval meta · 检索降级不丢写入"""
from sqlalchemy import func, select

import app.services.agent_runtime as agent_runtime_module
import app.services.llm_settings as llm_settings_module
from app.core.config import settings
from app.models.agent import AgentMessage, AgentSession
from app.services.agent_runtime import AgentRuntime
from app.services.llm_settings import ResolvedLlm

MAIN_SYSTEM_KEYWORD = "WorkTodo 协作助手"
SUMMARY_SYSTEM_KEYWORD = "对话摘要助手"


def _usable_llm() -> ResolvedLlm:
    return ResolvedLlm(
        provider="openai_compatible",
        base_url="http://llm.test/v1",
        model="test-model",
        api_key="test-key",
        source="company",
    )


def _fake_llm() -> ResolvedLlm:
    return ResolvedLlm(provider="fake", base_url="", model="fake", api_key="", source="fake")


def _patch_resolve(monkeypatch, llm: ResolvedLlm):
    async def _resolve(db=None, *, company_id=None, user=None):
        return llm

    monkeypatch.setattr(llm_settings_module, "resolve_llm", _resolve)


def _is_summary_call(messages: list[dict]) -> bool:
    return bool(messages) and SUMMARY_SYSTEM_KEYWORD in messages[0].get("content", "")


async def _make_session(db, seed, *, project_id=None) -> AgentSession:
    session = AgentSession(
        company_id=seed["company_id"],
        project_id=project_id,
        user_id=seed["member_user_id"],
        channel="web",
        title="记忆测试",
    )
    db.add(session)
    await db.flush()
    return session


async def test_history_included_in_llm_messages(db_session, seed_knowledge, monkeypatch):
    """最近历史按序进 LLM messages；system 历史跳过；当前 user 消息只出现一次。"""
    session = await _make_session(db_session, seed_knowledge)
    db_session.add_all(
        [
            AgentMessage(session_id=session.id, role="user", content="第一句提问"),
            AgentMessage(session_id=session.id, role="assistant", content="第一句回答"),
            AgentMessage(session_id=session.id, role="system", content="内部系统消息不应进上下文"),
            AgentMessage(session_id=session.id, role="user", content="第二句提问"),
        ]
    )
    await db_session.flush()

    _patch_resolve(monkeypatch, _usable_llm())
    captured: dict = {}

    async def _chat_completion(llm, *, messages, **kwargs):
        captured["messages"] = messages
        return {"ok": True, "provider": llm.provider, "content": "模型回复"}

    monkeypatch.setattr(llm_settings_module, "chat_completion", _chat_completion)

    msg = await AgentRuntime().chat(db_session, session=session, user_text="这是新问题请回答")
    assert msg.content == "模型回复"

    messages = captured["messages"]
    assert messages[0]["role"] == "system"
    contents = [m["content"] for m in messages]
    assert "内部系统消息不应进上下文" not in contents
    # 历史按时间正序，且在当前这句 user 之前
    i1 = contents.index("第一句提问")
    i2 = contents.index("第一句回答")
    i3 = contents.index("第二句提问")
    i4 = contents.index("这是新问题请回答")
    assert i1 < i2 < i3 < i4
    assert messages[i1]["role"] == "user" and messages[i2]["role"] == "assistant"
    # 当前这句 user 不重复出现
    assert contents.count("这是新问题请回答") == 1
    assert messages[-1] == {"role": "user", "content": "这是新问题请回答"}


async def test_summary_updated_when_threshold_exceeded(db_session, seed_knowledge, monkeypatch):
    """未摘要消息数超过 AGENT_SUMMARY_THRESHOLD 时生成摘要并更新覆盖位点。"""
    session = await _make_session(db_session, seed_knowledge)
    for i in range(settings.AGENT_SUMMARY_THRESHOLD):
        role = "user" if i % 2 == 0 else "assistant"
        db_session.add(AgentMessage(session_id=session.id, role=role, content=f"历史消息{i}"))
    await db_session.flush()

    _patch_resolve(monkeypatch, _usable_llm())

    async def _chat_completion(llm, *, messages, **kwargs):
        if _is_summary_call(messages):
            return {"ok": True, "provider": llm.provider, "content": "这是新摘要"}
        return {"ok": True, "provider": llm.provider, "content": "模型回复"}

    monkeypatch.setattr(llm_settings_module, "chat_completion", _chat_completion)

    msg = await AgentRuntime().chat(db_session, session=session, user_text="触发摘要的新消息")
    assert msg.content == "模型回复"
    assert session.summary_text == "这是新摘要"

    # 摘要覆盖到当前这句 user 消息（助手回复在摘要之后落库，留待下一轮）
    last_user_id = (
        await db_session.execute(
            select(func.max(AgentMessage.id)).where(
                AgentMessage.session_id == session.id,
                AgentMessage.role == "user",
            )
        )
    ).scalar()
    assert session.summary_upto_message_id == last_user_id


async def test_summary_failure_does_not_block_chat(db_session, seed_knowledge, monkeypatch):
    """摘要生成抛异常：对话正常返回，meta 记 summary_error。"""
    session = await _make_session(db_session, seed_knowledge)
    for i in range(settings.AGENT_SUMMARY_THRESHOLD):
        role = "user" if i % 2 == 0 else "assistant"
        db_session.add(AgentMessage(session_id=session.id, role=role, content=f"历史消息{i}"))
    await db_session.flush()

    _patch_resolve(monkeypatch, _usable_llm())

    async def _chat_completion(llm, *, messages, **kwargs):
        if _is_summary_call(messages):
            raise RuntimeError("摘要服务不可用")
        return {"ok": True, "provider": llm.provider, "content": "模型回复"}

    monkeypatch.setattr(llm_settings_module, "chat_completion", _chat_completion)

    msg = await AgentRuntime().chat(db_session, session=session, user_text="摘要失败也要正常回复")
    assert msg.content == "模型回复"
    assert "摘要服务不可用" in (msg.meta_json or {}).get("summary_error", "")
    assert session.summary_text is None
    assert session.summary_upto_message_id is None


async def test_fake_llm_path_records_retrieval_meta(db_session, seed_knowledge, monkeypatch):
    """FakeLLM 路径（无 LLM 配置）：回复行为不回归，但 retrieval meta 照记。"""
    session = await _make_session(
        db_session, seed_knowledge, project_id=seed_knowledge["project_id"]
    )
    _patch_resolve(monkeypatch, _fake_llm())

    # 与已索引 wiki 正文同文，保证 LIKE 降级路径（全 token 命中）也能召回
    msg = await AgentRuntime().chat(
        db_session, session=session, user_text="上线前必须完成数据库迁移与冒烟测试"
    )
    assert msg.content.startswith("（助手）已理解")

    retrieval = (msg.meta_json or {}).get("retrieval")
    assert retrieval, "项目会话应记录召回明细"
    top = retrieval[0]
    assert set(top) >= {"chunk_id", "source", "score", "text"}
    assert top["source"].startswith(f"wiki:{seed_knowledge['wiki_id']}")
    assert len(top["text"]) <= 100


async def test_retrieval_rollback_does_not_lose_messages(db_session, seed_knowledge, monkeypatch):
    """守护：检索层内部 rollback（FTS5 失败降级 LIKE）不得丢掉已写入的用户消息。"""
    session = await _make_session(
        db_session, seed_knowledge, project_id=seed_knowledge["project_id"]
    )
    _patch_resolve(monkeypatch, _fake_llm())

    async def _rollback_search(db, **kwargs):
        # 模拟 search_chunks 内部 FTS5 失败后的 rollback 再降级
        await db.rollback()
        return []

    monkeypatch.setattr(agent_runtime_module, "search_chunks", _rollback_search)

    msg = await AgentRuntime().chat(
        db_session, session=session, user_text="这条消息不能因检索降级而丢失"
    )
    assert msg.content
    await db_session.commit()

    rows = (
        (
            await db_session.execute(
                select(AgentMessage)
                .where(AgentMessage.session_id == session.id)
                .order_by(AgentMessage.id.asc())
            )
        )
        .scalars()
        .all()
    )
    assert [m.role for m in rows] == ["user", "assistant"]
    assert rows[0].content == "这条消息不能因检索降级而丢失"
    # 会话行本身也不能被回滚掉
    assert await db_session.get(AgentSession, session.id) is not None
