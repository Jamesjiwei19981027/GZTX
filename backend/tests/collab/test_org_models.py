def test_org_models():
    from app.models.company import OrgUnit
    from app.models.integration import IntegrationAccount

    assert OrgUnit.__tablename__ == "org_units"
    assert IntegrationAccount.__tablename__ == "integration_accounts"
    # P1 fields
    assert hasattr(OrgUnit, "source")
    assert hasattr(OrgUnit, "path")
