"""LLM 证据判定桩（JUDGE_BACKEND=llm 时启用；无密钥则规则回退）"""
from copy import deepcopy
from typing import Any

from app.services.evidence_judge import JudgeResult, RuleBasedEvidenceJudge

# 抽取正文拼入 prompt 的预算：单文件截 6000 字符，全部文件合计 16000 字符
_PER_FILE_LIMIT = 6000
_TOTAL_BUDGET = 16000


def build_files_prompt_block(
    files_texts: list | None,
    *,
    per_file_limit: int = _PER_FILE_LIMIT,
    total_budget: int = _TOTAL_BUDGET,
) -> str:
    """把抽取正文组装为 prompt 片段（标注文件名，按预算截断）；无正文返回空串。"""
    if not files_texts:
        return ""
    parts: list[str] = []
    used = 0
    for item in files_texts:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "附件")
        text = str(item.get("text") or "").strip()
        if not text:
            continue
        remain = total_budget - used
        if remain <= 0:
            break
        snippet = text[: min(per_file_limit, remain)]
        used += len(snippet)
        parts.append(f"### 文件：{name}\n{snippet}")
    if not parts:
        return ""
    return "## 附件正文（已按预算截断）\n\n" + "\n\n".join(parts)


class LlmEvidenceJudge:
    """
    P1：FakeLLM 风格判定。
    真实调用可在此接 OpenAI-compatible；当前用规则+「llm」标记 reason。
    prompt 已按最终格式组装（含抽取正文），接真实 LLM 时直接发送 last_prompt 即可。
    """

    def __init__(self) -> None:
        # 最近一次组装的 prompt（测试与审计用；真实 LLM 接入后作为请求体）
        self.last_prompt: str = ""

    def _build_prompt(
        self,
        *,
        package: Any,
        node_progress: dict,
        files_count: int,
        files_texts: list | None,
    ) -> str:
        summary = (package.summary_text or "").strip()
        structured = package.structured_json or {}
        lines = [
            "你是项目 PM 智能体，请判定以下材料是否可采纳为正式进度。",
            f"## 材料说明\n{summary or '（无文字说明）'}",
            f"## 结构化字段\n{structured}",
            f"## 附件数量\n{files_count}",
            f"## 当前进度\n{node_progress or {}}",
        ]
        # 无 files_texts 时 prompt 与现状一致（不追加正文块）
        files_block = build_files_prompt_block(files_texts)
        if files_block:
            lines.append(files_block)
        return "\n\n".join(lines)

    def judge(
        self,
        *,
        package: Any,
        node_progress: dict,
        files_count: int = 0,
        files_texts: list | None = None,
    ) -> JudgeResult:
        self.last_prompt = self._build_prompt(
            package=package,
            node_progress=node_progress,
            files_count=files_count,
            files_texts=files_texts,
        )
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
