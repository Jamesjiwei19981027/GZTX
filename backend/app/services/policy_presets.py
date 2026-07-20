"""默认权益与策略预设"""

DEFAULT_ENTITLEMENT = {
    "features": {
        "project_tree": True,
        "agents": True,
        "org_sync": True,
        "policy_isolated": False,
        "asr": True,
        "custom_storage": True,
    },
    "quotas": {
        "max_users": 200,
        "max_projects": 50,
        "max_storage_gb": 100,
        "max_llm_calls_day": 10000,
        "max_asr_minutes_day": 500,
    },
    "valid_to": None,
    "on_expire": "readonly",
}

DEFAULT_LOGIN_METHODS = {
    "password": True,
    "wechat": True,
    "wecom": False,
    "dingtalk": False,
    "feishu": False,
}

POLICY_PRESETS = {
    "standard": {
        "llm_egress": "allow_cloud",
        "asr_egress": "allow_cloud",
        "file_egress": "allow",
        "allowed_model_ids": ["*"],
        "allowed_asr_ids": ["builtin", "cloud:*"],
        "storage_mode": "builtin_or_customer",
        "project_pull_requires_same_org_unit": False,
        "evidence_retention_days": 1095,
        "chat_retention_days": 365,
        "progress_ledger_retention_days": None,
        "progress_auto_write_alert": {
            "window_seconds": 3600,
            "max_writes_per_node": 20,
            "notify_roles": ["pm"],
        },
    },
    "controlled": {
        "llm_egress": "allowlist",
        "asr_egress": "allowlist",
        "file_egress": "customer_preferred",
        "allowed_model_ids": [],
        "allowed_asr_ids": ["builtin", "customer"],
        "storage_mode": "customer_or_builtin",
        "project_pull_requires_same_org_unit": False,
        "evidence_retention_days": 1095,
        "chat_retention_days": 180,
        "progress_ledger_retention_days": None,
        "progress_auto_write_alert": {
            "window_seconds": 3600,
            "max_writes_per_node": 20,
            "notify_roles": ["pm"],
        },
    },
    "isolated": {
        "llm_egress": "private_only",
        "asr_egress": "builtin_or_customer",
        "file_egress": "deny_external",
        "allowed_model_ids": ["private:*"],
        "allowed_asr_ids": ["builtin", "customer"],
        "storage_mode": "customer_or_local",
        "project_pull_requires_same_org_unit": False,
        "evidence_retention_days": 1825,
        "chat_retention_days": 365,
        "progress_ledger_retention_days": None,
        "progress_auto_write_alert": {
            "window_seconds": 3600,
            "max_writes_per_node": 20,
            "notify_roles": ["pm"],
        },
    },
}
