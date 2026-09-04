"""node_assignments 唯一约束配套：重复 (user_id, role_key) 在写入前折叠。"""
from app.services.tree_service import dedupe_assignees


def test_dedupe_keeps_first_occurrence_and_distinct_roles():
    raw = [
        {"user_id": 3, "role_key": "primary"},
        {"user_id": "3", "role_key": "primary"},
        {"user_id": 3},
        {"user_id": 7, "role_key": "reviewer"},
        {"user_id": 3, "role_key": "reviewer"},
    ]
    assert dedupe_assignees(raw) == [
        (3, "primary"),
        (7, "reviewer"),
        (3, "reviewer"),
    ]


def test_dedupe_empty_and_missing_role():
    assert dedupe_assignees([]) == []
    assert dedupe_assignees(None) == []  # type: ignore[arg-type]
    assert dedupe_assignees([{"user_id": 1}]) == [(1, "primary")]
