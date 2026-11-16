import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/axis/data/axis_view_models.dart';
import 'package:worktodo_app/features/axis/screens/axis_node_detail_screen.dart';
import 'package:worktodo_app/features/axis/screens/axis_root_screen.dart';
import 'package:worktodo_app/features/axis/widgets/axis_canvas.dart';
import 'axis_test_harness.dart';

void main() {
  setUp(() {
    final dispatcher = TestWidgetsFlutterBinding.instance.platformDispatcher;
    dispatcher.accessibilityFeaturesTestValue =
        const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(dispatcher.clearAccessibilityFeaturesTestValue);
    addTearDown(resetToastForTesting);
  });

  Future<void> pumpScreen(WidgetTester tester, AxisTestHarness harness,
      {bool canvas = false}) async {
    tester.view.physicalSize = const Size(430, 1500);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(harness.wrap(canvas
        ? AxisRootScreen(
            api: harness.api,
            authState: harness.authState,
            initialTab: AxisViewTab.overview)
        : AxisNodeDetailScreen(nodeId: 102, projectId: 1, api: harness.api)));
    await tester.pumpAndSettle();
  }

  Future<void> openForm(WidgetTester tester) async {
    await tester.tap(find.byKey(const Key('axis-add-matter')));
    await tester.pumpAndSettle();
    expect(find.text('挂载人员：林悦'), findsOneWidget);
  }

  for (final entry
      in {'work_item': '工作项', 'milestone': '里程碑', 'scope': '范围'}.entries) {
    testWidgets('人员详情添加${entry.value}固定挂到该人，保存后刷新', (tester) async {
      final harness = await AxisTestHarness.create();
      await pumpScreen(tester, harness);
      await openForm(tester);
      await tester.tap(find.byKey(const Key('axis-matter-type')));
      await tester.pumpAndSettle();
      await tester.tap(find.text(entry.value).last);
      await tester.pumpAndSettle();
      await tester.enterText(
          find.byKey(const Key('axis-matter-title')), '新增${entry.value}');
      await tester.enterText(
          find.byKey(const Key('axis-matter-date')), '2026-12-20');
      harness.helper.whenPost('/projects/1/nodes', {'id': 300});
      final tree = AxisTestHarness.defaultTree();
      ((tree.first['children'] as List).first['children'] as List).add(
          AxisTestHarness.workItem(
              id: 300,
              parentId: 102,
              title: '新增${entry.value}',
              type: entry.key));
      harness.helper.whenGet('/projects/1/tree', {'nodes': tree},
          query: {'format': 'nested'});
      await tester.tap(find.byKey(const Key('axis-matter-save')));
      await tester.pumpAndSettle();
      final request = harness.helper.history.singleWhere(
          (r) => r.method == 'POST' && r.url.path.endsWith('/nodes'));
      expect(request.body, containsPair('parent_id', 102));
      expect(request.body, containsPair('node_type_key', entry.key));
      expect(request.body, containsPair('title', '新增${entry.value}'));
      expect(
          request.body,
          containsPair(entry.key == 'milestone' ? 'milestone_at' : 'due_at',
              '2026-12-20T23:59:59'));
      expect(find.byKey(const Key('axis-matter-save')), findsNothing);
      expect(find.text('新增${entry.value}'), findsOneWidget);
      expect(tester.takeException(), isNull);
      resetToastForTesting();
    });
  }

  for (final status in [403, 409, 422]) {
    testWidgets('后端 $status 拒绝时中文提示并保留事项草稿', (tester) async {
      final harness = await AxisTestHarness.create();
      harness.helper.whenPost('/projects/1/nodes',
          AxisTestHarness.errorBody(status * 100, '上级节点未开放此项新增权限'),
          statusCode: status);
      await pumpScreen(tester, harness);
      await openForm(tester);
      await tester.enterText(
          find.byKey(const Key('axis-matter-title')), '保留的草稿');
      await tester.tap(find.byKey(const Key('axis-matter-save')));
      await tester.pumpAndSettle();
      expect(find.text('上级节点未开放此项新增权限'), findsOneWidget);
      expect(find.widgetWithText(TextField, '保留的草稿'), findsOneWidget);
      expect(tester.takeException(), isNull);
      resetToastForTesting();
    });
  }

  testWidgets('人员禁用新增时详情按钮置灰并说明，不发创建请求', (tester) async {
    final permissions = AxisTestHarness.defaultPermissions(isPm: false);
    (permissions['node_permissions'] as Map)['102']['can_add_work_item'] =
        false;
    final tree = AxisTestHarness.defaultTree();
    ((tree.first['children'] as List).first['responsibility_permissions']
        as Map)['allow_add_work_items'] = false;
    final harness =
        await AxisTestHarness.create(tree: tree, permissions: permissions);
    await pumpScreen(tester, harness);
    final button =
        tester.widget<AppButton>(find.byKey(const Key('axis-add-matter')));
    expect(button.onPressed, isNull);
    expect(find.textContaining('未开放'), findsWidgets);
    expect(harness.helper.history.where((r) => r.method == 'POST'), isEmpty);
  });

  testWidgets('服务端允许管理者越过人员新增关闭策略', (tester) async {
    final tree = AxisTestHarness.defaultTree();
    ((tree.first['children'] as List).first['responsibility_permissions']
        as Map)['allow_add_work_items'] = false;
    final harness = await AxisTestHarness.create(isPm: true, tree: tree);
    await pumpScreen(tester, harness);
    expect(
        tester
            .widget<AppButton>(find.byKey(const Key('axis-add-matter')))
            .onPressed,
        isNotNull);
    await openForm(tester);
    await tester.enterText(find.byKey(const Key('axis-matter-title')), '管理者事项');
    harness.helper.whenPost('/projects/1/nodes', {'id': 310});
    await tester.tap(find.byKey(const Key('axis-matter-save')));
    await tester.pumpAndSettle();
    expect(
        harness.helper.history
            .where((r) => r.method == 'POST' && r.url.path.endsWith('/nodes')),
        hasLength(1));
    resetToastForTesting();
  });

  testWidgets('创建校验空名称、非法日期且失败保留表单，取消不写入', (tester) async {
    final harness = await AxisTestHarness.create();
    await pumpScreen(tester, harness);
    await openForm(tester);
    await tester.tap(find.byKey(const Key('axis-matter-save')));
    await tester.pumpAndSettle();
    expect(find.text('事项名称不能为空'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('axis-matter-title')), '日期校验');
    await tester.enterText(
        find.byKey(const Key('axis-matter-date')), '2026-02-30');
    await tester.tap(find.byKey(const Key('axis-matter-save')));
    await tester.pumpAndSettle();
    expect(find.textContaining('请输入有效日期'), findsOneWidget);
    await tester.tap(find.text('取消'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('axis-matter-save')), findsNothing);
    expect(harness.helper.history.where((r) => r.method == 'POST'), isEmpty);
  });

  testWidgets('后端英文错误回退为中文创建提示', (tester) async {
    final harness = await AxisTestHarness.create();
    harness.helper.whenPost(
        '/projects/1/nodes', AxisTestHarness.errorBody(40300, 'Forbidden'),
        statusCode: 403);
    await pumpScreen(tester, harness);
    await openForm(tester);
    await tester.enterText(find.byKey(const Key('axis-matter-title')), '保留草稿');
    await tester.tap(find.byKey(const Key('axis-matter-save')));
    await tester.pumpAndSettle();
    expect(find.textContaining('添加事项失败'), findsOneWidget);
    expect(find.text('Forbidden'), findsNothing);
  });

  testWidgets('画布添加事项禁用时菜单可见原因，点击不打开表单', (tester) async {
    final permissions = AxisTestHarness.defaultPermissions(isPm: false);
    (permissions['node_permissions'] as Map)['102']['can_add_work_item'] =
        false;
    final harness = await AxisTestHarness.create(permissions: permissions);
    await pumpScreen(tester, harness, canvas: true);
    tester
        .widget<AxisCanvas>(find.byType(AxisCanvas))
        .viewportController!
        .focusNode(102);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('axis-person-102')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('axis-person-more-102')));
    await tester.pumpAndSettle();
    final tile =
        tester.widget<ListTile>(find.byKey(const Key('axis-add-matter')));
    expect(tile.enabled, isFalse);
    expect(tile.onTap, isNull);
    expect(find.textContaining('未开放'), findsOneWidget);
  });

  for (final configured in [false, true]) {
    testWidgets('画布配置=$configured：已有多事项时创建后新事项可见', (tester) async {
      final tree = AxisTestHarness.defaultTree();
      final children =
          (tree.first['children'] as List).first['children'] as List;
      for (var id = 210; id < 214; id++) {
        children.add(
            AxisTestHarness.workItem(id: id, parentId: 102, title: '原事项$id'));
      }
      final harness = await AxisTestHarness.create(tree: tree);
      if (configured) {
        harness.helper.whenGet('/projects/1', {
          ...AxisTestHarness.projectJson(),
          'card_template_json': {
            'fields': ['name']
          }
        });
        harness.helper.whenGet('/users/me/ui-prefs', {'ui': {}});
      }
      await pumpScreen(tester, harness, canvas: true);
      final canvas = tester.widget<AxisCanvas>(find.byType(AxisCanvas));
      canvas.viewportController!.focusNode(102);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(
          Key(configured ? 'axis-person-select-102' : 'axis-person-102')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('axis-person-more-102')));
      await tester.pumpAndSettle();
      await openForm(tester);
      await tester.enterText(
          find.byKey(const Key('axis-matter-title')), '画布新工作');
      harness.helper.whenPost('/projects/1/nodes', {'id': 300});
      ((tree.first['children'] as List).first['children'] as List).add(
          AxisTestHarness.workItem(id: 300, parentId: 102, title: '画布新工作'));
      harness.helper.whenGet('/projects/1/tree', {'nodes': tree},
          query: {'format': 'nested'},
          delay: const Duration(milliseconds: 300));
      await tester.tap(find.byKey(const Key('axis-matter-save')));
      await tester.pumpAndSettle();
      expect(find.textContaining('画布新工作'), findsOneWidget);
      expect(find.text('事项已添加'), findsOneWidget);
      expect(tester.widget<AxisCanvas>(find.byType(AxisCanvas)).selectedNodeId,
          102);
      expect(tester.takeException(), isNull);
      resetToastForTesting();
    });
  }
}
