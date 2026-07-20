"""ASR 路由：用户绑定 → 公司默认 → builtin"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bindings import AsrBinding
from app.services.asr.builtin import BuiltinAsr
from app.services.policy_guard import PolicyGuard


class AsrRouter:
    def __init__(self, policy: PolicyGuard | None = None):
        self.policy = policy or PolicyGuard()

    def _engine_for(self, provider_id: str):
        # 首发仅 builtin；云/客户侧后续可插拔
        if provider_id == "builtin" or not provider_id:
            return BuiltinAsr()
        # 占位：未配置真实引擎时仍返回 builtin 包装并标记 provider
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
            return self._engine_for(preferred)

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
                return self._engine_for(ub.provider_id)

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
            return self._engine_for(cb.provider_id)

        return BuiltinAsr()
