/// T09「我的与管理」数据模型
///
/// 所有字段名与后端 Swagger（http://localhost:8010/docs）及网页取数层
/// `frontend/src/api/auth.ts`、`frontend/src/api/notifications.ts`、
/// `frontend/src/api/shell.ts` 保持一致。
library;

/// 用户双验证状态（GET /users/me/verification）
class MeVerificationStatus {
  const MeVerificationStatus({
    this.email,
    this.phone,
    this.emailVerified = false,
    this.phoneVerified = false,
    this.isVerified = false,
  });

  final String? email;
  final String? phone;
  final bool emailVerified;
  final bool phoneVerified;
  final bool isVerified;

  factory MeVerificationStatus.fromJson(Map<String, dynamic> json) {
    return MeVerificationStatus(
      email: json['email'] as String?,
      phone: json['phone'] as String?,
      emailVerified: json['email_verified'] == true,
      phoneVerified: json['phone_verified'] == true,
      isVerified: json['is_verified'] == true,
    );
  }
}

/// 计费概览（GET /users/me/billing）
class MeBillingSummary {
  const MeBillingSummary({
    this.companyId,
    this.companyName,
    this.planCode,
    this.status = '',
    this.managedBy = '',
  });

  final int? companyId;
  final String? companyName;
  final String? planCode;
  final String status;
  final String managedBy;

  bool get isActive => status == 'active';

  factory MeBillingSummary.fromJson(Map<String, dynamic> json) {
    return MeBillingSummary(
      companyId: (json['company_id'] as num?)?.toInt(),
      companyName: json['company_name'] as String?,
      planCode: json['plan_code'] as String?,
      status: (json['status'] as String?) ?? '',
      managedBy: (json['managed_by'] as String?) ?? '',
    );
  }
}

/// 隐私数据概览（GET /users/me/privacy）
class MePrivacySummary {
  const MePrivacySummary({
    this.retention = '',
    this.exportEndpoint = '',
    this.deleteEndpoint = '',
    this.storedData = const {},
  });

  final String retention;
  final String exportEndpoint;
  final String deleteEndpoint;
  final Map<String, dynamic> storedData;

  factory MePrivacySummary.fromJson(Map<String, dynamic> json) {
    return MePrivacySummary(
      retention: (json['retention'] as String?) ?? '',
      exportEndpoint: (json['export_endpoint'] as String?) ?? '',
      deleteEndpoint: (json['delete_endpoint'] as String?) ?? '',
      storedData: json['stored_data'] is Map<String, dynamic>
          ? json['stored_data'] as Map<String, dynamic>
          : const {},
    );
  }
}

/// 通知投递记录（GET /notify/records）
class MeNotifyRecord {
  const MeNotifyRecord({
    this.id,
    this.channel = '',
    this.status = '',
    this.error,
    this.taskTitle,
    this.createdAt,
  });

  final int? id;
  final String channel;
  final String status;
  final String? error;
  final String? taskTitle;

  /// 接口下发 UTC，已转本地时区
  final DateTime? createdAt;

  /// 失败判定口径与网页版一致：status == failed 或存在 error
  bool get isFailed =>
      status == 'failed' || (error != null && error!.trim().isNotEmpty);

  bool get isSuccess => !isFailed;

  factory MeNotifyRecord.fromJson(Map<String, dynamic> json) {
    return MeNotifyRecord(
      id: (json['id'] as num?)?.toInt(),
      channel: (json['channel'] as String?) ?? '',
      status: (json['status'] as String?) ?? '',
      error: json['error'] as String?,
      taskTitle: json['task_title'] as String?,
      createdAt: parseMeUtc(json['created_at']),
    );
  }
}

/// 解析接口返回的 UTC 时间串并转本地时区（与 app/test/datetime_contract_test.dart 契约一致）
DateTime? parseMeUtc(dynamic value) {
  if (value is! String || value.trim().isEmpty) return null;
  final raw = value.trim();
  final normalized = raw.endsWith('Z') || raw.contains('+')
      ? raw
      : (raw.contains('T') ? '${raw}Z' : '${raw.replaceFirst(' ', 'T')}Z');
  return DateTime.tryParse(normalized)?.toLocal();
}

/// 个人 SMTP 配置（GET /notifications/smtp-config、GET /companies/{id}/smtp）
class MeSmtpConfig {
  const MeSmtpConfig({
    this.host = '',
    this.port = 465,
    this.user = '',
    this.from = '',
    this.hasPassword = false,
    this.configured = false,
  });

  final String host;
  final int port;
  final String user;
  final String from;

  /// 服务端是否已保存密码；已保存时不回显明文
  final bool hasPassword;
  final bool configured;

  factory MeSmtpConfig.fromJson(Map<String, dynamic> json) {
    return MeSmtpConfig(
      host: (json['smtp_host'] as String?) ?? '',
      port: (json['smtp_port'] as num?)?.toInt() ?? 465,
      user: (json['smtp_user'] as String?) ?? '',
      from: (json['smtp_from'] as String?) ?? '',
      hasPassword: json['has_password'] == true,
      configured: json['configured'] == true,
    );
  }
}

/// 大模型配置（GET /notifications/llm-config、GET /companies/{id}/llm）
class MeLlmConfig {
  const MeLlmConfig({
    this.provider = '',
    this.baseUrl = '',
    this.model = '',
    this.enabled = false,
    this.useForJudge = false,
    this.useForAgent = false,
    this.hasApiKey = false,
    this.configured = false,
    this.presets = const {},
  });

  final String provider;
  final String baseUrl;
  final String model;
  final bool enabled;
  final bool useForJudge;
  final bool useForAgent;

  /// 服务端是否已保存 API Key；已保存时不回显明文
  final bool hasApiKey;
  final bool configured;

  /// 服务端预设：{provider: {label, default_base_url, default_model, needs_key}}
  final Map<String, dynamic> presets;

  factory MeLlmConfig.fromJson(Map<String, dynamic> json) {
    return MeLlmConfig(
      provider: (json['provider'] as String?) ?? '',
      baseUrl: (json['base_url'] as String?) ?? '',
      model: (json['model'] as String?) ?? '',
      enabled: json['enabled'] == true,
      useForJudge: json['use_for_judge'] == true,
      useForAgent: json['use_for_agent'] == true,
      hasApiKey: json['has_api_key'] == true,
      configured: json['configured'] == true,
      presets: json['presets'] is Map<String, dynamic>
          ? json['presets'] as Map<String, dynamic>
          : const {},
    );
  }
}

/// 企业语音识别绑定（GET /companies/{id}/bindings 的 asr 节点）
class MeAsrBinding {
  const MeAsrBinding({
    this.providerId = 'builtin',
    this.baseUrl = '',
    this.model = 'whisper-1',
    this.language = 'zh',
    this.hasApiKey = false,
  });

  final String providerId;
  final String baseUrl;
  final String model;
  final String language;
  final bool hasApiKey;

  bool get isBuiltin => providerId == 'builtin';

  factory MeAsrBinding.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const MeAsrBinding();
    final config = json['config_json'] is Map<String, dynamic>
        ? json['config_json'] as Map<String, dynamic>
        : const <String, dynamic>{};
    return MeAsrBinding(
      providerId: (json['provider_id'] as String?) ?? 'builtin',
      baseUrl: (config['base_url'] as String?) ?? '',
      model: (config['model'] as String?) ?? 'whisper-1',
      language: (config['language'] as String?) ?? 'zh',
      hasApiKey: json['has_api_key'] == true,
    );
  }

  Map<String, dynamic> toRequestConfig({String? apiKey}) {
    final config = <String, dynamic>{
      'base_url': baseUrl.trim(),
      'model': model.trim(),
      'language': language,
    };
    // 留空表示不修改已保存的密钥
    if (apiKey != null && apiKey.trim().isNotEmpty) {
      config['api_key'] = apiKey.trim();
    }
    return config;
  }
}

/// 企业集成账号（GET /companies/{id}/integrations）
///
/// 后端 `org.py::_integration_dto` 实际下发 `provider` / `config` /
/// `credentials` / `has_credentials` / `last_sync_at` / `created_at`，
/// 并没有 `enabled` 或 `status` 字段；配置状态必须按真实字段推导。
class MeIntegration {
  const MeIntegration({
    this.provider = '',
    this.hasCredentials = false,
    this.config = const {},
    this.lastSyncAt,
    this.createdAt,
  });

  final String provider;

  /// 服务端是否已保存可解密凭证（`has_credentials`）
  final bool hasCredentials;

  /// 非密钥配置节点（`config`），例如企微回调地址、组织快照
  final Map<String, dynamic> config;

  final DateTime? lastSyncAt;
  final DateTime? createdAt;

  /// 已配置口径：有凭证、有非空配置或已成功同步过
  bool get isConfigured =>
      hasCredentials || config.isNotEmpty || lastSyncAt != null;

  /// 后端 `trigger_org_sync` 支持的集成类型（oidc 仅用于登录，不能同步）
  static const Set<String> orgSyncProviders = {
    'wecom',
    'dingtalk',
    'feishu',
    'generic_scim',
    'generic',
  };

  bool get supportsOrgSync => orgSyncProviders.contains(provider);

  String get displayName => switch (provider) {
        'wecom' => '企业微信（WeCom）',
        'dingtalk' => '钉钉（DingTalk）',
        'feishu' => '飞书（Feishu）',
        'generic_scim' || 'generic' => '通用快照（SCIM）',
        'oidc' => '通用 OIDC（仅登录）',
        _ => provider.isEmpty ? '未知服务' : provider.toUpperCase(),
      };

  factory MeIntegration.fromJson(Map<String, dynamic> json) {
    return MeIntegration(
      provider: (json['provider'] as String?) ?? '',
      hasCredentials: json['has_credentials'] == true,
      config: json['config'] is Map<String, dynamic>
          ? json['config'] as Map<String, dynamic>
          : const {},
      lastSyncAt: parseMeUtc(json['last_sync_at']),
      createdAt: parseMeUtc(json['created_at']),
    );
  }
}

/// 企业可用登录方式（GET /companies/{id} 的 login_methods 节点）
class MeLoginMethods {
  const MeLoginMethods({
    this.password = true,
    this.wechat = false,
    this.wecom = false,
    this.dingtalk = false,
    this.feishu = false,
    this.oidc = false,
  });

  final bool password;
  final bool wechat;
  final bool wecom;
  final bool dingtalk;
  final bool feishu;
  final bool oidc;

  MeLoginMethods copyWith({bool? oidc}) {
    return MeLoginMethods(
      password: password,
      wechat: wechat,
      wecom: wecom,
      dingtalk: dingtalk,
      feishu: feishu,
      oidc: oidc ?? this.oidc,
    );
  }

  factory MeLoginMethods.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const MeLoginMethods();
    return MeLoginMethods(
      password: json['password'] != false,
      wechat: json['wechat'] == true,
      wecom: json['wecom'] == true,
      dingtalk: json['dingtalk'] == true,
      feishu: json['feishu'] == true,
      oidc: json['oidc'] == true,
    );
  }
}

/// 当前用户在企业内的权限（GET /companies/{id} 的 my_membership 节点）
///
/// 底座 `Company` 模型未携带该节点，因此由本模块单独取 `/companies/{id}` 判定。
class MeMembership {
  const MeMembership({
    this.isSuperAdmin = false,
    this.isOrgLeader = false,
    this.status = '',
    this.title,
  });

  static const MeMembership none = MeMembership();

  final bool isSuperAdmin;
  final bool isOrgLeader;
  final String status;
  final String? title;

  factory MeMembership.fromJson(Map<String, dynamic>? json) {
    if (json == null) return MeMembership.none;
    return MeMembership(
      isSuperAdmin: json['is_super_admin'] == true,
      isOrgLeader: json['is_org_leader'] == true,
      status: (json['status'] as String?) ?? '',
      title: json['title'] as String?,
    );
  }
}

/// 企业详情中「我的」相关字段（GET /companies/{id}）
class MeCompanyContext {
  const MeCompanyContext({
    this.membership = MeMembership.none,
    this.loginMethods = const MeLoginMethods(),
  });

  final MeMembership membership;
  final MeLoginMethods loginMethods;

  factory MeCompanyContext.fromJson(Map<String, dynamic> json) {
    return MeCompanyContext(
      membership: MeMembership.fromJson(
        json['my_membership'] is Map<String, dynamic>
            ? json['my_membership'] as Map<String, dynamic>
            : null,
      ),
      loginMethods: MeLoginMethods.fromJson(
        json['login_methods'] is Map<String, dynamic>
            ? json['login_methods'] as Map<String, dynamic>
            : null,
      ),
    );
  }
}

/// 后端健康检查（GET /health）
class MeHealth {
  const MeHealth({
    this.status = '',
    this.version = '',
    this.database = '',
  });

  final String status;
  final String version;
  final String database;

  bool get isHealthy => status == 'healthy';

  factory MeHealth.fromJson(dynamic json) {
    if (json is! Map<String, dynamic>) return const MeHealth();
    return MeHealth(
      status: (json['status'] as String?) ?? '',
      version: (json['version'] as String?) ?? '',
      database: (json['database'] as String?) ?? '',
    );
  }
}

/// 界面偏好（GET/PUT /users/me/ui-prefs）
class MeUiPrefs {
  const MeUiPrefs({
    this.language = 'zh',
    this.themeMode,
    this.taskDefaultPriority,
    this.taskDefaultCategoryId,
  });

  final String language;

  /// 'system' / 'light' / 'dark'，服务端未下发时为 null
  final String? themeMode;
  final int? taskDefaultPriority;
  final int? taskDefaultCategoryId;

  factory MeUiPrefs.fromJson(Map<String, dynamic> json) {
    final ui = json['ui'] is Map<String, dynamic>
        ? json['ui'] as Map<String, dynamic>
        : json;
    return MeUiPrefs(
      language: (ui['language'] as String?) ?? 'zh',
      themeMode: ui['theme_mode'] as String?,
      taskDefaultPriority: (ui['task_default_priority'] as num?)?.toInt(),
      taskDefaultCategoryId:
          (ui['task_default_category_id'] as num?)?.toInt(),
    );
  }
}

/// 任务分类（GET /categories，返回数组）
class MeCategory {
  const MeCategory({required this.id, required this.name});

  final int id;
  final String name;

  static MeCategory? fromJson(dynamic json) {
    if (json is! Map<String, dynamic>) return null;
    final id = (json['id'] as num?)?.toInt();
    final name = json['name'] as String?;
    if (id == null || name == null) return null;
    return MeCategory(id: id, name: name);
  }
}

/// 通知偏好（用户 notify_pref，与后端 NotifyPrefUpdate 结构一致）
class MeNotifyPref {
  const MeNotifyPref({
    this.email = true,
    this.push = true,
    this.desktop = true,
    this.wechat = false,
    this.quietHoursStart = '22:00',
    this.quietHoursEnd = '08:00',
    this.weekendMute = false,
  });

  final bool email;
  final bool push;
  final bool desktop;
  final bool wechat;
  final String quietHoursStart;
  final String quietHoursEnd;
  final bool weekendMute;

  MeNotifyPref copyWith({
    bool? email,
    bool? push,
    bool? desktop,
    bool? wechat,
    String? quietHoursStart,
    String? quietHoursEnd,
    bool? weekendMute,
  }) {
    return MeNotifyPref(
      email: email ?? this.email,
      push: push ?? this.push,
      desktop: desktop ?? this.desktop,
      wechat: wechat ?? this.wechat,
      quietHoursStart: quietHoursStart ?? this.quietHoursStart,
      quietHoursEnd: quietHoursEnd ?? this.quietHoursEnd,
      weekendMute: weekendMute ?? this.weekendMute,
    );
  }

  /// 组装 PUT /users/me 的 notify_pref 载荷（只提交后端允许的字段）
  Map<String, dynamic> toUpdatePayload() {
    return {
      'channels': {
        'email': {'enabled': email},
        'push': {'enabled': push},
        'desktop': {'enabled': desktop},
        'wechat': {'enabled': wechat},
      },
      'quiet_hours': {'start': quietHoursStart, 'end': quietHoursEnd},
      'weekend_mute': weekendMute,
    };
  }

  factory MeNotifyPref.fromJson(Map<String, dynamic>? json) {
    const fallback = MeNotifyPref();
    if (json == null) return fallback;
    final channels = json['channels'] is Map<String, dynamic>
        ? json['channels'] as Map<String, dynamic>
        : const <String, dynamic>{};
    bool channel(String key, bool fallbackValue) {
      final item = channels[key];
      if (item is Map<String, dynamic> && item['enabled'] is bool) {
        return item['enabled'] as bool;
      }
      if (item is bool) return item;
      return fallbackValue;
    }

    final quiet = json['quiet_hours'] is Map<String, dynamic>
        ? json['quiet_hours'] as Map<String, dynamic>
        : const <String, dynamic>{};

    return MeNotifyPref(
      email: channel('email', fallback.email),
      push: channel('push', fallback.push),
      desktop: channel('desktop', fallback.desktop),
      wechat: channel('wechat', fallback.wechat),
      quietHoursStart:
          (quiet['start'] as String?)?.trim().isNotEmpty == true
              ? (quiet['start'] as String).trim()
              : fallback.quietHoursStart,
      quietHoursEnd: (quiet['end'] as String?)?.trim().isNotEmpty == true
          ? (quiet['end'] as String).trim()
          : fallback.quietHoursEnd,
      weekendMute: json['weekend_mute'] is bool
          ? json['weekend_mute'] as bool
          : fallback.weekendMute,
    );
  }
}

/// 微信服务号订阅状态（GET /wx/subscribe-status）
class MeWechatStatus {
  const MeWechatStatus({
    this.bound = false,
    this.subscriptionEnabled = false,
  });

  final bool bound;
  final bool subscriptionEnabled;

  factory MeWechatStatus.fromJson(Map<String, dynamic> json) {
    return MeWechatStatus(
      bound: json['wx_bound'] == true,
      subscriptionEnabled: json['subscription_enabled'] == true,
    );
  }
}

/// 验证码发送结果（POST /users/me/verification/send-code）
class MeSendCodeResult {
  const MeSendCodeResult({this.cooldownSeconds = 60, this.debugCode});

  final int cooldownSeconds;
  final String? debugCode;

  factory MeSendCodeResult.fromJson(dynamic json) {
    if (json is! Map<String, dynamic>) {
      return const MeSendCodeResult();
    }
    return MeSendCodeResult(
      cooldownSeconds: (json['cooldown_seconds'] as num?)?.toInt() ?? 60,
      debugCode: json['debug_code'] as String?,
    );
  }
}

/// 通知渠道测试发送结果（POST /notify/test-send）
class MeNotifyTestResult {
  const MeNotifyTestResult({this.ok = false, this.error});

  final bool ok;
  final String? error;

  factory MeNotifyTestResult.fromJson(dynamic json) {
    if (json is! Map<String, dynamic>) {
      return const MeNotifyTestResult(ok: true);
    }
    return MeNotifyTestResult(
      ok: json['ok'] != false,
      error: json['error'] as String?,
    );
  }
}
