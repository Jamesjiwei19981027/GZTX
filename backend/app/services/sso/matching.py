"""只在目标企业已有成员内匹配身份，供应商绑定优先于联系方式。"""
import re

from sqlalchemy import func, select
from app.core.collab_errors import CollabError
from app.models.company import CompanyMembership
from app.models.sso import SsoBinding
from app.models.user import User


def normalize_mobile(value: str | None) -> str:
    phone = re.sub(r"[\s()-]", "", value or "")
    if phone.startswith("+86") and len(phone) == 14:
        phone = phone[3:]
    elif phone.startswith("0086") and len(phone) == 15:
        phone = phone[4:]
    return phone


async def match_member(db, company_id: int, *, provider: str, issuer: str, external_id: str,
                       email: str | None = None, mobile: str | None = None):
    binding = await db.scalar(select(SsoBinding).where(SsoBinding.company_id == company_id,
        SsoBinding.provider == provider, SsoBinding.issuer == issuer, SsoBinding.external_id == external_id))
    query = select(CompanyMembership, User).join(User, User.id == CompanyMembership.user_id).where(
        CompanyMembership.company_id == company_id)
    if binding:
        rows = (await db.execute(query.where(User.id == binding.user_id))).all()
        # 注销账户已撤销身份与联系方式；重新受邀的成员不应被旧禁用账户永久占用。
        if rows and not rows[0][1].is_active and (email or mobile):
            rows = []
    else:
        rows = []
        if email and isinstance(email, str):
            rows = (await db.execute(query.where(func.lower(User.email) == email.strip().lower()))).all()
        if not rows and mobile:
            phone = normalize_mobile(mobile)
            # 数据库里兼容已有国际区号格式；限定企业成员，不能匹配到别的企业账号。
            rows = [(m, u) for m, u in (await db.execute(query.where(User.phone.is_not(None)))).all()
                    if normalize_mobile(u.phone) == phone and phone]
    if len(rows) != 1:
        return None
    return rows[0]


def assert_member_can_login(membership, user):
    if not user.is_active or membership.status != "active":
        raise CollabError(403, 40302, "请联系管理员邀请你加入")
    if membership.employment_status != "active":
        raise CollabError(403, 40314, "在职状态无效，禁止登录协作域")


async def bind_identity(db, company_id: int, user_id: int, ident):
    existing = await db.scalar(select(SsoBinding).where(SsoBinding.company_id == company_id,
        SsoBinding.provider == ident.provider, SsoBinding.issuer == ident.issuer,
        SsoBinding.user_id == user_id))
    if existing:
        owner = await db.get(User, existing.user_id)
        if owner and not owner.is_active and existing.user_id != user_id:
            await db.delete(existing)
            await db.flush()
            existing = None
        elif existing.external_id != ident.external_id:
            raise CollabError(403, 40302, "账号已绑定其他企业身份，请联系管理员")
        if existing:
            return
    db.add(SsoBinding(company_id=company_id, user_id=user_id, provider=ident.provider,
                      issuer=ident.issuer, external_id=ident.external_id))
    await db.flush()
