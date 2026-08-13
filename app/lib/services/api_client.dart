import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';
import '../models/models.dart';
import 'token_store.dart';

typedef JsonMap = Map<String, dynamic>;

class ApiClient {
  ApiClient({TokenStore? tokenStore, http.Client? httpClient})
      : tokens = tokenStore ?? TokenStore(),
        _http = httpClient ?? http.Client();

  final TokenStore tokens;
  final http.Client _http;
  SharedPreferences? _prefs;
  Future<bool>? _refreshInflight;

  Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
    await tokens.load(_prefs!);
  }

  Uri _uri(String path, [Map<String, String>? query]) {
    final base = ApiConfig.baseUrl.endsWith('/')
        ? ApiConfig.baseUrl.substring(0, ApiConfig.baseUrl.length - 1)
        : ApiConfig.baseUrl;
    final p = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$base$p').replace(queryParameters: query);
  }

  Future<dynamic> get(String path, {Map<String, String>? query}) =>
      _request('GET', path, query: query);

  Future<dynamic> post(String path, {Object? body}) =>
      _request('POST', path, body: body);

  Future<dynamic> put(String path, {Object? body}) =>
      _request('PUT', path, body: body);

  Future<dynamic> patch(String path, {Object? body}) =>
      _request('PATCH', path, body: body);

  Future<dynamic> delete(String path, {Map<String, String>? query}) =>
      _request('DELETE', path, query: query);

  Future<dynamic> _request(
    String method,
    String path, {
    Object? body,
    Map<String, String>? query,
    bool retry = true,
  }) async {
    final headers = <String, String>{
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
    if (tokens.hasAccess) {
      headers['Authorization'] = 'Bearer ${tokens.accessToken}';
    }

    late http.Response res;
    final uri = _uri(path, query);
    final encoded = body == null ? null : jsonEncode(body);
    switch (method) {
      case 'GET':
        res = await _http.get(uri, headers: headers);
      case 'POST':
        res = await _http.post(uri, headers: headers, body: encoded);
      case 'PUT':
        res = await _http.put(uri, headers: headers, body: encoded);
      case 'PATCH':
        res = await _http.patch(uri, headers: headers, body: encoded);
      case 'DELETE':
        res = await _http.delete(uri, headers: headers);
      default:
        throw ApiException('Unsupported method $method');
    }

    if (res.statusCode == 401 && retry && tokens.refreshToken != null) {
      final ok = await _tryRefresh();
      if (ok) {
        return _request(method, path, body: body, query: query, retry: false);
      }
    }

    return _decode(res);
  }

  /// 刷新令牌（单飞）。
  ///
  /// 旧实现有两个问题：
  /// 1. `if (_refreshing) return false` —— 并发 401 时只有第一个请求去刷新，
  ///    其余立刻拿到 false 直接报错，一批并发请求会有一半无谓失败；
  /// 2. `catch (_) { clear tokens }` —— 不区分异常类型，断网/超时/5xx
  ///    也会把 refresh_token 删掉，网络恢复后仍要重新登录。
  Future<bool> _tryRefresh() {
    return _refreshInflight ??= _doRefresh().whenComplete(() {
      _refreshInflight = null;
    });
  }

  Future<bool> _doRefresh() async {
    final refresh = tokens.refreshToken;
    final prefs = _prefs;
    if (refresh == null || refresh.isEmpty || prefs == null) return false;
    try {
      final res = await _http.post(
        _uri('/auth/refresh'),
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({'refresh_token': refresh}),
      );
      // 只有服务端明确拒绝这张 refresh_token 才清凭证
      if (res.statusCode == 401 || res.statusCode == 403) {
        await tokens.clear(prefs);
        return false;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) return false;

      final data = _decode(res);
      final access = data is JsonMap ? data['access_token'] as String? : null;
      if (access == null || access.isEmpty) return false;
      // 轮换式刷新：服务端每次刷新都会撤销旧 refresh_token 并下发新的，
      // 不存新 token 的话 60 秒宽限期一过，下次刷新必 401 被踢回登录
      final rotated = data is JsonMap ? data['refresh_token'] as String? : null;
      await tokens.save(
        prefs,
        access: access,
        refresh: (rotated != null && rotated.isNotEmpty) ? rotated : null,
      );
      return true;
    } on ApiException catch (e) {
      if (e.statusCode == 401 || e.statusCode == 403) {
        await tokens.clear(prefs);
      }
      return false;
    } catch (_) {
      // 网络异常：保留凭证，恢复网络后照旧可用
      return false;
    }
  }

  dynamic _decode(http.Response res) {
    dynamic payload;
    if (res.body.isNotEmpty) {
      try {
        payload = jsonDecode(res.body);
      } catch (_) {
        payload = res.body;
      }
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      if (payload is Map<String, dynamic>) {
        final code = payload['code'];
        if (code != null && code != 200) {
          throw ApiException(
            (payload['message'] ?? '请求失败').toString(),
            statusCode: res.statusCode,
            code: code is int ? code : int.tryParse('$code'),
          );
        }
        if (payload.containsKey('data')) return payload['data'];
      }
      return payload;
    }

    String message = '请求失败 (${res.statusCode})';
    int? bizCode;
    if (payload is Map<String, dynamic>) {
      final detail = payload['detail'];
      if (detail is Map) {
        message = (detail['message'] ?? detail['msg'] ?? message).toString();
        bizCode = detail['code'] is int
            ? detail['code'] as int
            : int.tryParse('${detail['code']}');
      } else if (detail is String) {
        message = detail;
      } else if (payload['message'] != null) {
        message = payload['message'].toString();
      }
    }
    throw ApiException(message, statusCode: res.statusCode, code: bizCode);
  }

  Future<void> persistTokens({required String access, String? refresh}) async {
    await tokens.save(_prefs!, access: access, refresh: refresh);
  }

  Future<void> clearTokens() async {
    await tokens.clear(_prefs!);
  }

  Future<void> setCompanyId(int? id) async {
    if (id == null || id <= 0) {
      await _prefs!.remove('company_id');
    } else {
      await _prefs!.setInt('company_id', id);
    }
  }

  int get companyId => _prefs?.getInt('company_id') ?? 0;
}
