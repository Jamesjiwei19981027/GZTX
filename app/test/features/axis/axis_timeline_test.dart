import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:worktodo_app/features/axis/data/axis_models.dart';
import 'package:worktodo_app/features/axis/data/axis_timeline.dart';
import 'package:worktodo_app/features/axis/data/axis_view_models.dart';
import 'package:worktodo_app/features/axis/widgets/axis_flow_layout.dart';
import 'package:worktodo_app/features/axis/widgets/axis_canvas.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/features/axis/state/axis_controller.dart';
import 'package:worktodo_app/features/axis/screens/axis_root_screen.dart';
import 'axis_test_harness.dart';

AxisPersonNode owner(int id, List<DateTime?> dates) => AxisPersonNode(
        id: id,
        parentId: null,
        title: '人员$id',
        description: null,
        name: '人员$id',
        roleTitle: '',
        department: '',
        nodeOrigin: 'project',
        isTerminalPm: false,
        ownerUserIds: [],
        responsibilityPermissions: {},
        workItems: [
          for (var i = 0; i < dates.length; i++)
            AxisWorkItem(
                id: id * 10 + i,
                title: '事项$i',
                nodeTypeKey: 'work_item',
                status: 'in_progress',
                percent: 20,
                dueAt: dates[i]),
        ]);

void main() {
  test('树序时间序持久化重载恢复', () async {
    final harness = await AxisTestHarness.create();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(AxisController.sortKey, 'time');
    final controller =
        AxisController(api: harness.api, projectId: 1, currentUserId: 11);
    addTearDown(controller.dispose);
    await controller.load();
    expect(controller.sort, AxisSort.time);
    controller.setSort(AxisSort.tree);
    await Future<void>.delayed(Duration.zero);
    expect(prefs.getString(AxisController.sortKey), 'tree');
  });
  test('日期比例定位，重复日期分道，不编造无日期事项', () {
    final nodes = [
      owner(1, [
        DateTime(2026, 11, 1),
        DateTime(2026, 11, 1),
        DateTime(2026, 11, 3)
      ]),
      owner(2, [DateTime(2026, 11, 2), null])
    ];
    for (final orientation in AxisOrientation.values) {
      final timeline =
          buildAxisTimeline(nodes, orientation: orientation, cross: -100);
      expect(timeline.items.length, 4);
      final early = timeline.items.firstWhere((entry) => entry.item.id == 10);
      final sameDay = timeline.items.firstWhere((entry) => entry.item.id == 11);
      final late = timeline.items.firstWhere((entry) => entry.item.id == 12);
      final middle = timeline.items.firstWhere((entry) => entry.item.id == 20);
      expect(middle.along - early.along, late.along - middle.along);
      expect(early.along, sameDay.along);
      expect(early.rect.overlaps(sameDay.rect), isFalse);
      expect(
          orientation == AxisOrientation.horizontal
              ? early.anchor.dx
              : early.anchor.dy,
          early.along);
      expect(
          orientation == AxisOrientation.horizontal
              ? early.rect.center.dx
              : early.rect.center.dy,
          early.along);
      expect(timeline.ticks.length, greaterThanOrEqualTo(2));
    }
    expect(buildAxisTimeline([], orientation: AxisOrientation.vertical).items,
        isEmpty);
  });

  test('时间序完整事项纳入取景边界，树序不增加事项卡片', () {
    final nodes = [
      owner(1, [DateTime(2026, 11, 1), DateTime(2026, 11, 3)])
    ];
    for (final orientation in AxisOrientation.values) {
      final layout = AxisFlowLayout.compute(
          nodes: nodes,
          orientation: orientation,
          spacing: AxisSpacing.standard,
          sort: AxisSort.time);
      expect(layout.timeline!.items.length, 2);
      for (final entry in layout.timeline!.items) {
        expect(layout.contentBounds.contains(entry.rect.topLeft), isTrue);
        expect(
            layout.contentBounds
                .contains(entry.rect.bottomRight - const Offset(.01, .01)),
            isTrue);
      }
    }
    expect(
        AxisFlowLayout.compute(
                nodes: nodes,
                orientation: AxisOrientation.vertical,
                spacing: AxisSpacing.standard,
                sort: AxisSort.tree)
            .timeline,
        isNull);
  });

  testWidgets('横纵时间序实际卡片按日期定位可点击，树序恢复人员画布', (tester) async {
    tester.view.physicalSize = const Size(900, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final nodes = [
      owner(1, [DateTime(2026, 11, 1), DateTime(2026, 11, 3)])
    ];
    int? opened;
    Widget host(AxisOrientation orientation, AxisSort sort) => MaterialApp(
        home: Scaffold(
            body: MediaQuery(
                data: const MediaQueryData(disableAnimations: true),
                child: AxisCanvas(
                    nodes: nodes,
                    orientation: orientation,
                    spacing: AxisSpacing.standard,
                    sort: sort,
                    onOpenMatter: (item, _) => opened = item.id))));
    for (final orientation in AxisOrientation.values) {
      await tester.pumpWidget(host(orientation, AxisSort.time));
      await tester.pumpAndSettle();
      final early = find.byKey(const Key('axis-timeline-matter-10'));
      final late = find.byKey(const Key('axis-timeline-matter-11'));
      expect(early, findsOneWidget);
      expect(late, findsOneWidget);
      final earlyCenter = tester.getCenter(early),
          lateCenter = tester.getCenter(late);
      expect(
          orientation == AxisOrientation.horizontal
              ? lateCenter.dx
              : lateCenter.dy,
          greaterThan(orientation == AxisOrientation.horizontal
              ? earlyCenter.dx
              : earlyCenter.dy));
      await tester.tap(early);
      expect(opened, 10);
      expect(tester.takeException(), isNull);
    }
    await tester.pumpWidget(host(AxisOrientation.vertical, AxisSort.tree));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('axis-timeline-matter-10')), findsNothing);
  });

  testWidgets('项目全貌菜单切换树序时间序后时间事项出现和消失', (tester) async {
    final dispatcher = tester.binding.platformDispatcher;
    dispatcher.accessibilityFeaturesTestValue =
        const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(dispatcher.clearAccessibilityFeaturesTestValue);
    tester.view.physicalSize = const Size(430, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final item = {
      ...AxisTestHarness.workItem(id: 201, parentId: 102, title: '日期事项'),
      'due_at': '2026-11-10T12:00:00'
    };
    final harness = await AxisTestHarness.create(tree: [
      AxisTestHarness.personNode(
          id: 102,
          parentId: null,
          name: '林悦',
          role: '设计负责人',
          department: '设计部',
          userId: 11,
          children: [item])
    ]);
    await tester.pumpWidget(harness
        .wrap(AxisRootScreen(api: harness.api, authState: harness.authState)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('项目全貌'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('axis-more-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('时间序'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('axis-timeline-matter-201')), findsOneWidget);
    await tester.tap(find.byKey(const Key('axis-more-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('树序'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('axis-timeline-matter-201')), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
