"""本地文件系统对象存储"""
from pathlib import Path

from app.core.config import settings


class LocalStorage:
    provider_id = "local"

    def __init__(self, root: str | None = None):
        self.root = Path(root or settings.COLLAB_OBJECT_ROOT or settings.UPLOAD_DIR)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        # normalize, block path traversal
        safe = key.replace("\\", "/").lstrip("/")
        parts = [p for p in safe.split("/") if p and p != ".."]
        return self.root.joinpath(*parts)

    async def put(self, key: str, data: bytes, content_type: str) -> str:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return key.replace("\\", "/").lstrip("/")

    async def get(self, key: str) -> bytes:
        path = self._path(key)
        if not path.is_file():
            raise FileNotFoundError(key)
        return path.read_bytes()

    async def get_url(self, key: str, expires_sec: int = 3600) -> str:
        path = self._path(key)
        return f"file://{path.resolve()}"

    async def delete(self, key: str) -> None:
        path = self._path(key)
        if path.exists():
            path.unlink()
