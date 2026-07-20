"""权益与解锁判定"""
from datetime import datetime, timezone
from typing import Any


class QuotaExceeded(Exception):
    def __init__(self, metric: str, limit: int):
        self.metric = metric
        self.limit = limit
        super().__init__(f"配额已满: {metric} <= {limit}")


class EntitlementService:
    def _ent(self, company) -> dict[str, Any]:
        return company.entitlement_json or {}

    def is_expired(self, company) -> bool:
        valid_to = self._ent(company).get("valid_to")
        if not valid_to:
            return False
        vt = datetime.fromisoformat(str(valid_to).replace("Z", "+00:00"))
        if vt.tzinfo is None:
            vt = vt.replace(tzinfo=timezone.utc)
        return vt < datetime.now(timezone.utc)

    def is_company_unlocked(self, company) -> bool:
        if company.status in ("suspended", "pending_license"):
            return False
        if company.status == "readonly":
            return True
        if self.is_expired(company):
            return company.status == "readonly" or self._ent(company).get("on_expire") == "readonly"
        return company.status == "active"

    def has_feature(self, company, feature: str) -> bool:
        if not self.is_company_unlocked(company) and company.status != "readonly":
            return False
        return bool(self._ent(company).get("features", {}).get(feature, False))

    def is_write_allowed(self, company) -> bool:
        if company.status in ("suspended", "pending_license", "readonly"):
            return False
        if self.is_expired(company):
            return False
        return company.status == "active"

    def check_quota(self, company, metric: str, current: int) -> None:
        limit = self._ent(company).get("quotas", {}).get(metric)
        if limit is None:
            return
        if current >= int(limit):
            raise QuotaExceeded(metric, int(limit))

    def feature_map(self, company) -> dict[str, bool]:
        if not self.is_company_unlocked(company) and company.status != "readonly":
            return {}
        return dict(self._ent(company).get("features") or {})
