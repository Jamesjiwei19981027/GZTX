"""策略引擎"""
from typing import Any

from app.services.policy_presets import POLICY_PRESETS


class PolicyGuard:
    def policy(self, company) -> dict[str, Any]:
        p = dict(company.policy_json or {})
        preset = company.policy_preset
        if preset and preset in POLICY_PRESETS:
            merged = dict(POLICY_PRESETS[preset])
            merged.update(p)
            return merged
        return p

    def allow_model(self, company, model_id: str) -> bool:
        pol = self.policy(company)
        egress = pol.get("llm_egress", "allow_cloud")
        if egress == "private_only" and not str(model_id).startswith("private:"):
            return False
        allowed = pol.get("allowed_model_ids") or []
        if "*" in allowed:
            return True
        if any(
            a.endswith(":*") and str(model_id).startswith(a[:-1])
            for a in allowed
        ):
            return True
        if egress == "allowlist" and model_id not in allowed:
            return False
        return model_id in allowed or egress == "allow_cloud"

    def allow_asr(self, company, asr_id: str) -> bool:
        allowed = self.policy(company).get("allowed_asr_ids") or []
        if not allowed:
            # 无白名单时：builtin 总是允许；其余看 asr_egress
            if asr_id == "builtin":
                return True
            egress = self.policy(company).get("asr_egress", "allow_cloud")
            return egress == "allow_cloud"
        if asr_id in allowed:
            return True
        for a in allowed:
            if a.endswith(":*") and str(asr_id).startswith(a[:-1]):
                return True
        return False

    def allow_file_egress(self, company) -> bool:
        return self.policy(company).get("file_egress") != "deny_external"
