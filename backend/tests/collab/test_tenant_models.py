def test_company_models_importable():
    from app.models.company import Company, CompanyLicense, CompanyMembership, ServiceActivation

    assert Company.__tablename__ == "companies"
    assert CompanyMembership.__tablename__ == "company_memberships"
    assert CompanyLicense.__tablename__ == "company_licenses"
    assert ServiceActivation.__tablename__ == "service_activations"
