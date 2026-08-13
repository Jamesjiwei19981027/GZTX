import '../models/models.dart';
import 'api_client.dart';

class AuthService {
  AuthService(this._api);

  final ApiClient _api;

  Future<AppUser> login({required String username, required String password}) async {
    final data = await _api.post('/auth/login', body: {
      'username': username.trim(),
      'password': password,
    }) as JsonMap;
    return _persistAuth(data);
  }

  Future<AppUser> loginWithCode({
    required String channel,
    required String target,
    required String code,
  }) async {
    final data = await _api.post('/auth/login-code', body: {
      'channel': channel,
      'target': target.trim(),
      'code': code.trim(),
    }) as JsonMap;
    return _persistAuth(data);
  }

  Future<AppUser> register({
    required String username,
    required String password,
    required String email,
    required String emailCode,
    String? nickname,
    String? phone,
    String? phoneCode,
  }) async {
    final body = <String, dynamic>{
      'username': username.trim(),
      'password': password,
      'email': email.trim(),
      'email_code': emailCode.trim(),
      if (nickname != null && nickname.trim().isNotEmpty) 'nickname': nickname.trim(),
      if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
      if (phoneCode != null && phoneCode.trim().isNotEmpty) 'phone_code': phoneCode.trim(),
    };
    final data = await _api.post('/auth/register', body: body) as JsonMap;
    return _persistAuth(data);
  }

  Future<Map<String, dynamic>> sendCode({
    required String channel,
    required String target,
    String? purpose,
  }) async {
    final data = await _api.post('/auth/send-code', body: {
      'channel': channel,
      'target': target.trim(),
      if (purpose != null) 'purpose': purpose,
    }) as JsonMap;
    return data;
  }

  Future<AppUser> fetchMe() async {
    final data = await _api.get('/users/me') as JsonMap;
    return AppUser.fromJson(data);
  }

  Future<AppUser> updateProfile({String? nickname}) async {
    final data = await _api.put('/users/me', body: {
      if (nickname != null) 'nickname': nickname.trim(),
    }) as JsonMap;
    return AppUser.fromJson(data);
  }

  Future<void> changePassword({
    required String oldPassword,
    required String newPassword,
  }) async {
    await _api.put('/users/me/password', body: {
      'old_password': oldPassword,
      'new_password': newPassword,
    });
  }

  Future<Map<String, dynamic>> verificationStatus() async {
    final data = await _api.get('/users/me/verification') as JsonMap;
    return data;
  }

  Future<Map<String, dynamic>> sendVerificationCode({
    required String channel,
    required String target,
  }) async {
    final data = await _api.post('/users/me/verification/send-code', body: {
      'channel': channel,
      'target': target.trim(),
    }) as JsonMap;
    return data;
  }

  Future<Map<String, dynamic>> confirmVerification({
    required String channel,
    required String target,
    required String code,
  }) async {
    final data = await _api.post('/users/me/verification/confirm', body: {
      'channel': channel,
      'target': target.trim(),
      'code': code.trim(),
    }) as JsonMap;
    return data;
  }

  Future<void> logout() async {
    // 先通知服务端撤销 refresh_token（旧后端忽略该字段；失败不阻断本地登出）
    final refresh = _api.tokens.refreshToken;
    if (refresh != null && refresh.isNotEmpty) {
      try {
        await _api.post('/auth/logout', body: {'refresh_token': refresh});
      } catch (_) {
        // 网络异常等：本地照常清凭证
      }
    }
    await _api.clearTokens();
  }

  Future<AppUser> _persistAuth(JsonMap data) async {
    final access = data['access_token'] as String;
    final refresh = data['refresh_token'] as String?;
    await _api.persistTokens(access: access, refresh: refresh);
    final userJson = data['user'] as JsonMap?;
    if (userJson != null) return AppUser.fromJson(userJson);
    return fetchMe();
  }
}
