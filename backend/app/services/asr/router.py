"""ASR 路由：用户绑定 → 公司默认 → builtin"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bindings import AsrBinding
from app.services.asr.builtin import BuiltinAsr
from app.services.policy_guard import PolicyGuard


class AsrRouter:
    def __init__(self, policy: PolicyGuard | None = None):
        self.policy = policy or PolicyGuard()

    def _engine_for(self, provider_id: str, config: dict | None = None):
        if provider_id == "builtin" or not provider_id:
            return BuiltinAsr()
        if config and config.get('base_url'):
            from app.services.asr.openai_compatible import OpenAICompatibleAsr
            return OpenAICompatibleAsr(provider_id, config)
        eng = BuiltinAsr()
        eng.provider_id = provider_id  # type: ignore[misc]
        return eng

    async def resolve(
        self,
        db: AsyncSession,
        company,
        user_id: int | None = None,
        preferred: str | None = None,
    ):
        if preferred:
            if not self.policy.allow_asr(company, preferred):
                raise PermissionError(f"ASR provider not allowed: {preferred}")
            binding = (await db.execute(select(AsrBinding).where(AsrBinding.company_id == company.id,
                AsrBinding.provider_id == preferred, AsrBinding.is_default.is_(True)).order_by(AsrBinding.id.desc()).limit(1))).scalar_one_or_none()
            return self._engine_for(preferred, binding.config_json if binding else None)

        if user_id is not None:
            q = await db.execute(
                select(AsrBinding)
                .where(
                    AsrBinding.company_id == company.id,
                    AsrBinding.user_id == user_id,
                )
                .limit(1)
            )
            ub = q.scalar_one_or_none()
            if ub and self.policy.allow_asr(company, ub.provider_id):
                config = ub.config_json
                if not config:
                    shared = (await db.execute(select(AsrBinding).where(AsrBinding.company_id == company.id,
                        AsrBinding.user_id.is_(None), AsrBinding.provider_id == ub.provider_id,
                        AsrBinding.is_default.is_(True)).order_by(AsrBinding.id.desc()).limit(1))).scalar_one_or_none()
                    config = shared.config_json if shared else None
                return self._engine_for(ub.provider_id, config)

        q = await db.execute(
            select(AsrBinding)
            .where(
                AsrBinding.company_id == company.id,
                AsrBinding.user_id.is_(None),
                AsrBinding.is_default.is_(True),
            )
            .limit(1)
        )
        cb = q.scalar_one_or_none()
        if cb:
            if not self.policy.allow_asr(company, cb.provider_id):
                return BuiltinAsr()
            return self._engine_for(cb.provider_id, cb.config_json)

        return BuiltinAsr()
