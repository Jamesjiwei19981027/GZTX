import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/projects/screens/project_settings_screen.dart';
import 'package:worktodo_app/features/projects/screens/project_overview_screen.dart';
import 'package:worktodo_app/features/projects/screens/team_screen.dart';
import 'package:worktodo_app/features/projects/screens/company_members_screen.dart';
import 'package:worktodo_app/features/projects/screens/project_report_policy_screen.dart';
import 'package:worktodo_app/features/projects/data/projects_repository.dart';

import 'support/projects_test_harness.dart';

Map<String, dynamic> enterpriseMember({String status = 'active'}) => {
      'user_id': 6,
      'username': 'linyue',
      'nickname': '林悦',
      'status': status,
      'employment_status': 'active',
      'is_super_admin': false,
      'is_org_leader': false,
    };

void settingsRoutes(ProjectsTestHarness h, {bool archived = false}) {
  h.helper.whenGet(
      '/projects/11', projectJson(status: archived ? 'archived' : 'active'));
  h.helper.whenGet('/projects/11/my-permissions', permissionsJson());
}

Future<void> makeSuperadmin(ProjectsTestHarness h) async {
  h.helper.whenGet('/companies/mine', {
    'items': [
      {
        ...companyJson(),
        'my_membership': {'is_super_admin': true}
      }
    ],
    'total': 1,
  });
  await h.authState.refreshCompanies();
}

void main() {
  test('C14 企业成员分页加载到total，不漏掉后续页的停用成员', () async {
    final h = ProjectsTestHarness();
    h.helper.whenGet('/companies/1/members', {
      'items': [enterpriseMember()],
      'total': 2
    }, query: {
      'page': '1',
      'page_size': '100'
    });
    h.helper.whenGet('/companies/1/members', {
      'items': [enterpriseMember(status: 'disabled')..['user_id'] = 7],
      'total': 2
    }, query: {
      'page': '2',
      'page_size': '100'
    });
    final members =
        await ProjectsRepository(h.helper.buildClient()).fetchCompanyMembers(1);
    expect(members.map((m) => m.userId), [6, 7]);
    expect(members.last.statusLabel, '已停用');
    expect(
        h.helper.history.map((r) => r.url.queryParameters['page']), ['1', '2']);
  });

  testWidgets('C13 从设置返回概览立即显示最新项目名称', (tester) async {
    final h = ProjectsTestHarness();
    await h.bootstrap();
    settingsRoutes(h);
    h.helper.whenGet('/projects/11/members', {'items': []});
    h.helper.whenGet('/projects/11/tasks', {'items': [], 'total': 0});
    h.helper.register('PATCH', '/projects/11', projectJson(name: '新版项目'));
    await h.pumpApp(tester, location: '/projects/11');
    await tester.tap(
        find.byWidgetPredicate((w) => w is AppIcon && w.name == 'settings'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('修改项目名称'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, '新版项目');
    await tester.tap(find.text('保存名称'));
    await tester.pumpAndSettle();
    h.helper.whenGet('/projects/11', projectJson(name: '新版项目'));
    await tester.tap(
        find.byWidgetPredicate((w) => w is AppIcon && w.name == 'back').first);
    await tester.pumpAndSettle();
    expect(find.text('新版项目'), findsWidgets);
    expect(find.text('智能客服 2.0'), findsNothing);
  });

  testWidgets('C13 空项目名被表单拦截，不发送写请求', (tester) async {
    final h = ProjectsTestHarness();
    await h.bootstrap();
    settingsRoutes(h);
    await h.pumpScreen(tester, const ProjectSettingsScreen(projectId: 11));
    await tester.tap(find.text('修改项目名称'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, '   ');
    await tester.tap(find.text('保存名称'));
    await tester.pumpAndSettle();
    expect(find.text('项目名称不能为空'), findsOneWidget);
    expect(h.helper.history.where((r) => r.method == 'PATCH'), isEmpty);
  });

  testWidgets('C13 创建者可改项目但不能凭创建者身份设置汇报策略', (tester) async {
    final h = ProjectsTestHarness();
    await h.bootstrap();
    settingsRoutes(h);
    h.helper.whenGet('/projects/11', {...projectJson(), 'created_by': 11});
    h.helper.whenGet('/projects/11/my-permissions',
        permissionsJson(role: 'member', isPm: false, canEditAll: false));
    await h.pumpScreen(tester, const ProjectSettingsScreen(projectId: 11));
    expect(find.text('修改项目名称'), findsOneWidget);
    expect(find.text('更换项目负责人'), findsOneWidget);
    expect(find.text('汇报策略'), findsNothing);
  });

  testWidgets('C13 项目改名发送PATCH并刷新全局项目列表', (tester) async {
    final h = ProjectsTestHarness();
    await h.bootstrap();
    settingsRoutes(h);
    h.helper.register('PATCH', '/projects/11', projectJson(name: '交付平台'));
    await h.pumpScreen(tester, const ProjectSettingsScreen(projectId: 11));
    await tester.tap(find.text('修改项目名称'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, '  交付平台  ');
    await tester.tap(find.text('保存名称'));
    await tester.pumpAndSettle();
    expect(h.helper.history.where((r) => r.method == 'PATCH').single.body,
        {'name': '交付平台'});
    expect(find.text('交付平台'), findsOneWidget);
    expect(
        h.helper.history.where((r) => r.url.path == '/api/v1/projects').length,
        2);
  });

  testWidgets('C13 更换负责人只列在职启用企业成员并提交所选用户', (tester) async {
    final h = ProjectsTestHarness();
    await h.bootstrap();
    settingsRoutes(h);
    h.helper.whenGet('/companies/1/members', {
      'items': [
        enterpriseMember(),
        enterpriseMember(status: 'disabled')
          ..['user_id'] = 7
          ..['nickname'] = '停用成员'
      ],
      'total': 2
    });
    h.helper.register('PATCH', '/projects/11', {
      ...projectJson(ownerNickname: '林悦'),
      'pm_user_id': 6,
      'final_owner': {'user_id': 6, 'nickname': '林悦'}
    });
    await h.pumpScreen(tester, const ProjectSettingsScreen(projectId: 11));
    await tester.tap(find.text('更换项目负责人'));
    await tester.pumpAndSettle();
    expect(find.text('停用成员'), findsNothing);
    await tester.tap(find.text('林悦'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('确认交接'));
    await tester.pumpAndSettle();
    expect(h.helper.history.where((r) => r.method == 'PATCH').single.body,
        {'pm_user_id': 6});
    expect(find.text('林悦'), findsOneWidget);
  });

  testWidgets('C13 归档项目只能取消归档且取消后恢复编辑入口', (tester) async {
    final h = ProjectsTestHarness();
    await h.bootstrap();
    settingsRoutes(h, archived: true);
    h.helper.whenPost('/projects/11/unarchive', {'status': 'active'});
    await h.pumpScreen(tester, const ProjectSettingsScreen(projectId: 11));
    expect(find.text('修改项目名称'), findsNothing);
    expect(find.text('归档此项目'), findsNothing);
    await tester.tap(find.text('取消归档'));
    await tester.pumpAndSettle();
    h.helper.whenGet('/projects/11', projectJson());
    await tester.tap(find.text('确认取消归档'));
    await tester.pumpAndSettle();
    expect(
        h.helper.history.where(
            (r) => r.url.path.endsWith('/unarchive') && r.method == 'POST'),
        hasLength(1));
    expect(find.text('修改项目名称'), findsOneWidget);
  });

  testWidgets('C14 企业成员停用后仍可见且能重新启用、变更角色、移出', (tester) async {
    final h = ProjectsTestHarness();
    await h.bootstrap();
    await makeSuperadmin(h);
    h.helper.whenGet('/projects/11/members', {
      'items': [memberJson(userId: 6, nickname: '林悦')]
    });
    h.helper.whenGet('/companies/1/presence', {'items': []});
    h.helper.whenGet('/projects/11', projectJson());
    h.helper.whenGet('/companies/1/members', {
      'items': [enterpriseMember()],
      'total': 1
    });
    h.helper.register('PATCH', '/companies/1/members/6',
        enterpriseMember(status: 'disabled'));
    await h.pumpScreen(tester, const TeamScreen(projectId: 11));
    await tester.tap(find.text('企业成员管理'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('管理林悦'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('停用成员'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('确认停用'));
    await tester.pumpAndSettle();
    expect(find.text('已停用'), findsOneWidget);
    expect(h.helper.history.where((r) => r.method == 'PATCH').last.body,
        {'status': 'disabled'});
    h.helper.register('PATCH', '/companies/1/members/6', enterpriseMember());
    await tester.tap(find.text('管理林悦'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('启用成员'));
    await tester.pumpAndSettle();
    expect(h.helper.history.where((r) => r.method == 'PATCH').last.body,
        {'status': 'active'});
    await tester.tap(find.text('管理林悦'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('设为组织负责人'));
    await tester.pumpAndSettle();
    expect(h.helper.history.where((r) => r.method == 'PATCH').last.body,
        {'is_org_leader': true});
    h.helper.whenDelete(
        '/companies/1/members/6', enterpriseMember(status: 'removed'));
    await tester.tap(find.text('管理林悦'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('移出企业'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('确认移出'));
    await tester.pumpAndSettle();
    expect(find.text('林悦'), findsNothing);
    expect(h.helper.history.where((r) => r.method == 'DELETE').single.url.path,
        '/api/v1/companies/1/members/6');
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('项目团队与成员'), findsOneWidget);
  });

  testWidgets('C14 非超管看不到企业成员管理入口', (tester) async {
    final h = ProjectsTestHarness();
    await h.bootstrap();
    h.helper.whenGet('/projects/11/members', {
      'items': [memberJson(userId: 6, nickname: '林悦')]
    });
    h.helper.whenGet('/companies/1/presence', {'items': []});
    await h.pumpScreen(tester, const TeamScreen(projectId: 11));
    expect(find.text('企业成员管理'), findsNothing);
  });

  testWidgets('C14 直接打开企业管理页仍需超管，不加载成员敏感数据', (tester) async {
    final h = ProjectsTestHarness();
    await h.bootstrap();
    await h.pumpScreen(tester, const CompanyMembersScreen(companyId: 1));
    expect(find.text('暂无访问权限'), findsOneWidget);
    expect(
        h.helper.history
            .where((r) => r.url.path == '/api/v1/companies/1/members'),
        isEmpty);
  });

  testWidgets('C14 超管不能管理其他企业的成员', (tester) async {
    final h = ProjectsTestHarness();
    await h.bootstrap();
    await makeSuperadmin(h);
    await h.pumpScreen(tester, const CompanyMembersScreen(companyId: 2));
    expect(find.text('暂无访问权限'), findsOneWidget);
    expect(
        h.helper.history
            .where((r) => r.url.path == '/api/v1/companies/2/members'),
        isEmpty);
  });

  testWidgets('C14 服务端拒绝角色修改时保留原角色并显示原因', (tester) async {
    final h = ProjectsTestHarness();
    await h.bootstrap();
    await makeSuperadmin(h);
    h.helper.whenGet('/companies/1/members', {
      'items': [enterpriseMember()],
      'total': 1
    });
    h.helper.register('PATCH', '/companies/1/members/6',
        {'code': 40303, 'message': '需要公司超级管理员', 'data': null},
        statusCode: 403);
    await h.pumpScreen(tester, const CompanyMembersScreen(companyId: 1));
    await tester.tap(find.text('管理林悦'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('设为组织负责人'));
    await tester.pumpAndSettle();
    expect(find.text('需要公司超级管理员'), findsOneWidget);
    expect(find.text('普通成员'), findsOneWidget);
  });

  testWidgets('C16 非负责人直接打开策略页被拒绝，不读取策略', (tester) async {
    final h = ProjectsTestHarness();
    await h.bootstrap();
    settingsRoutes(h);
    h.helper.whenGet('/projects/11/my-permissions',
        permissionsJson(role: 'member', isPm: false, canEditAll: false));
    await h.pumpScreen(tester, const ProjectReportPolicyScreen(projectId: 11));
    expect(find.text('暂无访问权限'), findsOneWidget);
    expect(
        h.helper.history.where((r) => r.url.path.endsWith('/report-policies')),
        isEmpty);
  });

  testWidgets('C16 截止时间非法时阻止保存并保留用户输入', (tester) async {
    final h = ProjectsTestHarness();
    await h.bootstrap();
    settingsRoutes(h);
    h.helper.whenGet('/projects/11/report-policies', {
      'items': [
        {'period': 'daily', 'deadline_time': '18:00'}
      ]
    });
    await h.pumpScreen(tester, const ProjectReportPolicyScreen(projectId: 11));
    await tester.enterText(
        find.byKey(const ValueKey('report-deadline-time')), '25:99');
    await tester.tap(find.text('保存策略'));
    await tester.pumpAndSettle();
    expect(find.text('请输入有效截止时间，例如 18:00'), findsOneWidget);
    expect(find.text('25:99'), findsOneWidget);
    expect(h.helper.history.where((r) => r.method == 'PUT'), isEmpty);
  });

  testWidgets('C16 月策略可调整截止日、停用提醒与策略并保存', (tester) async {
    final h = ProjectsTestHarness();
    await h.bootstrap();
    settingsRoutes(h);
    final policy = {
      'period': 'monthly',
      'deadline_time': '18:00',
      'weekday': 5,
      'month_day': 25,
      'remind': true,
      'enabled': true
    };
    h.helper.whenGet('/projects/11/report-policies', {
      'items': [policy]
    });
    h.helper.whenPut('/projects/11/report-policy',
        {...policy, 'month_day': 28, 'remind': false, 'enabled': false});
    await h.pumpScreen(tester, const ProjectReportPolicyScreen(projectId: 11));
    await tester.tap(find.text('每月 25 日'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('每月 28 日').last, 100,
        scrollable: find.byType(Scrollable).last);
    await tester.tap(find.text('每月 28 日').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('启用汇报策略'));
    await tester.tap(find.text('截止前提醒'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('保存策略'));
    await tester.pumpAndSettle();
    expect(h.helper.history.where((r) => r.method == 'PUT').single.body, {
      'period': 'monthly',
      'deadline_time': '18:00',
      'weekday': 5,
      'month_day': 28,
      'remind': false,
      'enabled': false
    });
    expect(find.text('汇报策略已保存'), findsOneWidget);
  });

  testWidgets('C16 保存被拒绝时保留表单并显示服务端错误', (tester) async {
    final h = ProjectsTestHarness();
    await h.bootstrap();
    settingsRoutes(h);
    h.helper.whenGet('/projects/11/report-policies', {
      'items': [
        {'period': 'daily', 'deadline_time': '18:00'}
      ]
    });
    h.helper.whenPut('/projects/11/report-policy',
        {'code': 40300, 'message': '项目已归档为只读', 'data': null},
        statusCode: 403);
    await h.pumpScreen(tester, const ProjectReportPolicyScreen(projectId: 11));
    await tester.enterText(
        find.byKey(const ValueKey('report-deadline-time')), '19:20');
    await tester.tap(find.text('保存策略'));
    await tester.pumpAndSettle();
    expect(find.text('项目已归档为只读'), findsOneWidget);
    expect(find.text('19:20'), findsOneWidget);
    expect(find.text('汇报策略已保存'), findsNothing);
  });

  testWidgets('C16 汇报策略读取已有值、保存周策略并能返回设置', (tester) async {
    final h = ProjectsTestHarness();
    await h.bootstrap();
    settingsRoutes(h);
    final policy = {
      'id': 1,
      'period': 'weekly',
      'deadline_time': '17:30',
      'weekday': 5,
      'month_day': 25,
      'remind': true,
      'enabled': true
    };
    h.helper.whenGet('/projects/11/report-policies', {
      'items': [policy]
    });
    h.helper.whenPut(
        '/projects/11/report-policy', {...policy, 'deadline_time': '18:45'});
    await h.pumpScreen(tester, const ProjectSettingsScreen(projectId: 11));
    await tester.scrollUntilVisible(find.text('汇报策略'), 200);
    await tester.tap(find.text('汇报策略'));
    await tester.pumpAndSettle();
    expect(find.text('每周'), findsOneWidget);
    await tester.enterText(
        find.byKey(const ValueKey('report-deadline-time')), '18:45');
    await tester.tap(find.text('保存策略'));
    await tester.pumpAndSettle();
    expect(h.helper.history.where((r) => r.method == 'PUT').single.body, {
      'period': 'weekly',
      'deadline_time': '18:45',
      'weekday': 5,
      'month_day': 25,
      'remind': true,
      'enabled': true
    });
    expect(find.text('汇报策略已保存'), findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('项目设置'), findsOneWidget);
  });

  testWidgets('C16 普通成员不能修改项目和策略', (tester) async {
    final h = ProjectsTestHarness();
    await h.bootstrap();
    settingsRoutes(h);
    h.helper.whenGet('/projects/11/my-permissions',
        permissionsJson(role: 'member', isPm: false, canEditAll: false));
    await h.pumpScreen(tester, const ProjectSettingsScreen(projectId: 11));
    expect(find.text('修改项目名称'), findsNothing);
    expect(find.text('更换项目负责人'), findsNothing);
    expect(find.text('汇报策略'), findsNothing);
  });

  testWidgets('C18 委托成员使用服务端can_invite显示邀请入口', (tester) async {
    final h = ProjectsTestHarness();
    await h.bootstrap();
    h.helper.whenGet('/projects/11', projectJson());
    h.helper.whenGet('/projects/11/members', {'items': []});
    h.helper.whenGet('/projects/11/tasks', {'items': [], 'total': 0});
    h.helper.whenGet('/projects/11/my-permissions', {
      ...permissionsJson(role: 'member', isPm: false, canEditAll: false),
      'can_invite': true
    });
    await h.pumpScreen(tester, const ProjectOverviewScreen(projectId: 11));
    expect(find.text('邀请新成员加入'), findsOneWidget);
  });

  testWidgets('C18 服务端明确禁止邀请时PM身份不会覆盖can_invite', (tester) async {
    final h = ProjectsTestHarness();
    await h.bootstrap();
    h.helper.whenGet('/projects/11', projectJson());
    h.helper.whenGet('/projects/11/members', {'items': []});
    h.helper.whenGet('/projects/11/tasks', {'items': [], 'total': 0});
    h.helper.whenGet('/projects/11/my-permissions',
        {...permissionsJson(), 'can_invite': false});
    await h.pumpScreen(tester, const ProjectOverviewScreen(projectId: 11));
    expect(find.text('邀请新成员加入'), findsNothing);
  });
}
