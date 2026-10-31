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

/// 假接口客户端辅助工具：供各任务编写组件测试与端到端模拟测试
class MockApiClientHelper {
  final Map<String, dynamic> _responses = {};
  final List<MockRequestRecord> _history = [];

  List<MockRequestRecord> get history => List.unmodifiable(_history);

  /// 注册模拟响应（支持特定路径匹配）
  void register(String method, String path, dynamic response, {int statusCode = 200}) {
    final key = '${method.toUpperCase()} $path';
    _responses[key] = {'status': statusCode, 'body': response};
  }

  void whenGet(String path, dynamic response, {int statusCode = 200}) =>
      register('GET', path, response, statusCode: statusCode);

  void whenPost(String path, dynamic response, {int statusCode = 200}) =>
      register('POST', path, response, statusCode: statusCode);

  void whenPut(String path, dynamic response, {int statusCode = 200}) =>
      register('PUT', path, response, statusCode: statusCode);

  void whenDelete(String path, dynamic response, {int statusCode = 200}) =>
      register('DELETE', path, response, statusCode: statusCode);

  /// 构建 ApiClient 实例
  ApiClient buildClient({TokenStorage? tokenStorage}) {
    final mockHttp = MockClient((request) async {
      final method = request.method;
      final path = request.url.path;

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

      // 匹配注册路由：全路径匹配或结尾匹配
      for (final entry in _responses.entries) {
        final parts = entry.key.split(' ');
        final regMethod = parts[0];
        final regPath = parts[1];

        if (regMethod == method &&
            (path == regPath || path.endsWith(regPath) || request.url.toString().contains(regPath))) {
          final resData = entry.value;
          final status = resData['status'] as int;
          final bodyData = resData['body'];

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

      // 未命中返回默认 404
      return http.Response(
        jsonEncode({'code': 404, 'message': '未配置模拟数据: $method $path'}),
        404,
        headers: {'content-type': 'application/json'},
      );
    });

    return ApiClient(
      tokenStorage: tokenStorage ?? InMemoryTokenStorage(access: 'mock-access-token'),
      httpClient: mockHttp,
      baseUrl: 'http://localhost:8010/api/v1',
    );
  }
}
