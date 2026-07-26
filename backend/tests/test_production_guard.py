"""生产启动门禁回归测试（Settings.validate_production_secrets）。

门禁在 main.py 的 lifespan 里调用，任一项不合格必须拒绝启动。
历史缺陷：
1. 只比对固定黑名单，.env.example 的占位符 `change-me-to-a-long-random-string`
   长 33 字符不在名单内，照抄部署即带着公开已知密钥上线；
2. 完全不检查 ALLOW_FAKE_SSO，而它当时默认 true，等于 SSO 桩在生产敞开。
"""
import pytest

from app.core.config import Settings


def _prod_settings(**overrides) -> Settings:
    """一份"本应能通过门禁"的生产配置，再按需覆盖单项来断言拒绝。"""
    base = dict(
        DEBUG=False,
        SECRET_KEY="Jd7d0f0Yb5x2Qw9pKm3RtVzA1sNc8HgLpEuXyZ4bTqWv",
        LICENSE_PUBLIC_KEY="c29tZS1yZWFsLWVkMjU1MTktcHVibGljLWtleS1iYXNlNjQ",
        LICENSE_VERIFY_MODE="ed25519",
        ALLOW_FAKE_SSO=False,
        IMAP_USER="",
    )
    base.update(overrides)
    return Settings(**base)


def test_valid_production_config_passes():
    _prod_settings().validate_production_secrets()


def test_debug_skips_guard():
    """DEBUG=true 是本地开发档，门禁整体跳过（此时默认弱密钥可用）"""
    _prod_settings(DEBUG=True, SECRET_KEY="x").validate_production_secrets()


@pytest.mark.parametrize(
    "secret",
    [
        "",
        "short",
        "change-this-to-a-strong-secret-key-in-production",
        "change-me-to-a-long-random-string",  # .env.example 占位符，33 字符
        "my-super-secret-key-for-example-app",
        "please-change-me-before-deploying-this",
        "dev-secret-key-please-change-in-production",
    ],
)
def test_placeholder_secret_key_rejected(secret):
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        _prod_settings(SECRET_KEY=secret).validate_production_secrets()


def test_fake_sso_must_be_off_in_production():
    """ALLOW_FAKE_SSO=true 时可用 fake: code 冒充任意成员，生产必须拒绝启动"""
    with pytest.raises(RuntimeError, match="ALLOW_FAKE_SSO"):
        _prod_settings(ALLOW_FAKE_SSO=True).validate_production_secrets()


def test_hmac_license_mode_rejected():
    with pytest.raises(RuntimeError, match="LICENSE_VERIFY_MODE"):
        _prod_settings(LICENSE_VERIFY_MODE="hmac").validate_production_secrets()


def test_placeholder_license_key_rejected():
    with pytest.raises(RuntimeError, match="LICENSE_PUBLIC_KEY"):
        _prod_settings(
            LICENSE_PUBLIC_KEY="dev-secret-key-for-tests-only"
        ).validate_production_secrets()


def test_email_reply_secret_required_when_imap_configured():
    """配了 IMAP 即启用邮件指令通道，该通道仅凭 From + 本密钥鉴权"""
    with pytest.raises(RuntimeError, match="EMAIL_REPLY_SECRET"):
        _prod_settings(
            IMAP_USER="bot@example.com",
            EMAIL_REPLY_SECRET="change-me-to-a-random-secret",
        ).validate_production_secrets()


def test_email_reply_secret_not_checked_when_imap_disabled():
    """没配 IMAP 就没有该通道，不必因为它的默认值拦住启动"""
    _prod_settings(
        IMAP_USER="", EMAIL_REPLY_SECRET="change-me-to-a-random-secret"
    ).validate_production_secrets()
