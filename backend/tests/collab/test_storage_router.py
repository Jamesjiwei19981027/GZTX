import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bindings import StorageBinding
from app.models.company import Company
from app.services.storage.local import LocalStorage
from app.services.storage.router import StorageRouter


@pytest.mark.asyncio
async def test_local_storage_put_get(tmp_path):
    s = LocalStorage(root=str(tmp_path))
    key = await s.put("ev/1/a.txt", b"hello", "text/plain")
    assert (tmp_path / "ev" / "1" / "a.txt").exists()
    assert key == "ev/1/a.txt"
    url = await s.get_url(key)
    assert "ev" in url or "a.txt" in url


@pytest.mark.asyncio
async def test_isolated_policy_blocks_external_s3(db_session: AsyncSession, seed_ids):
    company = await db_session.get(Company, seed_ids["company_id"])
    company.policy_preset = "isolated"
    company.policy_json = {"file_egress": "deny_external"}
    db_session.add(
        StorageBinding(
            company_id=company.id,
            provider_id="s3",
            config_json={"bucket": "x", "endpoint": "https://s3.example.com"},
            is_default=True,
        )
    )
    await db_session.flush()

    router = StorageRouter()
    backend = await router.for_company(db_session, company)
    assert backend.provider_id in ("local", "customer")
