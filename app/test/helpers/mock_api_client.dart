import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:worktodo_app/core/api/api_client.dart';
import 'package:worktodo_app/core/api/token_storage.dart';

/// 模拟网络请求记录
class MockRequestRecord {
  const MockRequestRecord({
    required this.method,
    required this.url,
    this.body,
    this.headers = const {},
  });

  final String method;
  final Uri url;
  final dynamic body;
  final Map<String, String> headers;
}

class _MockRouteRule {
  const _MockRouteRule({
    required this.method,
    required this.path,
    required this.response,
    this.query,
    this.statusCode = 200,
  });

  final String method;
  final String path;
  final Map<String, String>? query;
  final dynamic response;
  final int statusCode;

  bool matches(String reqMethod, String reqPath, Map<String, String> reqQuery) {
    if (method.toUpperCase() != reqMethod.toUpperCase()) {
      return false;
    }

    // 精确匹配路径（严格比对，包含斜杠一致性）
    final normReg = path.startsWith('/') ? path : '/$path';
    final normReq = reqPath.startsWith('/') ? reqPath : '/$reqPath';
    if (normReg != normReq) {
      return false;
    }

    // 若注册了 query 参数，要求请求必须精确包含注册的全部键值对
    if (query != null && query!.isNotEmpty) {
      for (final entry in query!.entries) {
        if (reqQuery[entry.key] != entry.value) {
          return false;
        }
      }
    }

    return true;
  }
}

/// 假接口客户端辅助工具：供各任务编写组件测试与端到端模拟测试（精确匹配模式）
class MockApiClientHelper {
  final List<_MockRouteRule> _rules = [];
  final List<MockRequestRecord> _history = [];

  List<MockRequestRecord> get history => List.unmodifiable(_history);

  /// 注册模拟响应（精确匹配 HTTP 方法、路径与查询参数）
  void register(
    String method,
    String path,
    dynamic response, {
    int statusCode = 200,
    Map<String, String>? query,
  }) {
    _rules.add(_MockRouteRule(
      method: method,
      path: path,
      query: query,
      response: response,
      statusCode: statusCode,
    ));
  }

  void whenGet(
    String path,
    dynamic response, {
    int statusCode = 200,
    Map<String, String>? query,
  }) =>
      register('GET', path, response, statusCode: statusCode, query: query);

  void whenPost(
    String path,
    dynamic response, {
    int statusCode = 200,
    Map<String, String>? query,
  }) =>
      register('POST', path, response, statusCode: statusCode, query: query);

  void whenPut(
    String path,
    dynamic response, {
    int statusCode = 200,
    Map<String, String>? query,
  }) =>
      register('PUT', path, response, statusCode: statusCode, query: query);

  void whenDelete(
    String path,
    dynamic response, {
    int statusCode = 200,
    Map<String, String>? query,
  }) =>
      register('DELETE', path, response, statusCode: statusCode, query: query);

  /// 构建 ApiClient 实例
  ApiClient buildClient({TokenStorage? tokenStorage}) {
    const basePrefix = '/api/v1';

    final mockHttp = MockClient((request) async {
      final method = request.method;
      var reqPath = request.url.path;

      // 剥离 baseUrl 路径前缀（如 /api/v1），保留真实业务 path 进行精确匹配
      if (reqPath.startsWith(basePrefix)) {
        reqPath = reqPath.substring(basePrefix.length);
        if (reqPath.isEmpty) reqPath = '/';
      }

      dynamic bodyJson;
      if (request.body.isNotEmpty) {
        try {
          bodyJson = jsonDecode(request.body);
        } catch (_) {
          bodyJson = request.body;
        }
      }

      _history.add(MockRequestRecord(
        method: method,
        url: request.url,
        body: bodyJson,
        headers: request.headers,
      ));

      // 按注册顺序倒序查找（后注册的规则优先命中）
      for (final rule in _rules.reversed) {
        if (rule.matches(method, reqPath, request.url.queryParameters)) {
          final bodyData = rule.response;
          if (bodyData is Exception) {
            throw bodyData;
          }
          final status = rule.statusCode;

          final bodyString = bodyData is String
              ? bodyData
              : jsonEncode(bodyData is Map || bodyData is List
                  ? bodyData
                  : {'code': status, 'message': 'success', 'data': bodyData});

          return http.Response(
            bodyString,
            status,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
      }

      // 未命中返回明确的 404
      return http.Response(
        jsonEncode({
          'code': 404,
          'message':
              '未配置模拟数据: $method $reqPath query=${request.url.queryParameters}',
        }),
        404,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

    return ApiClient(
      tokenStorage: tokenStorage ??
          InMemoryTokenStorage(access: 'mock-access-token'),
      httpClient: mockHttp,
      baseUrl: 'http://localhost:8010/api/v1',
    );
  }
}
