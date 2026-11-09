import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/auth/data/auth_api.dart';
import 'package:worktodo_app/features/auth/screens/login_screen.dart';
import 'package:worktodo_app/features/evidence/routes.dart';
import 'package:worktodo_app/features/evidence/data/evidence_api.dart';
import 'package:worktodo_app/features/evidence/screens/evidence_submit_screen.dart';
import 'package:worktodo_app/core/errors/app_error.dart';
import 'package:worktodo_app/features/me/appearance/me_appearance.dart';
import 'package:worktodo_app/features/me/screens/me_appearance_screen.dart';
import 'package:worktodo_app/features/me/screens/me_delete_account_screen.dart';
import 'package:worktodo_app/features/me/screens/me_integrations_screen.dart';
import 'package:worktodo_app/features/me/screens/me_notifications_screen.dart';
import 'package:worktodo_app/features/me/screens/me_security_screen.dart';
import 'package:worktodo_app/features/me/widgets/me_common.dart';
import 'package:worktodo_app/features/projects/models/project_models.dart';
import 'package:worktodo_app/features/projects/widgets/project_widgets.dart';
import 'package:worktodo_app/features/reports/screens/report_editor_screen.dart';
import 'package:worktodo_app/features/reports/screens/report_review_screen.dart';
import 'package:worktodo_app/features/work/data/work_api.dart';
import 'package:worktodo_app/features/work/screens/work_task_edit_screen.dart';

import 'features/me/me_test_harness.dart';
import 'features/reports/reports_test_fixtures.dart';
import 'helpers/mock_api_client.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  tearDown(resetToastForTesting);

  testWidgets('WR-34 成员头像与个人头像共用绝对地址转换', (tester) async {
    await tester.pumpWidget(const MaterialApp(
        home: MemberAvatar(
      member: ProjectMember(userId: 11, avatarUrl: '/api/v1/users/11/avatar'),
    )));
    final provider =
        tester.widget<Image>(find.byType(Image)).image as NetworkImage;
    expect(provider.url, meAbsoluteUrl('/api/v1/users/11/avatar'));
    expect(Uri.parse(provider.url).hasAuthority, isTrue);
  });

  testWidgets('WR-41 云端主题覆盖旧本机缓存', (tester) async {
    final h = await MeTestHarness.create();
    SharedPreferences.setMockInitialValues(
        {MeAppearanceController.themeModeKey: 'dark'});
    final appearance = MeAppearanceController();
    await tester.pumpWidget(
        h.wrap(MeAppearanceScreen(api: h.api, appearance: appearance)));
    await tester.pumpAndSettle();
    expect(appearance.themeMode, MeThemeMode.light);
    expect(
        (await SharedPreferences.getInstance())
            .getString(MeAppearanceController.themeModeKey),
        'light');
  });

  testWidgets('WR-26 重进页面显示个人保存的语音服务', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final h = await MeTestHarness.create();
    h.helper.whenGet(
        '/users/me/bindings/asr', {'provider_id': 'customer:whisper'},
        query: {'company_id': '1'});
    await tester.pumpWidget(
        h.wrap(MeIntegrationsScreen(api: h.api, authState: h.authState)));
    await tester.pumpAndSettle();
    final row = find
        .ancestor(of: find.text('自有语音服务'), matching: find.byType(InkWell))
        .first;
    expect(
        find.descendant(
            of: row,
            matching: find
                .byWidgetPredicate((w) => w is AppIcon && w.name == 'check')),
        findsOneWidget);
    expect(h.lastRequest('GET', '/users/me/bindings/asr').url.queryParameters,
        {'company_id': '1'});
  });

  testWidgets('WR-27 完整新建页显示云端默认高优先级', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final h = await MeTestHarness.create(withCompany: false);
    h.helper.whenGet('/users/me/ui-prefs', {
      'ui': {'task_default_priority': 2}
    });
    await tester.pumpWidget(h.wrap(WorkTaskEditScreen(
        api: WorkApi(h.authState.api), authState: h.authState)));
    await tester.pumpAndSettle();
    final control = tester
        .widget<DropdownButton<int>>(find.byType(DropdownButton<int>).first);
    expect(control.value, 2);
  });

  testWidgets('WR-28 导出按钮请求真实鉴权接口', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final h = await MeTestHarness.create();
    h.helper.whenGet('/users/me/export', {'code': 500, 'message': '导出暂时失败'},
        statusCode: 500);
    await tester.pumpWidget(
        h.wrap(MeDeleteAccountScreen(api: h.api, authState: h.authState)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('导出我的数据'));
    await tester.pumpAndSettle();
    expect(h.lastRequest('GET', '/users/me/export').headers['Authorization'],
        'Bearer mock-access-token');
    expect(find.textContaining('导出失败'), findsOneWidget);
    expect(find.textContaining('已复制'), findsNothing);
  });

  testWidgets('WR-42 注销确认如实说明停用和协作记录保留', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final h = await MeTestHarness.create();
    await tester.pumpWidget(
        h.wrap(MeDeleteAccountScreen(api: h.api, authState: h.authState)));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('me-delete-password')), 'pass');
    await tester.enterText(
        find.byKey(const Key('me-delete-keyword')), 'DELETE');
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(AppButton, '永久注销此账号'));
    await tester.pumpAndSettle();
    expect(find.textContaining('账号将被停用、无法再登录'), findsWidgets);
    expect(find.textContaining('已产生的任务与协作记录保留在所属项目中'), findsWidgets);
    expect(find.textContaining('立即销毁'), findsNothing);
    await tester.tap(find.text('取消'));
    await tester.pumpAndSettle();
    expect(h.hasRequest('POST', '/users/me/delete'), isFalse);
  });

  testWidgets('WR-29 只说明前台通知并测试站内通知', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final h = await MeTestHarness.create();
    h.helper.whenPost('/notify/test-send', {'ok': true});
    await tester.pumpWidget(h.wrap(MeNotificationsScreen(api: h.api)));
    await tester.pumpAndSettle();
    expect(find.textContaining('App 打开时接收通知'), findsWidgets);
    expect(find.text('系统推送'), findsNothing);
    await tester.tap(find.text('发送测试站内通知'));
    await tester.pumpAndSettle();
    expect(
        h.lastRequest('POST', '/notify/test-send').body, {'channel': 'in_app'});
    expect(find.textContaining('请在消息中查看'), findsOneWidget);
  });

  for (final channel in ['email', 'sms']) {
    testWidgets('WR-25 $channel 确认接口仅返回布尔值仍立即显示新地址', (tester) async {
      MeTestHarness.useTallSurface(tester);
      final h = await MeTestHarness.create();
      h.helper.whenPost('/users/me/verification/confirm', {
        'email_verified': true,
        'phone_verified': true,
        'is_verified': true
      });
      await tester.pumpWidget(
          h.wrap(MeSecurityScreen(api: h.api, authState: h.authState)));
      await tester.pumpAndSettle();
      await tester.tap(find.text(channel == 'email' ? '换绑' : '验证').first);
      await tester.pumpAndSettle();
      final target = channel == 'email' ? 'new@example.com' : '13812345678';
      await tester.enterText(find.byKey(const Key('me-bind-target')), target);
      await tester.enterText(find.byKey(const Key('me-bind-code')), '123456');
      await tester.tap(find.byKey(const Key('me-bind-confirm')));
      await tester.pumpAndSettle();
      expect(find.text(target), findsOneWidget);
      expect(find.text(channel == 'email' ? '13900000001' : 'demo@example.com'),
          findsOneWidget);
    });
  }

  testWidgets('WR-36 登录页隐藏公司禁用的密码方式及找回入口', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/auth/registration-config', {
      'mode': 'open',
      'login_methods': {'password': false, 'code': true}
    });
    await tester.pumpWidget(
        MaterialApp(home: LoginScreen(api: AuthApi(helper.buildClient()))));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('login-username')), findsNothing);
    expect(find.text('账号密码登录'), findsNothing);
    expect(find.text('找回密码帮助'), findsNothing);
    expect(find.byKey(const ValueKey('login-target')), findsOneWidget);
  });

  test('WR-39 邀请能力按服务端 ACL 而非角色显示', () {
    expect(
        ProjectPermissions.fromJson({'role': 'member', 'can_invite': true})
            .canInviteMembers,
        isTrue);
    expect(
        ProjectPermissions.fromJson(
                {'role': 'pm', 'is_pm': true, 'can_invite': false})
            .canInviteMembers,
        isFalse);
    expect(
        ProjectPermissions.fromJson({
          'role': 'member',
          'can_edit_all': true,
          'via_delegation': true
        }).canInviteMembers,
        isFalse);
  });

  testWidgets('WR-30 后端无核验裁决接口时按钮禁用', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final h = await ReportsTestHarness.create();
    await tester.pumpWidget(h.wrapRouted(ReportReviewScreen(
        api: h.api, projectId: 10, mode: ReportReviewMode.conflict)));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('记录核验意见'), 300,
        scrollable: find.byType(Scrollable).first);
    final button =
        tester.widget<AppButton>(find.widgetWithText(AppButton, '记录核验意见'));
    expect(button.onPressed, isNull);
    expect(find.textContaining('暂不支持保存核验意见'), findsOneWidget);
  });

  testWidgets('WR-30 上传材料带上原项目和已输入说明并可返回', (tester) async {
    final h = await ReportsTestHarness.create();
    await tester.pumpWidget(h.wrapRouted(
      ReportReviewScreen(
          api: h.api, projectId: 10, mode: ReportReviewMode.followup),
      routes: [
        GoRoute(
            path: '/',
            builder: (context, state) => ReportReviewScreen(
                api: h.api, projectId: 10, mode: ReportReviewMode.followup)),
        GoRoute(
            path: '/evidence/submit',
            builder: (_, state) => Scaffold(
                body: Text(
                    '${state.uri.queryParameters['projectId']}|${(state.extra as Map?)?['summary']}'))),
      ],
    ));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '验收清单已补齐');
    await tester.ensureVisible(find.text('上传材料'));
    await tester.tap(find.text('上传材料'));
    await tester.pumpAndSettle();
    expect(find.text('10|验收清单已补齐'), findsOneWidget);
  });

  testWidgets('WR-16 从指定草稿详情恢复任务和材料快照', (tester) async {
    MeTestHarness.useTallSurface(tester, size: const Size(430, 2400));
    final h = await ReportsTestHarness.create();
    h.helper.whenGet(
      '/reports/my',
      {
        'items': [ReportsTestFixtures.draftReportJson]
      },
      query: {'project_id': '10'},
    );
    h.helper.whenGet('/reports/503', {
      ...ReportsTestFixtures.draftReportJson,
      'payload_json': {
        'task_snapshot': [
          {'id': 912, 'title': '服务端任务快照', 'status': 2}
        ],
        'evidence_snapshot': [
          {'id': 913, 'summary': '服务端材料快照', 'status': 'adopted', 'files': []}
        ],
      },
    });
    await tester.pumpWidget(h.wrapRouted(ReportEditorScreen(
        api: h.api,
        userId: 11,
        projectId: 10,
        draftStore: h.draftStore,
        initialDraftReportId: 503)));
    await tester.pumpAndSettle();
    expect(
      h.helper.history
          .any((r) => r.method == 'GET' && r.url.path.endsWith('/reports/503')),
      isTrue,
    );
    expect(find.text('服务端任务快照'), findsOneWidget);
    expect(find.text('服务端材料快照'), findsOneWidget);
    expect(find.textContaining('任务快照 · 状态：已完成'), findsOneWidget);
    expect(find.textContaining('材料快照 · 状态：已采纳'), findsOneWidget);
  });

  testWidgets('WR-31 提交草稿不重复提交已经保存的来源', (tester) async {
    MeTestHarness.useTallSurface(tester, size: const Size(430, 2400));
    final h = await ReportsTestHarness.create();
    await tester.pumpWidget(h.wrapRouted(ReportEditorScreen(
        api: h.api,
        userId: 11,
        projectId: 10,
        draftStore: h.draftStore,
        initialDraftReportId: 503)));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('确认提交'));
    await tester.tap(find.text('确认提交'));
    await tester.pumpAndSettle();
    final sent = h.helper.history.singleWhere((r) =>
        r.method == 'POST' && r.url.path.endsWith('/reports/503/submit'));
    expect((sent.body as Map)['sources'] ?? [], isEmpty);
    expect((sent.body as Map)['summary'], isNotEmpty);
  });

  testWidgets('WR-30 无节点的汇报追问可选择本项目事项并带说明提交材料', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final h = await ReportsTestHarness.create();
    h.helper.whenGet('/projects/10/tree', {
      'nodes': [
        {
          'id': 21,
          'title': '验收负责人',
          'children': [
            {
              'id': 22,
              'title': '验收事项',
              'node_type_key': 'work_item',
              'children': []
            },
          ]
        },
      ]
    }, query: {
      'format': 'nested'
    });
    h.helper.whenPost('/nodes/22/evidence', {'code': 403, 'message': '验收锁定'},
        statusCode: 403);
    await tester.pumpWidget(h.wrapRouted(
      ReportReviewScreen(
          api: h.api, projectId: 10, mode: ReportReviewMode.followup),
      routes: [
        GoRoute(
            path: '/',
            builder: (context, state) => ReportReviewScreen(
                api: h.api, projectId: 10, mode: ReportReviewMode.followup)),
        ...evidenceRoutes,
      ],
    ));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '补充验收清单及结果');
    await tester.tap(find.text('上传材料'));
    await tester.pumpAndSettle();
    expect(find.text('补充验收清单及结果'), findsOneWidget);
    await tester.tap(find.byType(DropdownButton<int>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('验收事项').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('提交材料'));
    await tester.pumpAndSettle();
    final sent = h.helper.history.singleWhere(
        (r) => r.method == 'POST' && r.url.path.endsWith('/nodes/22/evidence'));
    expect((sent.body as Map)['summary_text'], '补充验收清单及结果');
    expect(find.textContaining('验收锁定'), findsOneWidget);
  });

  testWidgets('WR-30 选择节点后断网保存的材料仍可从原入口恢复', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final h = await ReportsTestHarness.create();
    h.helper.whenGet('/projects/10/tree', {
      'nodes': [
        {'id': 22, 'title': '验收事项', 'children': []}
      ]
    });
    h.helper.whenPost('/nodes/22/evidence', NetworkException('网络中断'));
    Widget screen() => h.wrapRouted(EvidenceSubmitScreen(
        api: EvidenceApi(h.authState.api),
        userId: 11,
        userName: '测试用户',
        companyId: 1,
        projectId: 10));
    await tester.pumpWidget(screen());
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, '离线保留的补充说明');
    await tester.tap(find.byType(DropdownButton<int>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('验收事项').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('提交材料'));
    await tester.pumpAndSettle();
    expect(find.textContaining('已保存本地草稿'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(screen());
    await tester.pumpAndSettle();
    expect(find.text('离线保留的补充说明'), findsOneWidget);
  });

  testWidgets('WR-30 汇报补充说明在页面重载后只追加一次', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final h = await ReportsTestHarness.create();
    late StateSetter rebuild;
    var dark = false;
    await tester
        .pumpWidget(h.wrapRouted(StatefulBuilder(builder: (context, setState) {
      rebuild = setState;
      return Theme(
          data:
              ThemeData(brightness: dark ? Brightness.dark : Brightness.light),
          child: const ReportEditorScreen(
              userId: 11,
              projectId: 10,
              initialDraftReportId: 503,
              initialSupplement: '验收补充事实'));
    })));
    await tester.pumpAndSettle();
    rebuild(() => dark = true);
    await tester.pumpAndSettle();
    final fields = tester.widgetList<TextField>(find.byType(TextField));
    final text = fields.map((field) => field.controller!.text).join('\n');
    expect('验收补充事实'.allMatches(text), hasLength(1));
  });
}
