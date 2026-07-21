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
  bool _refreshing = false;

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

  Future<dynamic> get(String path, {Map<String, String>? query}) {
    return _request('GET', path, query: query);
  }

  Future<dynamic> post(String path, {Object? body}) {
    return _request('POST', path, body: body);
  }

  Future<dynamic> patch(String path, {Object? body}) {
    return _request('PATCH', path, body: body);
  }

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
      case 'PATCH':
        res = await _http.patch(uri, headers: headers, body: encoded);
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

  Future<bool> _tryRefresh() async {
    if (_refreshing) return false;
    final refresh = tokens.refreshToken;
    if (refresh == null || refresh.isEmpty) return false;
    _refreshing = true;
    try {
      final res = await _http.post(
        _uri('/auth/refresh'),
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({'refresh_token': refresh}),
      );
      final data = _decode(res) as JsonMap;
      final access = data['access_token'] as String?;
      if (access == null || access.isEmpty) return false;
      await tokens.save(_prefs!, access: access);
      return true;
    } catch (_) {
      await tokens.clear(_prefs!);
      return false;
    } finally {
      _refreshing = false;
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
        if (payload.containsKey('data')) {
          return payload['data'];
        }
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
}
