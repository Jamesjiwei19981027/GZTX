import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/core/models/company.dart';
import 'package:worktodo_app/core/models/project.dart';
import '../helpers/mock_api_client.dart';

void main() {
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

      helper.whenGet('/projects/', {
        'items': [
          {'id': 88, 'name': '核心重构项目', 'company_id': 1},
        ],
        'total': 1,
      });

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
      helper.whenGet('company_id=1', {
        'items': [
          {'id': 11, 'name': '项目A', 'company_id': 1},
        ],
      });
      helper.whenGet('company_id=2', {
        'items': [
          {'id': 22, 'name': '项目B', 'company_id': 2},
        ],
      });

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
  });
}
