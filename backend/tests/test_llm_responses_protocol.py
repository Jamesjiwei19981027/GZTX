"""模型调用：OpenAI Responses 协议（如 igrok / Grok）。"""
import json

import httpx
import pytest

from app.services import llm_settings
from app.services.llm_settings import LLM_PROVIDER_PRESETS, ResolvedLlm, chat_completion


def _llm(**kw) -> ResolvedLlm:
    base = dict(
        provider="openai_responses",
        base_url="https://example.invalid/v1/",
        model="grok-test",
        api_key="test-key",
        max_tokens=1024,
    )
    base.update(kw)
    return ResolvedLlm(**base)


_REAL_ASYNC_CLIENT = httpx.AsyncClient


def _patch_transport(monkeypatch, handler):
    real = _REAL_ASYNC_CLIENT

    def factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real(*args, **kwargs)

    monkeypatch.setattr(llm_settings.httpx, "AsyncClient", factory)


def test_preset_registered():
    assert "openai_responses" in LLM_PROVIDER_PRESETS
    assert LLM_PROVIDER_PRESETS["openai_responses"]["needs_key"] is True


@pytest.mark.asyncio
async def test_responses_request_and_output_parsing(monkeypatch):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "output": [
                    {"type": "reasoning", "summary": []},
                    {
                        "type": "message",
                        "content": [
                            {"type": "output_text", "text": "第一段"},
                            {"type": "output_text", "text": "第二段"},
                        ],
                    },
                ]
            },
        )

    _patch_transport(monkeypatch, handler)
    result = await chat_completion(
        _llm(),
        messages=[
            {"role": "system", "content": "你是审计助手"},
            {"role": "user", "content": "审一下"},
        ],
    )
    assert result["ok"] is True
    assert result["content"] == "第一段第二段"
    assert seen["url"] == "https://example.invalid/v1/responses"
    assert seen["auth"] == "Bearer test-key"
    body = seen["body"]
    assert body["model"] == "grok-test"
    assert body["input"][0] == {"role": "system", "content": "你是审计助手"}
    # 推理模型需要足够输出额度
    assert body["max_output_tokens"] >= llm_settings.RESPONSES_MIN_OUTPUT_TOKENS
    assert "messages" not in body


@pytest.mark.asyncio
async def test_responses_output_text_shortcut(monkeypatch):
    _patch_transport(monkeypatch, lambda r: httpx.Response(200, json={"output_text": "好"}))
    result = await chat_completion(_llm(), messages=[{"role": "user", "content": "x"}])
    assert result == {"ok": True, "provider": "openai_responses", "content": "好", "raw": {"output_text": "好"}}


@pytest.mark.asyncio
async def test_responses_error_and_empty(monkeypatch):
    _patch_transport(
        monkeypatch, lambda r: httpx.Response(401, json={"error": {"message": "bad key"}})
    )
    result = await chat_completion(_llm(), messages=[{"role": "user", "content": "x"}])
    assert result["ok"] is False and "401" in result["error"] and "bad key" in result["error"]

    _patch_transport(
        monkeypatch, lambda r: httpx.Response(200, json={"output": [{"type": "reasoning"}]})
    )
    result = await chat_completion(_llm(), messages=[{"role": "user", "content": "x"}])
    assert result["ok"] is False
    assert "没有返回正文" in result["error"]


@pytest.mark.asyncio
async def test_chat_completions_path_unchanged(monkeypatch):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    _patch_transport(monkeypatch, handler)
    result = await chat_completion(
        _llm(provider="openai_compatible"), messages=[{"role": "user", "content": "x"}]
    )
    assert result["content"] == "ok"
    assert seen["url"].endswith("/chat/completions")


@pytest.mark.asyncio
@pytest.mark.parametrize('provider', ['openai_responses', 'openai_compatible'])
@pytest.mark.parametrize('budget', [120.0, 180.0])
async def test_audit_timeout_reaches_http_transport(monkeypatch, provider, budget):
    seen = []
    def handler(request):
        seen.append(request.extensions['timeout'])
        return httpx.Response(200, json={'output_text': 'ok', 'choices': [{'message': {'content': 'ok'}}]})
    _patch_transport(monkeypatch, handler)
    reply = await chat_completion(_llm(provider=provider), messages=[{'role': 'user', 'content': 'x'}], timeout=budget)
    assert reply['ok']
    assert seen == [{'connect': budget, 'read': budget, 'write': budget, 'pool': budget}]


@pytest.mark.asyncio
async def test_company_stub_does_not_block_env_model(monkeypatch):
    """企业只存了本地桩时，企业级调用改用部署级真实模型；企业配了真实模型则优先企业。"""
    env = _llm(source="env")
    stub = ResolvedLlm(provider="fake", base_url="", model="fake", api_key="")
    real = _llm(provider="openai_compatible", model="company-model", source="company")
    monkeypatch.setattr(llm_settings, "llm_from_env", lambda: env)

    async def company_stub(db, cid):
        return stub

    monkeypatch.setattr(llm_settings, "llm_from_company", company_stub)
    assert (await llm_settings.llm_for_company(None, 1)) is env
    assert (await llm_settings.resolve_llm(object(), company_id=1)) is env

    async def company_real(db, cid):
        return real

    monkeypatch.setattr(llm_settings, "llm_from_company", company_real)
    assert (await llm_settings.llm_for_company(None, 1)) is real

    monkeypatch.setattr(llm_settings, "llm_from_env", lambda: None)
    monkeypatch.setattr(llm_settings, "llm_from_company", company_stub)
    assert (await llm_settings.llm_for_company(None, 1)) is stub
