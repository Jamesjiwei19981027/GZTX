"""内置 ASR 桩"""


class BuiltinAsr:
    provider_id = "builtin"

    async def transcribe(self, audio: bytes, mime: str, language: str = "zh") -> str:
        if not audio:
            return ""
        return "[builtin-asr]（请配置真实模型）"


class FakeAsr:
    """测试用"""

    provider_id = "fake"

    def __init__(self, text: str = "你好世界"):
        self._text = text

    async def transcribe(self, audio: bytes, mime: str, language: str = "zh") -> str:
        return self._text if audio else ""
