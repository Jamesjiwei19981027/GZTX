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

      final result =
          await ProjectsRepository(helper.buildClient()).fetchProjectTasks(11);
      final tasks = result.tasks;

      expect(tasks.map((task) => task.id), [1, 2, 3]);
      expect(tasks[2].statusLabel, '已完成');
      expect(result.total, 3);
      expect(result.truncated, isFalse);
      expect(
        helper.history.where((item) => item.url.path.endsWith('/tasks')).length,
        2,
      );
    });

    test('项目任务超过 10 页时按 total 继续拉，不静默丢任务', () async {
      final helper = MockApiClientHelper();
      const totalTasks = 2200;
      for (var page = 1; page <= 11; page++) {
        final items = <Map<String, dynamic>>[];
        for (var index = 0; index < 200; index++) {
          final id = (page - 1) * 200 + index + 1;
          items.add(taskJson(id: id, title: '任务 $id'));
        }
        helper.whenGet(
          '/projects/11/tasks',
          {
            'items': items,
            'total': totalTasks,
            'page': page,
            'page_size': 200,
          },
          query: {'page': '$page', 'page_size': '200'},
        );
      }

      final result =
          await ProjectsRepository(helper.buildClient()).fetchProjectTasks(11);

      // 旧的「最多 10 页」口径只会有 2000 条，这里必须拿全
      expect(result.tasks.length, totalTasks);
      expect(result.tasks.last.id, totalTasks);
      expect(result.total, totalTasks);
      expect(result.truncated, isFalse);
      expect(
        helper.history.where((item) => item.url.path.endsWith('/tasks')).length,
        11,
      );
    });

    test('接口不返回 total 时以空页结束，不会按短页提前放弃', () async {
      final helper = MockApiClientHelper();
      helper.whenGet(
        '/projects/11/tasks',
        {
          'items': [
            taskJson(id: 1, title: '需求方案确认'),
            taskJson(id: 2, title: '交互原型设计'),
          ],
        },
        query: {'page': '1', 'page_size': '200'},
      );
      helper.whenGet(
        '/projects/11/tasks',
        {'items': <Map<String, dynamic>>[]},
        query: {'page': '2', 'page_size': '200'},
      );

      final result =
          await ProjectsRepository(helper.buildClient()).fetchProjectTasks(11);

      expect(result.tasks.map((task) => task.id), [1, 2]);
      expect(result.total, isNull);
      expect(result.truncated, isFalse);
      expect(
        helper.history.where((item) => item.url.path.endsWith('/tasks')).length,
        2,
      );
    });

    test('后端忽略分页参数时按安全上限停止并标记截断', () async {
      final helper = MockApiClientHelper();
      // 每页都返回 200 条、total 永远更大：模拟后端忽略 page 参数的异常
      final items = List<Map<String, dynamic>>.generate(
        200,
        (index) => taskJson(id: index + 1, title: '任务 ${index + 1}'),
      );
      for (var page = 1; page <= ProjectsRepository.maxTaskPages; page++) {
        helper.whenGet(
          '/projects/11/tasks',
          {'items': items, 'total': 999999},
          query: {'page': '$page', 'page_size': '200'},
        );
      }

      final result =
          await ProjectsRepository(helper.buildClient()).fetchProjectTasks(11);

      expect(result.tasks.length, 200 * ProjectsRepository.maxTaskPages);
      expect(result.truncated, isTrue);
      expect(
        helper.history.where((item) => item.url.path.endsWith('/tasks')).length,
        ProjectsRepository.maxTaskPages,
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

    test('权限快照：邀请与归档按后端 ACL 分别判定', () async {
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
      // 委托只拿到 tree.edit_subtree（可改树，但不能邀请、不能归档）
      helper.whenGet(
        '/projects/13/my-permissions',
        permissionsJson(
          role: 'member',
          isPm: false,
          canEditAll: true,
          canMove: false,
          canDelete: false,
        ),
      );
      // 委托只拿到 tree.edit_any（可归档，但没有 member.pull）
      helper.whenGet(
        '/projects/14/my-permissions',
        permissionsJson(
          role: 'member',
          isPm: false,
          canEditAll: false,
          canMove: true,
          canDelete: true,
        ),
      );

      final repo = ProjectsRepository(helper.buildClient());
      final pm = await repo.fetchPermissions(11);
      expect(pm.canInviteMembers, isTrue);
      expect(pm.canArchive, isTrue);

      final member = await repo.fetchPermissions(12);
      expect(member.canInviteMembers, isFalse);
      expect(member.canArchive, isFalse);
      expect(member.roleLabel, '项目成员');

      final treeEditor = await repo.fetchPermissions(13);
      expect(treeEditor.canEditAll, isTrue);
      expect(treeEditor.canInviteMembers, isFalse);
      expect(treeEditor.canArchive, isFalse);

      final archiveDelegate = await repo.fetchPermissions(14);
      expect(archiveDelegate.canInviteMembers, isFalse);
      expect(archiveDelegate.canArchive, isTrue);
    });

    test('成员列表保留 left_at 并区分现任 / 已退出', () async {
      final helper = MockApiClientHelper();
      helper.whenGet('/projects/11/members', {
        'items': [
          memberJson(userId: 5, nickname: '王宁', role: 'pm'),
          memberJson(
            userId: 6,
            nickname: '林悦',
            leftAt: '2026-10-20T02:00:00Z',
          ),
        ],
      });

      final members =
          await ProjectsRepository(helper.buildClient()).fetchMembers(11);

      expect(members.first.hasLeft, isFalse);
      expect(members.first.isActive, isTrue);
      expect(members.last.leftAt, '2026-10-20T02:00:00Z');
      expect(members.last.hasLeft, isTrue);
      expect(members.last.isActive, isFalse);
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
