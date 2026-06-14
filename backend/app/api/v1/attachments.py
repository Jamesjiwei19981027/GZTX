import os
import uuid
import mimetypes
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, get_current_user
from app.models.user import User
from app.models.task import Task
from app.models.attachment import Attachment
from app.schemas.attachment import AttachmentResponse
from app.schemas.common import ResponseModel

router = APIRouter(tags=["附件"])

# Upload directory
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "data", "uploads")

# Max file size: 20MB
MAX_FILE_SIZE = 20 * 1024 * 1024

# Allowed extensions (broad set for a productivity app)
ALLOWED_EXTENSIONS = {
    # Documents
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".txt", ".csv", ".md", ".rtf", ".odt", ".ods", ".odp",
    # Images
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg", ".ico",
    # Archives
    ".zip", ".rar", ".7z", ".tar", ".gz",
    # Code / Data
    ".json", ".xml", ".yaml", ".yml", ".sql", ".py", ".js", ".ts",
    ".html", ".css", ".sh", ".bat",
    # Other
    ".eml", ".log",
}


def _ensure_upload_dir():
    """Create upload directory if it doesn't exist."""
    os.makedirs(UPLOAD_DIR, exist_ok=True)


def _get_file_extension(filename: str) -> str:
    """Extract lowercase file extension."""
    _, ext = os.path.splitext(filename)
    return ext.lower()


def _format_size(size_bytes: int) -> str:
    """Format file size for display."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    else:
        return f"{size_bytes / (1024 * 1024):.1f} MB"


@router.post("/tasks/{task_id}/attachments", response_model=ResponseModel)
async def upload_attachment(
    task_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a file attachment to a task."""
    # Verify task belongs to user
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.user_id == current_user.id,
        Task.is_deleted == False
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "任务不存在"})

    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail={"code": 400, "message": "未选择文件"})

    ext = _get_file_extension(file.filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail={"code": 400, "message": f"不支持的文件类型: {ext}"}
        )

    # Read file content and check size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail={"code": 400, "message": f"文件大小超过限制 (最大 {_format_size(MAX_FILE_SIZE)})"}
        )

    # Generate unique stored filename
    stored_name = f"{uuid.uuid4().hex}{ext}"
    _ensure_upload_dir()

    # Save file to disk
    file_path = os.path.join(UPLOAD_DIR, stored_name)
    with open(file_path, "wb") as f:
        f.write(content)

    # Detect mime type
    mime_type = file.content_type or mimetypes.guess_type(file.filename)[0] or "application/octet-stream"

    # Create database record
    attachment = Attachment(
        task_id=task_id,
        user_id=current_user.id,
        original_name=file.filename,
        stored_name=stored_name,
        file_size=len(content),
        mime_type=mime_type,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)

    return ResponseModel(
        data={
            "id": attachment.id,
            "task_id": attachment.task_id,
            "original_name": attachment.original_name,
            "file_size": attachment.file_size,
            "mime_type": attachment.mime_type,
            "download_url": f"/api/v1/attachments/{attachment.id}/download",
            "created_at": attachment.created_at.isoformat(),
        }
    )


@router.get("/tasks/{task_id}/attachments", response_model=ResponseModel)
async def list_attachments(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all attachments for a task."""
    # Verify task belongs to user
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.user_id == current_user.id,
        Task.is_deleted == False
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "任务不存在"})

    attachments = db.query(Attachment).filter(
        Attachment.task_id == task_id,
        Attachment.user_id == current_user.id,
    ).order_by(Attachment.created_at.desc()).all()

    items = []
    for att in attachments:
        items.append({
            "id": att.id,
            "task_id": att.task_id,
            "original_name": att.original_name,
            "file_size": att.file_size,
            "mime_type": att.mime_type,
            "download_url": f"/api/v1/attachments/{att.id}/download",
            "created_at": att.created_at.isoformat(),
        })

    return ResponseModel(data=items)


@router.get("/attachments/{attachment_id}/download")
async def download_attachment(
    attachment_id: int,
    request: Request,
    token: str = Query(None, description="JWT token (alternative to Authorization header)"),
    db: Session = Depends(get_db),
):
    """Download an attachment file. Supports both Authorization header and ?token= query param."""
    from app.core.security import verify_token as jwt_verify_token

    current_user = None

    # Try Authorization header first
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        header_token = auth_header[7:]
        payload = jwt_verify_token(header_token, "access")
        if payload:
            user_id = payload.get("sub")
            if user_id:
                current_user = db.query(User).filter(User.id == int(user_id)).first()

    # Fall back to query param token
    if not current_user and token:
        payload = jwt_verify_token(token, "access")
        if payload:
            user_id = payload.get("sub")
            if user_id:
                current_user = db.query(User).filter(User.id == int(user_id)).first()

    if not current_user:
        raise HTTPException(status_code=401, detail={"code": 401, "message": "需要认证"})

    attachment = db.query(Attachment).filter(
        Attachment.id == attachment_id,
        Attachment.user_id == current_user.id,
    ).first()
    if not attachment:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "附件不存在"})

    file_path = os.path.join(UPLOAD_DIR, attachment.stored_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail={"code": 404, "message": "文件已丢失"})

    return FileResponse(
        path=file_path,
        filename=attachment.original_name,
        media_type=attachment.mime_type,
    )


@router.delete("/attachments/{attachment_id}", response_model=ResponseModel)
async def delete_attachment(
    attachment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete an attachment."""
    attachment = db.query(Attachment).filter(
        Attachment.id == attachment_id,
        Attachment.user_id == current_user.id,
    ).first()
    if not attachment:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "附件不存在"})

    # Delete file from disk
    file_path = os.path.join(UPLOAD_DIR, attachment.stored_name)
    if os.path.exists(file_path):
        os.remove(file_path)

    # Delete database record
    db.delete(attachment)
    db.commit()

    return ResponseModel(message="附件已删除")


# MIME types that can be viewed/edited as text
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


def _is_text_file(attachment: Attachment) -> bool:
    """Check if an attachment is a text-based file."""
    if attachment.mime_type in TEXT_MIME_TYPES:
        return True
    ext = _get_file_extension(attachment.original_name)
    return ext in TEXT_EXTENSIONS


# Office document MIME types and extensions
OFFICE_WORD_MIMES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
    "application/msword",  # .doc
}
OFFICE_EXCEL_MIMES = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # .xlsx
    "application/vnd.ms-excel",  # .xls
}
OFFICE_PPT_MIMES = {
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",  # .pptx
    "application/vnd.ms-powerpoint",  # .ppt
}
OFFICE_WORD_EXTS = {".docx", ".doc"}
OFFICE_EXCEL_EXTS = {".xlsx", ".xls"}
OFFICE_PPT_EXTS = {".pptx", ".ppt"}


def _get_file_category(attachment: Attachment) -> str:
    """Categorize a file for frontend preview rendering.
    Returns: text, markdown, csv, image, pdf, docx, xlsx, or unsupported
    """
    ext = _get_file_extension(attachment.original_name)

    # Markdown
    if ext == ".md" or attachment.mime_type in ("text/markdown", "text/x-markdown"):
        return "markdown"

    # CSV
    if ext == ".csv" or attachment.mime_type == "text/csv":
        return "csv"

    # Plain text / code
    if _is_text_file(attachment):
        return "text"

    # Images
    if attachment.mime_type.startswith("image/"):
        return "image"

    # PDF
    if "pdf" in attachment.mime_type:
        return "pdf"

    # Word (.docx only - .doc legacy binary not supported for preview)
    if attachment.mime_type in OFFICE_WORD_MIMES:
        if ext == ".docx":
            return "docx"
        return "unsupported"  # .doc legacy

    # Excel (.xlsx only - .xls legacy not supported)
    if attachment.mime_type in OFFICE_EXCEL_MIMES:
        if ext == ".xlsx":
            return "xlsx"
        return "unsupported"  # .xls legacy

    # PowerPoint (not supported for inline preview)
    if attachment.mime_type in OFFICE_PPT_MIMES:
        return "unsupported"

    return "unsupported"


@router.get("/attachments/{attachment_id}/content")
async def get_attachment_content(
    attachment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the text content of an attachment (for text-based files)."""
    attachment = db.query(Attachment).filter(
        Attachment.id == attachment_id,
        Attachment.user_id == current_user.id,
    ).first()
    if not attachment:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "附件不存在"})

    file_path = os.path.join(UPLOAD_DIR, attachment.stored_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail={"code": 404, "message": "文件已丢失"})

    file_category = _get_file_category(attachment)
    base_data = {
        "id": attachment.id,
        "original_name": attachment.original_name,
        "mime_type": attachment.mime_type,
        "file_size": attachment.file_size,
        "file_category": file_category,
    }

    # Text-based files (including markdown, csv): return content as string
    if file_category in ("text", "markdown", "csv"):
        try:
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
            return ResponseModel(data={**base_data, "content": content, "is_text": True})
        except Exception:
            raise HTTPException(status_code=500, detail={"code": 500, "message": "文件读取失败"})

    # Images, PDF, Office docs: return download URL for frontend to fetch as blob
    if file_category in ("image", "pdf", "docx", "xlsx"):
        return ResponseModel(data={
            **base_data,
            "content": None,
            "is_text": False,
            "preview_url": f"/api/v1/attachments/{attachment.id}/download",
        })

    # Other types - not previewable inline
    return ResponseModel(data={
        **base_data,
        "content": None,
        "is_text": False,
        "preview_url": None,
    })


@router.put("/attachments/{attachment_id}/replace", response_model=ResponseModel)
async def replace_attachment_content(
    attachment_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Replace the content of an existing attachment (keeps same record, updates file)."""
    attachment = db.query(Attachment).filter(
        Attachment.id == attachment_id,
        Attachment.user_id == current_user.id,
    ).first()
    if not attachment:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "附件不存在"})

    # Read new file
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail={"code": 400, "message": f"文件大小超过限制 (最大 {_format_size(MAX_FILE_SIZE)})"}
        )

    # Delete old file from disk
    old_path = os.path.join(UPLOAD_DIR, attachment.stored_name)
    if os.path.exists(old_path):
        os.remove(old_path)

    # Generate new stored name (keep original extension or use new one)
    ext = _get_file_extension(file.filename or attachment.original_name)
    new_stored_name = f"{uuid.uuid4().hex}{ext}"

    # Save new file
    _ensure_upload_dir()
    new_path = os.path.join(UPLOAD_DIR, new_stored_name)
    with open(new_path, "wb") as f:
        f.write(content)

    # Update database record
    mime_type = file.content_type or mimetypes.guess_type(file.filename or attachment.original_name)[0] or attachment.mime_type
    attachment.stored_name = new_stored_name
    attachment.file_size = len(content)
    attachment.mime_type = mime_type
    if file.filename:
        attachment.original_name = file.filename
    db.commit()
    db.refresh(attachment)

    return ResponseModel(
        data={
            "id": attachment.id,
            "task_id": attachment.task_id,
            "original_name": attachment.original_name,
            "file_size": attachment.file_size,
            "mime_type": attachment.mime_type,
            "download_url": f"/api/v1/attachments/{attachment.id}/download",
            "created_at": attachment.created_at.isoformat(),
        }
    )
