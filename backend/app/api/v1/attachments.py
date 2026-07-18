"""
任务附件接口（异步 SQLAlchemy，与现役 v1 路由一致）
"""
import mimetypes
import os
import uuid

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.core.dependencies import CurrentUser, DbSession
from app.core.security import decode_token
from app.models.attachment import Attachment
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

ALLOWED_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".txt", ".csv", ".md", ".rtf", ".odt", ".ods", ".odp",
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg", ".ico",
    ".zip", ".rar", ".7z", ".tar", ".gz",
    ".json", ".xml", ".yaml", ".yml", ".sql", ".py", ".js", ".ts",
    ".html", ".css", ".sh", ".bat",
    ".eml", ".log",
}

TEXT_MIME_TYPES = {
    "text/plain", "text/csv", "text/html", "text/css", "text/xml",
    "text/markdown", "text/x-markdown",
    "application/json", "application/xml", "application/javascript",
    "application/x-yaml", "application/yaml",
    "application/x-sh", "application/x-bat",
}

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
    result = await db.execute(
        select(Task).where(
            Task.id == task_id,
            Task.user_id == user_id,
            Task.is_deleted == False,  # noqa: E712
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return task


async def _resolve_user_from_request(
    request: Request,
    db: DbSession,
    token: str | None,
) -> User:
    """支持 Authorization Bearer 或 ?token= 查询参数。"""
    access_token = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        access_token = auth_header[7:]
    elif token:
        access_token = token

    if not access_token:
        raise HTTPException(status_code=401, detail="需要认证")

    payload = decode_token(access_token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="需要认证")

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail="需要认证")

    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if not user:
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
    """列出任务附件"""
    await _get_task_for_user(db, task_id, user.id)

    result = await db.execute(
        select(Attachment)
        .where(Attachment.task_id == task_id, Attachment.user_id == user.id)
        .order_by(Attachment.created_at.desc())
    )
    attachments = result.scalars().all()
    return ResponseData(data=[_attachment_dict(att) for att in attachments])


@router.get("/attachments/{attachment_id}/download")
async def download_attachment(
    attachment_id: int,
    request: Request,
    db: DbSession,
    token: str = Query(None, description="JWT token（可选，替代 Authorization 头）"),
):
    """下载附件（支持 Header 或 query token）"""
    current_user = await _resolve_user_from_request(request, db, token)

    result = await db.execute(
        select(Attachment).where(
            Attachment.id == attachment_id,
            Attachment.user_id == current_user.id,
        )
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="附件不存在")

    file_path = os.path.join(UPLOAD_DIR, attachment.stored_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件已丢失")

    return FileResponse(
        path=file_path,
        filename=attachment.original_name,
        media_type=attachment.mime_type,
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
    """获取附件内容（文本类可直接预览）"""
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
                "preview_url": f"/api/v1/attachments/{attachment.id}/download",
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

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"文件大小超过限制 (最大 {_format_size(MAX_FILE_SIZE)})",
        )

    old_path = os.path.join(UPLOAD_DIR, attachment.stored_name)
    if os.path.exists(old_path):
        os.remove(old_path)

    ext = _get_file_extension(file.filename or attachment.original_name)
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
