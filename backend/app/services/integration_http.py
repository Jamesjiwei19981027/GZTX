"""外部身份/通讯录请求边界；错误不包含令牌、密钥或上游响应正文。"""
import httpx


async def request_json(method: str, url: str, **kwargs) -> dict:
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
            response = await client.request(method, url, **kwargs)
            response.raise_for_status()
            data = response.json()
        if not isinstance(data, dict):
            raise ValueError("响应格式错误")
        return data
    except (httpx.HTTPError, ValueError) as exc:
        raise ValueError("外部身份或通讯录服务请求失败，请检查应用配置、权限和网络") from exc
