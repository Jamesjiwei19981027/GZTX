import 'package:flutter/cupertino.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
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

import '../../helpers/golden_test_helper.dart';
import 'support/projects_test_harness.dart';

/// 双平台截图测试统一入口：把页面挂到已登录的全局状态上
Widget _wrap(AuthState auth, Widget child) {
  return ChangeNotifierProvider<AuthState>.value(value: auth, child: child);
}

const String _goldenFont = 'NotoSansSC';

const CupertinoTextThemeData _goldenCupertinoTextTheme = CupertinoTextThemeData(
  textStyle: TextStyle(fontFamily: _goldenFont),
  actionTextStyle: TextStyle(fontFamily: _goldenFont),
  tabLabelTextStyle: TextStyle(fontFamily: _goldenFont),
  navTitleTextStyle: TextStyle(
    fontFamily: _goldenFont,
    fontSize: 17,
    fontWeight: FontWeight.w600,
  ),
  navLargeTitleTextStyle: TextStyle(fontFamily: _goldenFont),
  pickerTextStyle: TextStyle(fontFamily: _goldenFont),
  dateTimePickerTextStyle: TextStyle(fontFamily: _goldenFont),
);

/// 双平台截图：先与页面交互（如点按钮进入“工作区同步失败”结果态），再截图。
///
/// `testAdaptiveGolden` 只截静态初态，无法覆盖「点完才出现」的界面，
/// 这里沿用同一套字体、主题与机型尺寸口径，只在截图前多走一步交互。
Future<void> _testGoldenAfterAction({
  required WidgetTester tester,
  required AuthState auth,
  required Widget child,
  required String goldenFileNamePrefix,
  required Future<void> Function() action,
}) async {
  await loadTestFonts(tester);

  Widget wrap(Widget themedApp) => ChangeNotifierProvider<AuthState>.value(
        value: auth,
        child: themedApp,
      );

  // 1. iOS
  const iosSize = Size(390, 844);
  debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
  await tester.binding.setSurfaceSize(iosSize);
  tester.view.physicalSize = iosSize;
  tester.view.devicePixelRatio = 1.0;
  await tester.pumpWidget(
    wrap(
      CupertinoTheme(
        data: const CupertinoThemeData(textTheme: _goldenCupertinoTextTheme),
        child: MaterialApp(
          theme: ThemeData(
            platform: TargetPlatform.iOS,
            fontFamily: _goldenFont,
            fontFamilyFallback: const [_goldenFont, '.SF Pro Text'],
            cupertinoOverrideTheme: const CupertinoThemeData(
              textTheme: _goldenCupertinoTextTheme,
            ),
          ),
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          supportedLocales: const [Locale('zh', 'CN')],
          home: MediaQuery(
            data: const MediaQueryData(
              size: iosSize,
              devicePixelRatio: 1.0,
              padding: EdgeInsets.only(top: 47, bottom: 34),
            ),
            child: child,
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  await action();
  await tester.pumpAndSettle();
  await expectLater(
    find.byType(MaterialApp),
    matchesGoldenFile('goldens/${goldenFileNamePrefix}_ios.png'),
  );

  // 2. Android
  const androidSize = Size(412, 915);
  debugDefaultTargetPlatformOverride = TargetPlatform.android;
  await tester.binding.setSurfaceSize(androidSize);
  tester.view.physicalSize = androidSize;
  tester.view.devicePixelRatio = 1.0;
  await tester.pumpWidget(
    wrap(
      MaterialApp(
        theme: ThemeData(
          platform: TargetPlatform.android,
          fontFamily: _goldenFont,
          fontFamilyFallback: const [_goldenFont],
        ),
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: const [Locale('zh', 'CN')],
        home: MediaQuery(
          data: const MediaQueryData(
            size: androidSize,
            devicePixelRatio: 1.0,
            padding: EdgeInsets.only(top: 24, bottom: 16),
          ),
          child: child,
        ),
      ),
    ),
  );
  await tester.pump();
  await action();
  await tester.pumpAndSettle();
  await expectLater(
    find.byType(MaterialApp),
    matchesGoldenFile('goldens/${goldenFileNamePrefix}_android.png'),
  );

  debugDefaultTargetPlatformOverride = null;
  await tester.binding.setSurfaceSize(null);
}

void _registerOverview(ProjectsTestHarness harness) {
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
          title: '需求方案确认',
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
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    '项目切换页双平台外观',
    tags: ['golden'],
    (tester) async {
      final harness = ProjectsTestHarness();
      final auth = await harness.bootstrap();
      await testAdaptiveGolden(
        tester: tester,
        widget: _wrap(auth, const ProjectSwitchScreen()),
        goldenFileNamePrefix: 'project_switch_screen',
      );
    },
  );

  testWidgets(
    '新建项目页双平台外观',
    tags: ['golden'],
    (tester) async {
      final harness = ProjectsTestHarness();
      final auth = await harness.bootstrap();
      await testAdaptiveGolden(
        tester: tester,
        widget: _wrap(auth, const ProjectCreateScreen()),
        goldenFileNamePrefix: 'project_create_screen',
      );
    },
  );

  testWidgets(
    '创建公司页双平台外观',
    tags: ['golden'],
    (tester) async {
      final harness = ProjectsTestHarness();
      final auth = await harness.bootstrap();
      await testAdaptiveGolden(
        tester: tester,
        widget: _wrap(
          auth,
          const ProjectCreateScreen(initialMode: WorkspaceCreateMode.company),
        ),
        goldenFileNamePrefix: 'company_create_screen',
      );
    },
  );

  testWidgets(
    '项目概览页双平台外观',
    tags: ['golden'],
    (tester) async {
      final harness = ProjectsTestHarness();
      final auth = await harness.bootstrap();
      _registerOverview(harness);
      await testAdaptiveGolden(
        tester: tester,
        widget: _wrap(auth, const ProjectOverviewScreen(projectId: 11)),
        goldenFileNamePrefix: 'project_overview_screen',
      );
    },
  );

  testWidgets(
    '项目设置页双平台外观',
    tags: ['golden'],
    (tester) async {
      final harness = ProjectsTestHarness();
      final auth = await harness.bootstrap();
      harness.helper.whenGet('/projects/11', projectJson());
      harness.helper.whenGet('/projects/11/my-permissions', permissionsJson());
      await testAdaptiveGolden(
        tester: tester,
        widget: _wrap(auth, const ProjectSettingsScreen(projectId: 11)),
        goldenFileNamePrefix: 'project_settings_screen',
      );
    },
  );

  testWidgets(
    '成员邀请页双平台外观',
    tags: ['golden'],
    (tester) async {
      final harness = ProjectsTestHarness();
      final auth = await harness.bootstrap();
      await testAdaptiveGolden(
        tester: tester,
        widget: _wrap(auth, const ProjectInviteScreen(projectId: 11)),
        goldenFileNamePrefix: 'project_invite_screen',
      );
    },
  );

  testWidgets(
    '接受邀请页双平台外观',
    tags: ['golden'],
    (tester) async {
      final harness = ProjectsTestHarness();
      final auth = await harness.bootstrap();
      await testAdaptiveGolden(
        tester: tester,
        widget: _wrap(
          auth,
          const InviteAcceptScreen(initialToken: 'Ab3_-xYz9Qw8Er7Ty6Ui5Op4As3Df2Gh1Jk0LzXcVbN'),
        ),
        goldenFileNamePrefix: 'invite_accept_screen',
      );
    },
  );

  testWidgets(
    '接受邀请后工作区同步失败结果区双平台外观',
    tags: ['golden'],
    (tester) async {
      final harness = ProjectsTestHarness();
      final auth = await harness.bootstrap();
      // 邀请已消费，但 /companies/mine 临时不可用：页面停在结果区等重试
      harness.helper.whenGet('/companies/mine', '服务暂不可用', statusCode: 500);
      harness.helper.whenPost(
        '/projects/invitations/Ab3_-xYz9Qw8Er7Ty6Ui5Op4As3Df2Gh1Jk0LzXcVbN/accept',
        {'project_id': 11, 'role': 'member'},
      );
      harness.helper.whenGet('/projects/11', projectJson());

      await _testGoldenAfterAction(
        tester: tester,
        auth: auth,
        child: const InviteAcceptScreen(initialToken: 'Ab3_-xYz9Qw8Er7Ty6Ui5Op4As3Df2Gh1Jk0LzXcVbN'),
        goldenFileNamePrefix: 'invite_accept_sync_failed_screen',
        action: () async {
          await tester.tap(find.text('接受并进入项目'));
        },
      );
    },
  );

  testWidgets(
    '团队页双平台外观',
    tags: ['golden'],
    (tester) async {
      final harness = ProjectsTestHarness();
      final auth = await harness.bootstrap();
      harness.helper.whenGet('/projects/11/members', {
        'items': [
          memberJson(userId: 5, nickname: '王宁', username: 'wangning', role: 'pm'),
          memberJson(userId: 6, nickname: '林悦', username: 'linyue'),
        ],
      });
      harness.helper.whenGet('/companies/1/presence', {
        'items': [
          {'user_id': 5, 'status': 'online'},
          {'user_id': 6, 'status': 'offline'},
        ],
      });
      await testAdaptiveGolden(
        tester: tester,
        widget: _wrap(auth, const TeamScreen(projectId: 11)),
        goldenFileNamePrefix: 'team_screen',
      );
    },
  );

  testWidgets(
    '成员详情页双平台外观',
    tags: ['golden'],
    (tester) async {
      final harness = ProjectsTestHarness();
      final auth = await harness.bootstrap();
      harness.helper.whenGet('/projects/11/members', {
        'items': [
          memberJson(userId: 5, nickname: '王宁', username: 'wangning', role: 'pm'),
        ],
      });
      harness.helper.whenGet(
        '/projects/11/tasks',
        {
          'items': [
            taskJson(
              id: 1,
              title: '需求方案确认',
              assignees: [assigneeJson(userId: 5, name: '王宁')],
              dueDate: '2026-11-05T08:00:00Z',
            ),
          ],
          'total': 1,
        },
        query: {'page': '1', 'page_size': '200'},
      );
      await testAdaptiveGolden(
        tester: tester,
        widget: _wrap(auth, const MemberDetailScreen(projectId: 11, userId: 5)),
        goldenFileNamePrefix: 'member_detail_screen',
      );
    },
  );
}
