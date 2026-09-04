"""
任务附件接口（异步 SQLAlchemy，与现役 v1 路由一致）
"""
import hashlib
import mimetypes
import os
import secrets
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import delete, select

from app.core.dependencies import CurrentUser, DbSession
from app.core.security import decode_token, token_revoked_for_user
from app.models.attachment import Attachment, AttachmentDownloadTicket
from app.models.task import Task
from app.models.user import User
from app.schemas.common import ResponseData

router = APIRouter(tags=["附件"])

# 上传目录：backend/data/uploads
UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
    "data",
    "uploads",
)

MAX_FILE_SIZE = 20 * 1024 * 1024

# 一次性下载票据有效期：够浏览器发起下载，又短到捡到 URL 也基本无用
DOWNLOAD_TICKET_TTL_SECONDS = 120

# 允许 inline 渲染的类型白名单（图片位图 + PDF）。
# 下载端点一律强制 attachment，预览要单开一个端点，且只放这些**不会执行脚本**的类型；
# image/svg+xml 故意不在其中——SVG 能内嵌 <script>，inline 打开等于同源 XSS。
INLINE_SAFE_MIME_TYPES = {
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/bmp",
    "image/webp",
    "image/x-icon",
    "image/vnd.microsoft.icon",
    "application/pdf",
}

# 剔除 .html / .htm / .svg / .js / .ts：这些在同源下打开等于在本站执行攻击者脚本
# （SVG 可内嵌 <script>），配合下面强制的 Content-Disposition + nosniff 才算闭环。
ALLOWED_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".txt", ".csv", ".md", ".rtf", ".odt", ".ods", ".odp",
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".ico",
    ".zip", ".rar", ".7z", ".tar", ".gz",
    ".json", ".xml", ".yaml", ".yml", ".sql", ".py",
    ".css", ".sh", ".bat",
    ".eml", ".log",
}

TEXT_MIME_TYPES = {
    "text/plain", "text/csv", "text/html", "text/css", "text/xml",
    "text/markdown", "text/x-markdown",
    "application/json", "application/xml", "application/javascript",
    "application/x-yaml", "application/yaml",
    "application/x-sh", "application/x-bat",
}

# 存量库里可能还有 .html/.js 等历史附件，文本预览口径保留它们（走 JSON 正文而非
# 浏览器渲染，不会执行）；上传侧已按 ALLOWED_EXTENSIONS 拒绝新增。
TEXT_EXTENSIONS = {
    ".txt", ".md", ".csv", ".json", ".xml", ".html", ".css", ".js", ".ts",
    ".py", ".sh", ".bat", ".yaml", ".yml", ".sql", ".log", ".eml", ".rtf",
}

OFFICE_WORD_MIMES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
}
OFFICE_EXCEL_MIMES = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
}
OFFICE_PPT_MIMES = {
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint",
}


def _ensure_upload_dir() -> None:
    os.makedirs(UPLOAD_DIR, exist_ok=True)


def _get_file_extension(filename: str) -> str:
    _, ext = os.path.splitext(filename)
    return ext.lower()


def _attachment_disposition(filename: str) -> str:
    """RFC 5987 的 Content-Disposition：ASCII 兜底名 + UTF-8 filename*。

    自己拼这个头是因为要强制 attachment，不能再用 FileResponse(filename=...)
    的默认 inline 逻辑；中文名必须走 filename* 否则会被截成乱码。
    """
    from urllib.parse import quote

    fallback = filename.encode("ascii", "ignore").decode("ascii") or "download"
    fallback = fallback.replace('"', "").replace("\\", "")
    return f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{quote(filename)}"


def _format_size(size_bytes: int) -> str:
    if size_bytes < 1024:
        return f"{size_bytes} B"
    if size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    return f"{size_bytes / (1024 * 1024):.1f} MB"


def _attachment_dict(att: Attachment) -> dict:
    return {
        "id": att.id,
        "task_id": att.task_id,
        "original_name": att.original_name,
        "file_size": att.file_size,
        "mime_type": att.mime_type,
        "download_url": f"/api/v1/attachments/{att.id}/download",
        "created_at": att.created_at.isoformat() if att.created_at else None,
    }


def _is_text_file(attachment: Attachment) -> bool:
    if attachment.mime_type in TEXT_MIME_TYPES:
        return True
    return _get_file_extension(attachment.original_name) in TEXT_EXTENSIONS


def _get_file_category(attachment: Attachment) -> str:
    ext = _get_file_extension(attachment.original_name)

    if ext == ".md" or attachment.mime_type in ("text/markdown", "text/x-markdown"):
        return "markdown"
    if ext == ".csv" or attachment.mime_type == "text/csv":
        return "csv"
    if _is_text_file(attachment):
        return "text"
    if attachment.mime_type and attachment.mime_type.startswith("image/"):
        return "image"
    if attachment.mime_type and "pdf" in attachment.mime_type:
        return "pdf"
    if attachment.mime_type in OFFICE_WORD_MIMES:
        return "docx" if ext == ".docx" else "unsupported"
    if attachment.mime_type in OFFICE_EXCEL_MIMES:
        return "xlsx" if ext == ".xlsx" else "unsupported"
    if attachment.mime_type in OFFICE_PPT_MIMES:
        return "unsupported"
    return "unsupported"


async def _get_task_for_user(db: DbSession, task_id: int, user_id: int) -> Task:
    """与 tasks 读路径同口径：任务 owner 或被指派人都可访问附件。"""
    from app.api.v1.tasks import task_visibility_filter

    result = await db.execute(
        select(Task).where(
            Task.id == task_id,
            task_visibility_filter(user_id),
            Task.is_deleted == False,  # noqa: E712
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return task


async def _get_attachment_for_read(
    db: DbSession, attachment_id: int, user_id: int
) -> Attachment:
    """读取附件的 ACL：上传者本人，或对所属任务可见（owner/assignee）。"""
    result = await db.execute(
        select(Attachment).where(Attachment.id == attachment_id)
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="附件不存在")
    if attachment.user_id != user_id:
        try:
            await _get_task_for_user(db, attachment.task_id, user_id)
        except HTTPException:
            # 统一 404，避免暴露附件存在性
            raise HTTPException(status_code=404, detail="附件不存在")
    return attachment


def _ticket_hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


async def _resolve_download_user(
    request: Request,
    db: DbSession,
    attachment_id: int,
    ticket: str | None,
) -> User:
    """下载鉴权：Authorization Bearer，或一次性下载票据。

    旧实现接受 `?token=<access_token>`——那是能调用全部接口的凭据，写进 URL 就会
    落进浏览器历史、Referer 和反代访问日志。改为 `?ticket=`：短时、一次性、
    且只对这一个附件有效。
    """
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        payload = decode_token(auth_header[7:])
        if not payload or payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="需要认证")
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="需要认证")
        user = (
            await db.execute(select(User).where(User.id == int(user_id)))
        ).scalar_one_or_none()
        if not user or not user.is_active:
            raise HTTPException(status_code=401, detail="需要认证")
        if token_revoked_for_user(payload, user.sessions_revoked_at):
            raise HTTPException(status_code=401, detail="需要认证")
        return user

    if not ticket:
        raise HTTPException(status_code=401, detail="需要认证")

    row = (
        await db.execute(
            select(AttachmentDownloadTicket).where(
                AttachmentDownloadTicket.token_hash == _ticket_hash(ticket),
                AttachmentDownloadTicket.attachment_id == attachment_id,
            )
        )
    ).scalar_one_or_none()
    now = datetime.utcnow()
    if row is None or row.used_at is not None or row.expires_at < now:
        raise HTTPException(status_code=401, detail="下载票据无效或已过期")
    row.used_at = now

    user = (
        await db.execute(select(User).where(User.id == row.user_id))
    ).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="需要认证")
    return user


@router.post("/tasks/{task_id}/attachments", response_model=ResponseData, status_code=201)
async def upload_attachment(
    task_id: int,
    db: DbSession,
    user: CurrentUser,
    file: UploadFile = File(...),
):
    """上传任务附件"""
    from app.services.rate_limit import enforce_upload

    await enforce_upload(db, user.id)
    await _get_task_for_user(db, task_id, user.id)

    if not file.filename:
        raise HTTPException(status_code=400, detail="未选择文件")

    ext = _get_file_extension(file.filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型: {ext}")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"文件大小超过限制 (最大 {_format_size(MAX_FILE_SIZE)})",
        )

    stored_name = f"{uuid.uuid4().hex}{ext}"
    _ensure_upload_dir()
    file_path = os.path.join(UPLOAD_DIR, stored_name)
    with open(file_path, "wb") as f:
        f.write(content)

    mime_type = (
        file.content_type
        or mimetypes.guess_type(file.filename)[0]
        or "application/octet-stream"
    )

    attachment = Attachment(
        task_id=task_id,
        user_id=user.id,
        original_name=file.filename,
        stored_name=stored_name,
        file_size=len(content),
        mime_type=mime_type,
    )
    db.add(attachment)
    await db.flush()

    return ResponseData(data=_attachment_dict(attachment))


@router.get("/tasks/{task_id}/attachments", response_model=ResponseData)
async def list_attachments(task_id: int, db: DbSession, user: CurrentUser):
    """列出任务附件（任务可见者可读全部附件，而非仅自己上传的）"""
    await _get_task_for_user(db, task_id, user.id)

    result = await db.execute(
        select(Attachment)
        .where(Attachment.task_id == task_id)
        .order_by(Attachment.created_at.desc())
    )
    attachments = result.scalars().all()
    return ResponseData(data=[_attachment_dict(att) for att in attachments])


@router.post("/attachments/{attachment_id}/download-ticket", response_model=ResponseData)
async def create_download_ticket(attachment_id: int, db: DbSession, user: CurrentUser):
    """换一张短时一次性下载票据，供 `<a download>` / `<img src>` 这类无法带头的场景。"""
    await _get_attachment_for_read(db, attachment_id, user.id)

    # 顺手清理过期票据，避免表无限增长
    await db.execute(
        delete(AttachmentDownloadTicket).where(
            AttachmentDownloadTicket.expires_at < datetime.utcnow()
        )
    )

    raw = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(seconds=DOWNLOAD_TICKET_TTL_SECONDS)
    db.add(
        AttachmentDownloadTicket(
            token_hash=_ticket_hash(raw),
            attachment_id=attachment_id,
            user_id=user.id,
            expires_at=expires_at,
        )
    )
    await db.flush()
    return ResponseData(
        data={
            "ticket": raw,
            "url": f"/api/v1/attachments/{attachment_id}/download?ticket={raw}",
            "expires_in": DOWNLOAD_TICKET_TTL_SECONDS,
        }
    )


@router.get("/attachments/{attachment_id}/download")
async def download_attachment(
    attachment_id: int,
    request: Request,
    db: DbSession,
    ticket: str = Query(None, description="一次性下载票据（替代 Authorization 头）"),
):
    """下载附件（Authorization 头，或 ?ticket= 一次性票据）"""
    current_user = await _resolve_download_user(request, db, attachment_id, ticket)

    attachment = await _get_attachment_for_read(db, attachment_id, current_user.id)

    file_path = os.path.join(UPLOAD_DIR, attachment.stored_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件已丢失")

    # 一律当附件下载：即使存量库里还有 .html/.svg，也不会在本站源下被渲染执行。
    # nosniff 关掉 IE/Edge 的内容嗅探回退。
    return FileResponse(
        path=file_path,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": _attachment_disposition(attachment.original_name),
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/attachments/{attachment_id}/preview")
async def preview_attachment(
    attachment_id: int,
    request: Request,
    db: DbSession,
    ticket: str = Query(None, description="一次性下载票据（替代 Authorization 头）"),
):
    """内联预览：仅图片位图与 PDF，其余类型退回 attachment 下载语义。"""
    current_user = await _resolve_download_user(request, db, attachment_id, ticket)
    attachment = await _get_attachment_for_read(db, attachment_id, current_user.id)

    file_path = os.path.join(UPLOAD_DIR, attachment.stored_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件已丢失")

    if (attachment.mime_type or "").lower() not in INLINE_SAFE_MIME_TYPES:
        return FileResponse(
            path=file_path,
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": _attachment_disposition(attachment.original_name),
                "X-Content-Type-Options": "nosniff",
            },
        )

    return FileResponse(
        path=file_path,
        media_type=attachment.mime_type,
        headers={
            "Content-Disposition": "inline",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.delete("/attachments/{attachment_id}", response_model=ResponseData)
async def delete_attachment(attachment_id: int, db: DbSession, user: CurrentUser):
    """删除附件"""
    result = await db.execute(
        select(Attachment).where(
            Attachment.id == attachment_id,
            Attachment.user_id == user.id,
        )
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="附件不存在")

    file_path = os.path.join(UPLOAD_DIR, attachment.stored_name)
    if os.path.exists(file_path):
        os.remove(file_path)

    await db.delete(attachment)
    await db.flush()
    return ResponseData(message="附件已删除")


@router.get("/attachments/{attachment_id}/content", response_model=ResponseData)
async def get_attachment_content(attachment_id: int, db: DbSession, user: CurrentUser):
    """获取附件内容（文本类可直接预览；owner/assignee 可读）"""
    attachment = await _get_attachment_for_read(db, attachment_id, user.id)

    file_path = os.path.join(UPLOAD_DIR, attachment.stored_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件已丢失")

    file_category = _get_file_category(attachment)
    base_data = {
        "id": attachment.id,
        "original_name": attachment.original_name,
        "mime_type": attachment.mime_type,
        "file_size": attachment.file_size,
        "file_category": file_category,
    }

    if file_category in ("text", "markdown", "csv"):
        try:
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
            return ResponseData(data={**base_data, "content": content, "is_text": True})
        except Exception as exc:
            raise HTTPException(status_code=500, detail="文件读取失败") from exc

    if file_category in ("image", "pdf", "docx", "xlsx"):
        return ResponseData(
            data={
                **base_data,
                "content": None,
                "is_text": False,
                "preview_url": f"/api/v1/attachments/{attachment.id}/preview",
            }
        )

    return ResponseData(
        data={
            **base_data,
            "content": None,
            "is_text": False,
            "preview_url": None,
        }
    )


@router.put("/attachments/{attachment_id}/replace", response_model=ResponseData)
async def replace_attachment_content(
    attachment_id: int,
    db: DbSession,
    user: CurrentUser,
    file: UploadFile = File(...),
):
    """替换附件文件内容（保留同一记录）"""
    result = await db.execute(
        select(Attachment).where(
            Attachment.id == attachment_id,
            Attachment.user_id == user.id,
        )
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="附件不存在")

    ext = _get_file_extension(file.filename or attachment.original_name)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型: {ext}")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"文件大小超过限制 (最大 {_format_size(MAX_FILE_SIZE)})",
        )

    old_path = os.path.join(UPLOAD_DIR, attachment.stored_name)
    if os.path.exists(old_path):
        os.remove(old_path)

    new_stored_name = f"{uuid.uuid4().hex}{ext}"
    _ensure_upload_dir()
    new_path = os.path.join(UPLOAD_DIR, new_stored_name)
    with open(new_path, "wb") as f:
        f.write(content)

    mime_type = (
        file.content_type
        or mimetypes.guess_type(file.filename or attachment.original_name)[0]
        or attachment.mime_type
    )
    attachment.stored_name = new_stored_name
    attachment.file_size = len(content)
    attachment.mime_type = mime_type
    if file.filename:
        attachment.original_name = file.filename

    await db.flush()
    return ResponseData(data=_attachment_dict(attachment))
