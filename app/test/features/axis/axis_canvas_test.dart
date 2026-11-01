import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/axis/data/axis_models.dart';
import 'package:worktodo_app/features/axis/data/axis_tree_mapper.dart';
import 'package:worktodo_app/features/axis/data/axis_view_models.dart';
import 'package:worktodo_app/features/axis/widgets/axis_canvas.dart';
import 'package:worktodo_app/features/axis/widgets/axis_flow_layout.dart';

import 'axis_test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late List<AxisPersonNode> nodes;
  late AxisFlowResult layout;

  setUp(() {
    nodes = AxisTreeMapper.mapTree(
      AxisTestHarness.defaultTree(),
      finalOwnerUserId: AxisTestHarness.pmUserId,
    );
    layout = AxisFlowLayout.compute(
      nodes: nodes,
      orientation: AxisOrientation.vertical,
      spacing: AxisSpacing.standard,
      sort: AxisSort.tree,
    );
  });

  Widget host(Widget child) {
    return MaterialApp(
      theme: ThemeData(platform: TargetPlatform.android, useMaterial3: true),
      home: Scaffold(
        body: SizedBox(width: 1000, height: 1300, child: child),
      ),
    );
  }

  AxisFlowResult layoutOf(WidgetTester tester) {
    // 画布内部重新计算结果；与上面一致，用作拖动向量基准。
    return layout;
  }

  testWidgets('拖动人员卡片到另一位人员上：触发调整上级（人挂人）', (tester) async {
    tester.view.physicalSize = const Size(1100, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    AxisPersonNode? dragged;
    AxisPersonNode? target;
    await tester.pumpWidget(host(AxisCanvas(
      nodes: nodes,
      orientation: AxisOrientation.vertical,
      spacing: AxisSpacing.standard,
      sort: AxisSort.tree,
      canAdjustFinalOwner: true,
      onReparentPerson: (d, t) {
        dragged = d;
        target = t;
      },
    )));
    await tester.pumpAndSettle();

    final from = layoutOf(tester).personById(104)!.center;
    final to = layoutOf(tester).personById(101)!.center;
    await tester.drag(
      find.byKey(const Key('axis-person-104')),
      to - from,
    );
    await tester.pumpAndSettle();

    expect(dragged?.id, 104);
    expect(target?.id, 101);
  });

  testWidgets('拖动事项卡片到另一位人员上：触发事项换责任人', (tester) async {
    tester.view.physicalSize = const Size(1100, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    AxisWorkItem? dragged;
    AxisPersonNode? target;
    await tester.pumpWidget(host(AxisCanvas(
      nodes: nodes,
      orientation: AxisOrientation.vertical,
      spacing: AxisSpacing.standard,
      sort: AxisSort.tree,
      onReparentMatter: (item, person) {
        dragged = item;
        target = person;
      },
    )));
    await tester.pumpAndSettle();

    final matter = layout.matters.firstWhere((m) => m.item.id == 201);
    final person = layout.personById(104)!;
    await tester.drag(
      find.byKey(const Key('axis-matter-201')),
      person.center - matter.rect.center,
    );
    await tester.pumpAndSettle();

    expect(dragged?.id, 201);
    expect(target?.id, 104);
  });

  testWidgets('拖到空白处只保存卡片位置，不改上级', (tester) async {
    tester.view.physicalSize = const Size(1100, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    AxisPersonNode? moved;
    Offset? offset;
    var reparent = 0;
    await tester.pumpWidget(host(AxisCanvas(
      nodes: nodes,
      orientation: AxisOrientation.vertical,
      spacing: AxisSpacing.standard,
      sort: AxisSort.tree,
      onReparentPerson: (_, __) => reparent++,
      onLayoutChanged: (node, value) async {
        moved = node;
        offset = value;
      },
    )));
    await tester.pumpAndSettle();

    await tester.drag(
      find.byKey(const Key('axis-person-101')),
      const Offset(40, 60),
    );
    await tester.pumpAndSettle();

    expect(reparent, 0);
    expect(moved?.id, 101);
    expect(offset?.dx, closeTo(40, 0.5));
    expect(offset?.dy, closeTo(60, 0.5));
  });

  testWidgets('拖动过程中连线实时跟随：画布拿到实时的拖拽位移', (tester) async {
    tester.view.physicalSize = const Size(1100, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(host(AxisCanvas(
      nodes: nodes,
      orientation: AxisOrientation.vertical,
      spacing: AxisSpacing.standard,
      sort: AxisSort.tree,
    )));
    await tester.pumpAndSettle();

    final start = layoutOf(tester).personById(102)!.center;
    final gesture = await tester.startGesture(start);
    await tester.pump();
    await gesture.moveBy(const Offset(56, 40));
    await tester.pump();

    final paint = tester.widgetList<CustomPaint>(
      find.descendant(
        of: find.byType(AxisCanvas),
        matching: find.byType(CustomPaint),
      ),
    );
    AxisCurvePainter? painter;
    for (final item in paint) {
      if (item.painter is AxisCurvePainter) {
        painter = item.painter as AxisCurvePainter;
      }
    }
    expect(painter, isNotNull);
    expect(painter!.liveDeltas[102], const Offset(56, 40));

    await gesture.up();
    await tester.pumpAndSettle();
  });

  testWidgets('终责卡无权限时不能拖动，有权限时只沿主干调整', (tester) async {
    tester.view.physicalSize = const Size(1100, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    String? notice;
    double? delta;
    await tester.pumpWidget(host(AxisCanvas(
      nodes: nodes,
      orientation: AxisOrientation.vertical,
      spacing: AxisSpacing.standard,
      sort: AxisSort.tree,
      canAdjustFinalOwner: false,
      onNotice: (value) => notice = value,
      onFinalOwnerChanged: (value) => delta = value,
    )));
    await tester.pumpAndSettle();

    await tester.drag(
      find.byKey(const Key('axis-person-103')),
      const Offset(0, -60),
    );
    await tester.pumpAndSettle();
    expect(notice, contains('仅项目负责人或创建者可调'));
    expect(delta, isNull);

    await tester.pumpWidget(host(AxisCanvas(
      nodes: nodes,
      orientation: AxisOrientation.vertical,
      spacing: AxisSpacing.standard,
      sort: AxisSort.tree,
      canAdjustFinalOwner: true,
      onFinalOwnerChanged: (value) => delta = value,
    )));
    await tester.pumpAndSettle();
    await tester.drag(
      find.byKey(const Key('axis-person-103')),
      const Offset(0, 80),
    );
    await tester.pumpAndSettle();
    expect(delta, closeTo(80, 0.5));
  });
}
