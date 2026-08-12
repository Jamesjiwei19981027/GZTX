"""抽取引擎：plain / markitdown / docling / libreoffice

四个引擎函数签名统一：输入 (content: bytes, filename: str)，输出 (text_md, meta)。

- text_md 为 None 表示该文件应标 skipped（如 LibreOffice 未安装），meta 里带原因；
- 重依赖（markitdown/docling）全部 lazy import：不在 backend 主依赖里，
  import 失败逐级降级（docling → markitdown → plain；markitdown → plain），
  只有 libreoffice 不可用直接 skipped（老格式无纯文本兜底价值）；
- 正文超 settings.EXTRACTION_MAX_CHARS 截断并在 meta 记 truncated=true；
- 引擎运行期异常（非 import 失败）向上抛，由 service.extract_package 兜底标 failed，
  不会外泄到判定主流程。
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

from app.core.config import settings

# plain 引擎的多编码尝试顺序：utf-8 → 中文常见 gb18030 → latin-1（永不失败的兜底）
_PLAIN_ENCODINGS = ("utf-8", "gb18030", "latin-1")

# 老 Office 格式 → LibreOffice 转换目标格式
_LIBREOFFICE_TARGETS = {"doc": "docx", "xls": "xlsx", "ppt": "pptx"}

_LIBREOFFICE_TIMEOUT_SEC = 120


def _finalize(text: str, meta: dict) -> tuple[str, dict]:
    """统一收口：超上限截断并记 meta。"""
    limit = int(settings.EXTRACTION_MAX_CHARS)
    if len(text) > limit:
        text = text[:limit]
        meta["truncated"] = True
    meta["chars"] = len(text)
    return text, meta


def _safe_suffix(filename: str) -> str:
    """取安全的文件后缀（临时文件用，引擎按后缀识别格式）。"""
    suffix = Path(filename or "").suffix
    return suffix if len(suffix) <= 16 else ""


def extract_plain(content: bytes, filename: str) -> tuple[str | None, dict]:
    """纯文本：多编码依次尝试解码（latin-1 兜底不会失败）。"""
    for enc in _PLAIN_ENCODINGS:
        try:
            text = content.decode(enc)
        except (UnicodeDecodeError, ValueError):
            continue
        return _finalize(text, {"extractor": "plain", "encoding": enc})
    raise ValueError("plain_decode_failed")


def extract_markitdown(content: bytes, filename: str) -> tuple[str | None, dict]:
    """MarkItDown：docx/xlsx/pptx/html/epub → Markdown；依赖缺失降级 plain。"""
    try:
        from markitdown import MarkItDown
    except Exception:
        text, meta = extract_plain(content, filename)
        meta["degraded_from"] = "markitdown"
        return text, meta

    md = MarkItDown(enable_plugins=False)
    # convert_stream 各版本行为不一，落临时文件走 convert(path) 最稳
    with tempfile.TemporaryDirectory(prefix="wt_extract_") as tmpdir:
        tmp = Path(tmpdir) / f"input{_safe_suffix(filename)}"
        tmp.write_bytes(content)
        result = md.convert(str(tmp))
    return _finalize(result.text_content or "", {"extractor": "markitdown"})


def extract_docling(content: bytes, filename: str) -> tuple[str | None, dict]:
    """Docling：PDF/图片版面分析 + OCR；依赖缺失降级 markitdown → plain。"""
    try:
        from docling.document_converter import DocumentConverter
    except Exception:
        text, meta = extract_markitdown(content, filename)
        meta["degraded_from"] = meta.get("degraded_from") or "docling"
        return text, meta

    with tempfile.TemporaryDirectory(prefix="wt_extract_") as tmpdir:
        tmp = Path(tmpdir) / f"input{_safe_suffix(filename)}"
        tmp.write_bytes(content)
        converter = DocumentConverter()
        result = converter.convert(str(tmp))
        doc = result.document
        text = doc.export_to_markdown()
    meta: dict = {"extractor": "docling"}
    pages = getattr(doc, "num_pages", None)
    if callable(pages):
        try:
            pages = pages()
        except Exception:
            pages = None
    if isinstance(pages, int):
        meta["pages"] = pages
    return _finalize(text or "", meta)


def extract_libreoffice(content: bytes, filename: str) -> tuple[str | None, dict]:
    """老 Office（doc/xls/ppt）：LibreOffice headless 转新格式后走 MarkItDown。

    LibreOffice 未安装时返回 (None, meta) → skipped，不做纯文本兜底
    （二进制老格式直接解码只会得到乱码）。
    """
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        return None, {
            "extractor": "libreoffice+markitdown",
            "skipped_reason": "libreoffice_not_available",
        }

    ext = Path(filename or "").suffix.lstrip(".").lower()
    target = _LIBREOFFICE_TARGETS.get(ext)
    if not target:
        return None, {
            "extractor": "libreoffice+markitdown",
            "skipped_reason": f"unsupported_legacy_format:{ext}",
        }

    with tempfile.TemporaryDirectory(prefix="wt_extract_") as tmpdir:
        src = Path(tmpdir) / f"input.{ext}"
        src.write_bytes(content)
        proc = subprocess.run(
            [soffice, "--headless", "--convert-to", target, "--outdir", tmpdir, str(src)],
            capture_output=True,
            timeout=_LIBREOFFICE_TIMEOUT_SEC,
        )
        out = src.with_suffix(f".{target}")
        if proc.returncode != 0 or not out.exists():
            stderr = (proc.stderr or b"").decode("utf-8", errors="replace")[:500]
            raise RuntimeError(f"libreoffice_convert_failed: {stderr}")
        text, meta = extract_markitdown(out.read_bytes(), out.name)
    meta["extractor"] = "libreoffice+markitdown"
    return text, meta


ENGINE_FUNCS = {
    "plain": extract_plain,
    "markitdown": extract_markitdown,
    "docling": extract_docling,
    "libreoffice": extract_libreoffice,
}


def run_engine(engine: str, content: bytes, filename: str) -> tuple[str | None, dict]:
    """按引擎名分派；未知引擎名视为不支持（防路由与引擎表脱节）。"""
    fn = ENGINE_FUNCS.get(engine)
    if fn is None:
        return None, {"skipped_reason": f"unknown_engine:{engine}"}
    return fn(content, filename)
