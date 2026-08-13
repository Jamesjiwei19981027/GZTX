import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/services/api_client.dart';

/// refresh 轮换回归测试。
///
/// 服务端每次 POST /auth/refresh 都会撤销旧 refresh_token 的 jti 并下发
/// 新 refresh_token（60 秒宽限期）。客户端若只存 access_token，第二次刷新
/// 时旧 token 已被撤销 → 401 → 被踢回登录。这里守护「轮换后的
/// refresh_token 必须写入内存与持久化存储」。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('401 触发刷新后，轮换下发的新 refresh_token 被保存', () async {
    SharedPreferences.setMockInitialValues({
      'access_token': 'stale-access',
      'refresh_token': 'old-refresh',
    });

    var refreshCalls = 0;
    final mock = MockClient((request) async {
      if (request.url.path.endsWith('/auth/refresh')) {
        refreshCalls++;
        expect(jsonDecode(request.body)['refresh_token'], 'old-refresh');
        return http.Response(
          jsonEncode({
            'code': 200,
            'message': 'success',
            'data': {
              'access_token': 'new-access',
              'refresh_token': 'new-refresh',
              'expires_in': 900,
            },
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      // 业务请求：旧 access 一律 401，新 access 放行
      if (request.headers['Authorization'] == 'Bearer new-access') {
        return http.Response(
          jsonEncode({'code': 200, 'message': 'success', 'data': {'ok': true}}),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response(
        jsonEncode({'code': 401, 'message': '未认证'}),
        401,
        headers: {'content-type': 'application/json'},
      );
    });

    final api = ApiClient(httpClient: mock);
    await api.init();

    final data = await api.get('/tasks/stats');
    expect((data as Map)['ok'], true);
    expect(refreshCalls, 1);

    // 内存与持久化都必须是轮换后的新 token
    expect(api.tokens.accessToken, 'new-access');
    expect(api.tokens.refreshToken, 'new-refresh');
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('access_token'), 'new-access');
    expect(prefs.getString('refresh_token'), 'new-refresh');
  });

  test('刷新响应不含 refresh_token（旧后端）时保留原 token', () async {
    SharedPreferences.setMockInitialValues({
      'access_token': 'stale-access',
      'refresh_token': 'old-refresh',
    });

    final mock = MockClient((request) async {
      if (request.url.path.endsWith('/auth/refresh')) {
        return http.Response(
          jsonEncode({
            'code': 200,
            'message': 'success',
            'data': {'access_token': 'new-access', 'expires_in': 900},
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (request.headers['Authorization'] == 'Bearer new-access') {
        return http.Response(
          jsonEncode({'code': 200, 'message': 'success', 'data': {'ok': true}}),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response(
        jsonEncode({'code': 401, 'message': '未认证'}),
        401,
        headers: {'content-type': 'application/json'},
      );
    });

    final api = ApiClient(httpClient: mock);
    await api.init();
    await api.get('/tasks/stats');

    expect(api.tokens.accessToken, 'new-access');
    expect(api.tokens.refreshToken, 'old-refresh');
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('refresh_token'), 'old-refresh');
  });
}
