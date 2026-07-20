import json
from datetime import datetime, timedelta, timezone

import pytest


def test_policy_presets_have_three_keys():
    from app.services.policy_presets import DEFAULT_ENTITLEMENT, POLICY_PRESETS

    assert set(POLICY_PRESETS.keys()) == {"standard", "controlled", "isolated"}
    assert DEFAULT_ENTITLEMENT["features"]["project_tree"] is True
    assert "max_users" in DEFAULT_ENTITLEMENT["quotas"]


def test_verify_license_accepts_valid_hmac_dev_key(monkeypatch):
    from app.core.config import settings
    from app.services.license_verify import sign_license_dev, verify_license_payload

    monkeypatch.setattr(settings, "LICENSE_PUBLIC_KEY", "dev-secret-key-for-tests-only")
    monkeypatch.setattr(settings, "LICENSE_VERIFY_MODE", "hmac")
    payload = {
        "company_slug": "acme",
        "features": {"project_tree": True, "agents": True},
        "quotas": {"max_users": 50},
        "valid_to": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
    }
    raw = json.dumps(payload, sort_keys=True)
    sig = sign_license_dev(raw, settings.LICENSE_PUBLIC_KEY)
    out = verify_license_payload(raw, sig)
    assert out["company_slug"] == "acme"


def test_verify_license_rejects_bad_signature(monkeypatch):
    import pytest
    from app.core.config import settings
    from app.services.license_verify import verify_license_payload

    monkeypatch.setattr(settings, "LICENSE_PUBLIC_KEY", "dev-secret-key-for-tests-only")
    monkeypatch.setattr(settings, "LICENSE_VERIFY_MODE", "hmac")
    with pytest.raises(ValueError):
        verify_license_payload('{"company_slug":"x"}', "deadbeef")


def test_ed25519_sign_verify_and_reject_tamper(monkeypatch):
    import pytest
    from app.core.config import settings
    from app.services.license_verify import (
        generate_ed25519_keypair,
        sign_license_ed25519,
        verify_license_payload,
    )

    priv, pub = generate_ed25519_keypair()
    monkeypatch.setattr(settings, "LICENSE_PUBLIC_KEY", pub)
    monkeypatch.setattr(settings, "LICENSE_VERIFY_MODE", "ed25519")
    payload = {
        "company_slug": "acme-ed",
        "features": {"project_tree": True, "agents": True},
        "quotas": {"max_users": 10},
        "valid_to": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
    }
    raw = json.dumps(payload, sort_keys=True)
    sig = sign_license_ed25519(raw, priv)
    out = verify_license_payload(raw, sig)
    assert out["company_slug"] == "acme-ed"

    with pytest.raises(ValueError, match="签名"):
        verify_license_payload(raw, sig[:-4] + "AAAA")

    tampered = raw.replace("acme-ed", "evil")
    with pytest.raises(ValueError, match="签名"):
        verify_license_payload(tampered, sig)


@pytest.mark.asyncio
async def test_ed25519_unlocks_company_via_apply_license(db_session, monkeypatch):
    """Drive real company unlock path with ed25519 (not reimplemented)."""
    from app.core.config import settings
    from app.core.security import get_password_hash
    from app.models.user import User
    from app.services.company_bootstrap import apply_license_to_company, bootstrap_single_company
    from app.services.entitlement import EntitlementService
    from app.services.license_verify import generate_ed25519_keypair, sign_license_ed25519

    priv, pub = generate_ed25519_keypair()
    monkeypatch.setattr(settings, "LICENSE_PUBLIC_KEY", pub)
    monkeypatch.setattr(settings, "LICENSE_VERIFY_MODE", "ed25519")

    u = User(
        username="lic_admin",
        email="lic_admin@example.com",
        password_hash=get_password_hash("password123"),
        is_active=True,
    )
    db_session.add(u)
    await db_session.flush()
    company = await bootstrap_single_company(
        db_session,
        name="ED公司",
        slug="ed-co",
        admin_user_id=u.id,
        activate=False,
    )
    assert company.status == "pending_license" or not EntitlementService().is_company_unlocked(
        company
    )

    payload = {
        "company_slug": "ed-co",
        "features": {"project_tree": True, "agents": True, "org_sync": True},
        "quotas": {"max_users": 20, "max_projects": 10},
        "valid_to": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
    }
    raw = json.dumps(payload, sort_keys=True)
    sig = sign_license_ed25519(raw, priv)
    await apply_license_to_company(db_session, company, raw, sig)
    await db_session.refresh(company)
    assert EntitlementService().is_company_unlocked(company)
    assert EntitlementService().has_feature(company, "project_tree")

    # tampered reject
    import pytest
    from app.services.license_verify import verify_license_payload

    with pytest.raises(ValueError):
        verify_license_payload(raw.replace("ed-co", "other"), sig)
