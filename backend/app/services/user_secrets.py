"""个人级凭证的加密落库。

背景：个人 SMTP 密码与个人 LLM API Key 一直明文存在 users.notify_pref 这个
JSON 列里，而公司级的同类凭证走 secret_box 加密（services/smtp_settings.py
文件头就写着"公司级凭证经 secret_box 加密落库"）。两者标准不一致的后果是：
数据库文件或备份一旦泄露，无需任何令牌即可拿到全部用户的邮箱授权码与 LLM 密钥。

存储格式：`enc:v1:<fernet token>`。
读取时对**没有该前缀的旧值按明文兼容**，因此存量数据不需要迁移脚本；
下一次保存会自动写成密文，逐步完成升级。
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

PREFIX = "enc:v1:"


def is_sealed(value: str | None) -> bool:
    return isinstance(value, str) and value.startswith(PREFIX)


def seal(plain: str | None) -> str:
    """加密明文凭证。空值原样返回（表示"未配置"，不必产生密文）。"""
    if not plain:
        return ""
    if is_sealed(plain):
        return plain
    from app.services.secret_box import encrypt_str

    try:
        return PREFIX + encrypt_str(str(plain))
    except Exception as e:  # noqa: BLE001
        # 加密不可用时宁可不落库，也不要退回明文存储
        logger.error("seal user secret failed: %s", e)
        raise


def unseal(stored: str | None) -> str:
    """解出明文。

    - 带 enc:v1: 前缀 → 解密；密钥轮换等原因解不开时按"未配置"处理并告警，
      而不是抛异常把发信/LLM 整条链路打挂；
    - 无前缀 → 视为升级前的明文存量值，原样返回。
    """
    if not stored:
        return ""
    if not is_sealed(stored):
        return str(stored)
    from app.services.secret_box import decrypt_str

    try:
        return decrypt_str(stored[len(PREFIX) :])
    except Exception as e:  # noqa: BLE001
        logger.warning("unseal user secret failed (视为未配置): %s", e)
        return ""
