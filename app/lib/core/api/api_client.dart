import 'dart:convert';
import 'package:http/http.dart' as http;

import '../errors/app_error.dart';
import 'api_config.dart';
import 'token_storage.dart';

typedef JsonMap = Map<String, dynamic>;

/// 统一 API 客户端
class ApiClient {
  ApiClient({
    TokenStorage? tokenStorage,
    http.Client? httpClient,
    String? baseUrl,
  })  : tokens = tokenStorage ?? SecureTokenStorage(),
        _http = httpClient ?? http.Client(),
        _customBaseUrl = baseUrl;

  final TokenStorage tokens;
  final http.Client _http;
  final String? _customBaseUrl;

  Future<bool>? _refreshInflight;

  Future<void> init() async {
    await tokens.init();
  }

  String get baseUrl => _customBaseUrl ?? ApiConfig.baseUrl;

  Uri _buildUri(String path, [Map<String, String>? query]) {
    final base = baseUrl.endsWith('/')
        ? baseUrl.substring(0, baseUrl.length - 1)
        : baseUrl;
    final p = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$base$p').replace(
      queryParameters: (query != null && query.isNotEmpty) ? query : null,
    );
  }

  Future<dynamic> get(
    String path, {
    Map<String, String>? query,
    Map<String, String>? headers,
  }) =>
      _request('GET', path, query: query, customHeaders: headers);

  Future<dynamic> post(
    String path, {
    Object? body,
    Map<String, String>? query,
    Map<String, String>? headers,
  }) =>
      _request('POST', path, body: body, query: query, customHeaders: headers);

  Future<dynamic> put(
    String path, {
    Object? body,
    Map<String, String>? query,
    Map<String, String>? headers,
  }) =>
      _request('PUT', path, body: body, query: query, customHeaders: headers);

  Future<dynamic> patch(
    String path, {
    Object? body,
    Map<String, String>? query,
    Map<String, String>? headers,
  }) =>
      _request('PATCH', path, body: body, query: query, customHeaders: headers);

  Future<dynamic> delete(
    String path, {
    Map<String, String>? query,
    Map<String, String>? headers,
  }) =>
      _request('DELETE', path, query: query, customHeaders: headers);

  Future<dynamic> _request(
    String method,
    String path, {
    Object? body,
    Map<String, String>? query,
    Map<String, String>? customHeaders,
    bool retry = true,
  }) async {
    final headers = <String, String>{
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
    if (customHeaders != null) {
      headers.addAll(customHeaders);
    }
    if (tokens.hasAccess && !headers.containsKey('Authorization')) {
      headers['Authorization'] = 'Bearer ${tokens.accessToken}';
    }

    final uri = _buildUri(path, query);
    final encoded = body == null ? null : jsonEncode(body);

    http.Response res;
    try {
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
          throw ApiException('不支持的 HTTP 方法: $method');
      }
    } catch (e) {
      if (e is AppException) rethrow;
      throw NetworkException('网络请求失败: $e', cause: e);
    }

    // 401 续期处理：排除 /auth/ 下自身接口，防止死循环
    if (res.statusCode == 401 && retry && !path.contains('/auth/')) {
      final ok = await _tryRefresh();
      if (ok) {
        return _request(
          method,
          path,
          body: body,
          query: query,
          customHeaders: customHeaders,
          retry: false,
        );
      }
    }

    return _decode(res);
  }

  /// 单飞并发刷新机制
  Future<bool> _tryRefresh() {
    return _refreshInflight ??= _doRefresh().whenComplete(() {
      _refreshInflight = null;
    });
  }

  Future<bool> _doRefresh() async {
    final refresh = tokens.refreshToken;
    if (refresh == null || refresh.isEmpty) return false;

    try {
      final res = await _http.post(
        _buildUri('/auth/refresh'),
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({'refresh_token': refresh}),
      );

      // 服务端明确拒绝时才清空凭证
      if (res.statusCode == 401 || res.statusCode == 403) {
        await tokens.clear();
        return false;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return false;
      }

      final dynamic decoded = jsonDecode(utf8.decode(res.bodyBytes));
      if (decoded is! Map<String, dynamic>) return false;

      final data = decoded['data'];
      final access = (data is Map<String, dynamic>)
          ? data['access_token'] as String?
          : decoded['access_token'] as String?;

      if (access == null || access.isEmpty) return false;

      // 轮换下发新 refresh_token
      final rotated = (data is Map<String, dynamic>)
          ? data['refresh_token'] as String?
          : decoded['refresh_token'] as String?;

      await tokens.save(
        access: access,
        refresh: (rotated != null && rotated.isNotEmpty) ? rotated : null,
      );
      return true;
    } catch (_) {
      // 网络波动或超时保留本地凭证
      return false;
    }
  }

  /// 解析响应信封与错误
  dynamic _decode(http.Response res) {
    dynamic payload;
    if (res.body.isNotEmpty) {
      try {
        payload = jsonDecode(utf8.decode(res.bodyBytes));
      } catch (_) {
        payload = res.body;
      }
    }

    final isHttpSuccess = res.statusCode >= 200 && res.statusCode < 300;

    if (payload is Map<String, dynamic>) {
      final code = payload['code'];
      final message = _extractErrorMessage(payload, res.statusCode);

      // 检查信封业务 code（200 或 0 视为业务成功）
      final isBizSuccess = code == null || code == 200 || code == 0;

      if (isHttpSuccess && isBizSuccess) {
        // 如果包含标准 'data' 字段，解包 data；否则返回整个 map
        return payload.containsKey('data') ? payload['data'] : payload;
      }

      // 422 参数校验错误处理
      if (res.statusCode == 422) {
        final errors = _extractValidationErrors(payload);
        throw ValidationException(
          message,
          errors: errors,
          code: (code is num) ? code.toInt() : 422,
          cause: payload,
        );
      }

      final bizCode = (code is num) ? code.toInt() : res.statusCode;
      throw ApiException(
        message,
        statusCode: res.statusCode,
        code: bizCode,
        detail: payload['detail'],
      );
    }

    if (!isHttpSuccess) {
      throw ApiException(
        'HTTP ${res.statusCode}',
        statusCode: res.statusCode,
        code: res.statusCode,
      );
    }

    return payload;
  }

  /// 提取易读中文错误消息
  String _extractErrorMessage(Map<String, dynamic> body, int status) {
    if (body['message'] is String && (body['message'] as String).isNotEmpty) {
      return body['message'] as String;
    }

    final detail = body['detail'];
    if (detail is String && detail.isNotEmpty) {
      return detail;
    }

    if (detail is List && detail.isNotEmpty) {
      final messages = <String>[];
      for (final item in detail) {
        if (item is Map) {
          final loc = item['loc'] is List ? (item['loc'] as List).join('.') : '';
          final msg = item['msg'] as String? ?? '';
          if (loc.isNotEmpty) {
            messages.add('$loc: $msg');
          } else if (msg.isNotEmpty) {
            messages.add(msg);
          }
        } else if (item is String) {
          messages.add(item);
        }
      }
      if (messages.isNotEmpty) {
        return messages.join('; ');
      }
    }

    if (detail is Map) {
      final msg = detail['msg'] ?? detail['message'];
      if (msg is String && msg.isNotEmpty) {
        return msg;
      }
    }

    return '请求失败 (HTTP $status)';
  }

  /// 提取 422 验证字段字典
  Map<String, String> _extractValidationErrors(Map<String, dynamic> body) {
    final detail = body['detail'];
    final errors = <String, String>{};
    if (detail is List) {
      for (final item in detail) {
        if (item is Map) {
          final locList = item['loc'];
          final field = (locList is List && locList.isNotEmpty)
              ? locList.last.toString()
              : 'field';
          final msg = item['msg']?.toString() ?? '无效的值';
          errors[field] = msg;
        }
      }
    }
    return errors;
  }
}
