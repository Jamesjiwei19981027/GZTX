import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/core/api/api_client.dart';
import 'package:worktodo_app/core/api/token_storage.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/core/models/company.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('DELETE 批量请求保留 JSON 请求体', () async {
    final api = ApiClient(httpClient: MockClient((request) async {
      expect(request.method, 'DELETE');
      expect(jsonDecode(request.body), {
        'task_ids': [1, 2]
      });
      return http.Response('{"data":{"deleted_count":2}}', 200);
    }));
    expect(
        await api.delete('/tasks/batch', body: {
          'task_ids': [1, 2]
        }),
        {'deleted_count': 2});
  });

  test('新建公司切换失败仍保留公司列表，全部项目刷新后不自动选回首项', () async {
    final tokens = InMemoryTokenStorage();
    await tokens.save(access: 'test-access');
    final api = ApiClient(
      tokenStorage: tokens,
      httpClient: MockClient((request) async {
        final path = request.url.path;
        if (path.endsWith('/users/me')) {
          return http.Response('{"id":1,"username":"fixture"}', 200);
        }
        if (path.endsWith('/companies/mine')) {
          return http.Response('{"items":[{"id":1,"name":"one"}]}', 200);
        }
        if (request.url.queryParameters['company_id'] == '2') {
          return http.Response('{"message":"retry"}', 500);
        }
        return http.Response('{"items":[{"id":11,"name":"project"}]}', 200);
      }),
    );
    final auth = AuthState(apiClient: api);
    await auth.bootstrap();
    auth.selectAllProjects();
    await auth.refreshProjects();
    expect(auth.allProjectsSelected, isTrue);
    expect(auth.currentProject, isNull);
    expect(
        await auth.selectCompany(const Company(id: 2, name: 'new')), isFalse);
    expect(auth.companies.map((c) => c.id), contains(2));
    expect(auth.currentCompany?.id, 1);
    auth.dispose();
  });

  test('公司模型解析真实成员管理员标志', () {
    final company = Company.fromJson({
      'id': 1,
      'name': 'fixture',
      'my_membership': {'is_super_admin': true},
    });
    expect(company.isSuperAdmin, isTrue);
    expect(Company.fromJson(company.toJson()).isSuperAdmin, isTrue);
  });

  test('原始上传与 JSON 请求共用续期，401 后重建请求且保留文件', () async {
    final tokens = InMemoryTokenStorage(access: 'old', refresh: 'refresh');
    var refreshes = 0;
    var uploads = 0;
    final client = MockClient((request) async {
      if (request.url.path.endsWith('/auth/refresh')) {
        refreshes++;
        return http.Response('{"access_token":"new"}', 200);
      }
      uploads++;
      expect(request.body, contains('sample.txt'));
      expect(request.body, contains('file-bytes'));
      return request.headers['Authorization'] == 'Bearer new'
          ? http.Response('{"data":{"id":7}}', 200)
          : http.Response('{}', 401);
    });
    final api = ApiClient(tokenStorage: tokens, httpClient: client);
    expect(
        await api.postMultipart('/files',
            bytes: utf8.encode('file-bytes'), filename: 'sample.txt'),
        {'id': 7});
    expect(refreshes, 1);
    expect(uploads, 2);
  });

  test('文件下载拒绝外站凭据，最终 401 清除会话并通知宿主', () async {
    var expired = 0;
    var sends = 0;
    final tokens = InMemoryTokenStorage(access: 'token');
    final api = ApiClient(
      tokenStorage: tokens,
      onAuthExpired: () => expired++,
      httpClient: MockClient((_) async {
        sends++;
        return http.Response('{}', 401);
      }),
    );
    await expectLater(
      api.sendRaw(
          () => http.Request('GET', Uri.parse('https://other.invalid/file'))),
      throwsA(isA<Exception>()),
    );
    expect(sends, 0);
    await expectLater(
      api.sendRaw(() => http.Request('GET', Uri.parse('${api.baseUrl}/file'))),
      throwsA(isA<Exception>()),
    );
    expect(tokens.hasAccess, isFalse);
    expect(expired, 1);
  });

  test('项目超过第一页时加载剩余分页，不丢掉第 21 个项目', () async {
    final pages = <int>[];
    final api = ApiClient(
      tokenStorage: InMemoryTokenStorage(access: 'token'),
      httpClient: MockClient((request) async {
        if (request.url.path.endsWith('/users/me')) {
          return http.Response('{"id":1,"username":"fixture"}', 200);
        }
        if (request.url.path.endsWith('/companies/mine')) {
          return http.Response('{"items":[{"id":1,"name":"one"}]}', 200);
        }
        final page = int.parse(request.url.queryParameters['page'] ?? '1');
        pages.add(page);
        return http.Response(
            jsonEncode({
              'items': [
                for (var i = (page - 1) * 20 + 1;
                    i <= (page == 1 ? 20 : 21);
                    i++)
                  {'id': i, 'name': 'project-$i'}
              ],
              'total': 21,
            }),
            200);
      }),
    );
    final auth = AuthState(apiClient: api);
    await auth.bootstrap();
    expect(pages, [1, 2]);
    expect(auth.projects.last.id, 21);
    expect(auth.projects.length, 21);
    auth.dispose();
  });
}
