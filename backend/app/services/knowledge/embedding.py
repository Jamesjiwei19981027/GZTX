"""可插拔 embedding（OpenAI 兼容 /embeddings）

EMBEDDING_ENABLED=false（默认）时本模块任何函数都不发起网络请求，直接返回 None；
调用失败也返回 None（容错，不阻断索引/检索主流程）。
"""
from __future__ import annotations

import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


def _resolve_config() -> tuple[str, str, str] | None:
    """返回 (base_url, api_key, model)；未启用或缺配置时返回 None。"""
    if not settings.EMBEDDING_ENABLED:
        return None
    model = settings.EMBEDDING_MODEL
    # base_url/api_key 未配时回落公司 LLM 环境变量兜底配置
    base_url = settings.EMBEDDING_BASE_URL or settings.LLM_BASE_URL
    api_key = settings.EMBEDDING_API_KEY or settings.LLM_API_KEY
    if not model or not base_url:
        return None
    return base_url.rstrip("/"), api_key, model


async def embed_texts(texts: list[str]) -> list[list[float]] | None:
    """批量取向量；未启用/未配置/调用失败一律返回 None（上层留空 embedding_json）。"""
    cfg = _resolve_config()
    if cfg is None or not texts:
        return None
    base_url, api_key, model = cfg
    try:
        import httpx

        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{base_url}/embeddings",
                headers=headers,
                json={"model": model, "input": texts},
            )
            resp.raise_for_status()
            data = resp.json().get("data") or []
            vectors = [item.get("embedding") for item in data]
            if len(vectors) != len(texts) or any(v is None for v in vectors):
                return None
            return vectors
    except Exception:
        logger.warning("embedding 调用失败，向量留空", exc_info=True)
        return None
