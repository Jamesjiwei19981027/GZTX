import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/features/projects/screens/invite_accept_screen.dart';
import 'package:worktodo_app/features/projects/screens/member_detail_screen.dart';
import 'package:worktodo_app/features/projects/screens/project_create_screen.dart';
import 'package:worktodo_app/features/projects/screens/project_invite_screen.dart';
import 'package:worktodo_app/features/projects/screens/project_overview_screen.dart';
import 'package:worktodo_app/features/projects/screens/project_settings_screen.dart';
import 'package:worktodo_app/features/projects/screens/project_switch_screen.dart';
import 'package:worktodo_app/features/projects/screens/team_screen.dart';

import '../../helpers/responsive_checker.dart';
import 'support/projects_test_harness.dart';

/// 320 窄屏 / 430 宽屏 / 系统字号 200% / 深色模式，iOS 与安卓双分支均不得溢出
Widget _wrap(AuthState auth, Widget child) =>
    ChangeNotifierProvider<AuthState>.value(value: auth, child: child);

void _registerAll(ProjectsTestHarness harness) {
  harness.helper.whenGet('/projects/11', projectJson());
  harness.helper.whenGet('/projects/11/members', {
    'items': [
      memberJson(userId: 5, nickname: '王宁', username: 'wangning', role: 'pm'),
      memberJson(userId: 6, nickname: '林悦', username: 'linyue'),
    ],
  });
  harness.helper.whenGet('/projects/11/my-permissions', permissionsJson());
  harness.helper.whenGet(
    '/projects/11/tasks',
    {
      'items': [
        taskJson(
          id: 1,
          title: '需求方案确认：与客户对齐全部验收口径与交付时间',
          assignees: [assigneeJson(userId: 5, name: '王宁')],
          dueDate: '2026-11-05T08:00:00Z',
        ),
        taskJson(
          id: 2,
          title: '交互原型设计',
          status: 1,
          assignees: [assigneeJson(userId: 6, name: '林悦')],
        ),
        taskJson(
          id: 3,
          title: '核心功能开发',
          status: 2,
          assignees: [assigneeJson(userId: 5, name: '王宁')],
        ),
      ],
      'total': 3,
    },
    query: {'page': '1', 'page_size': '200'},
  );
  harness.helper.whenGet('/companies/1/presence', {
    'items': [
      {'user_id': 5, 'status': 'online'},
      {'user_id': 6, 'status': 'offline'},
    ],
  });
  harness.helper.whenPost('/projects/11/invitations', {
    'id': 7,
    'token': 'inv-token-1',
    'status': 'pending',
    'expires_at': '2026-11-08T02:00:00Z',
  });
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('项目切换页在窄屏/宽屏/大字号/深色模式下不溢出', (tester) async {
    final harness = ProjectsTestHarness();
    final auth = await harness.bootstrap();
    _registerAll(harness);
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: _wrap(auth, const ProjectSwitchScreen()),
    );
  });

  testWidgets('新建项目页在窄屏/宽屏/大字号/深色模式下不溢出', (tester) async {
    final harness = ProjectsTestHarness();
    final auth = await harness.bootstrap();
    _registerAll(harness);
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: _wrap(auth, const ProjectCreateScreen()),
    );
  });

  testWidgets('创建公司页在窄屏/宽屏/大字号/深色模式下不溢出', (tester) async {
    final harness = ProjectsTestHarness();
    final auth = await harness.bootstrap();
    _registerAll(harness);
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: _wrap(
        auth,
        const ProjectCreateScreen(initialMode: WorkspaceCreateMode.company),
      ),
    );
  });

  testWidgets('项目概览页在窄屏/宽屏/大字号/深色模式下不溢出', (tester) async {
    final harness = ProjectsTestHarness();
    final auth = await harness.bootstrap();
    _registerAll(harness);
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: _wrap(auth, const ProjectOverviewScreen(projectId: 11)),
    );
  });

  testWidgets('项目设置页在窄屏/宽屏/大字号/深色模式下不溢出', (tester) async {
    final harness = ProjectsTestHarness();
    final auth = await harness.bootstrap();
    _registerAll(harness);
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: _wrap(auth, const ProjectSettingsScreen(projectId: 11)),
    );
  });

  testWidgets('成员邀请页在窄屏/宽屏/大字号/深色模式下不溢出', (tester) async {
    final harness = ProjectsTestHarness();
    final auth = await harness.bootstrap();
    _registerAll(harness);
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: _wrap(auth, const ProjectInviteScreen(projectId: 11)),
    );
  });

  testWidgets('接受邀请页在窄屏/宽屏/大字号/深色模式下不溢出', (tester) async {
    final harness = ProjectsTestHarness();
    final auth = await harness.bootstrap();
    _registerAll(harness);
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: _wrap(
        auth,
        const InviteAcceptScreen(initialToken: 'inv-token-1'),
      ),
    );
  });

  testWidgets('团队页在窄屏/宽屏/大字号/深色模式下不溢出', (tester) async {
    final harness = ProjectsTestHarness();
    final auth = await harness.bootstrap();
    _registerAll(harness);
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: _wrap(auth, const TeamScreen(projectId: 11)),
    );
  });

  testWidgets('成员详情页在窄屏/宽屏/大字号/深色模式下不溢出', (tester) async {
    final harness = ProjectsTestHarness();
    final auth = await harness.bootstrap();
    _registerAll(harness);
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: _wrap(auth, const MemberDetailScreen(projectId: 11, userId: 5)),
    );
  });

  testWidgets('数据已加载时 320 窄屏 + 200% 字号仍完整展示关键文字', (tester) async {
    final harness = ProjectsTestHarness();
    final auth = await harness.bootstrap();
    _registerAll(harness);

    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      ChangeNotifierProvider<AuthState>.value(
        value: auth,
        child: MaterialApp(
          theme: ThemeData(platform: TargetPlatform.android),
          home: const MediaQuery(
            data: MediaQueryData(
              size: Size(320, 640),
              textScaler: TextScaler.linear(2.0),
            ),
            child: ProjectOverviewScreen(projectId: 11),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('邀请新成员加入'), findsOneWidget);
    expect(find.text('项目任务待办 · 3'), findsOneWidget);
    expect(find.text('成员 2 人'), findsOneWidget);
  });
}
