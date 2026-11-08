"""内测/单公司部署初始化（在 alembic 迁移之后执行，可重复运行）。

做四件事，每件都是“已存在就跳过”：
  1. 创建默认公司（DEFAULT_COMPANY_SLUG）；
  2. 创建首个公司超级管理员（邮箱标记为已验证）；
  3. 用私钥文件签发并应用授权，使公司解锁；
  4. 打印摘要（不含任何密钥或密码）。

管理员密码只从环境变量 BOOTSTRAP_ADMIN_PASSWORD 或交互输入读取，不回显、不打印。

容器内用法见 docs/本机内测部署手册.md。
"""
from __future__ import annotations

import argparse
import asyncio
import getpass
import json
import os
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, time, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import or_, select  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.security import get_password_hash  # noqa: E402
from app.models.category import Category  # noqa: E402
from app.models.company import Company, CompanyMembership  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.company_bootstrap import (  # noqa: E402
    apply_license_to_company,
    bootstrap_single_company,
)
from app.services.entitlement import EntitlementService  # noqa: E402
from app.services.license_verify import sign_license_ed25519  # noqa: E402

MIN_PASSWORD_LEN = 10


@dataclass
class InstallSummary:
    company_slug: str = ""
    company_created: bool = False
    admin_username: str = ""
    admin_created: bool = False
    license_applied: bool = False
    company_unlocked: bool = False
    max_users: int | None = None
    valid_to: str | None = None
    notes: list[str] = field(default_factory=list)

    def render(self) -> str:
        def yn(created: bool) -> str:
            return "本次新建" if created else "已存在，跳过"

        lines = [
            "===== 初始化摘要 =====",
            f"公司标识：{self.company_slug}（{yn(self.company_created)}）",
            f"超级管理员：{self.admin_username}（{yn(self.admin_created)}）",
            f"授权：{'本次已签发并应用' if self.license_applied else '未重新签发（公司已解锁）'}",
            f"公司状态：{'已解锁，可正常使用' if self.company_unlocked else '仍未解锁！'}",
        ]
        if self.max_users is not None:
            lines.append(f"人数上限：{self.max_users}")
        if self.valid_to:
            lines.append(f"授权到期：{self.valid_to}")
        lines.extend(self.notes)
        return "\n".join(lines)


def read_private_key(path: str | Path) -> str:
    p = Path(path).expanduser()
    if not p.is_file():
        raise ValueError(f"找不到私钥文件：{p}")
    key = p.read_text(encoding="ascii").strip()
    if not key:
        raise ValueError("私钥文件是空的")
    return key


def resolve_password(env=None, prompt=getpass.getpass) -> str:
    env = os.environ if env is None else env
    pwd = env.get("BOOTSTRAP_ADMIN_PASSWORD") or ""
    if not pwd:
        pwd = prompt("请输入管理员密码（输入时不显示）：")
        confirm = prompt("请再输入一次：")
        if pwd != confirm:
            raise ValueError("两次输入的密码不一致")
    if len(pwd) < MIN_PASSWORD_LEN:
        raise ValueError(f"管理员密码至少 {MIN_PASSWORD_LEN} 位")
    return pwd


def parse_expiry(text: str) -> datetime:
    """YYYY-MM-DD → 当日结束（UTC）；必须晚于现在。"""
    try:
        d = date.fromisoformat(text)
    except ValueError as e:
        raise ValueError(f"到期日格式应为 YYYY-MM-DD：{text}") from e
    end = datetime.combine(d, time(23, 59, 59), tzinfo=timezone.utc)
    if end <= datetime.now(timezone.utc):
        raise ValueError("到期日必须晚于今天")
    return end


def build_license(
    slug: str, private_key: str, max_users: int, valid_to: datetime, max_projects: int = 100
) -> tuple[str, str]:
    payload = {
        "company_slug": slug,
        "features": {"project_tree": True, "agents": True, "org_sync": True},
        "quotas": {"max_users": max_users, "max_projects": max_projects},
        "valid_to": valid_to.isoformat(),
    }
    raw = json.dumps(payload, sort_keys=True)
    return raw, sign_license_ed25519(raw, private_key)


async def ensure_admin(
    db: AsyncSession, *, username: str, email: str, password: str
) -> tuple[User, bool]:
    existing = await db.scalar(
        select(User).where(or_(User.username == username, User.email == email))
    )
    if existing:
        return existing, False
    user = User(
        username=username,
        nickname=username,
        email=email,
        password_hash=get_password_hash(password),
        email_verified_at=datetime.now(timezone.utc),
        is_active=True,
    )
    db.add(user)
    await db.flush()
    db.add_all(
        [
            Category(user_id=user.id, name="工作", color="#409EFF", icon="work", is_default=True, sort_order=0),
            Category(user_id=user.id, name="个人", color="#67C23A", icon="user", sort_order=1),
            Category(user_id=user.id, name="学习", color="#E6A23C", icon="book", sort_order=2),
            Category(user_id=user.id, name="重要", color="#F56C6C", icon="star", sort_order=3),
        ]
    )
    await db.flush()
    return user, True


async def ensure_company(
    db: AsyncSession, *, slug: str, name: str, admin: User, admin_created: bool
) -> tuple[Company, bool]:
    company = await db.scalar(select(Company).where(Company.slug == slug))
    if company:
        if admin_created:
            # 新建的管理员加入已存在的公司并设为超级管理员
            db.add(
                CompanyMembership(
                    company_id=company.id,
                    user_id=admin.id,
                    status="active",
                    is_super_admin=True,
                    is_org_leader=True,
                    employment_status="active",
                )
            )
            await db.flush()
        return company, False
    company = await bootstrap_single_company(db, name=name, slug=slug, admin_user_id=admin.id)
    return company, True


async def install(
    db: AsyncSession,
    *,
    company_slug: str,
    company_name: str,
    admin_username: str,
    admin_email: str,
    admin_password: str,
    private_key: str,
    max_users: int,
    valid_to: datetime,
    force_license: bool = False,
) -> InstallSummary:
    summary = InstallSummary(company_slug=company_slug, admin_username=admin_username)
    admin, summary.admin_created = await ensure_admin(
        db, username=admin_username, email=admin_email, password=admin_password
    )
    if not summary.admin_created:
        summary.notes.append("提示：该用户名或邮箱已存在，未修改其密码与资料。")
    company, summary.company_created = await ensure_company(
        db, slug=company_slug, name=company_name, admin=admin, admin_created=summary.admin_created
    )

    if force_license or not EntitlementService().is_company_unlocked(company):
        raw, sig = build_license(company_slug, private_key, max_users, valid_to)
        await apply_license_to_company(db, company, raw, sig)
        summary.license_applied = True
    await db.flush()
    await db.refresh(company)

    ent = company.entitlement_json or {}
    summary.company_unlocked = EntitlementService().is_company_unlocked(company)
    summary.max_users = (ent.get("quotas") or {}).get("max_users")
    summary.valid_to = ent.get("valid_to")
    return summary


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="内测部署初始化（可重复运行）")
    p.add_argument("--admin-username", required=True, help="管理员用户名")
    p.add_argument("--admin-email", required=True, help="管理员邮箱（将标记为已验证）")
    p.add_argument("--private-key-file", required=True, help="授权私钥文件路径（容器内路径）")
    p.add_argument("--max-users", type=int, required=True, help="人数上限")
    p.add_argument("--valid-to", required=True, help="授权到期日 YYYY-MM-DD")
    p.add_argument("--company-name", default="内测公司", help="公司名称（仅首次创建时使用）")
    p.add_argument("--force-license", action="store_true", help="公司已解锁时也重新签发授权（续期/调整人数）")
    return p


async def run(args: argparse.Namespace) -> InstallSummary:
    from app.db.session import async_session_factory, engine

    password = resolve_password()
    private_key = read_private_key(args.private_key_file)
    valid_to = parse_expiry(args.valid_to)
    if args.max_users < 1:
        raise ValueError("人数上限必须 >= 1")
    try:
        async with async_session_factory() as db:
            summary = await install(
                db,
                company_slug=(settings.DEFAULT_COMPANY_SLUG or "default").strip(),
                company_name=args.company_name,
                admin_username=args.admin_username,
                admin_email=args.admin_email,
                admin_password=password,
                private_key=private_key,
                max_users=args.max_users,
                valid_to=valid_to,
                force_license=args.force_license,
            )
            await db.commit()
    finally:
        await engine.dispose()
    return summary


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        summary = asyncio.run(run(args))
    except ValueError as e:
        print(f"失败：{e}", file=sys.stderr)
        return 2
    print(summary.render())
    return 0 if summary.company_unlocked else 1


if __name__ == "__main__":
    raise SystemExit(main())
