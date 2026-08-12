"""递归文本切块：Markdown 标题 → 空行段落 → 句子 → 超长硬切

返回 [{"text": 块内容, "index": 全文内序号, "meta": {"heading_path": [...]}}, ...]，
相邻块之间保留 overlap 字符重叠；size/overlap 默认读 settings。
"""
from __future__ import annotations

import re

from app.core.config import settings

_HEADING = re.compile(r"^(#{1,6})\s+(\S.*)$")
# 按中英文句末标点与换行切句（保留分隔符在句尾）
_SENT_SPLIT = re.compile(r"(?<=[。！？；!?;\n])")
_BLANK_LINE = re.compile(r"\n\s*\n")


def _split_sections(text: str) -> list[tuple[list[str], str]]:
    """按 Markdown 标题切分，返回 (标题路径, 段文本) 列表；标题行本身归入其段落。"""
    sections: list[tuple[list[str], str]] = []
    path: list[tuple[int, str]] = []  # (level, title)
    buf: list[str] = []

    def flush():
        if buf and "\n".join(buf).strip():
            sections.append(([t for _, t in path], "\n".join(buf)))
        buf.clear()

    for line in text.splitlines():
        m = _HEADING.match(line)
        if m:
            flush()
            level = len(m.group(1))
            while path and path[-1][0] >= level:
                path.pop()
            path.append((level, m.group(2).strip()))
        buf.append(line)
    flush()
    return sections


def _split_segments(section_text: str, size: int) -> list[str]:
    """段落级切分；超过 size 的段落再按句子拆开（句子仍可能超长，交给打包层硬切）。"""
    segments: list[str] = []
    for para in _BLANK_LINE.split(section_text):
        para = para.strip("\n")
        if not para.strip():
            continue
        if len(para) <= size:
            segments.append(para)
        else:
            segments.extend(s for s in _SENT_SPLIT.split(para) if s and s.strip())
    return segments


def chunk_text(text: str, *, size: int | None = None, overlap: int | None = None) -> list[dict]:
    """把文本切成带重叠的块。空文本返回 []。"""
    if not text or not text.strip():
        return []
    size = size if size is not None else settings.KNOWLEDGE_CHUNK_SIZE
    overlap = overlap if overlap is not None else settings.KNOWLEDGE_CHUNK_OVERLAP
    size = max(size, 1)
    # 重叠必须小于块大小，否则硬切步长会非正
    overlap = max(0, min(overlap, size - 1))

    chunks: list[dict] = []
    for heading_path, section_text in _split_sections(text):
        meta = {"heading_path": list(heading_path)}
        _pack(_split_segments(section_text, size), size, overlap, meta, chunks)
    for i, c in enumerate(chunks):
        c["index"] = i
    return chunks


def _pack(segments: list[str], size: int, overlap: int, meta: dict, chunks: list[dict]) -> None:
    """把段/句贪心打包为 ≤size 的块；同一节内相邻块保留 overlap 字符重叠。"""
    carry = ""  # 上一块尾部的重叠内容，作为下一块的开头
    buf = ""
    has_new = False  # buf 中是否含 carry 之外的新内容（避免只发重叠残料）

    def flush():
        nonlocal carry, buf, has_new
        if has_new and buf.strip():
            chunks.append({"text": buf, "meta": dict(meta)})
            carry = buf[-overlap:] if overlap > 0 else ""
        buf = carry
        has_new = False

    for seg in segments:
        seg = seg.strip("\n")
        if not seg.strip():
            continue
        if len(seg) > size:
            # 超长片段：冲掉缓冲后按 size 硬切，步长 size-overlap 自带重叠
            flush()
            step = size - overlap if overlap > 0 else size
            start = 0
            piece = ""
            while start < len(seg):
                piece = seg[start : start + size]
                chunks.append({"text": piece, "meta": dict(meta)})
                if start + size >= len(seg):
                    break
                start += step
            carry = piece[-overlap:] if overlap > 0 else ""
            buf = carry
            has_new = False
            continue
        candidate = f"{buf}\n{seg}" if buf else seg
        if len(candidate) <= size:
            buf = candidate
            has_new = True
        else:
            flush()
            # flush 后 buf=carry；若 carry 加新段仍超 size 则放弃该重叠
            if buf and len(buf) + 1 + len(seg) > size:
                buf = ""
            buf = f"{buf}\n{seg}" if buf else seg
            has_new = True
    flush()
