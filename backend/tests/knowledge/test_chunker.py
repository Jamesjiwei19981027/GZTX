"""chunker 切块行为：中英混排 · Markdown 标题 · 硬切 · 重叠 · 空文本"""
from app.services.knowledge.chunker import chunk_text


def test_empty_text_returns_empty_list():
    assert chunk_text("") == []
    assert chunk_text("   \n\n  ") == []


def test_short_mixed_chinese_english_single_chunk():
    text = "本项目使用 FastAPI 和 React 实现，验收标准是 pytest 全绿。"
    chunks = chunk_text(text, size=500, overlap=80)
    assert len(chunks) == 1
    assert chunks[0]["index"] == 0
    assert chunks[0]["text"] == text
    assert chunks[0]["meta"]["heading_path"] == []


def test_markdown_heading_paths():
    text = (
        "# 部署指南\n\n"
        "总体说明段落。\n\n"
        "## 数据库\n\n"
        "使用 PostgreSQL 作为生产数据库。\n\n"
        "## 前端\n\n"
        "使用 React 构建。\n\n"
        "# 附录\n\n"
        "其他补充内容。\n"
    )
    chunks = chunk_text(text, size=60, overlap=0)
    paths = [tuple(c["meta"]["heading_path"]) for c in chunks]
    assert ("部署指南",) in paths
    assert ("部署指南", "数据库") in paths
    assert ("部署指南", "前端") in paths
    # 二级标题弹栈后，新的一级标题路径只剩自己
    assert ("附录",) in paths
    # 全部原文内容都被覆盖
    joined = "".join(c["text"] for c in chunks)
    assert "PostgreSQL" in joined and "React" in joined and "其他补充内容" in joined
    # index 连续递增
    assert [c["index"] for c in chunks] == list(range(len(chunks)))


def test_overlong_paragraph_hard_cut_with_overlap():
    # 无标点超长段落：只能硬切
    text = "甲" * 1200
    size, overlap = 500, 80
    chunks = chunk_text(text, size=size, overlap=overlap)
    assert len(chunks) >= 3
    assert all(len(c["text"]) <= size for c in chunks)
    for prev, nxt in zip(chunks, chunks[1:]):
        assert nxt["text"][:overlap] == prev["text"][-overlap:]
    # 去掉重叠后拼回原文长度
    total = len(chunks[0]["text"]) + sum(len(c["text"]) - overlap for c in chunks[1:])
    assert total == 1200


def test_overlap_between_packed_sentence_chunks():
    # 多个句子打包为多块，块间应保留 overlap 重叠
    sentences = [f"第{i}句：这是一段关于项目验收标准的说明文字，长度适中。" for i in range(20)]
    text = "".join(sentences)
    size, overlap = 200, 50
    chunks = chunk_text(text, size=size, overlap=overlap)
    assert len(chunks) > 1
    assert all(len(c["text"]) <= size for c in chunks)
    for prev, nxt in zip(chunks, chunks[1:]):
        assert nxt["text"].startswith(prev["text"][-overlap:])
    # 每句话都出现在某个块里（内容不丢失）
    joined = "".join(c["text"] for c in chunks)
    for s in sentences:
        assert s in joined


def test_size_overlap_defaults_from_settings():
    from app.core.config import settings

    text = "均" * (settings.KNOWLEDGE_CHUNK_SIZE * 2)
    chunks = chunk_text(text)
    assert all(len(c["text"]) <= settings.KNOWLEDGE_CHUNK_SIZE for c in chunks)
    assert len(chunks) >= 2
