"""中文分词（jieba 懒加载单例，缺依赖时降级为逐字/按词切分）"""
from __future__ import annotations

import re

# jieba 模块级单例：首次调用才 import + 建词典（约 1s），失败后不再重试
_jieba = None
_jieba_failed = False

# 纯标点/符号（无字母数字与 CJK）的 token 过滤
_PUNCT_ONLY = re.compile(r"^[\W_]+$", re.UNICODE)
# 降级切分：连续英文/数字为一个词，CJK 逐字
_FALLBACK_SPLIT = re.compile(r"[A-Za-z0-9_]+|[\u3400-\u9fff\uf900-\ufaff]")


def _get_jieba():
    global _jieba, _jieba_failed
    if _jieba is None and not _jieba_failed:
        try:
            import jieba

            jieba.setLogLevel(60)  # 静默初始化日志
            _jieba = jieba
        except Exception:
            _jieba_failed = True
    return _jieba


def tokenize(text: str) -> list[str]:
    """切词并过滤空白与纯标点。jieba 不可用时降级：中文逐字 + 英文按词。"""
    if not text or not text.strip():
        return []
    jb = _get_jieba()
    if jb is not None:
        raw = jb.lcut(text, cut_all=False)
    else:
        raw = _FALLBACK_SPLIT.findall(text)
    return [t for t in (tok.strip() for tok in raw) if t and not _PUNCT_ONLY.match(t)]


def tokens_str(text: str) -> str:
    """分词后空格连接（knowledge_chunks.tokens 列与查询侧共用同一口径）。"""
    return " ".join(tokenize(text))
