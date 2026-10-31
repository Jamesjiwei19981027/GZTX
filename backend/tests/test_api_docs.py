"""接口文档（Swagger / OpenAPI）完整性与门禁回归测试。

完整性口径：每个接口都有中文标题、已登记的分组；直接收 dict 的接口在文档里有字段说明；
Swagger 的 Authorize 能用表单换到令牌；生产开启文档必须带 Basic 门禁。
"""
import base64

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.core import api_docs
from app.core.config import settings
from app.main import app as fastapi_app
from tests.test_production_guard import _prod_settings


def _has_chinese(text: str) -> bool:
    return any("一" <= c <= "鿿" for c in text)


def _docs_app(monkeypatch, password: str = "") -> FastAPI:
    """独立挂一份文档，避免依赖进程启动时的 DEBUG / EXPOSE_API_DOCS。"""
    monkeypatch.setattr(settings, "EXPOSE_API_DOCS", True)
    monkeypatch.setattr(settings, "API_DOCS_PASSWORD", password)
    monkeypatch.setattr(settings, "API_DOCS_SERVERS", "https://api.example.org|线上,https://staging.example.org/|测试")
    app = FastAPI(title="WorkTodo", docs_url=None, redoc_url=None, openapi_url=None)
    app.include_router(fastapi_app.router)
    api_docs.setup_api_docs(app)
    return app


def _spec(monkeypatch) -> dict:
    return _docs_app(monkeypatch).openapi()


def test_every_operation_has_chinese_summary_and_known_tag(monkeypatch):
    spec = _spec(monkeypatch)
    known = {t["name"] for t in spec["tags"]}
    ops = [(m, p, op) for p, item in spec["paths"].items() for m, op in item.items()]
    assert len(ops) > 200
    missing_summary = [f"{m.upper()} {p}" for m, p, op in ops if not _has_chinese(op.get("summary", ""))]
    assert missing_summary == []
    bad_tags = [f"{m.upper()} {p}" for m, p, op in ops if not op.get("tags") or set(op["tags"]) - known]
    assert bad_tags == []
    assert all(t.get("description") for t in spec["tags"])


def test_dict_bodies_are_documented(monkeypatch):
    spec = _spec(monkeypatch)
    for (method, path), schema in api_docs.DICT_BODY_SCHEMAS.items():
        body = spec["paths"][path][method]["requestBody"]["content"]["application/json"]["schema"]
        assert body == schema
    loose = [
        f"{m.upper()} {p}"
        for p, item in spec["paths"].items()
        for m, op in item.items()
        if (s := op.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema", {}))
        and s.get("type") == "object"
        and not s.get("properties")
    ]
    assert loose == []


def test_servers_and_auth_scheme(monkeypatch):
    spec = _spec(monkeypatch)
    assert spec["servers"] == [
        {"url": "/", "description": "当前站点（同源调用）"},
        {"url": "https://api.example.org", "description": "线上"},
        {"url": "https://staging.example.org", "description": "测试"},
    ]
    flow = spec["components"]["securitySchemes"]["OAuth2PasswordBearer"]["flows"]["password"]
    assert flow["tokenUrl"] == "/api/v1/auth/token"


async def test_docs_basic_auth_guard(monkeypatch):
    app = _docs_app(monkeypatch, password="docs-pass-1234567")
    transport = ASGITransport(app=app)
    good = base64.b64encode(b"apidocs:docs-pass-1234567").decode()
    bad = base64.b64encode(b"apidocs:wrong").decode()
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        for path in ("/docs", "/redoc", "/openapi.json"):
            r = await ac.get(path)
            assert r.status_code == 401
            assert r.headers["www-authenticate"].startswith("Basic")
            assert (await ac.get(path, headers={"Authorization": f"Basic {bad}"})).status_code == 401
            assert (await ac.get(path, headers={"Authorization": f"Basic {good}"})).status_code == 200
        html = (await ac.get("/docs", headers={"Authorization": f"Basic {good}"})).text
        assert "persistAuthorization" in html


async def test_oauth2_token_form_login_and_call(client, test_user):
    r = await client.post("/api/v1/auth/token", data={"username": "testuser", "password": "testpassword"})
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer" and body["access_token"]
    me = await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200

    wrong = await client.post("/api/v1/auth/token", data={"username": "testuser", "password": "nope"})
    assert wrong.status_code == 401


def test_production_docs_require_password():
    _prod_settings(EXPOSE_API_DOCS=False).validate_production_secrets()
    _prod_settings(EXPOSE_API_DOCS=True, API_DOCS_PASSWORD="Qm7x-Lp2v-Rt9z").validate_production_secrets()
    for weak in ("", "short", "change-me-please-now"):
        with pytest.raises(RuntimeError, match="API_DOCS_PASSWORD"):
            _prod_settings(EXPOSE_API_DOCS=True, API_DOCS_PASSWORD=weak).validate_production_secrets()
