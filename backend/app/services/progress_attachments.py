"""记录进展的附件：把用户已上传的文件（evidence_files）校验后转成可存入记录的摘要。"""
from sqlalchemy import select

from app.models.evidence import EvidenceFile


async def resolve_attachments(db, *, user_id: int, file_ids: list[int] | None, company_id: int | None = None) -> list[dict]:
    """只接受当前用户自己上传的文件；其他人或不存在的 id 直接忽略。"""
    ids = sorted({int(i) for i in (file_ids or []) if int(i) > 0})
    if not ids:
        return []
    rows = (
        await db.execute(select(EvidenceFile).where(EvidenceFile.id.in_(ids), EvidenceFile.uploader_user_id == user_id))
    ).scalars().all()
    return [
        {"file_id": f.id, "original_name": f.original_name, "mime_type": f.mime_type, "size_bytes": f.size_bytes}
        for f in rows
        if company_id is None or f.company_id in (None, company_id)
    ]
