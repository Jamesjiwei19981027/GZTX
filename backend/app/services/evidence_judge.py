"""证据判定器（P0 规则版）"""
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


@dataclass
class JudgeResult:
    decision: str  # adopted | rejected
    reason: str
    progress_after: dict
    wiki_draft: dict | None = None
    confidence: float = 0.8


class RuleBasedEvidenceJudge:
    """规则：有 summary 且（有文件或 percent/checklist/明确 done）则采纳。"""

    def judge(
        self,
        *,
        package: Any,
        node_progress: dict,
        files_count: int = 0,
    ) -> JudgeResult:
        summary = (package.summary_text or "").strip()
        structured = package.structured_json or {}
        links = package.links_json or []
        before = deepcopy(node_progress or {})
        template = before.get("template") or "work_item"

        if not summary and files_count == 0 and not structured and not links:
            return JudgeResult(
                decision="rejected",
                reason="材料为空：缺少说明、结构化进度与附件",
                progress_after=before,
                confidence=0.95,
            )

        after = deepcopy(before)
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        after["updated_at"] = now

        if template == "work_item":
            percent = structured.get("percent")
            if percent is not None:
                try:
                    after["percent"] = max(0, min(100, int(percent)))
                except (TypeError, ValueError):
                    pass
            checklist = structured.get("checklist")
            if isinstance(checklist, list):
                after["checklist"] = checklist
            status = structured.get("status")
            if status:
                after["status"] = status
            elif after.get("percent", 0) >= 100:
                after["status"] = "done"
            elif after.get("percent", 0) > 0 or files_count > 0 or summary:
                if after.get("status") in (None, "not_started"):
                    after["status"] = "in_progress"
        elif template == "milestone":
            st = structured.get("status") or (
                "reached" if "完成" in summary or "done" in summary.lower() else "at_risk"
            )
            after["status"] = st
        else:
            # scope: keep summary lightly
            after.setdefault("summary", before.get("summary") or {})

        wiki = {
            "title": f"材料采纳：{(summary[:40] if summary else '进度更新')}",
            "body_text": summary or "（无文字说明，见附件/结构化字段）",
            "source": "evidence_adopt",
        }
        return JudgeResult(
            decision="adopted",
            reason="规则判定：材料有效，写入正式进度",
            progress_after=after,
            wiki_draft=wiki,
            confidence=0.75,
        )


def get_judge(*, prefer_llm: bool = False):
    """prefer_llm 或 JUDGE_BACKEND=llm/auto 时使用 LlmEvidenceJudge。"""
    from app.core.config import settings

    mode = (getattr(settings, "JUDGE_BACKEND", "rule") or "rule").lower()
    use_llm = prefer_llm or mode in ("llm", "auto")
    if use_llm:
        try:
            from app.services.llm_evidence_judge import LlmEvidenceJudge

            return LlmEvidenceJudge()
        except Exception:
            return RuleBasedEvidenceJudge()
    return RuleBasedEvidenceJudge()
