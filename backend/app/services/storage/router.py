"""按公司绑定与 policy 选择对象存储"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.bindings import StorageBinding
from app.services.policy_guard import PolicyGuard
from app.services.storage.local import LocalStorage
from app.services.storage.s3_compat import S3CompatStorage


class StorageRouter:
    def __init__(self, policy: PolicyGuard | None = None):
        self.policy = policy or PolicyGuard()

    async def for_company(self, db: AsyncSession, company) -> LocalStorage | S3CompatStorage:
        q = await db.execute(
            select(StorageBinding)
            .where(
                StorageBinding.company_id == company.id,
                StorageBinding.is_default.is_(True),
            )
            .limit(1)
        )
        binding = q.scalar_one_or_none()
        provider = (binding.provider_id if binding else "local") or "local"
        config = (binding.config_json if binding else None) or {}

        # isolated / deny_external → 仅 local 或 customer 私有
        if not self.policy.allow_file_egress(company):
            if provider in ("s3", "cloud", "external") or str(provider).startswith("s3"):
                provider = "local"
                config = {}

        if provider in ("local", "customer") or str(provider).startswith("customer"):
            root = config.get("root") or settings.COLLAB_OBJECT_ROOT
            backend = LocalStorage(root=root)
            if provider != "local":
                backend.provider_id = provider  # type: ignore[misc]
            return backend

        if provider == "s3" or str(provider).startswith("s3"):
            return S3CompatStorage(config)

        return LocalStorage(root=config.get("root") or settings.COLLAB_OBJECT_ROOT)
