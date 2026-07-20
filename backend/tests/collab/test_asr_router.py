import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bindings import AsrBinding
from app.models.company import Company
from app.services.asr.builtin import BuiltinAsr, FakeAsr
from app.services.asr.router import AsrRouter


@pytest.mark.asyncio
async def test_builtin_transcribe():
    eng = BuiltinAsr()
    assert await eng.transcribe(b"", "audio/wav") == ""
    text = await eng.transcribe(b"xx", "audio/wav")
    assert "builtin" in text


@pytest.mark.asyncio
async def test_fake_asr():
    eng = FakeAsr("你好世界")
    assert await eng.transcribe(b"1", "audio/wav") == "你好世界"


@pytest.mark.asyncio
async def test_resolve_default_builtin(db_session: AsyncSession, seed_ids):
    company = await db_session.get(Company, seed_ids["company_id"])
    eng = await AsrRouter().resolve(db_session, company, user_id=seed_ids["member_user_id"])
    assert eng.provider_id == "builtin"


@pytest.mark.asyncio
async def test_user_cannot_pick_disallowed_cloud(db_session: AsyncSession, seed_ids):
    company = await db_session.get(Company, seed_ids["company_id"])
    company.policy_preset = "controlled"
    company.policy_json = {
        "allowed_asr_ids": ["builtin", "customer"],
        "asr_egress": "allowlist",
    }
    await db_session.flush()
    with pytest.raises(PermissionError):
        await AsrRouter().resolve(
            db_session, company, user_id=1, preferred="cloud:foo"
        )


@pytest.mark.asyncio
async def test_user_binding_preferred(db_session: AsyncSession, seed_ids):
    company = await db_session.get(Company, seed_ids["company_id"])
    company.policy_preset = "standard"
    company.policy_json = {"allowed_asr_ids": ["builtin", "cloud:*"]}
    db_session.add(
        AsrBinding(
            company_id=company.id,
            user_id=seed_ids["member_user_id"],
            provider_id="cloud:x",
            is_default=False,
        )
    )
    await db_session.flush()
    eng = await AsrRouter().resolve(
        db_session, company, user_id=seed_ids["member_user_id"]
    )
    assert eng.provider_id == "cloud:x"
