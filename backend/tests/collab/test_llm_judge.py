import types

from app.services.evidence_judge import RuleBasedEvidenceJudge
from app.services.llm_evidence_judge import LlmEvidenceJudge


def _pkg(summary="", structured=None):
    return types.SimpleNamespace(
        summary_text=summary,
        structured_json=structured or {},
        links_json=[],
    )


def test_llm_judge_rejects_too_short():
    j = LlmEvidenceJudge()
    r = j.judge(
        package=_pkg("ok"),
        node_progress={"template": "work_item", "status": "not_started", "percent": 0},
        files_count=0,
    )
    assert r.decision == "rejected"
    assert "[llm]" in r.reason


def test_llm_judge_adopts_with_structured():
    j = LlmEvidenceJudge()
    r = j.judge(
        package=_pkg("完成了登录页联调与自测", {"percent": 80, "status": "in_progress"}),
        node_progress={"template": "work_item", "status": "not_started", "percent": 0},
        files_count=0,
    )
    assert r.decision == "adopted"
    assert r.progress_after.get("percent") == 80
    assert "[llm]" in r.reason


def test_rule_still_works():
    j = RuleBasedEvidenceJudge()
    r = j.judge(
        package=_pkg("进度更新", {"percent": 50}),
        node_progress={"template": "work_item"},
        files_count=0,
    )
    assert r.decision == "adopted"
