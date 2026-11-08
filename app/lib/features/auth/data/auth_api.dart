import '../../../core/api/api_client.dart';
import '../../../core/errors/app_error.dart';
import '../models/auth_models.dart';

/// 登录注册相关的接口封装。
///
/// 仅调用 T00 底座提供的 [ApiClient]（自动附带令牌、解包信封、统一异常），
/// 不修改任何共享代码。
class AuthApi {
  AuthApi(this._client);

  final ApiClient _client;

  /// 账号密码登录（`username` 兼容用户名 / 邮箱 / 手机号）
  Future<AuthSession> loginWithPassword({
    required String username,
    required String password,
  }) async {
    final dynamic res = await _client.post(
      '/auth/login',
      body: {'username': username, 'password': password},
    );
    return _parseSession(res, fallbackMessage: '登录失败：未获取到访问令牌');
  }

  /// 验证码登录
  Future<AuthSession> loginWithCode({
    required AuthChannel channel,
    required String target,
    required String code,
  }) async {
    final dynamic res = await _client.post(
      '/auth/login-code',
      body: {
        'channel': channel.apiValue,
        'target': target,
        'code': code,
      },
    );
    return _parseSession(res, fallbackMessage: '验证码登录失败：未获取到访问令牌');
  }

  /// 注册并直接获得令牌
  Future<AuthSession> register({
    required String username,
    required String password,
    required String email,
    required String emailCode,
    String? phone,
    String? phoneCode,
    String? nickname,
    String? inviteToken,
  }) async {
    final body = <String, dynamic>{
      'username': username,
      'password': password,
      'email': email,
      'email_code': emailCode,
    };
    if (phone != null && phone.isNotEmpty) body['phone'] = phone;
    if (phoneCode != null && phoneCode.isNotEmpty) {
      body['phone_code'] = phoneCode;
    }
    if (nickname != null && nickname.isNotEmpty) body['nickname'] = nickname;
    if (inviteToken != null && inviteToken.trim().isNotEmpty) {
      body['invite_token'] = inviteToken.trim();
    }

    final dynamic res = await _client.post('/auth/register', body: body);
    return _parseSession(res, fallbackMessage: '注册失败：未获取到访问令牌');
  }

  /// 注册 / 登录场景发送验证码（匿名可调）
  Future<SendCodeResult> sendCode({
    required AuthChannel channel,
    required String target,
    required SendCodePurpose purpose,
    String? inviteToken,
  }) async {
    final body = <String, dynamic>{
      'channel': channel.apiValue,
      'target': target,
      'purpose': purpose.apiValue,
    };
    if (inviteToken != null && inviteToken.trim().isNotEmpty) {
      body['invite_token'] = inviteToken.trim();
    }
    final dynamic res = await _client.post(
      '/auth/send-code',
      body: body,
    );
    return SendCodeResult.fromJson(res);
  }

  /// 读取注册模式与手机必验配置（匿名）
  Future<RegistrationConfig> fetchRegistrationConfig() async {
    try {
      final dynamic res = await _client.get('/auth/registration-config');
      return RegistrationConfig.fromJson(res);
    } catch (_) {
      return const RegistrationConfig();
    }
  }

  /// 登录后补验 / 换绑：发送验证码（需登录态）
  Future<SendCodeResult> sendBindCode({
    required AuthChannel channel,
    required String target,
  }) async {
    final dynamic res = await _client.post(
      '/users/me/verification/send-code',
      body: {'channel': channel.apiValue, 'target': target},
    );
    return SendCodeResult.fromJson(res);
  }

  /// 双验证状态
  Future<VerificationStatus> fetchVerificationStatus() async {
    final dynamic res = await _client.get('/users/me/verification');
    return VerificationStatus.fromJson(res);
  }

  /// 校验验证码并写入邮箱 / 手机
  Future<VerificationStatus> confirmBindCode({
    required AuthChannel channel,
    required String target,
    required String code,
    VerificationStatus? base,
  }) async {
    final dynamic res = await _client.post(
      '/users/me/verification/confirm',
      body: {
        'channel': channel.apiValue,
        'target': target,
        'code': code,
      },
    );
    final server = VerificationStatus.fromJson(res, base: base);
    // confirm 接口不返回 email/phone 字段，用本次绑定的目标补齐展示值
    return server.confirmLocal(channel, target);
  }

  AuthSession _parseSession(dynamic res, {required String fallbackMessage}) {
    String? access;
    String? refresh;
    int? projectId;
    if (res is Map) {
      final dynamic rawAccess = res['access_token'];
      final dynamic rawRefresh = res['refresh_token'];
      if (rawAccess is String) access = rawAccess;
      if (rawRefresh is String) refresh = rawRefresh;
      if (res['project_id'] is num) {
        projectId = (res['project_id'] as num).toInt();
      }
    }
    if (access == null || access.isEmpty) {
      throw ApiException(fallbackMessage);
    }
    return AuthSession(
      accessToken: access,
      refreshToken: (refresh != null && refresh.isNotEmpty) ? refresh : null,
      projectId: projectId,
    );
  }
}
