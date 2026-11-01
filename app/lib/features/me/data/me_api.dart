import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/api/api_client.dart';
import '../../../core/errors/app_error.dart';
import '../../../core/models/user.dart';
import 'me_models.dart';

/// T09「我的与管理」接口层。
///
/// 统一走底座 [ApiClient]（自动携带令牌、30 秒超时、401 续期、标准信封解包），
/// 仅在头像上传（multipart）这一处直接使用 http，并在下方「接口备注」说明原因。
class MeApi {
  MeApi(this._client, {http.Client? uploadClient})
      : _uploadClient = uploadClient ?? http.Client();

  final ApiClient _client;
  final http.Client _uploadClient;

  /// 头像上传用的底层客户端（仅测试注入替换）
  http.Client get uploadClient => _uploadClient;

  // ---------------------------------------------------------------------------
  // 用户资料与账号安全
  // ---------------------------------------------------------------------------

  Future<User> fetchMe() async {
    final data = await _client.get('/users/me');
    return User.fromJson(_asMap(data));
  }

  Future<User> updateMe({
    String? nickname,
    String? avatarUrl,
    Map<String, dynamic>? notifyPref,
  }) async {
    final body = <String, dynamic>{};
    if (nickname != null) body['nickname'] = nickname;
    if (avatarUrl != null) body['avatar_url'] = avatarUrl;
    if (notifyPref != null) body['notify_pref'] = notifyPref;
    final data = await _client.put('/users/me', body: body);
    return User.fromJson(_asMap(data));
  }

  /// 上传头像（POST /users/me/avatar，multipart/form-data）
  ///
  /// 接口备注：底座 ApiClient 只支持 JSON 体，multipart 需自行组装；
  /// 已在回传报告「共享改动申请」中请求 ApiClient 支持文件上传。
  Future<String> uploadAvatar({
    required List<int> bytes,
    required String filename,
  }) async {
    final uri = Uri.parse('${_client.baseUrl}/users/me/avatar');
    // 后端按文件名后缀校验图片类型（png/jpg/gif/webp），无需显式 contentType
    final request = http.MultipartRequest('POST', uri)
      ..files.add(http.MultipartFile.fromBytes(
        'file',
        bytes,
        filename: filename,
      ));
    if (_client.tokens.hasAccess) {
      request.headers['Authorization'] = 'Bearer ${_client.tokens.accessToken}';
    }
    request.headers['Accept'] = 'application/json';

    final http.Response res;
    try {
      final streamed = await _uploadClient
          .send(request)
          .timeout(_client.timeout, onTimeout: () {
        throw NetworkException('请求超时，请检查网络连接');
      });
      res = await http.Response.fromStream(streamed);
    } on AppException {
      rethrow;
    } catch (e) {
      throw NetworkException('网络请求失败: $e', cause: e);
    }

    dynamic payload;
    try {
      payload = jsonDecode(utf8.decode(res.bodyBytes));
    } catch (_) {
      payload = null;
    }

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw ApiException(
        _extractMessage(payload) ?? '头像上传失败，请稍后重试',
        statusCode: res.statusCode,
        code: res.statusCode,
      );
    }

    final data = payload is Map<String, dynamic> ? payload['data'] : payload;
    final url = data is Map<String, dynamic>
        ? (data['avatar_url'] as String?)
        : null;
    if (url == null || url.isEmpty) {
      throw ApiException('头像上传失败：服务端未返回图片地址');
    }
    return url;
  }

  Future<MeVerificationStatus> fetchVerification() async {
    final data = await _client.get('/users/me/verification');
    return MeVerificationStatus.fromJson(_asMap(data));
  }

  Future<MeSendCodeResult> sendBindCode({
    required String channel,
    required String target,
  }) async {
    final data = await _client.post(
      '/users/me/verification/send-code',
      body: {'channel': channel, 'target': target},
    );
    return MeSendCodeResult.fromJson(data);
  }

  Future<MeVerificationStatus> confirmBindCode({
    required String channel,
    required String target,
    required String code,
  }) async {
    final data = await _client.post(
      '/users/me/verification/confirm',
      body: {'channel': channel, 'target': target, 'code': code},
    );
    return MeVerificationStatus.fromJson(_asMap(data));
  }

  Future<void> changePassword({
    required String oldPassword,
    required String newPassword,
  }) async {
    await _client.put(
      '/users/me/password',
      body: {'old_password': oldPassword, 'new_password': newPassword},
    );
  }

  Future<void> deleteAccount({
    required String password,
    String confirmation = 'DELETE',
  }) async {
    await _client.post(
      '/users/me/delete',
      body: {'password': password, 'confirmation': confirmation},
    );
  }

  Future<MeBillingSummary> fetchBilling() async {
    final data = await _client.get('/users/me/billing');
    return MeBillingSummary.fromJson(_asMap(data));
  }

  Future<MePrivacySummary> fetchPrivacy() async {
    final data = await _client.get('/users/me/privacy');
    return MePrivacySummary.fromJson(_asMap(data));
  }

  // ---------------------------------------------------------------------------
  // 界面偏好 / 任务默认值 / 分类
  // ---------------------------------------------------------------------------

  Future<MeUiPrefs> fetchUiPrefs() async {
    final data = await _client.get('/users/me/ui-prefs');
    return MeUiPrefs.fromJson(_asMap(data));
  }

  Future<MeUiPrefs> saveUiPrefs({
    String? language,
    String? themeMode,
    int? taskDefaultPriority,
    int? taskDefaultCategoryId,
  }) async {
    final body = <String, dynamic>{};
    if (language != null) body['language'] = language;
    if (themeMode != null) body['theme_mode'] = themeMode;
    if (taskDefaultPriority != null) {
      body['task_default_priority'] = taskDefaultPriority;
    }
    if (taskDefaultCategoryId != null) {
      body['task_default_category_id'] = taskDefaultCategoryId;
    }
    final data = await _client.put('/users/me/ui-prefs', body: body);
    return MeUiPrefs.fromJson(_asMap(data));
  }

  Future<List<MeCategory>> fetchCategories() async {
    final data = await _client.get('/categories');
    final list = <MeCategory>[];
    if (data is List) {
      for (final item in data) {
        final category = MeCategory.fromJson(item);
        if (category != null) list.add(category);
      }
    }
    return list;
  }

  // ---------------------------------------------------------------------------
  // 通知配置与通知可靠性
  // ---------------------------------------------------------------------------

  Future<MeSmtpConfig> fetchSmtpConfig() async {
    final data = await _client.get('/notifications/smtp-config');
    return MeSmtpConfig.fromJson(_asMap(data));
  }

  Future<MeSmtpConfig> saveSmtpConfig({
    required String host,
    required int port,
    required String user,
    required String from,
    String? password,
  }) async {
    final body = <String, dynamic>{
      'smtp_host': host.trim(),
      'smtp_port': port,
      'smtp_user': user.trim(),
      'smtp_from': from.trim(),
    };
    // 留空表示不修改已保存的密码
    if (password != null && password.trim().isNotEmpty) {
      body['smtp_password'] = password.trim();
    }
    final data = await _client.put('/notifications/smtp-config', body: body);
    return MeSmtpConfig.fromJson(_asMap(data));
  }

  Future<MeLlmConfig> fetchLlmConfig() async {
    final data = await _client.get('/notifications/llm-config');
    return MeLlmConfig.fromJson(_asMap(data));
  }

  Future<MeLlmConfig> saveLlmConfig({
    String? provider,
    String? baseUrl,
    String? model,
    String? apiKey,
    bool? enabled,
    bool? useForJudge,
    bool? useForAgent,
  }) async {
    final body = <String, dynamic>{};
    if (provider != null) body['provider'] = provider;
    if (baseUrl != null) body['base_url'] = baseUrl.trim();
    if (model != null) body['model'] = model.trim();
    if (enabled != null) body['enabled'] = enabled;
    if (useForJudge != null) body['use_for_judge'] = useForJudge;
    if (useForAgent != null) body['use_for_agent'] = useForAgent;
    // 留空表示不修改已保存的密钥
    if (apiKey != null && apiKey.trim().isNotEmpty) {
      body['api_key'] = apiKey.trim();
    }
    final data = await _client.put('/notifications/llm-config', body: body);
    return MeLlmConfig.fromJson(_asMap(data));
  }

  Future<void> testLlmConfig() async {
    await _client.post('/notifications/llm-test', body: const {});
  }

  Future<MeNotifyTestResult> sendNotifyTest(String channel) async {
    final data = await _client.post(
      '/notify/test-send',
      body: {'channel': channel},
    );
    return MeNotifyTestResult.fromJson(data);
  }

  Future<List<MeNotifyRecord>> listNotifyRecords({int limit = 50}) async {
    final data = await _client.get(
      '/notify/records',
      query: {'limit': limit.toString()},
    );
    final map = _asMap(data);
    final items = map['items'];
    final list = <MeNotifyRecord>[];
    if (items is List) {
      for (final item in items) {
        if (item is Map<String, dynamic>) {
          list.add(MeNotifyRecord.fromJson(item));
        }
      }
    }
    return list;
  }

  /// WebPush 公钥。未配置时后端返回 503，这里向上抛出，由页面显示「未配置」。
  Future<String> fetchVapidPublicKey() async {
    final data = await _client.get('/notifications/vapid-public-key');
    final key = _asMap(data)['publicKey'] as String? ?? '';
    if (key.isEmpty) {
      throw ApiException('WebPush 公钥为空');
    }
    return key;
  }

  // ---------------------------------------------------------------------------
  // 企业上下文 / 管理员配置
  // ---------------------------------------------------------------------------

  Future<MeCompanyContext> fetchCompanyContext(int companyId) async {
    final data = await _client.get('/companies/$companyId');
    return MeCompanyContext.fromJson(_asMap(data));
  }

  Future<MeSmtpConfig> fetchCompanySmtp(int companyId) async {
    final data = await _client.get('/companies/$companyId/smtp');
    return MeSmtpConfig.fromJson(_asMap(data));
  }

  Future<MeSmtpConfig> saveCompanySmtp(
    int companyId, {
    required String host,
    required int port,
    required String user,
    required String from,
    String? password,
  }) async {
    final body = <String, dynamic>{
      'smtp_host': host.trim(),
      'smtp_port': port,
      'smtp_user': user.trim(),
      'smtp_from': from.trim(),
    };
    if (password != null && password.trim().isNotEmpty) {
      body['smtp_password'] = password.trim();
    }
    final data = await _client.put(
      '/companies/$companyId/smtp',
      body: body,
    );
    return MeSmtpConfig.fromJson(_asMap(data));
  }

  Future<String> testCompanySmtp(int companyId) async {
    final data = await _client.post('/companies/$companyId/smtp/test');
    if (data is Map<String, dynamic> && data['message'] is String) {
      return data['message'] as String;
    }
    return '测试邮件已发送';
  }

  Future<MeLlmConfig> fetchCompanyLlm(int companyId) async {
    final data = await _client.get('/companies/$companyId/llm');
    return MeLlmConfig.fromJson(_asMap(data));
  }

  Future<MeLlmConfig> saveCompanyLlm(
    int companyId, {
    String? provider,
    String? baseUrl,
    String? model,
    String? apiKey,
    bool? enabled,
    bool? useForJudge,
    bool? useForAgent,
  }) async {
    final body = <String, dynamic>{};
    if (provider != null) body['provider'] = provider;
    if (baseUrl != null) body['base_url'] = baseUrl.trim();
    if (model != null) body['model'] = model.trim();
    if (enabled != null) body['enabled'] = enabled;
    if (useForJudge != null) body['use_for_judge'] = useForJudge;
    if (useForAgent != null) body['use_for_agent'] = useForAgent;
    if (apiKey != null && apiKey.trim().isNotEmpty) {
      body['api_key'] = apiKey.trim();
    }
    final data = await _client.put(
      '/companies/$companyId/llm',
      body: body,
    );
    return MeLlmConfig.fromJson(_asMap(data));
  }

  Future<String> testCompanyLlm(int companyId) async {
    final data = await _client.post('/companies/$companyId/llm/test');
    if (data is Map<String, dynamic> && data['content'] is String) {
      return data['content'] as String;
    }
    return '连通性测试通过';
  }

  Future<List<MeIntegration>> listIntegrations(int companyId) async {
    final data = await _client.get('/companies/$companyId/integrations');
    final items = _asMap(data)['items'];
    final list = <MeIntegration>[];
    if (items is List) {
      for (final item in items) {
        if (item is Map<String, dynamic>) {
          list.add(MeIntegration.fromJson(item));
        }
      }
    }
    return list;
  }

  Future<void> triggerOrgSync(int companyId) async {
    await _client.post('/companies/$companyId/org-sync', body: const {});
  }

  Future<MeAsrBinding> fetchCompanyAsr(int companyId) async {
    final data = await _client.get('/companies/$companyId/bindings');
    final asr = _asMap(data)['asr'];
    return MeAsrBinding.fromJson(
      asr is Map<String, dynamic> ? asr : null,
    );
  }

  Future<MeAsrBinding> saveCompanyAsr(
    int companyId, {
    required String providerId,
    String? baseUrl,
    String? model,
    String? language,
    String? apiKey,
  }) async {
    final body = <String, dynamic>{
      'provider_id': providerId,
      'config_json': providerId == 'builtin'
          ? null
          : MeAsrBinding(
              providerId: providerId,
              baseUrl: baseUrl ?? '',
              model: model ?? '',
              language: language ?? 'zh',
            ).toRequestConfig(apiKey: apiKey),
    };
    final data = await _client.put(
      '/companies/$companyId/bindings/asr',
      body: body,
    );
    return MeAsrBinding.fromJson(_asMap(data));
  }

  Future<MeLoginMethods> updateLoginMethods(
    int companyId, {
    bool? oidc,
    bool? password,
    bool? wechat,
    bool? wecom,
    bool? dingtalk,
    bool? feishu,
  }) async {
    final body = <String, dynamic>{};
    if (oidc != null) body['oidc'] = oidc;
    if (password != null) body['password'] = password;
    if (wechat != null) body['wechat'] = wechat;
    if (wecom != null) body['wecom'] = wecom;
    if (dingtalk != null) body['dingtalk'] = dingtalk;
    if (feishu != null) body['feishu'] = feishu;
    final data = await _client.patch(
      '/companies/$companyId/login-methods',
      body: body,
    );
    return MeLoginMethods.fromJson(_asMap(data));
  }

  // ---------------------------------------------------------------------------
  // 微信与个人语音识别
  // ---------------------------------------------------------------------------

  Future<MeWechatStatus> fetchWechatStatus() async {
    final data = await _client.get('/wx/subscribe-status');
    return MeWechatStatus.fromJson(_asMap(data));
  }

  Future<MeWechatStatus> updateWechatSubscription(bool enabled) async {
    final data = await _client.put(
      '/wx/subscribe-preference',
      body: {'enabled': enabled, 'template_ids': const <String>[]},
    );
    return MeWechatStatus.fromJson(_asMap(data));
  }

  /// 个人语音识别绑定（PUT /users/me/bindings/asr，provider_id + company_id）
  Future<void> saveUserAsr({
    required int companyId,
    required String providerId,
  }) async {
    await _client.put(
      '/users/me/bindings/asr',
      body: {'provider_id': providerId, 'company_id': companyId},
    );
  }

  // ---------------------------------------------------------------------------
  // 系统
  // ---------------------------------------------------------------------------

  Future<MeHealth> fetchHealth() async {
    final data = await _client.get('/health');
    return MeHealth.fromJson(data);
  }

  static Map<String, dynamic> _asMap(dynamic data) {
    if (data is Map<String, dynamic>) return data;
    return const <String, dynamic>{};
  }

  static String? _extractMessage(dynamic payload) {
    if (payload is Map<String, dynamic>) {
      final message = payload['message'] ?? payload['detail'];
      if (message is String && message.isNotEmpty) return message;
      if (message is Map && message['message'] is String) {
        return message['message'] as String;
      }
    }
    return null;
  }
}
