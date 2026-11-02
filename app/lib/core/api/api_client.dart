import 'dart:async';
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
    this.onAuthExpired,
    this.timeout = const Duration(seconds: 30),
  })  : tokens = tokenStorage ?? SecureTokenStorage(),
        _http = httpClient ?? http.Client(),
        _customBaseUrl = baseUrl;

  final TokenStorage tokens;
  final http.Client _http;
  final String? _customBaseUrl;

  /// 全局认证过期回调（在最终 401 且无法续期时触发）
  void Function()? onAuthExpired;

  /// 请求超时时间，默认 30 秒
  final Duration timeout;

  Future<bool>? _refreshInflight;
  int? _refreshGeneration;

  void requireSession(int generation) {
    if (tokens.sessionGeneration != generation) {
      throw AuthException('登录会话已切换，请重新操作', code: 401);
    }
  }

  Future<Never> expireSession(int generation) async {
    requireSession(generation);
    final clearing = tokens.clear();
    requireSession(generation + 1);
    onAuthExpired?.call();
    await clearing;
    throw AuthException('登录已过期，请重新登录', code: 401);
  }

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
    Object? body,
    Map<String, String>? query,
    Map<String, String>? headers,
  }) =>
      _request('DELETE', path,
          body: body, query: query, customHeaders: headers);

  /// 工厂每次返回新的请求，确保 multipart/流请求在 401 后可重放。
  /// 传入 sender 便于已有上传端口保留独立传输器，续期仍统一单飞。
  Future<http.Response> sendRaw(
    http.BaseRequest Function() createRequest, {
    http.Client? sender,
    Duration? requestTimeout,
  }) async {
    final generation = tokens.sessionGeneration;
    Future<http.Response> send() async {
      requireSession(generation);
      final request = createRequest();
      request.followRedirects = false;
      if (request.url.origin != Uri.parse(baseUrl).origin) {
        throw ApiException('拒绝向其他站点发送登录凭据');
      }
      request.headers['Accept'] = 'application/json';
      if (tokens.hasAccess) {
        request.headers['Authorization'] = 'Bearer ${tokens.accessToken}';
      }
      try {
        return await (() async {
          final stream = await (sender ?? _http).send(request);
          return http.Response.fromStream(stream);
        })()
            .timeout(requestTimeout ?? timeout);
      } on TimeoutException {
        throw NetworkException('请求超时，请检查网络连接');
      } on AppException {
        rethrow;
      } catch (e) {
        throw NetworkException('网络请求失败：$e', cause: e);
      }
    }

    final sentToken = tokens.accessToken;
    var response = await send();
    requireSession(generation);
    if (response.statusCode == 401) {
      final refreshed = tokens.hasAccess && tokens.accessToken != sentToken ||
          await _tryRefresh(sender: sender);
      requireSession(generation);
      if (refreshed) response = await send();
      requireSession(generation);
      if (!refreshed || response.statusCode == 401) {
        await expireSession(generation);
      }
    }
    return response;
  }

  Future<dynamic> postMultipart(
    String path, {
    Map<String, String> fields = const {},
    required List<int> bytes,
    required String filename,
    String fileField = 'file',
    http.Client? sender,
  }) async {
    final response = await sendRaw(
        () => http.MultipartRequest('POST', _buildUri(path))
          ..fields.addAll(fields)
          ..files.add(http.MultipartFile.fromBytes(fileField, bytes,
              filename: filename)),
        sender: sender);
    return _decode(response);
  }

  Future<http.Response> _sendHttpRequest(
    String method,
    Uri uri,
    Map<String, String> headers,
    String? body,
  ) {
    Future<http.Response> req;
    switch (method) {
      case 'GET':
        req = _http.get(uri, headers: headers);
      case 'POST':
        req = _http.post(uri, headers: headers, body: body);
      case 'PUT':
        req = _http.put(uri, headers: headers, body: body);
      case 'PATCH':
        req = _http.patch(uri, headers: headers, body: body);
      case 'DELETE':
        req = _http.delete(uri, headers: headers, body: body);
      default:
        throw ApiException('不支持的 HTTP 方法: $method');
    }

    return req.timeout(
      timeout,
      onTimeout: () => throw NetworkException('请求超时，请检查网络连接'),
    );
  }

  Future<dynamic> _request(
    String method,
    String path, {
    Object? body,
    Map<String, String>? query,
    Map<String, String>? customHeaders,
    bool retry = true,
  }) async {
    final generation = tokens.sessionGeneration;
    final sentToken = tokens.accessToken;
    final normalizedPath = path.startsWith('/') ? path : '/$path';
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
      res = await _sendHttpRequest(method, uri, headers, encoded);
    } catch (e) {
      if (e is AppException) rethrow;
      throw NetworkException('网络请求失败: $e', cause: e);
    }

    requireSession(generation);
    // 401 续期处理：网页版 client.ts 只排除以 /auth/ 开头的路径，防止自身刷新死循环
    if (res.statusCode == 401 && !normalizedPath.startsWith('/auth/')) {
      if (retry) {
        final ok = tokens.hasAccess && tokens.accessToken != sentToken ||
            await _tryRefresh();
        requireSession(generation);
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

      // 刷新失败或重试后最终仍是 401：对齐网页版 client.ts 清空令牌并触发全局登出
      await expireSession(generation);
    }

    return _decode(res);
  }

  /// 单飞并发刷新机制
  Future<bool> refreshSession() => _tryRefresh();

  Future<bool> _tryRefresh({http.Client? sender}) {
    final generation = tokens.sessionGeneration;
    if (_refreshGeneration == generation && _refreshInflight != null) {
      return _refreshInflight!;
    }
    _refreshGeneration = generation;
    return _refreshInflight =
        _doRefresh(generation, sender: sender).whenComplete(() {
      if (_refreshGeneration == generation) _refreshInflight = null;
    });
  }

  Future<bool> _doRefresh(int generation, {http.Client? sender}) async {
    final refresh = tokens.refreshToken;
    if (refresh == null || refresh.isEmpty) return false;

    try {
      final res = await (sender ?? _http)
          .post(
            _buildUri('/auth/refresh'),
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            body: jsonEncode({'refresh_token': refresh}),
          )
          .timeout(timeout);
      requireSession(generation);

      // 服务端明确拒绝时才清空凭证
      if (res.statusCode == 401 || res.statusCode == 403) {
        return false;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        throw NetworkException('登录续期暂时失败（${res.statusCode}），请重试');
      }

      final dynamic decoded = jsonDecode(utf8.decode(res.bodyBytes));
      if (decoded is! Map<String, dynamic>) {
        throw NetworkException('登录续期响应格式异常，请重试');
      }

      final data = decoded['data'];
      final access = (data is Map<String, dynamic>)
          ? data['access_token'] as String?
          : decoded['access_token'] as String?;

      if (access == null || access.isEmpty) {
        throw NetworkException('登录续期响应缺少凭据，请重试');
      }

      // 轮换下发新 refresh_token
      final rotated = (data is Map<String, dynamic>)
          ? data['refresh_token'] as String?
          : decoded['refresh_token'] as String?;

      await tokens.save(
        access: access,
        refresh: (rotated != null && rotated.isNotEmpty) ? rotated : null,
        preserveSession: true,
      );
      return true;
    } on AppException {
      rethrow;
    } catch (error) {
      throw NetworkException('登录续期暂时失败，请检查网络后重试', cause: error);
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

      // 检查信封业务 code（对齐网页版 client.ts：code == null || code == 200 视为业务成功）
      final isBizSuccess = code == null || code == 200;

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
          final loc =
              item['loc'] is List ? (item['loc'] as List).join('.') : '';
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
