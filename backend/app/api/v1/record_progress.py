"""记录进展统一入口：根据内容与上下文建议去向（汇报草稿 / 证据材料 / 个人知识）"""
import json
import logging
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.dependencies import CurrentUser, DbSession
from app.models.company import CompanyMembership
from app.models.project import Project
from app.schemas.common import ResponseData
from app.services.llm_settings import chat_completion, llm_from_company
from sqlalchemy import select

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/record-progress", tags=["记录进展"])

KNOWLEDGE_KEYWORDS = (
    "笔记",
    "备忘",
    "摘记",
    "摘录",
    "心得",
    "学习",
    "资料",
    "知识",
    "思考",
    "个人积累",
    "memo",
    "note",
    "tips",
    "总结",
    "阅读",
    "灵感",
)


class RecordProgressSuggestRequest(BaseModel):
    text: str = Field(default="", max_length=100000)
    has_attachments: bool = False
    project_id: int | None = None
    node_id: int | None = None


def _rule_fallback(
    text: str, has_attachments: bool, project_id: int | None, node_id: int | None
) -> dict[str, str]:
    if has_attachments and node_id is not None:
        return {
            "target": "evidence",
            "reason": "包含附件且关联了具体事项，建议存为证据材料",
            "source": "rule",
        }
    t = (text or "").lower()
    if not project_id and not node_id and any(kw in t for kw in KNOWLEDGE_KEYWORDS):
        return {
            "target": "knowledge",
            "reason": "内容偏向个人学习备忘与知识沉淀，建议存为个人知识",
            "source": "rule",
        }
    return {
        "target": "report_draft",
        "reason": "内容适合作为工作进展或汇报草稿沉淀",
        "source": "rule",
    }


async def _resolve_company_id(
    db: DbSession, user_id: int, project_id: int | None = None
) -> int | None:
    if project_id:
        proj = await db.get(Project, project_id)
        if proj and proj.company_id:
            return proj.company_id
    membership = (
        await db.execute(
            select(CompanyMembership.company_id)
            .where(
                CompanyMembership.user_id == user_id,
                CompanyMembership.status == "active",
            )
            .order_by(CompanyMembership.id.asc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if membership:
        return membership
    try:
        from app.services.register_join import get_default_company

        co = await get_default_company(db)
        if co:
            return co.id
    except Exception:
        pass
    return None


@router.post("/suggest")
async def suggest_record_target(
    body: RecordProgressSuggestRequest,
    db: DbSession,
    user: CurrentUser,
):
    """
    根据进展内容智能建议去向：汇报草稿 / 证据材料 / 个人知识。
    不落库，只给建议。要求登录。
    """
    company_id = getattr(user, "company_id", None)
    if not company_id:
        company_id = await _resolve_company_id(db, user.id, body.project_id)
    llm = await llm_from_company(db, company_id or 1)

    # provider=fake 或不可用或未配置时一律走规则，source="rule"
    if not llm or llm.provider == "fake" or not llm.is_usable():
        res = _rule_fallback(body.text, body.has_attachments, body.project_id, body.node_id)
        return ResponseData(data=res)

    prompt = (
        "你是一个办公智能助手，帮助用户判断一段新记录内容的最佳去向。\n"
        "可选去向只有以下三个（target 字段必须是这三个字符串之一）：\n"
        "1. report_draft: 汇报草稿（适合向上级或团队汇报的工作进展、阶段性成果、日常同步等）\n"
        "2. evidence: 证据材料（适合支撑事项交付的工作凭证、文档证明、测试记录、附带附件等）\n"
        "3. knowledge: 个人知识（适合个人笔记、备忘、方法总结、心得资料、通用积累等）\n\n"
        f"输入信息：\n"
        f"- 文本内容: {body.text}\n"
        f"- 是否有附件: {body.has_attachments}\n"
        f"- 关联项目ID: {body.project_id}\n"
        f"- 关联事项ID: {body.node_id}\n\n"
        "请根据输入分析并给出最合适的目标，必须只输出合法 JSON，格式如下：\n"
        '{"target": "report_draft"|"evidence"|"knowledge", "reason": "推荐理由简述（20字以内）"}\n'
        "禁止输出任何额外的标记、问候语或解释。"
    )

    try:
        completion = await chat_completion(
            llm,
            messages=[
                {"role": "system", "content": "你只输出合法的 JSON 格式。"},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            max_tokens=200,
        )
        if completion.get("ok"):
            content = (completion.get("content") or "").strip()
            # 清理可能的 markdown 代码块包装
            if content.startswith("```"):
                lines = content.splitlines()
                if len(lines) >= 2 and lines[-1].strip().startswith("```"):
                    content = "\n".join(lines[1:-1]).strip()
                elif lines[0].startswith("```"):
                    content = "\n".join(lines[1:]).strip()
            start = content.find("{")
            end = content.rfind("}")
            if start != -1 and end != -1 and end > start:
                content = content[start : end + 1]
            data = json.loads(content)
            target = data.get("target")
            if target in ("report_draft", "evidence", "knowledge"):
                reason = str(data.get("reason") or "模型智能推荐")
                return ResponseData(
                    data={
                        "target": target,
                        "reason": reason,
                        "source": "llm",
                    }
                )
    except Exception as e:
        logger.warning("LLM suggest failed, fallback to rule: %s", e)

    fallback_res = _rule_fallback(body.text, body.has_attachments, body.project_id, body.node_id)
    return ResponseData(data=fallback_res)
