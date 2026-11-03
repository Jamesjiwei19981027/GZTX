import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/axis/data/axis_models.dart';
import 'package:worktodo_app/features/axis/data/axis_tree_mapper.dart';
import 'package:worktodo_app/features/axis/data/axis_view_models.dart';
import 'package:worktodo_app/features/axis/widgets/axis_canvas.dart';
import 'package:worktodo_app/features/axis/widgets/axis_flow_layout.dart';

import 'axis_test_harness.dart';

AxisWorkItem task(int id, String title, {DateTime? dueAt}) => AxisWorkItem(
  id: id,
  title: title,
  nodeTypeKey: 'work_item',
  status: 'in_progress',
  percent: 10,
  dueAt: dueAt,
);

AxisPersonNode person(
  int id,
  int? parentId, {
  List<AxisWorkItem> workItems = const [],
}) => AxisPersonNode(
  id: id,
  parentId: parentId,
  title: '人员$id',
  description: null,
  name: '人员$id',
  roleTitle: '岗位',
  department: '部门',
  nodeOrigin: parentId == null ? 'project' : 'subordinate',
  isTerminalPm: parentId == null,
  ownerUserIds: const [],
  workItems: workItems,
  responsibilityPermissions: const {},
);

/// 根 1 下有 2、3；2 下有 4。
List<AxisPersonNode> sampleTree() => [
  person(1, null),
  person(2, 1),
  person(3, 1),
  person(4, 2),
];

Widget host(Widget child, {bool disableAnimations = false}) {
  return MaterialApp(
    theme: ThemeData(platform: TargetPlatform.android, useMaterial3: true),
    builder: (context, app) => MediaQuery(
      data: MediaQuery.of(
        context,
      ).copyWith(disableAnimations: disableAnimations),
      child: app!,
    ),
    home: Scaffold(
      body: SizedBox(width: 1400, height: 1300, child: child),
    ),
  );
}

AxisCurvePainter painterOf(WidgetTester tester) => tester
    .widgetList<CustomPaint>(
      find.descendant(
        of: find.byType(AxisCanvas),
        matching: find.byType(CustomPaint),
      ),
    )
    .map((e) => e.painter)
    .whereType<AxisCurvePainter>()
    .single;

void bigView(WidgetTester tester) {
  tester.view.physicalSize = const Size(1500, 1400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final defaultNodes = AxisTreeMapper.mapTree(
    AxisTestHarness.defaultTree(),
    finalOwnerUserId: AxisTestHarness.pmUserId,
  );

  AxisFlowResult layoutFor(
    List<AxisPersonNode> nodes, {
    AxisOrientation orientation = AxisOrientation.vertical,
  }) => AxisFlowLayout.compute(
    nodes: nodes,
    orientation: orientation,
    spacing: AxisSpacing.standard,
    sort: AxisSort.tree,
  );

  testWidgets('拖动人员卡片到另一位人员上：触发调整上级（人挂人）', (tester) async {
    bigView(tester);
    AxisPersonNode? dragged;
    AxisPersonNode? target;
    await tester.pumpWidget(
      host(
        AxisCanvas(
          nodes: defaultNodes,
          orientation: AxisOrientation.vertical,
          spacing: AxisSpacing.standard,
          sort: AxisSort.tree,
          onReparentPerson: (d, t) {
            dragged = d;
            target = t;
          },
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));

    final layout = layoutFor(defaultNodes);
    final from = layout.personById(104)!.center;
    final to = layout.personById(101)!.center;
    await tester.drag(find.byKey(const Key('axis-person-104')), to - from);
    await tester.pump(const Duration(milliseconds: 100));

    expect(dragged?.id, 104);
    expect(target?.id, 101);
  });

  testWidgets('拖到空白处只保存卡片位置，不改上级（曲线模式不吸附）', (tester) async {
    bigView(tester);
    AxisPersonNode? moved;
    Offset? offset;
    var reparent = 0;
    await tester.pumpWidget(
      host(
        AxisCanvas(
          nodes: defaultNodes,
          orientation: AxisOrientation.vertical,
          spacing: AxisSpacing.standard,
          sort: AxisSort.tree,
          onReparentPerson: (_, __) => reparent++,
          onLayoutChanged: (node, value) async {
            moved = node;
            offset = value;
          },
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));

    await tester.drag(
      find.byKey(const Key('axis-person-101')),
      const Offset(40, 60),
    );
    await tester.pump(const Duration(milliseconds: 100));

    expect(reparent, 0);
    expect(moved?.id, 101);
    expect(offset?.dx, closeTo(40, 0.5));
    expect(offset?.dy, closeTo(60, 0.5));
  });

  testWidgets('拖动过程中连线实时跟随：画布拿到实时的拖拽位移', (tester) async {
    bigView(tester);
    await tester.pumpWidget(
      host(
        AxisCanvas(
          nodes: defaultNodes,
          orientation: AxisOrientation.vertical,
          spacing: AxisSpacing.standard,
          sort: AxisSort.tree,
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));

    final gesture = await tester.startGesture(
      tester.getTopLeft(find.byKey(const Key('axis-person-102'))) +
          const Offset(30, 20),
    );
    await tester.pump();
    await gesture.moveBy(const Offset(56, 40));
    await tester.pump();

    expect(painterOf(tester).liveDeltas[102], const Offset(56, 40));

    await gesture.up();
    await tester.pump(const Duration(milliseconds: 100));
  });

  group('直线模式吸附', () {
    // 纵向：根 1 在 x=144，孩子 2 在 x=0（中心 120，与根中心 264 差 -144）。
    // 向右拖 134 后中心差 -10（< 16），松手应对齐到根中心：x 偏移 +144。
    Future<Offset?> dragSecondChild(
      WidgetTester tester, {
      required AxisEdgeStyle style,
      required double dx,
    }) async {
      bigView(tester);
      Offset? saved;
      final nodes = [person(1, null), person(2, 1), person(3, 1)];
      await tester.pumpWidget(
        host(
          AxisCanvas(
            nodes: nodes,
            orientation: AxisOrientation.vertical,
            spacing: AxisSpacing.standard,
            sort: AxisSort.tree,
            edgeStyle: style,
            onLayoutChanged: (node, value) async {
              if (node.id == 2) saved = value;
            },
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));
      await tester.drag(find.byKey(const Key('axis-person-2')), Offset(dx, 0));
      await tester.pump(const Duration(milliseconds: 100));
      return saved;
    }

    testWidgets('偏差 10px 处松手：收到对齐后的偏移', (tester) async {
      final saved = await dragSecondChild(
        tester,
        style: AxisEdgeStyle.straight,
        dx: 134,
      );
      expect(saved, isNotNull);
      expect(saved!.dx, closeTo(144, 0.01));
      expect(saved.dy, closeTo(0, 0.01));
    });

    testWidgets('偏差 20px 处松手：不吸附，按手指位置保存', (tester) async {
      final saved = await dragSecondChild(
        tester,
        style: AxisEdgeStyle.straight,
        dx: 124,
      );
      expect(saved!.dx, closeTo(124, 0.5));
    });

    testWidgets('曲线模式同样的拖动不吸附', (tester) async {
      final saved = await dragSecondChild(
        tester,
        style: AxisEdgeStyle.curve,
        dx: 134,
      );
      expect(saved!.dx, closeTo(134, 0.5));
    });

    testWidgets('吸附时画出对齐参考线，松手后消失', (tester) async {
      bigView(tester);
      final nodes = [person(1, null), person(2, 1), person(3, 1)];
      await tester.pumpWidget(
        host(
          AxisCanvas(
            nodes: nodes,
            orientation: AxisOrientation.vertical,
            spacing: AxisSpacing.standard,
            sort: AxisSort.tree,
            edgeStyle: AxisEdgeStyle.straight,
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));
      expect(painterOf(tester).referenceLineStart, isNull);
      final gesture = await tester.startGesture(
        tester.getCenter(find.byKey(const Key('axis-person-2'))),
      );
      await gesture.moveBy(const Offset(30, 0));
      await gesture.moveBy(const Offset(104, 0));
      await tester.pump();
      expect(painterOf(tester).referenceLineStart, isNotNull);
      expect(painterOf(tester).referenceLineEnd, isNotNull);
      await gesture.up();
      await tester.pump(const Duration(milliseconds: 100));
      expect(painterOf(tester).referenceLineStart, isNull);
    });
  });

  group('选中与高亮', () {
    testWidgets('点按选中某人：高亮到根的链路和到直接下属的连线，其余变淡；再点取消', (tester) async {
      bigView(tester);
      int? selected = -1;
      await tester.pumpWidget(
        host(
          AxisCanvas(
            nodes: sampleTree(),
            orientation: AxisOrientation.vertical,
            spacing: AxisSpacing.standard,
            sort: AxisSort.tree,
            onSelectPerson: (id) => selected = id,
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));
      expect(painterOf(tester).highlighted, isEmpty);
      expect(painterOf(tester).focusActive, isFalse);

      final card = find.byKey(const Key('axis-person-2'));
      // 点卡片左上的姓名区域，避开任务行和底部。
      final tapAt = tester.getTopLeft(card) + const Offset(30, 20);
      await tester.tapAt(tapAt);
      await tester.pump(const Duration(milliseconds: 100));
      expect(selected, 2);
      expect(painterOf(tester).highlighted, {'1-2', '2-4'});
      expect(painterOf(tester).focusActive, isTrue);

      await tester.tapAt(tapAt);
      await tester.pump(const Duration(milliseconds: 100));
      expect(selected, isNull);
      expect(painterOf(tester).highlighted, isEmpty);
      expect(painterOf(tester).focusActive, isFalse);
    });

    testWidgets('选中后高亮边用强调色加粗，其余边透明度 0.25', (tester) async {
      bigView(tester);
      await tester.pumpWidget(
        host(
          AxisCanvas(
            nodes: sampleTree(),
            orientation: AxisOrientation.vertical,
            spacing: AxisSpacing.standard,
            sort: AxisSort.tree,
            selectedNodeId: 3,
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));
      // 选中 3：只有 1-3 高亮；1-2 与 2-4 变淡。
      expect(painterOf(tester).highlighted, {'1-3'});
      expect(painterOf(tester).focusActive, isTrue);
    });
  });

  group('连线流动动画', () {
    testWidgets('默认播放：只有一个动画在跑，重建后也不会重复创建', (tester) async {
      bigView(tester);
      Widget build() => host(
        AxisCanvas(
          nodes: sampleTree(),
          orientation: AxisOrientation.vertical,
          spacing: AxisSpacing.standard,
          sort: AxisSort.tree,
        ),
      );
      await tester.pumpWidget(build());
      await tester.pump(const Duration(milliseconds: 100));
      expect(painterOf(tester).animation, isNotNull);
      expect(tester.binding.transientCallbackCount, 1);

      final before = painterOf(tester).animationValue;
      await tester.pump(const Duration(milliseconds: 300));
      expect(painterOf(tester).animationValue, isNot(before));

      for (var i = 0; i < 3; i++) {
        await tester.pumpWidget(build());
        await tester.pump(const Duration(milliseconds: 50));
      }
      expect(tester.binding.transientCallbackCount, 1);
    });

    testWidgets('系统开启“减少动态效果”：不创建动画，画静态虚线', (tester) async {
      bigView(tester);
      await tester.pumpWidget(
        host(
          AxisCanvas(
            nodes: sampleTree(),
            orientation: AxisOrientation.vertical,
            spacing: AxisSpacing.standard,
            sort: AxisSort.tree,
          ),
          disableAnimations: true,
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));
      expect(painterOf(tester).animation, isNull);
      expect(painterOf(tester).animationValue, 0);
      expect(tester.binding.transientCallbackCount, 0);
      // 没有持续的帧回调，pumpAndSettle 可以直接结束。
      await tester.pumpAndSettle();
    });

    testWidgets('运行中改为“减少动态效果”：动画被释放', (tester) async {
      bigView(tester);
      Widget build(bool disabled) => host(
        AxisCanvas(
          nodes: sampleTree(),
          orientation: AxisOrientation.vertical,
          spacing: AxisSpacing.standard,
          sort: AxisSort.tree,
        ),
        disableAnimations: disabled,
      );
      await tester.pumpWidget(build(false));
      await tester.pump(const Duration(milliseconds: 100));
      expect(tester.binding.transientCallbackCount, 1);
      await tester.pumpWidget(build(true));
      await tester.pump(const Duration(milliseconds: 100));
      expect(tester.binding.transientCallbackCount, 0);
      expect(painterOf(tester).animation, isNull);
    });
  });

  group('画笔', () {
    AxisCurvePainter make({
      AxisEdgeStyle style = AxisEdgeStyle.curve,
      Set<String> highlighted = const {},
      bool focus = false,
      required AxisFlowResult layout,
    }) => AxisCurvePainter(
      layout: layout,
      liveDeltas: const {},
      orientation: AxisOrientation.vertical,
      edgeStyle: style,
      isDark: false,
      highlighted: highlighted,
      focusActive: focus,
    );

    test('线型、高亮、聚焦变化时需要重绘', () {
      final layout = layoutFor(sampleTree());
      final base = make(layout: layout);
      expect(make(layout: layout).shouldRepaint(base), isFalse);
      expect(
        make(
          layout: layout,
          style: AxisEdgeStyle.straight,
        ).shouldRepaint(base),
        isTrue,
      );
      expect(
        make(layout: layout, highlighted: {'1-2'}).shouldRepaint(base),
        isTrue,
      );
      expect(make(layout: layout, focus: true).shouldRepaint(base), isTrue);
    });
  });

  group('卡片内容', () {
    final today = DateTime(2026, 11, 3, 9);
    final tasks = [
      task(11, '已逾期任务', dueAt: DateTime(2026, 11, 1)),
      task(12, '本周任务', dueAt: DateTime(2026, 11, 8)),
      task(13, '没有日期'),
    ];

    Future<void> pumpCards(
      WidgetTester tester, {
      void Function(AxisWorkItem, int)? onMatter,
      void Function(AxisPersonNode)? onPerson,
    }) async {
      bigView(tester);
      await tester.pumpWidget(
        host(
          AxisCanvas(
            nodes: [
              person(1, null, workItems: tasks),
              person(2, 1, workItems: [task(21, '唯一任务')]),
              person(3, 1),
            ],
            orientation: AxisOrientation.vertical,
            spacing: AxisSpacing.standard,
            sort: AxisSort.tree,
            onOpenMatter: onMatter,
            onOpenPerson: onPerson,
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));
    }

    testWidgets('卡片固定 240x168；最多显示 2 条任务，底部提示还有 N 项', (tester) async {
      await withClock(Clock.fixed(today), () async {
        await pumpCards(tester);
        expect(
          tester.getSize(find.byKey(const Key('axis-person-1'))),
          const Size(240, 168),
        );
        expect(find.text('已逾期任务'), findsOneWidget);
        expect(find.text('本周任务'), findsOneWidget);
        expect(find.text('没有日期'), findsNothing);
        expect(find.text('还有 1 项，点开查看'), findsOneWidget);
        expect(find.text('共 1 项'), findsOneWidget);
        expect(find.text('暂无任务'), findsOneWidget);
        expect(find.text('终责'), findsOneWidget);
      });
    });

    testWidgets('截止日期显示 MM/DD，逾期用危险色，未逾期不用', (tester) async {
      await withClock(Clock.fixed(today), () async {
        await pumpCards(tester);
        Color? colorOf(String text) =>
            tester.widget<Text>(find.text(text)).style?.color;
        expect(colorOf('11/01'), AppColors.danger);
        expect(colorOf('已逾期任务'), AppColors.danger);
        expect(colorOf('11/08'), isNot(AppColors.danger));
        expect(colorOf('本周任务'), isNot(AppColors.danger));
      });
    });

    testWidgets('点任务行打开该任务；点底部打开该人员详情', (tester) async {
      await withClock(Clock.fixed(today), () async {
        AxisWorkItem? opened;
        int? owner;
        AxisPersonNode? openedPerson;
        await pumpCards(
          tester,
          onMatter: (item, ownerId) {
            opened = item;
            owner = ownerId;
          },
          onPerson: (node) => openedPerson = node,
        );
        await tester.tap(find.text('本周任务'));
        await tester.pump(const Duration(milliseconds: 50));
        expect(opened?.id, 12);
        expect(owner, 1);
        expect(openedPerson, isNull);

        await tester.tap(find.text('还有 1 项，点开查看'));
        await tester.pump(const Duration(milliseconds: 50));
        expect(openedPerson?.id, 1);
      });
    });
  });
}
