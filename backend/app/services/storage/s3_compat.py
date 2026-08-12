"""S3 兼容存储桩（需显式配置；isolated policy 下不可用）"""


class S3CompatStorage:
    provider_id = "s3"

    def __init__(self, config: dict | None = None):
        self.config = config or {}
        self.bucket = self.config.get("bucket", "default")
        self.endpoint = self.config.get("endpoint", "")
        self.prefix = (self.config.get("prefix") or "").strip("/")
        self._store: dict[str, bytes] = {}

    def _full_key(self, key: str) -> str:
        k = key.lstrip("/")
        return f"{self.prefix}/{k}" if self.prefix else k

    async def put(self, key: str, data: bytes, content_type: str) -> str:
        fk = self._full_key(key)
        self._store[fk] = data
        return key

    async def get(self, key: str) -> bytes:
        fk = self._full_key(key)
        if fk not in self._store:
            raise FileNotFoundError(key)
        return self._store[fk]

    async def get_url(self, key: str, expires_sec: int = 3600) -> str:
        fk = self._full_key(key)
        ep = self.endpoint or "https://s3.example.local"
        return f"{ep.rstrip('/')}/{self.bucket}/{fk}?expires={expires_sec}"

    async def delete(self, key: str) -> None:
        self._store.pop(self._full_key(key), None)
