"""个人任务导入确认令牌（P0 进程内）"""
import time
from typing import Any


class ImportTokenStore:
    def __init__(self):
        self._data: dict[str, tuple[float, dict[str, Any]]] = {}

    def set(self, token: str, payload: dict, ttl_sec: int = 600) -> None:
        self._data[token] = (time.time() + ttl_sec, payload)

    def get(self, token: str) -> dict | None:
        item = self._data.get(token)
        if not item:
            return None
        exp, payload = item
        if time.time() > exp:
            self._data.pop(token, None)
            return None
        return payload

    def delete(self, token: str) -> None:
        self._data.pop(token, None)


import_token_store = ImportTokenStore()
