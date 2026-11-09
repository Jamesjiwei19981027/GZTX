import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
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
    expect(find.text('适应屏幕'), findsOneWidget);
    expect(find.byKey(const Key('axis-more-menu')), findsOneWidget);
  });

  for (final width in [320.0, 412.0]) {
    testWidgets('方向切换文字在 $width 宽屏完整显示，切换后仍可见', (tester) async {
      tester.view.physicalSize = Size(width, 915);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final harness = await AxisTestHarness.create();
      await tester.pumpWidget(harness.wrap(
        AxisRootScreen(
          api: harness.api,
          authState: harness.authState,
          initialTab: AxisViewTab.overview,
        ),
      ));
      await tester.pumpAndSettle();

      void expectFullLabels() {
        for (final label in ['纵向', '横向']) {
          final paragraph =
              tester.renderObject<RenderParagraph>(find.text(label));
          expect(
            paragraph.size.height,
            greaterThanOrEqualTo(
                paragraph.getMaxIntrinsicHeight(paragraph.size.width)),
            reason: '$label 的布局高度必须容纳完整文字行，不能裁掉下半截',
          );
        }
      }

      expectFullLabels();
      await tester.tap(find.text('横向'));
      await tester.pumpAndSettle();
      expect(tester.widget<AxisCanvas>(find.byType(AxisCanvas)).orientation,
          AxisOrientation.horizontal);
      expectFullLabels();
      await tester.tap(find.text('纵向'));
      await tester.pumpAndSettle();
      expect(tester.widget<AxisCanvas>(find.byType(AxisCanvas)).orientation,
          AxisOrientation.vertical);
      expectFullLabels();
      expect(tester.takeException(), isNull);
    });
  }

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
    await tester.tap(find.byKey(const Key('axis-more-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('直线连线'));
    await tester.pump(const Duration(milliseconds: 100));
    expect(painter().edgeStyle, AxisEdgeStyle.straight);
    await tester.tap(find.byKey(const Key('axis-more-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('曲线连线'));
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

  testWidgets('工具条单行显示，320 宽屏无溢出', (tester) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final harness = await AxisTestHarness.create();
    await tester.pumpWidget(harness.wrap(
      AxisRootScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('项目全貌'));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('纵向'), findsOneWidget);
    expect(find.text('横向'), findsOneWidget);
    expect(find.text('定位我'), findsOneWidget);
    expect(find.text('适应屏幕'), findsOneWidget);
    expect(find.byKey(const Key('axis-more-menu')), findsOneWidget);

    expect(tester.takeException(), isNull);
  });

  testWidgets('画布提示首次显示、点击消失，已看过后再次进入不显示', (tester) async {
    SharedPreferences.setMockInitialValues({'axis_canvas_hint_seen': false});
    final harness = await AxisTestHarness.create();
    await tester.pumpWidget(harness.wrap(
      AxisRootScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('项目全貌'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    final hintFinder = find.byKey(const Key('axis-drag-hint'));
    expect(hintFinder, findsOneWidget);
    expect(find.textContaining('换上级'), findsOneWidget);

    // 点击提示后消失
    await tester.tap(hintFinder);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
    expect(hintFinder, findsNothing);

    // 重新进入，不再显示（复用相同 harness，避免重复 create 重置 SharedPreferences）
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(harness.wrap(
      AxisRootScreen(
        key: const ValueKey('second-entry'),
        api: harness.api,
        authState: harness.authState,
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('项目全貌'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
    expect(hintFinder, findsNothing);
  });

  testWidgets('我的职责页无写死假汇报数据，无汇报显示暂无汇报，下属卡片第二行显示岗位', (tester) async {
    tester.view.physicalSize = const Size(430, 1200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final customTree = [
      AxisTestHarness.personNode(
        id: 101,
        parentId: null,
        name: '王宁',
        role: '终责领导',
        department: '管理部',
        userId: 10,
        children: [
          AxisTestHarness.personNode(
            id: 102,
            parentId: 101,
            name: '林悦',
            role: '设计负责人',
            department: '设计部',
            userId: AxisTestHarness.memberUserId,
            children: [
              AxisTestHarness.personNode(
                id: 105,
                parentId: 102,
                name: '苏菲',
                role: 'UI 设计师',
                department: '设计部',
                userId: 35,
              ),
              AxisTestHarness.workItem(
                id: 201,
                parentId: 102,
                title: '交互原型设计',
              ),
            ],
          ),
        ],
      ),
    ];

    final harness = await AxisTestHarness.create(tree: customTree);
    harness.helper.whenGet(
      '/projects/${AxisTestHarness.projectId}/agent-reports',
      [
        {
          'id': 1,
          'project_id': AxisTestHarness.projectId,
          'author_user_id': 35,
          'status': 'submitted',
          'source_count': 2,
          'submitted_at': '2026-11-04T10:30:00Z',
        },
      ],
    );

    await tester.pumpWidget(harness.wrap(
      AxisRootScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pumpAndSettle();

    // 绝不出现写死的假汇报文案
    expect(find.text('已收到汇报 · 未读'), findsNothing);

    // 无汇报的卡片（王宁、林悦）显示「暂无汇报」
    expect(find.text('暂无汇报'), findsNWidgets(2));

    // 下属（苏菲）卡片第二行显示岗位「UI 设计师 · 我的直属下属」，不重复姓名
    expect(find.text('UI 设计师 · 我的直属下属'), findsOneWidget);
    expect(find.text('苏菲 · 我的直属下属'), findsNothing);
    expect(find.text('苏菲 · 苏菲'), findsNothing);

    // 苏菲卡片显示真实汇报时间及状态
    expect(find.textContaining('已提交'), findsOneWidget);
  });

  testWidgets('我的职责页面中 _VerticalConnector 渲染宽度为 2 且水平居中', (tester) async {
    const screenWidth = 400.0;
    const screenHeight = 800.0;
    tester.view.physicalSize = const Size(screenWidth, screenHeight);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final harness = await AxisTestHarness.create();
    await tester.pumpWidget(harness.wrap(
      AxisRootScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pumpAndSettle();

    // 经公开界面断言查找连接线
    final connectorFinder = find.byKey(const Key('axis-vertical-connector'));
    expect(connectorFinder, findsWidgets);

    // 每一个连接线的渲染宽度必须为 2，且在屏幕水平正中间
    for (final element in connectorFinder.evaluate()) {
      final box = element.findRenderObject() as RenderBox?;
      expect(box, isNotNull);
      expect(box!.hasSize, isTrue);
      // 宽度为 2
      expect(box.size.width, equals(2.0));
      // 水平居中于屏幕（屏幕宽度 400，中心为 200）
      final globalPos = box.localToGlobal(Offset.zero);
      final centerX = globalPos.dx + box.size.width / 2;
      expect(centerX, closeTo(screenWidth / 2, 0.5));
    }
  });

  testWidgets('菜单“全部拉到人轴”“恢复默认折叠”执行后自动适应屏幕，卡片仍在画布内', (tester) async {
    final harness = await AxisTestHarness.create();
    await tester.pumpWidget(harness.wrap(
      AxisRootScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('项目全貌'));
    await tester.pump(const Duration(milliseconds: 500));

    final screen = Offset.zero & tester.view.physicalSize / tester.view.devicePixelRatio;
    bool inScreen(String k) {
      final f = find.byKey(Key(k));
      if (f.evaluate().isEmpty) return false;
      return screen.overlaps(tester.getRect(f));
    }

    await tester.tap(find.byKey(const Key('axis-more-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('全部拉到人轴'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));
    final persons = find.byWidgetPredicate(
      (w) => w.key is ValueKey<String> &&
          (w.key as ValueKey<String>).value.startsWith('axis-person-') &&
          !(w.key as ValueKey<String>).value.contains('more') &&
          !(w.key as ValueKey<String>).value.contains('add'),
    );
    expect(persons, findsWidgets);
    for (final e in persons.evaluate()) {
      expect(screen.contains(tester.getRect(find.byWidget(e.widget)).center), isTrue,
          reason: '全部拉到人轴后卡片应在屏幕内');
    }

    await tester.tap(find.byKey(const Key('axis-more-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('恢复默认折叠'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));
    expect(inScreen('axis-person-101'), isTrue);
    expect(screen.contains(tester.getRect(find.byKey(const Key('axis-person-101'))).center), isTrue);
  });
}
