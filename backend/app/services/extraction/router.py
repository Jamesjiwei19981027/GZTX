"""格式路由：按扩展名 + mime 选择抽取引擎

扩展名优先（上传时 original_name 更可信）；扩展名不认识再看 mime。
都不认识 → skipped（不支持的格式不报错，判定流程照常走）。
"""
from __future__ import annotations

from pathlib import PurePosixPath

ENGINE_PLAIN = "plain"
ENGINE_MARKITDOWN = "markitdown"
ENGINE_DOCLING = "docling"
ENGINE_LIBREOFFICE = "libreoffice"
ENGINE_SKIPPED = "skipped"

_EXT_ENGINE: dict[str, str] = {
    # 纯文本：backend 镜像内置可用
    "txt": ENGINE_PLAIN,
    "md": ENGINE_PLAIN,
    "csv": ENGINE_PLAIN,
    "log": ENGINE_PLAIN,
    # 新 Office / 网页 / 电子书：MarkItDown
    "docx": ENGINE_MARKITDOWN,
    "xlsx": ENGINE_MARKITDOWN,
    "pptx": ENGINE_MARKITDOWN,
    "html": ENGINE_MARKITDOWN,
    "epub": ENGINE_MARKITDOWN,
    # PDF / 图片（含扫描件）：Docling（版面分析 + OCR）
    "pdf": ENGINE_DOCLING,
    "png": ENGINE_DOCLING,
    "jpg": ENGINE_DOCLING,
    "jpeg": ENGINE_DOCLING,
    "tif": ENGINE_DOCLING,
    "tiff": ENGINE_DOCLING,
    "bmp": ENGINE_DOCLING,
    "webp": ENGINE_DOCLING,
    # 老 Office：LibreOffice headless 转新格式后走 MarkItDown
    "doc": ENGINE_LIBREOFFICE,
    "xls": ENGINE_LIBREOFFICE,
    "ppt": ENGINE_LIBREOFFICE,
}

_MIME_ENGINE: dict[str, str] = {
    "text/plain": ENGINE_PLAIN,
    "text/markdown": ENGINE_PLAIN,
    "text/csv": ENGINE_PLAIN,
    "text/html": ENGINE_MARKITDOWN,
    "application/epub+zip": ENGINE_MARKITDOWN,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ENGINE_MARKITDOWN,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ENGINE_MARKITDOWN,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ENGINE_MARKITDOWN,
    "application/pdf": ENGINE_DOCLING,
    "image/png": ENGINE_DOCLING,
    "image/jpeg": ENGINE_DOCLING,
    "image/tiff": ENGINE_DOCLING,
    "image/bmp": ENGINE_DOCLING,
    "image/webp": ENGINE_DOCLING,
    "application/msword": ENGINE_LIBREOFFICE,
    "application/vnd.ms-excel": ENGINE_LIBREOFFICE,
    "application/vnd.ms-powerpoint": ENGINE_LIBREOFFICE,
}


def route_engine(filename: str | None, mime_type: str | None = None) -> str:
    """返回引擎名：plain / markitdown / docling / libreoffice / skipped。"""
    ext = PurePosixPath(filename or "").suffix.lstrip(".").lower()
    if ext in _EXT_ENGINE:
        return _EXT_ENGINE[ext]
    mt = (mime_type or "").split(";")[0].strip().lower()
    if mt in _MIME_ENGINE:
        return _MIME_ENGINE[mt]
    # 其余 text/* 当纯文本兜底（如 text/x-python）
    if mt.startswith("text/"):
        return ENGINE_PLAIN
    return ENGINE_SKIPPED
