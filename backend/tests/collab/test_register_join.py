"""Register API → single_company default company membership + max_users."""
from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from app.models.company import Company, CompanyMembership
from app.services.license_verify import sign_license_dev
from app.services.policy_presets import DEFAULT_ENTITLEMENT
from app.core.config import settings


@pytest.mark.asyncio
async def test_register_joins_default_company_when_unlocked(
    async_client: AsyncClient, db_session, seed_ids, monkeypatch
):
    """Real POST /auth/register attaches membership to DEFAULT_COMPANY_SLUG company."""
    company = await db_session.get(Company, seed_ids["company_id"])
    assert company is not None
    monkeypatch.setattr(settings, "DEPLOY_MODE", "single_company")
    monkeypatch.setattr(settings, "DEFAULT_COMPANY_SLUG", company.slug)

    before_companies = (
        await db_session.execute(select(func.count()).select_from(Company))
    ).scalar()

    r = await async_client.post(
        "/api/v1/auth/register",
        json={
            "username": "joinme_user",
            "password": "password123",
            "email": "joinme@example.com",
            "nickname": "Join Me",
        },
    )
    assert r.status_code in (200, 201), r.text
    body = r.json()
    assert body["code"] == 200
    user_id = body["data"]["user"]["id"]
    cj = body["data"].get("company_join") or {}
    assert cj.get("joined") is True
    assert cj.get("company_id") == company.id

    m = (
        await db_session.execute(
            select(CompanyMembership).where(
                CompanyMembership.company_id == company.id,
                CompanyMembership.user_id == user_id,
                CompanyMembership.status == "active",
            )
        )
    ).scalar_one_or_none()
    assert m is not None
    assert m.employment_status == "active"

    after_companies = (
        await db_session.execute(select(func.count()).select_from(Company))
    ).scalar()
    assert after_companies == before_companies


@pytest.mark.asyncio
async def test_register_over_max_users_returns_error(
    async_client: AsyncClient, db_session, seed_ids, monkeypatch
):
    company = await db_session.get(Company, seed_ids["company_id"])
    monkeypatch.setattr(settings, "DEPLOY_MODE", "single_company")
    monkeypatch.setattr(settings, "DEFAULT_COMPANY_SLUG", company.slug)

    ent = deepcopy(company.entitlement_json or DEFAULT_ENTITLEMENT)
    ent.setdefault("quotas", {})["max_users"] = 1  # already has admin+members in seed
    company.entitlement_json = ent
    await db_session.commit()

    # seed has multiple active members → any new register hits quota
    n = (
        await db_session.execute(
            select(func.count())
            .select_from(CompanyMembership)
            .where(
                CompanyMembership.company_id == company.id,
                CompanyMembership.status == "active",
            )
        )
    ).scalar()
    assert n >= 1

    r = await async_client.post(
        "/api/v1/auth/register",
        json={
            "username": "overflow_user",
            "password": "password123",
            "email": "overflow@example.com",
        },
    )
    assert r.status_code == 409, r.text
    # user must not exist
    from app.models.user import User

    u = (
        await db_session.execute(select(User).where(User.username == "overflow_user"))
    ).scalar_one_or_none()
    assert u is None


@pytest.mark.asyncio
async def test_register_without_default_company_still_works(async_client: AsyncClient, monkeypatch):
    """No company with DEFAULT slug → personal-only register OK."""
    monkeypatch.setattr(settings, "DEPLOY_MODE", "single_company")
    monkeypatch.setattr(settings, "DEFAULT_COMPANY_SLUG", "no-such-slug-xyz")
    r = await async_client.post(
        "/api/v1/auth/register",
        json={
            "username": "personal_only",
            "password": "password123",
            "email": "personal_only@example.com",
        },
    )
    assert r.status_code in (200, 201), r.text
    assert r.json()["code"] == 200
    cj = r.json()["data"].get("company_join") or {}
    assert cj.get("joined") is False


@pytest.mark.asyncio
async def test_register_locked_company_no_join(
    async_client: AsyncClient, db_session, seed_ids, monkeypatch
):
    """Locked/pending company: register succeeds but company_join.joined=False."""
    company = await db_session.get(Company, seed_ids["company_id"])
    monkeypatch.setattr(settings, "DEPLOY_MODE", "single_company")
    monkeypatch.setattr(settings, "DEFAULT_COMPANY_SLUG", company.slug)
    company.status = "pending_license"
    await db_session.commit()

    r = await async_client.post(
        "/api/v1/auth/register",
        json={
            "username": "locked_join_user",
            "password": "password123",
            "email": "locked_join@example.com",
        },
    )
    assert r.status_code in (200, 201), r.text
    cj = r.json()["data"].get("company_join") or {}
    assert cj.get("joined") is False
    assert cj.get("reason") == "company_locked"

    m = (
        await db_session.execute(
            select(CompanyMembership).where(
                CompanyMembership.company_id == company.id,
                CompanyMembership.user_id == r.json()["data"]["user"]["id"],
            )
        )
    ).scalar_one_or_none()
    assert m is None


@pytest.mark.asyncio
async def test_single_company_blocks_second_company_api(
    async_client: AsyncClient, seed_ids, monkeypatch
):
    """With an existing company, POST /companies is forbidden in single_company mode."""
    monkeypatch.setattr(settings, "DEPLOY_MODE", "single_company")
    r = await async_client.post(
        "/api/v1/companies",
        json={"name": "第二家", "slug": "second-co", "policy_preset": "standard"},
        headers=seed_ids["super_admin_headers"],
    )
    assert r.status_code == 403, r.text
    assert r.json()["code"] == 40312
