"""Upgrade an existing tree without changing its project definition."""
import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_existing_nodes_gain_safe_origin_and_permission_defaults(monkeypatch):
    path = Path(__file__).resolve().parents[2] / 'alembic/versions/de22fa33bc00_responsibility_permissions.py'
    spec = importlib.util.spec_from_file_location('responsibility_migration', path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine('sqlite:///:memory:')
    with engine.begin() as connection:
        connection.execute(sa.text('CREATE TABLE tree_nodes (id INTEGER PRIMARY KEY, title TEXT NOT NULL)'))
        connection.execute(sa.text("INSERT INTO tree_nodes VALUES (1, 'original definition')"))
        monkeypatch.setattr(migration, 'op', Operations(MigrationContext.configure(connection)))
        migration.upgrade()
        migration.upgrade()
        result = connection.execute(sa.text('SELECT title, node_origin, responsibility_permissions FROM tree_nodes')).one()
        assert result == ('original definition', 'project', '{}')
        migration.downgrade()
        assert connection.execute(sa.text('SELECT title FROM tree_nodes')).scalar_one() == 'original definition'
    engine.dispose()
