from datetime import datetime, timedelta, timezone
from types import SimpleNamespace


def _company(**kw):
    base = {
        "status": "active",
        "entitlement_json": {
            "features": {"project_tree": True, "agents": False},
            "quotas": {"max_projects": 2},
            "valid_to": (datetime.now(timezone.utc) + timedelta(days=10)).isoformat(),
            "on_expire": "readonly",
        },
        "policy_json": {
            "allowed_model_ids": ["*"],
            "llm_egress": "allow_cloud",
            "file_egress": "allow",
        },
        "policy_preset": "standard",
    }
    base.update(kw)
    return SimpleNamespace(**base)


def test_has_feature():
    from app.services.entitlement import EntitlementService

    svc = EntitlementService()
    c = _company()
    assert svc.has_feature(c, "project_tree") is True
    assert svc.has_feature(c, "agents") is False


def test_unlocked_false_when_pending():
    from app.services.entitlement import EntitlementService

    svc = EntitlementService()
    assert svc.is_company_unlocked(_company(status="pending_license")) is False
    assert svc.is_company_unlocked(_company(status="active")) is True


def test_quota_exceeded():
    import pytest
    from app.services.entitlement import EntitlementService, QuotaExceeded

    svc = EntitlementService()
    with pytest.raises(QuotaExceeded):
        svc.check_quota(_company(), "max_projects", current=2)


def test_policy_allow_model_wildcard():
    from app.services.policy_guard import PolicyGuard

    g = PolicyGuard()
    assert g.allow_model(_company(), "gpt-x") is True
