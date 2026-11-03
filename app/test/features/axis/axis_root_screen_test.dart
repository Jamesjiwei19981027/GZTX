import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/axis/data/axis_view_models.dart';
import 'package:worktodo_app/features/axis/screens/axis_root_screen.dart';
import 'package:worktodo_app/features/axis/widgets/axis_canvas.dart';

import 'axis_test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    // 画布连线有持续的流动动画；这些用例按“减少动态效果”渲染，
    // 否则 pumpAndSettle 永远等不到静止，截图也会随动画帧漂移。
    final dispatcher = TestWidgetsFlutterBinding.instance.platformDispatcher;
    dispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(
      disableAnimations: true,
    );
    addTearDown(dispatcher.clearAccessibilityFeaturesTestValue);
  });

  testWidgets('没有加入任何项目时显示空状态，不再一直转圈', (tester) async {
    final harness = await AxisTestHarness.create(withProjects: false);
    await tester.pumpWidget(harness.wrap(
      AxisRootScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pumpAndSettle();

    expect(find.text('还没有加入任何项目'), findsOneWidget);
    expect(find.text('新建项目'), findsOneWidget);
    expect(find.text('刷新项目列表'), findsOneWidget);
    expect(find.text('正在加载责任链数据…'), findsNothing);

    // 无项目时不能请求任何项目人树接口。
    expect(
      harness.helper.history.where((r) => r.url.path.contains('/tree')),
      isEmpty,
    );
  });

  testWidgets('有项目时加载“我的职责”：直属领导、我、责任事项', (tester) async {
    tester.view.physicalSize = const Size(430, 1200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final harness = await AxisTestHarness.create();
    await tester.pumpWidget(harness.wrap(
      AxisRootScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pumpAndSettle();

    expect(find.text('林悦 · 我'), findsOneWidget);
    expect(find.text('直属领导 · 项目负责人'), findsOneWidget);
    expect(find.text('直属下属（0）'), findsOneWidget);
    expect(find.text('交互原型设计'), findsOneWidget);
  });

  testWidgets('切到项目全貌：根卡片带“终责”徽标，只有一个，并有线型切换与定位我', (tester) async {
    final harness = await AxisTestHarness.create();
    await tester.pumpWidget(harness.wrap(
      AxisRootScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('项目全貌'));
    // 连线流动动画会一直重绘，不能用 pumpAndSettle。
    await tester.pump(const Duration(milliseconds: 500));

    // 默认夹具有 3 个根；只有第一个根（王宁）是终责根。
    expect(find.text('终责'), findsOneWidget);
    final badgeCard = find.ancestor(
      of: find.text('终责'),
      matching: find.byKey(const Key('axis-person-101')),
    );
    expect(badgeCard, findsOneWidget);
    expect(find.text('定位我'), findsOneWidget);
    expect(find.text('纵向'), findsOneWidget);
    expect(find.text('横向'), findsOneWidget);
    expect(find.text('曲线'), findsOneWidget);
    expect(find.text('直线'), findsOneWidget);
  });

  testWidgets('多个根时画布顶部显示提示条；单根时不显示', (tester) async {
    final multi = await AxisTestHarness.create();
    await tester.pumpWidget(multi.wrap(
      AxisRootScreen(api: multi.api, authState: multi.authState),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('项目全貌'));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('该项目存在多个根节点，请联系管理员整理'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    final single = await AxisTestHarness.create(
      tree: [AxisTestHarness.defaultTree().first],
    );
    await tester.pumpWidget(single.wrap(
      AxisRootScreen(
        key: const ValueKey('single'),
        api: single.api,
        authState: single.authState,
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('项目全貌'));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('该项目存在多个根节点，请联系管理员整理'), findsNothing);
    expect(find.text('终责'), findsOneWidget);
  });

  testWidgets('点“直线”切换线型并记住到控制器', (tester) async {
    final harness = await AxisTestHarness.create();
    await tester.pumpWidget(harness.wrap(
      AxisRootScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('项目全貌'));
    await tester.pump(const Duration(milliseconds: 500));

    AxisCurvePainter painter() => tester
        .widgetList<CustomPaint>(find.byType(CustomPaint))
        .map((e) => e.painter)
        .whereType<AxisCurvePainter>()
        .single;
    expect(painter().edgeStyle, AxisEdgeStyle.curve);
    await tester.tap(find.text('直线'));
    await tester.pump(const Duration(milliseconds: 100));
    expect(painter().edgeStyle, AxisEdgeStyle.straight);
    await tester.tap(find.text('曲线'));
    await tester.pump(const Duration(milliseconds: 100));
    expect(painter().edgeStyle, AxisEdgeStyle.curve);
  });

  testWidgets('树为空时显示“先添加终责人”，并预填项目负责人', (tester) async {
    tester.view.physicalSize = const Size(430, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final harness = await AxisTestHarness.create(isPm: true, tree: const []);
    await tester.pumpWidget(harness.wrap(
      AxisRootScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('项目全貌'));
    await tester.pumpAndSettle();

    expect(find.text('先添加终责人'), findsOneWidget);
    await tester.tap(find.byKey(const Key('axis-add-root')));
    await tester.pumpAndSettle();
    final name = tester.widget<TextField>(
      find.descendant(
        of: find.byKey(const Key('axis-form-name')),
        matching: find.byType(TextField),
      ),
    );
    // 夹具里项目负责人 pm_user_id=12，对应成员“陈宇”。
    expect(name.controller?.text, '陈宇');
  });

  testWidgets('普通成员看不到“先添加终责人”', (tester) async {
    final harness = await AxisTestHarness.create(tree: const []);
    await tester.pumpWidget(harness.wrap(
      AxisRootScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('项目全貌'));
    await tester.pumpAndSettle();
    expect(find.text('人轴还没有人员'), findsOneWidget);
    expect(find.text('先添加终责人'), findsNothing);
  });

  testWidgets('项目经理看到新增主轴人员入口，普通成员看不到', (tester) async {
    final pm = await AxisTestHarness.create(isPm: true);
    await tester.pumpWidget(pm.wrap(
      AxisRootScreen(
        key: const ValueKey('pm'),
        api: pm.api,
        authState: pm.authState,
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('axis-add-person')), findsOneWidget);

    final member = await AxisTestHarness.create();
    await tester.pumpWidget(member.wrap(
      AxisRootScreen(
        key: const ValueKey('member'),
        api: member.api,
        authState: member.authState,
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('axis-add-person')), findsNothing);
  });

  testWidgets('项目经理新增主轴人员：提交顶层人员节点', (tester) async {
    tester.view.physicalSize = const Size(430, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(resetToastForTesting);
    final harness = await AxisTestHarness.create(isPm: true);
    harness.helper.whenPost(
      '/projects/${AxisTestHarness.projectId}/nodes',
      AxisTestHarness.personNode(
        id: 120,
        parentId: null,
        name: '新人员',
        role: '新岗位',
        department: '新部门',
        userId: 30,
      ),
    );
    await tester.pumpWidget(harness.wrap(
      AxisRootScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('axis-add-person')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('axis-form-name')), '新人员');
    await tester.pump();
    await tester.tap(find.text('保存人员'));
    await tester.pumpAndSettle();

    final post = harness.helper.history.firstWhere(
      (r) =>
          r.method == 'POST' &&
          r.url.path == '/api/v1/projects/${AxisTestHarness.projectId}/nodes',
      orElse: () => throw StateError('未发出新增人员请求'),
    );
    final body = post.body as Map;
    expect(body['node_type_key'], 'person');
    expect(body['title'], '新人员');
    expect(body['parent_id'], isNull);
    expect(body['node_origin'], 'project');
    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('主轴人员给“我”新增直属下属：挂到当前人员下', (tester) async {
    tester.view.physicalSize = const Size(430, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(resetToastForTesting);
    final harness = await AxisTestHarness.create();
    harness.helper.whenPost(
      '/projects/${AxisTestHarness.projectId}/nodes',
      AxisTestHarness.personNode(
        id: 121,
        parentId: 102,
        name: '新下属',
        role: '设计助理',
        department: '设计部',
        userId: 31,
        nodeOrigin: 'subordinate',
      ),
    );
    await tester.pumpWidget(harness.wrap(
      AxisRootScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('axis-add-subordinate')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('axis-form-name')), '新下属');
    await tester.pump();
    await tester.tap(find.text('保存人员'));
    await tester.pumpAndSettle();

    final post = harness.helper.history.firstWhere(
      (r) =>
          r.method == 'POST' &&
          r.url.path == '/api/v1/projects/${AxisTestHarness.projectId}/nodes',
      orElse: () => throw StateError('未发出新增下属请求'),
    );
    final body = post.body as Map;
    expect(body['parent_id'], 102);
    expect(body['node_origin'], 'subordinate');
    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('加载失败显示中文原因与重试，不静默吞异常', (tester) async {
    final harness = await AxisTestHarness.create();
    harness.helper.whenGet(
      '/projects/${AxisTestHarness.projectId}/tree',
      AxisTestHarness.errorBody(500, '服务暂不可用，请稍后重试'),
      statusCode: 500,
      query: {'format': 'nested'},
    );

    await tester.pumpWidget(harness.wrap(
      AxisRootScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pumpAndSettle();

    expect(find.text('无法加载人轴'), findsOneWidget);
    expect(find.text('服务暂不可用，请稍后重试'), findsOneWidget);
    expect(find.text('重试'), findsOneWidget);
  });

  testWidgets('切换项目后按新项目重新加载人轴', (tester) async {
    final harness = await AxisTestHarness.create();
    const secondId = 2;
    // 重新注册项目列表（后注册优先），加入第二个项目。
    harness.helper.whenGet(
      '/projects',
      {
        'items': [
          {'id': 1, 'name': '责任树联合调试', 'company_id': 1, 'status': 'active'},
          {'id': secondId, 'name': '第二个项目', 'company_id': 1, 'status': 'active'},
        ],
        'total': 2,
      },
      query: {'company_id': '1', 'as_admin': 'true'},
    );
    harness.helper.whenGet(
      '/projects/$secondId/tree',
      {
        'project_id': secondId,
        'nodes': [
          AxisTestHarness.personNode(
            id: 301,
            parentId: null,
            name: '周然',
            role: '第二个项目负责人',
            department: '项目部',
            userId: 20,
          ),
        ],
      },
      query: {'format': 'nested'},
    );
    harness.helper.whenGet(
      '/projects/$secondId/members',
      AxisTestHarness.membersPayload(),
    );
    harness.helper.whenGet(
      '/projects/$secondId/my-permissions',
      AxisTestHarness.defaultPermissions(isPm: false),
    );
    harness.helper.whenGet(
      '/projects/$secondId',
      AxisTestHarness.projectJson(id: secondId, name: '第二个项目'),
    );
    await harness.authState.bootstrap();

    await tester.pumpWidget(harness.wrap(
      AxisRootScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pumpAndSettle();
    expect(find.text('林悦 · 我'), findsOneWidget);

    await tester.tap(find.byKey(const Key('axis-project-picker')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('第二个项目').last);
    await tester.pumpAndSettle();

    expect(
      harness.helper.history.any(
        (r) => r.url.path == '/api/v1/projects/$secondId/tree',
      ),
      isTrue,
    );
    expect(find.text('第二个项目'), findsOneWidget);

    await tester.tap(find.text('项目全貌'));
    await tester.pumpAndSettle();
    expect(find.text('周然'), findsOneWidget);
  });
}
