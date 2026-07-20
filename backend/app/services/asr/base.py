"""ASR 引擎协议"""
from typing import Protocol, runtime_checkable


@runtime_checkable
class AsrEngine(Protocol):
    provider_id: str

    async def transcribe(self, audio: bytes, mime: str, language: str = "zh") -> str: ...
