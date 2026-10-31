"""Multipart speech transcription for configured OpenAI-compatible ASR servers."""
from urllib.parse import urlsplit

import httpx


class OpenAICompatibleAsr:
    def __init__(self, provider_id: str, config: dict):
        self.provider_id = provider_id
        base_url = str(config.get('base_url') or '').rstrip('/')
        parsed = urlsplit(base_url)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError('ASR base_url 无效')
        self.endpoint = base_url + '/audio/transcriptions'
        self.model = str(config.get('model') or 'whisper-1')
        self.language = str(config.get('language') or '')
        self.api_key = str(config.get('api_key') or '')
        if config.get('api_key_encrypted'):
            from app.services.secret_box import decrypt_str
            self.api_key = decrypt_str(config['api_key_encrypted'])

    async def transcribe(self, audio: bytes, mime: str, language: str = 'zh') -> str:
        media_type = (mime or 'audio/wav').split(';')[0]
        extension = {'audio/mp4': 'm4a', 'video/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/aac': 'aac'}.get(media_type, 'webm')
        headers = {'Authorization': 'Bearer ' + self.api_key} if self.api_key else {}
        async with httpx.AsyncClient(timeout=90.0, follow_redirects=False) as client:
            response = await client.post(self.endpoint, headers=headers,
                data={'model': self.model, 'language': self.language or language, 'response_format': 'json'},
                files={'file': ('material-voice.' + extension, audio, media_type)})
            response.raise_for_status()
            result = response.json()
            if not isinstance(result, dict) or not isinstance(result.get('text'), str):
                raise ValueError('ASR 返回格式无效')
            return result['text'].strip()
