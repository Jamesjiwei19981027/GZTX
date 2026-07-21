import 'package:shared_preferences/shared_preferences.dart';

class TokenStore {
  static const _accessKey = 'access_token';
  static const _refreshKey = 'refresh_token';

  String? accessToken;
  String? refreshToken;

  Future<void> load(SharedPreferences prefs) async {
    accessToken = prefs.getString(_accessKey);
    refreshToken = prefs.getString(_refreshKey);
  }

  Future<void> save(
    SharedPreferences prefs, {
    required String access,
    String? refresh,
  }) async {
    accessToken = access;
    if (refresh != null) {
      refreshToken = refresh;
      await prefs.setString(_refreshKey, refresh);
    }
    await prefs.setString(_accessKey, access);
  }

  Future<void> clear(SharedPreferences prefs) async {
    accessToken = null;
    refreshToken = null;
    await prefs.remove(_accessKey);
    await prefs.remove(_refreshKey);
  }

  bool get hasAccess => accessToken != null && accessToken!.isNotEmpty;
}
