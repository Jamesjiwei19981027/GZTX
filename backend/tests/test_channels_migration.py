import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config


def test_channels_unique_idx_migration():
    # 验证 alembic 历史能够读取到新迁移，并且配置语法正常
    config = Config("alembic.ini")
    config.set_main_option("script_location", "alembic")
    # 只要能解析迁移脚本无语法错误
    from alembic.script import ScriptDirectory
    script = ScriptDirectory.from_config(config)
    head = script.get_current_head()
    assert head == "fn2b3c4d5e6f"
