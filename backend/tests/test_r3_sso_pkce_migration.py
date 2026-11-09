"""PKCE 迁移可用于已有数据库，也兼容旧迁移由当前模型创建的全新库。"""
import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_pkce_migration_adds_nullable_column_and_handles_current_metadata(monkeypatch):
    path = Path(__file__).parents[1] / 'alembic/versions/fq5e6f7a8b9c_sso_mobile_pkce.py'
    spec = importlib.util.spec_from_file_location('r3_pkce_migration', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    engine = sa.create_engine('sqlite:///:memory:')
    try:
        with engine.begin() as connection:
            connection.execute(sa.text('CREATE TABLE sso_login_attempts (state_hash VARCHAR(64) PRIMARY KEY)'))
            monkeypatch.setattr(module, 'op', Operations(MigrationContext.configure(connection)))
            module.upgrade()
            module.upgrade()
            column = next(column for column in sa.inspect(connection).get_columns('sso_login_attempts') if column['name'] == 'code_challenge')
            assert column['nullable'] is True
            assert column['type'].length == 128
            module.downgrade()
            assert 'code_challenge' not in {column['name'] for column in sa.inspect(connection).get_columns('sso_login_attempts')}
    finally:
        engine.dispose()
