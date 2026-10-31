"""Isolated JSON adapter to the pinned Microsoft llmwiki core; no vectors/network."""
import asyncio
import json
import shutil
import subprocess
from pathlib import Path

ENGINE_ROOT = Path(__file__).resolve().parents[2] / "wiki-engine"


async def inspect_wiki(pages: list[dict], *, query: str = "") -> dict:
    node = shutil.which("node")
    if not node or not (ENGINE_ROOT / "dist/wiki.js").is_file():
        raise RuntimeError("Wiki 引擎未安装：请在 backend/wiki-engine 执行 npm ci && npm run build")
    payload = json.dumps({"pages": pages, "query": query}, ensure_ascii=False)

    def run():
        try:
            proc = subprocess.run([node, str(ENGINE_ROOT / "bridge.mjs")],
                input=payload, capture_output=True, text=True, encoding="utf-8", timeout=30,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        except (OSError, subprocess.TimeoutExpired):
            raise RuntimeError("Wiki 引擎不可用或处理超时，请检查服务端运行环境") from None
        if proc.returncode:
            raise RuntimeError("Wiki 引擎执行失败，请检查服务端部署与日志")
        return json.loads(proc.stdout)

    return await asyncio.to_thread(run)
