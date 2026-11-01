import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/core/errors/app_error.dart';
import 'package:worktodo_app/features/projects/data/projects_repository.dart';

import '../../helpers/mock_api_client.dart';
import 'support/projects_test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('项目接口仓库', () {
    test('项目任务按页拉全：total 未满时继续请求下一页', () async {
      final helper = MockApiClientHelper();
      helper.whenGet(
        '/projects/11/tasks',
        {
          'items': [
            taskJson(id: 1, title: '需求方案确认'),
            taskJson(id: 2, title: '交互原型设计', status: 1),
          ],
          'total': 3,
          'page': 1,
          'page_size': 200,
        },
        query: {'page': '1', 'page_size': '200'},
      );
      helper.whenGet(
        '/projects/11/tasks',
        {
          'items': [
            taskJson(id: 3, title: '核心功能开发', status: 2),
          ],
          'total': 3,
          'page': 2,
          'page_size': 200,
        },
        query: {'page': '2', 'page_size': '200'},
      );

      final tasks = await ProjectsRepository(helper.buildClient())
          .fetchProjectTasks(11);

      expect(tasks.map((task) => task.id), [1, 2, 3]);
      expect(tasks[2].statusLabel, '已完成');
      expect(
        helper.history.where((item) => item.url.path.endsWith('/tasks')).length,
        2,
      );
    });

    test('项目详情解析终责负责人昵称并识别归档状态', () async {
      final helper = MockApiClientHelper();
      helper.whenGet(
        '/projects/11',
        projectJson(status: 'archived', ownerNickname: '王宁'),
      );

      final detail =
          await ProjectsRepository(helper.buildClient()).fetchProject(11);

      expect(detail.name, '智能客服 2.0');
      expect(detail.isArchived, isTrue);
      expect(detail.statusLabel, '已归档');
      expect(detail.finalOwnerName, '王宁');
      expect(detail.memberCount, 2);
    });

    test('成员列表解析角色并回退展示名', () async {
      final helper = MockApiClientHelper();
      helper.whenGet('/projects/11/members', {
        'items': [
          memberJson(userId: 5, nickname: '王宁', username: 'wangning', role: 'pm'),
          memberJson(userId: 6, nickname: '林悦'),
        ],
      });

      final members =
          await ProjectsRepository(helper.buildClient()).fetchMembers(11);

      expect(members.length, 2);
      expect(members.first.name, '王宁');
      expect(members.first.isManager, isTrue);
      expect(members.first.roleLabel, 'PM 负责人');
      expect(members.last.isManager, isFalse);
      expect(members.last.roleLabel, '成员');
    });

    test('权限快照：普通成员 canManage 为 false，管理员为 true', () async {
      final helper = MockApiClientHelper();
      helper.whenGet('/projects/11/my-permissions', permissionsJson());
      helper.whenGet(
        '/projects/12/my-permissions',
        permissionsJson(
          role: 'member',
          isPm: false,
          canEditAll: false,
        ),
      );

      final repo = ProjectsRepository(helper.buildClient());
      expect((await repo.fetchPermissions(11)).canManage, isTrue);
      final memberPermissions = await repo.fetchPermissions(12);
      expect(memberPermissions.canManage, isFalse);
      expect(memberPermissions.roleLabel, '项目成员');
    });

    test('无权限时向上抛出 403 ApiException（不静默吞掉）', () async {
      final helper = MockApiClientHelper();
      helper.whenGet(
        '/projects/11/members',
        {'code': 40301, 'message': '非项目成员', 'data': null},
        statusCode: 403,
      );

      await expectLater(
        ProjectsRepository(helper.buildClient()).fetchMembers(11),
        throwsA(isA<ApiException>()
            .having((error) => error.statusCode, 'statusCode', 403)
            .having((error) => error.message, 'message', '非项目成员')),
      );
    });

    test('断网时抛出 NetworkException', () async {
      final helper = MockApiClientHelper();
      helper.whenGet('/projects/11', Exception('连接被拒绝'));

      await expectLater(
        ProjectsRepository(helper.buildClient()).fetchProject(11),
        throwsA(isA<NetworkException>()),
      );
    });

    test('接受邀请调用 accept 接口并解析项目与角色', () async {
      final helper = MockApiClientHelper();
      const token = 'abc-DEF_123';
      helper.whenPost(
        '/projects/invitations/$token/accept',
        {'project_id': 11, 'role': 'member'},
      );

      final result =
          await ProjectsRepository(helper.buildClient()).acceptInvitation(token);

      expect(result.projectId, 11);
      expect(result.role, 'member');
      expect(helper.history.last.method, 'POST');
      expect(helper.history.last.url.path,
          '/api/v1/projects/invitations/$token/accept');
    });
  });
}
