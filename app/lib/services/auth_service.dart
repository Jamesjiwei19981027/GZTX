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

    final access = data['access_token'] as String;
    final refresh = data['refresh_token'] as String?;
    await _api.persistTokens(access: access, refresh: refresh);

    final userJson = data['user'] as JsonMap?;
    if (userJson != null) {
      return AppUser.fromJson(userJson);
    }
    return fetchMe();
  }

  Future<AppUser> fetchMe() async {
    final data = await _api.get('/users/me') as JsonMap;
    return AppUser.fromJson(data);
  }

  Future<void> logout() => _api.clearTokens();
}
