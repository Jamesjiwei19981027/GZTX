import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:worktodo_app/core/api/api_client.dart';
import 'package:worktodo_app/core/api/token_storage.dart';
import 'package:worktodo_app/core/errors/app_error.dart';

void main() {
  group('ApiClient 统一信封与错误处理测试', () {
    test('标准成功信封自动解包 data 字段', () async {
      final mock = MockClient((request) async {
        return http.Response(
          jsonEncode({
            'code': 200,
            'message': 'success',
            'data': {'userId': 123, 'name': '测试用户'},
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final client = ApiClient(
        httpClient: mock,
        tokenStorage: InMemoryTokenStorage(access: 'token'),
      );
      final dynamic res = await client.get('/users/me');

      expect(res, isA<Map<String, dynamic>>());
      expect(res['userId'], 123);
      expect(res['name'], '测试用户');
    });

    test('HTTP 200 但业务 code 非 200 抛出 ApiException 并携带中文 message', () async {
      final mock = MockClient((request) async {
        return http.Response(
          jsonEncode({
            'code': 4001,
            'message': '用户已被禁用，无法操作',
            'data': null,
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final client = ApiClient(
        httpClient: mock,
        tokenStorage: InMemoryTokenStorage(access: 'token'),
      );

      expect(
        () => client.get('/some/biz'),
        throwsA(isA<ApiException>().having(
          (e) => e.message,
          'message',
          '用户已被禁用，无法操作',
        )),
      );
    });

    test('HTTP 422 验证错误自动解析 detail 列表', () async {
      final mock = MockClient((request) async {
        return http.Response(
          jsonEncode({
            'detail': [
              {
                'loc': ['query', 'company_id'],
                'msg': 'Field required',
                'type': 'missing'
              }
            ]
          }),
          422,
          headers: {'content-type': 'application/json'},
        );
      });

      final client = ApiClient(
        httpClient: mock,
        tokenStorage: InMemoryTokenStorage(access: 'token'),
      );

      expect(
        () => client.get('/projects/'),
        throwsA(isA<ValidationException>().having(
          (e) => e.errors['company_id'],
          'company_id field error',
          'Field required',
        )),
      );
    });

    test('并发 401 触发单飞刷新，只请求一次 /auth/refresh', () async {
      int refreshCount = 0;
      final tokenStorage = InMemoryTokenStorage(
        access: 'stale-token',
        refresh: 'valid-refresh-token',
      );

      final mock = MockClient((request) async {
        if (request.url.path.endsWith('/auth/refresh')) {
          refreshCount++;
          // 模拟延迟
          await Future.delayed(const Duration(milliseconds: 50));
          return http.Response(
            jsonEncode({
              'code': 200,
              'data': {
                'access_token': 'new-fresh-access',
                'refresh_token': 'new-fresh-refresh',
              }
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }

        if (request.headers['Authorization'] == 'Bearer new-fresh-access') {
          return http.Response(
            jsonEncode({
              'code': 200,
              'data': {'ok': true}
            }),
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

      final client = ApiClient(
        httpClient: mock,
        tokenStorage: tokenStorage,
      );

      // 并发触发两个受保护接口调用
      final results = await Future.wait([
        client.get('/tasks/stats'),
        client.get('/users/me'),
      ]);

      expect(refreshCount, 1);
      expect((results[0] as Map)['ok'], true);
      expect((results[1] as Map)['ok'], true);
      expect(tokenStorage.accessToken, 'new-fresh-access');
      expect(tokenStorage.refreshToken, 'new-fresh-refresh');
    });

    test(
        'token is replaced before a 401 response, so it still performs one refresh',
        () async {
      int refreshCount = 0;
      final tokenStorage = InMemoryTokenStorage(
        access: 'token-before-send',
        refresh: 'valid-refresh-token',
      );

      final mock = MockClient((request) async {
        if (request.url.path.endsWith('/auth/refresh')) {
          refreshCount++;
          return http.Response(
            jsonEncode({
              'code': 200,
              'data': {'access_token': 'token-after-refresh'},
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }

        await Future<void>.delayed(const Duration(milliseconds: 20));
        return http.Response(
          jsonEncode({'code': 401, 'message': 'expired'}),
          401,
          headers: {'content-type': 'application/json'},
        );
      });

      final client = ApiClient(
        httpClient: mock,
        tokenStorage: tokenStorage,
      );

      final request = client.get('/tasks/list');
      await tokenStorage.save(
        access: 'token-replaced-before-response',
        preserveSession: true,
      );

      Object? error;
      try {
        await request;
      } catch (caught) {
        error = caught;
      }

      expect(error, isA<AuthException>());
      expect(refreshCount, 1);
    });

    test('401 刷新失败后清空本地令牌、触发 onAuthExpired 并抛出 AuthException', () async {
      bool expiredCalled = false;
      final tokenStorage = InMemoryTokenStorage(
        access: 'stale-token',
        refresh: 'invalid-refresh-token',
      );

      final mock = MockClient((request) async {
        if (request.url.path.endsWith('/auth/refresh')) {
          return http.Response(
            jsonEncode({'code': 401, 'message': '刷新令牌已失效'}),
            401,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          jsonEncode({'code': 401, 'message': '未认证'}),
          401,
          headers: {'content-type': 'application/json'},
        );
      });

      final client = ApiClient(
        httpClient: mock,
        tokenStorage: tokenStorage,
        onAuthExpired: () {
          expiredCalled = true;
        },
      );

      expect(
        () => client.get('/tasks/list'),
        throwsA(isA<AuthException>().having(
          (e) => e.message,
          'message',
          '登录已过期，请重新登录',
        )),
      );

      // 等待请求结束
      try {
        await client.get('/tasks/list');
      } catch (_) {}

      expect(expiredCalled, true);
      expect(tokenStorage.hasAccess, false);
      expect(tokenStorage.accessToken, isNull);
    });

    test('请求超时自动中断并抛出 NetworkException', () async {
      final mock = MockClient((request) async {
        // 延迟大于设定的 timeout
        await Future.delayed(const Duration(milliseconds: 150));
        return http.Response('{"code":200,"data":{}}', 200);
      });

      final client = ApiClient(
        httpClient: mock,
        tokenStorage: InMemoryTokenStorage(access: 'token'),
        timeout: const Duration(milliseconds: 50),
      );

      expect(
        () => client.get('/slow/endpoint'),
        throwsA(isA<NetworkException>().having(
          (e) => e.message,
          'message',
          contains('超时'),
        )),
      );
    });

    test('JSON 请求不跟随重定向，保持方法/头/请求体一致，且 302 走错误分支', () async {
      final recording = _RecordingHttpClient();
      final client = ApiClient(
        httpClient: recording,
        tokenStorage: InMemoryTokenStorage(access: 'secret_token_123'),
      );

      // 1. GET 请求
      final getRes = await client.get('/test/get');
      expect(getRes, {'success': true});
      expect(recording.recordedRequests.length, 1);
      final getReq = recording.recordedRequests.first;
      expect(getReq.followRedirects, isFalse);
      expect(getReq.method, 'GET');
      expect(getReq.headers['authorization'], 'Bearer secret_token_123');
      expect(getReq.headers['accept'], 'application/json');

      // 2. POST 请求
      final postRes =
          await client.post('/test/post', body: {'name': '张三', 'count': 42});
      expect(postRes, {'success': true});
      expect(recording.recordedRequests.length, 2);
      final postReq = recording.recordedRequests[1];
      expect(postReq.followRedirects, isFalse);
      expect(postReq.method, 'POST');
      expect(postReq.headers['content-type'], contains('application/json'));
      expect(postReq, isA<http.Request>());
      expect((postReq as http.Request).body,
          jsonEncode({'name': '张三', 'count': 42}));

      // 3. 服务端返回 302 重定向：不跟随跳转，按非 2xx 抛出 ApiException，不会发起第二次跳转请求
      recording.handler = (req) async {
        return http.StreamedResponse(
          Stream.value(utf8.encode('{"code":302,"message":"请跳转到指定地址"}')),
          302,
          headers: {
            'content-type': 'application/json',
            'location': 'https://evil.external.site/leak',
          },
        );
      };

      expect(
        () => client.get('/redirect/test'),
        throwsA(isA<ApiException>().having(
          (e) => e.statusCode,
          'statusCode',
          302,
        )),
      );
      // 只产生了一次请求（没有向 location 发出新的请求）
      expect(recording.recordedRequests.length, 3);
    });
  });
}

class _RecordingHttpClient extends http.BaseClient {
  final List<http.BaseRequest> recordedRequests = [];
  Future<http.StreamedResponse> Function(http.BaseRequest request)? handler;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    recordedRequests.add(request);
    if (handler != null) {
      return handler!(request);
    }
    return http.StreamedResponse(
      Stream.value(
          utf8.encode('{"code":200,"message":"ok","data":{"success":true}}')),
      200,
      headers: {'content-type': 'application/json'},
    );
  }
}
