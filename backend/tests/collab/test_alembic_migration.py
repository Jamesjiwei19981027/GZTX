"""Migration path: empty DB + alembic upgrade creates collab-critical tables."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text

BACKEND = Path(__file__).resolve().parents[2]
CRITICAL = {
    "companies",
    "projects",
    "tree_nodes",
    "progress_records",
    "evidence_packages",
    "agent_definitions",
    "notify_jobs",
    "delegation_grants",
    "report_policies",
}


@pytest.mark.sqlite_only
def test_alembic_upgrade_empty_sqlite_creates_collab_tables(tmp_path):
    db_path = tmp_path / "migrate_empty.db"
    url = f"sqlite:///{db_path.as_posix()}"
    env = os.environ.copy()
    env["DATABASE_URL"] = url
    # Always use the same interpreter running pytest (CI-friendly)
    py = Path(sys.executable)

    proc = subprocess.run(
        [str(py), "-m", "alembic", "upgrade", "head"],
        cwd=str(BACKEND),
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert proc.returncode == 0, f"stdout={proc.stdout}\nstderr={proc.stderr}"

    engine = create_engine(url)
    tables = set(inspect(engine).get_table_names())
    missing = CRITICAL - tables
    assert not missing, f"missing tables: {missing}; have={sorted(tables)}"

    # tasks compat columns
    cols = {c["name"] for c in inspect(engine).get_columns("tasks")}
    for col in ("origin", "company_id", "project_id", "project_node_id", "linked_readonly"):
        assert col in cols, f"tasks missing {col}"

    # evidence_files tenant columns
    ef_cols = {c["name"] for c in inspect(engine).get_columns("evidence_files")}
    for col in ("company_id", "project_id"):
        assert col in ef_cols, f"evidence_files missing {col}"

    # verification columns/table (b2c3d4e5f6a7)
    u_cols = {c["name"] for c in inspect(engine).get_columns("users")}
    for col in ("phone", "email_verified_at", "phone_verified_at"):
        assert col in u_cols, f"users missing {col}"
    assert "verification_codes" in tables or "verification_codes" in set(
        inspect(engine).get_table_names()
    )

    # rate limit counters (c3d4e5f6a7b8)
    assert "rate_limit_counters" in tables

    # alembic_version 停在脚本目录的 head 上（不硬编码版本号，新增迁移不必改测试）
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    expected_head = ScriptDirectory.from_config(
        Config(str(BACKEND / "alembic.ini"))
    ).get_current_head()
    with engine.connect() as conn:
        rev = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
    assert rev == expected_head
