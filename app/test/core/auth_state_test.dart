import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/core/models/company.dart';
import 'package:worktodo_app/core/models/project.dart';
import '../helpers/mock_api_client.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  SharedPreferences.setMockInitialValues({});

  group('AuthState 登录态与会话流转测试', () {
    test('bootstrap 顺序加载 me -> companies -> projects 并默认选中首项', () async {
      final helper = MockApiClientHelper();

      helper.whenGet('/users/me', {
        'id': 101,
        'username': 'e2e_user',
        'nickname': '端到端测试员',
      });

      helper.whenGet('/companies/mine', {
        'items': [
          {'id': 1, 'name': '示范集团'},
          {'id': 2, 'name': '分公司'},
        ],
        'total': 2,
      });

      helper.whenGet(
        '/projects',
        {
          'items': [
            {'id': 88, 'name': '核心重构项目', 'company_id': 1},
          ],
          'total': 1,
        },
        query: {'company_id': '1', 'as_admin': 'true'},
      );

      final apiClient = helper.buildClient();
      final authState = AuthState(apiClient: apiClient);

      await authState.bootstrap();

      expect(authState.status, AuthStatus.authenticated);
      expect(authState.currentUser?.username, 'e2e_user');
      expect(authState.currentUser?.displayName, '端到端测试员');
      expect(authState.currentCompany?.id, 1);
      expect(authState.companies.length, 2);
      expect(authState.currentProject?.id, 88);
      expect(authState.projects.length, 1);
    });

    test('切换公司 selectCompany 会拉取对应公司的 projects 列表', () async {
      final helper = MockApiClientHelper();
      helper.whenGet('/users/me', {'id': 101, 'username': 'e2e_user'});
      helper.whenGet('/companies/mine', {
        'items': [
          {'id': 1, 'name': '公司一'},
          {'id': 2, 'name': '公司二'},
        ],
      });
      helper.whenGet(
        '/projects',
        {
          'items': [
            {'id': 11, 'name': '项目A', 'company_id': 1},
          ],
        },
        query: {'company_id': '1', 'as_admin': 'true'},
      );
      helper.whenGet(
        '/projects',
        {
          'items': [
            {'id': 22, 'name': '项目B', 'company_id': 2},
          ],
        },
        query: {'company_id': '2', 'as_admin': 'true'},
      );

      final apiClient = helper.buildClient();
      final authState = AuthState(apiClient: apiClient);
      await authState.bootstrap();

      expect(authState.currentCompany?.id, 1);
      expect(authState.currentProject?.id, 11);

      await authState.selectCompany(const Company(id: 2, name: '公司二'));

      expect(authState.currentCompany?.id, 2);
      expect(authState.currentProject?.id, 22);
    });

    test('切换项目 selectProject 正常更新 currentProject', () async {
      final authState = AuthState(apiClient: MockApiClientHelper().buildClient());
      const p = Project(id: 99, name: '新项目');
      authState.selectProject(p);
      expect(authState.currentProject?.id, 99);
      expect(authState.currentProject?.name, '新项目');
    });

    test('退出登录 logout 清除 token 并重置状态为 unauthenticated', () async {
      final helper = MockApiClientHelper();
      helper.whenGet('/users/me', {'id': 101, 'username': 'e2e_user'});
      helper.whenGet('/companies/mine', {'items': []});
      helper.whenPost('/auth/logout', {'ok': true});

      final apiClient = helper.buildClient();
      final authState = AuthState(apiClient: apiClient);
      await authState.bootstrap();
      expect(authState.isAuthenticated, true);

      await authState.logout();

      expect(authState.isAuthenticated, false);
      expect(authState.status, AuthStatus.unauthenticated);
      expect(authState.currentUser, isNull);
      expect(authState.currentCompany, isNull);
      expect(apiClient.tokens.hasAccess, false);
    });

    test('业务请求最终 401 触发 onAuthExpired 时自动登出回到 unauthenticated', () async {
      final helper = MockApiClientHelper();
      helper.whenGet('/users/me', {'id': 101, 'username': 'e2e_user'});
      helper.whenGet('/companies/mine', {'items': []});

      final apiClient = helper.buildClient();
      final authState = AuthState(apiClient: apiClient);
      await authState.bootstrap();
      expect(authState.isAuthenticated, true);

      // 模拟底层 ApiClient 触发 onAuthExpired
      apiClient.onAuthExpired?.call();

      expect(authState.status, AuthStatus.unauthenticated);
      expect(authState.isAuthenticated, false);
      expect(authState.currentUser, isNull);
    });

    test('bootstrap 加载项目列表遇到网络错误（断网）时，转为 offline 状态', () async {
      final helper = MockApiClientHelper();
      helper.whenGet('/users/me', {'id': 101, 'username': 'e2e_user'});
      helper.whenGet('/companies/mine', {
        'items': [
          {'id': 1, 'name': '测试企业'},
        ],
      });
      // 模拟请求 /projects 时网络中断
      helper.whenGet(
        '/projects',
        Exception('Connection refused / 网络断开'),
        query: {'company_id': '1', 'as_admin': 'true'},
      );

      final apiClient = helper.buildClient();
      final authState = AuthState(apiClient: apiClient);
      await authState.bootstrap();

      // 验证未被吞成 authenticated 和空列表，而是正确转为 offline 离线状态
      expect(authState.status, AuthStatus.offline);
      expect(authState.isAuthenticated, false);
      expect(authState.errorMessage, contains('网络请求失败'));
      expect(authState.projects, isEmpty);
      expect(authState.currentProject, isNull);
    });

    test('bootstrap 加载项目列表遇到服务端错误（HTTP 500）时，转为 offline 状态', () async {
      final helper = MockApiClientHelper();
      helper.whenGet('/users/me', {'id': 101, 'username': 'e2e_user'});
      helper.whenGet('/companies/mine', {
        'items': [
          {'id': 1, 'name': '测试企业'},
        ],
      });
      helper.whenGet(
        '/projects',
        {'code': 500, 'message': '项目服务不可用'},
        statusCode: 500,
        query: {'company_id': '1', 'as_admin': 'true'},
      );

      final apiClient = helper.buildClient();
      final authState = AuthState(apiClient: apiClient);
      await authState.bootstrap();

      expect(authState.status, AuthStatus.offline);
      expect(authState.isAuthenticated, false);
      expect(authState.errorMessage, '项目服务不可用');
    });

    test('bootstrap 加载项目列表遇到 401 且无法续期时，清空会话并转为 unauthenticated 状态', () async {
      final helper = MockApiClientHelper();
      helper.whenGet('/users/me', {'id': 101, 'username': 'e2e_user'});
      helper.whenGet('/companies/mine', {
        'items': [
          {'id': 1, 'name': '测试企业'},
        ],
      });
      helper.whenGet(
        '/projects',
        {'detail': 'Token expired'},
        statusCode: 401,
        query: {'company_id': '1', 'as_admin': 'true'},
      );
      // 模拟刷新接口返回 401 失败
      helper.whenPost(
        '/auth/refresh',
        {'detail': 'Refresh token invalid'},
        statusCode: 401,
      );

      final apiClient = helper.buildClient();
      final authState = AuthState(apiClient: apiClient);
      await authState.bootstrap();

      // 验证最终 401 不会被覆盖回 authenticated，且会话被清空转为 unauthenticated
      expect(authState.status, AuthStatus.unauthenticated);
      expect(authState.isAuthenticated, false);
      expect(authState.currentUser, isNull);
      expect(authState.currentCompany, isNull);
      expect(apiClient.tokens.hasAccess, false);
    });

    test('确实没有项目时（API 200 返回空列表），保持 authenticated 且 projects 为空', () async {
      final helper = MockApiClientHelper();
      helper.whenGet('/users/me', {'id': 101, 'username': 'e2e_user'});
      helper.whenGet('/companies/mine', {
        'items': [
          {'id': 1, 'name': '测试企业'},
        ],
      });
      helper.whenGet(
        '/projects',
        {'items': [], 'total': 0},
        statusCode: 200,
        query: {'company_id': '1', 'as_admin': 'true'},
      );

      final apiClient = helper.buildClient();
      final authState = AuthState(apiClient: apiClient);
      await authState.bootstrap();

      expect(authState.status, AuthStatus.authenticated);
      expect(authState.isAuthenticated, true);
      expect(authState.projects, isEmpty);
      expect(authState.currentProject, isNull);
    });
  });
}
