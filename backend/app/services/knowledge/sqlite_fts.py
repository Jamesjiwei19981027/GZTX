"""SQLite FTS5 外部内容表 DDL（迁移与测试共用，保持单一事实来源）

knowledge_chunks_fts 以 knowledge_chunks 为外部内容表（content_rowid=id），
只索引 tokens 列；INSERT/UPDATE/DELETE 触发器保持两表同步。
个别 SQLite 构建不带 FTS5 扩展，建表失败可容忍——检索层会降级为 LIKE。
"""

FTS_TABLE = "knowledge_chunks_fts"

FTS_CREATE_STATEMENTS = [
    (
        "CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5("
        "tokens, content='knowledge_chunks', content_rowid='id')"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS knowledge_chunks_fts_ai "
        "AFTER INSERT ON knowledge_chunks BEGIN "
        "INSERT INTO knowledge_chunks_fts(rowid, tokens) VALUES (new.id, new.tokens); "
        "END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS knowledge_chunks_fts_ad "
        "AFTER DELETE ON knowledge_chunks BEGIN "
        "INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts, rowid, tokens) "
        "VALUES ('delete', old.id, old.tokens); "
        "END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS knowledge_chunks_fts_au "
        "AFTER UPDATE ON knowledge_chunks BEGIN "
        "INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts, rowid, tokens) "
        "VALUES ('delete', old.id, old.tokens); "
        "INSERT INTO knowledge_chunks_fts(rowid, tokens) VALUES (new.id, new.tokens); "
        "END"
    ),
]

FTS_DROP_STATEMENTS = [
    "DROP TRIGGER IF EXISTS knowledge_chunks_fts_au",
    "DROP TRIGGER IF EXISTS knowledge_chunks_fts_ad",
    "DROP TRIGGER IF EXISTS knowledge_chunks_fts_ai",
    "DROP TABLE IF EXISTS knowledge_chunks_fts",
]
