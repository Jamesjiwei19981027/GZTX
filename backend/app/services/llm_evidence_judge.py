"""LLM 证据判定桩（JUDGE_BACKEND=llm 时启用；无密钥则规则回退）"""
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from app.services.evidence_judge import JudgeResult, RuleBasedEvidenceJudge


class LlmEvidenceJudge:
    """
    P1：FakeLLM 风格判定。
    真实调用可在此接 OpenAI-compatible；当前用规则+「llm」标记 reason。
    """

    def judge(
        self,
        *,
        package: Any,
        node_progress: dict,
        files_count: int = 0,
    ) -> JudgeResult:
        base = RuleBasedEvidenceJudge().judge(
            package=package,
            node_progress=node_progress,
            files_count=files_count,
        )
        # 轻量「模型」增强：摘要过短且无文件 → 更倾向拒绝并要求澄清
        summary = (package.summary_text or "").strip()
        if base.decision == "adopted" and len(summary) < 4 and files_count == 0:
            before = deepcopy(node_progress or {})
            return JudgeResult(
                decision="rejected",
                reason="[llm] 信息不足，请补充完成度说明或附件（FakeLLM）",
                progress_after=before,
                confidence=0.55,
            )
        return JudgeResult(
            decision=base.decision,
            reason=f"[llm] {base.reason}",
            progress_after=base.progress_after,
            wiki_draft=base.wiki_draft,
            confidence=min(0.9, base.confidence + 0.05),
        )
