"""Shared deterministic/LLM-backed summaries for chats and calls."""

from __future__ import annotations

from typing import Any, Iterable

SUMMARY_SOURCE_LIMIT = 100


def _clean(value: Any) -> str:
    return " ".join(str(value or "").split()).strip()


def summarize_lines(lines: Iterable[str], *, provider: str = "deterministic") -> dict[str, Any]:
    """Produce a useful, auditable summary without inventing facts."""
    source = [_clean(line) for line in lines if _clean(line)]
    source = source[-SUMMARY_SOURCE_LIMIT:]
    decisions = [line for line in source if any(word in line for word in ("决定", "确认", "结论", "同意"))]
    action_items = [line for line in source if any(word in line for word in ("待办", "需要", "负责", "截止", "跟进"))]
    risks = [line for line in source if any(word in line for word in ("风险", "阻塞", "问题", "依赖", "缺少"))]
    points = source[:8]
    sections = []
    if points:
        sections.append("要点：" + "；".join(points))
    if decisions:
        sections.append("决定：" + "；".join(decisions[:5]))
    if action_items:
        sections.append("待办：" + "；".join(action_items[:8]))
    if risks:
        sections.append("风险：" + "；".join(risks[:8]))
    return {
        "summary_text": "\n".join(sections) or "暂无可总结的文字消息。",
        "key_points": points,
        "decisions": decisions[:10],
        "action_items": action_items[:10],
        "risks": risks[:10],
        "provider": provider,
        "source_count": len(source),
    }


async def summarize_lines_with_llm(db, *, company_id: int | None, user, lines: Iterable[str]) -> dict[str, Any]:
    """Use the configured company/user model when available, with a truthful fallback.

    The structured buckets always come from the deterministic extractor so callers can
    audit the source lines even when a model is unavailable. Only the prose summary is
    replaced by a successful model response.
    """
    lines = list(lines)
    base = summarize_lines(lines)
    try:
        from app.services.llm_settings import chat_completion, resolve_llm

        llm = await resolve_llm(db, company_id=company_id, user=user)
        if not llm or llm.provider == "fake" or not llm.is_usable() or not llm.use_for_agent:
            return base
        source = "\n".join([_clean(line) for line in lines if _clean(line)][-SUMMARY_SOURCE_LIMIT:])
        prompt = (
            "请把下面的团队聊天或通话转写整理成简洁、可执行的中文汇报。"
            "只使用原文事实，不要臆测；保留决定、待办和风险。\n\n" + source
        )
        result = await chat_completion(
            llm,
            messages=[
                {"role": "system", "content": "你是项目沟通纪要助手。"},
                {"role": "user", "content": prompt},
            ],
        )
        content = str(result.get("content") or "").strip()
        if result.get("ok") and content:
            base["summary_text"] = content
            base["provider"] = str(result.get("provider") or llm.provider)
    except Exception:
        # Summary generation must remain available when a provider is misconfigured.
        return base
    return base


def summary_dto(row) -> dict[str, Any]:
    return {
        "id": row.id,
        "company_id": row.company_id,
        "project_id": row.project_id,
        "scope_type": row.scope_type,
        "scope_id": row.scope_id,
        "source_from_id": row.source_from_id,
        "source_to_id": row.source_to_id,
        "source_count": row.source_count,
        "summary_text": row.summary_text,
        "key_points": list(row.key_points_json or []),
        "decisions": list(row.decisions_json or []),
        "action_items": list(row.action_items_json or []),
        "risks": list(row.risks_json or []),
        "provider": row.provider,
        "status": row.status,
        "error_message": row.error_message,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
