"""内测部署初始化脚本测试：幂等、邮箱已验证、授权解锁、私钥路径护栏。"""
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.core.config import settings
from app.models.company import Company, CompanyMembership
from app.models.user import User
from app.services.entitlement import EntitlementService
from app.services.license_verify import generate_ed25519_keypair
from scripts import bootstrap_install as bi
from scripts import gen_license_keypair as gk

# 测试专用占位值，非真实凭据
TEST_PASSWORD = "test-only-pass-1234"


@pytest.fixture
def keypair(monkeypatch):
    priv, pub = generate_ed25519_keypair()
    monkeypatch.setattr(settings, "LICENSE_PUBLIC_KEY", pub)
    monkeypatch.setattr(settings, "LICENSE_VERIFY_MODE", "ed25519")
    return priv, pub


def _kwargs(priv, **over):
    base = dict(
        company_slug="beta-co",
        company_name="内测公司",
        admin_username="beta_admin",
        admin_email="beta_admin@example.com",
        admin_password=TEST_PASSWORD,
        private_key=priv,
        max_users=30,
        valid_to=bi.parse_expiry("2999-12-31"),
    )
    base.update(over)
    return base


async def _count(db, model):
    return (await db.execute(select(func.count()).select_from(model))).scalar()


async def test_install_creates_company_admin_and_unlocks(db_session, keypair):
    priv, _ = keypair
    summary = await bi.install(db_session, **_kwargs(priv))

    assert summary.company_created and summary.admin_created and summary.license_applied
    assert summary.company_unlocked and summary.max_users == 30

    admin = await db_session.scalar(select(User).where(User.username == "beta_admin"))
    assert admin.email_verified_at is not None
    assert admin.password_hash and admin.password_hash != TEST_PASSWORD

    company = await db_session.scalar(select(Company).where(Company.slug == "beta-co"))
    assert EntitlementService().is_company_unlocked(company)
    member = await db_session.scalar(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company.id, CompanyMembership.user_id == admin.id
        )
    )
    assert member.is_super_admin


async def test_install_is_idempotent(db_session, keypair):
    priv, _ = keypair
    await bi.install(db_session, **_kwargs(priv))
    second = await bi.install(db_session, **_kwargs(priv))

    assert not second.company_created and not second.admin_created
    assert not second.license_applied and second.company_unlocked
    assert await _count(db_session, Company) == 1
    assert await _count(db_session, User) == 1
    assert await _count(db_session, CompanyMembership) == 1


async def test_summary_has_no_secrets(db_session, keypair):
    priv, pub = keypair
    summary = await bi.install(db_session, **_kwargs(priv))
    text = summary.render()
    assert TEST_PASSWORD not in text and priv not in text


async def test_force_license_reapplies(db_session, keypair):
    priv, _ = keypair
    await bi.install(db_session, **_kwargs(priv))
    again = await bi.install(db_session, **_kwargs(priv, max_users=50), force_license=True)
    assert again.license_applied and again.max_users == 50


def test_resolve_password_from_env_and_prompt():
    assert bi.resolve_password({"BOOTSTRAP_ADMIN_PASSWORD": TEST_PASSWORD}) == TEST_PASSWORD
    answers = iter([TEST_PASSWORD, TEST_PASSWORD])
    assert bi.resolve_password({}, prompt=lambda _: next(answers)) == TEST_PASSWORD
    with pytest.raises(ValueError):
        bi.resolve_password({"BOOTSTRAP_ADMIN_PASSWORD": "short"})
    mismatch = iter([TEST_PASSWORD, TEST_PASSWORD + "x"])
    with pytest.raises(ValueError):
        bi.resolve_password({}, prompt=lambda _: next(mismatch))


def test_parse_expiry_rejects_past_and_bad_format():
    with pytest.raises(ValueError):
        bi.parse_expiry("2000-01-01")
    with pytest.raises(ValueError):
        bi.parse_expiry("not-a-date")


def test_gen_keypair_writes_outside_repo(tmp_path, capsys):
    dest = tmp_path / "keys" / "license.key"
    assert gk.main(["--private-key-file", str(dest)]) == 0
    out = capsys.readouterr().out
    priv = dest.read_text().strip()
    assert priv and priv not in out  # 私钥不上屏
    pub_line = out.strip().splitlines()[-1]
    assert pub_line and pub_line != priv
    # 已存在时拒绝覆盖
    assert gk.main(["--private-key-file", str(dest)]) == 2


def test_gen_keypair_rejects_path_inside_repo(capsys):
    inside = Path(gk.__file__).resolve().parents[1] / "should_not_exist.key"
    assert gk.is_inside_repo(inside)
    assert gk.main(["--private-key-file", str(inside)]) == 2
    assert not inside.exists()
    repo_root_file = Path(gk.__file__).resolve().parents[2] / "should_not_exist.key"
    assert gk.is_inside_repo(repo_root_file)
    assert gk.main(["--private-key-file", str(repo_root_file)]) == 2
    assert not repo_root_file.exists()


def test_generated_key_can_drive_bootstrap_read(tmp_path):
    dest = tmp_path / "k.key"
    assert gk.main(["--private-key-file", str(dest)]) == 0
    assert bi.read_private_key(dest)
    with pytest.raises(ValueError):
        bi.read_private_key(tmp_path / "missing.key")
