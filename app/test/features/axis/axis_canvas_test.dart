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

  testWidgets('拖动人员卡片到另一位人员上：停留 300ms 触发调整上级（人挂人）', (tester) async {
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
          permissions: const AxisPermissions(
            canEditAll: true,
            nodePermissions: {
              '104': {'can_add_subordinate': true},
              '102': {'can_change_supervisor': true},
            },
          ),
          onReparentPerson: (d, t) {
            dragged = d;
            target = t;
          },
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));

    final from = tester.getCenter(find.byKey(const Key('axis-person-102')));
    final to = tester.getCenter(find.byKey(const Key('axis-person-104')));
    final gesture = await tester.startGesture(from);
    await tester.pump();
    await gesture.moveTo(to);
    await tester.pump(const Duration(milliseconds: 400));
    await gesture.up();
    await tester.pump(const Duration(milliseconds: 100));

    expect(dragged?.id, 102);
    expect(target?.id, 104);
  });

  testWidgets('拖到空白处只保存卡片位置，不改上级（曲线模式不吸附）', (tester) async {
    bigView(tester);
    AxisPersonNode? moved;
    Offset? offset;
    var reparent = 0;
    final viewport = AxisViewportController();
    await tester.pumpWidget(
      host(
        AxisCanvas(
          nodes: defaultNodes,
          orientation: AxisOrientation.vertical,
          spacing: AxisSpacing.standard,
          sort: AxisSort.tree,
          viewportController: viewport,
          onReparentPerson: (_, __) => reparent++,
          onLayoutChanged: (node, value) async {
            moved = node;
            offset = value;
          },
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));
    viewport.setScale(1.0);
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

  for (final scale in [0.5, 0.75]) {
    testWidgets('缩放 $scale 下拖动：卡片跟手，画布偏移 = 屏幕距离 / 缩放', (tester) async {
      bigView(tester);
      Offset? offset;
      final viewport = AxisViewportController();
      await tester.pumpWidget(
        host(
          AxisCanvas(
            nodes: defaultNodes,
            orientation: AxisOrientation.vertical,
            spacing: AxisSpacing.standard,
            sort: AxisSort.tree,
            viewportController: viewport,
            onLayoutChanged: (node, value) async => offset = value,
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));
      viewport.setScale(scale);
      await tester.pump(const Duration(milliseconds: 100));

      final card = find.byKey(const Key('axis-person-101'));
      final before = tester.getTopLeft(card);
      const screen = Offset(60, 40);
      final gesture = await tester.startGesture(tester.getCenter(card));
      await tester.pump();
      await gesture.moveBy(const Offset(30, 20));
      await tester.pump();
      await gesture.moveBy(const Offset(30, 20));
      await tester.pump();
      // 拖动中卡片屏幕位移应等于手指位移（跟手）。
      final during = tester.getTopLeft(card);
      expect(during.dx - before.dx, closeTo(screen.dx, 1.0));
      expect(during.dy - before.dy, closeTo(screen.dy, 1.0));
      await gesture.up();
      await tester.pump(const Duration(milliseconds: 100));

      expect(offset, isNotNull);
      expect(offset!.dx, closeTo(screen.dx / scale, 1.0));
      expect(offset!.dy, closeTo(screen.dy / scale, 1.0));
    });

    testWidgets('缩放 $scale 下拖到另一人员上：悬停目标判定正确', (tester) async {
      bigView(tester);
      AxisPersonNode? dragged;
      AxisPersonNode? target;
      final viewport = AxisViewportController();
      await tester.pumpWidget(
        host(
          AxisCanvas(
            nodes: defaultNodes,
            orientation: AxisOrientation.vertical,
            spacing: AxisSpacing.standard,
            sort: AxisSort.tree,
            viewportController: viewport,
            permissions: const AxisPermissions(
              canEditAll: true,
              nodePermissions: {
                '104': {'can_add_subordinate': true},
                '102': {'can_change_supervisor': true},
              },
            ),
            onReparentPerson: (d, t) {
              dragged = d;
              target = t;
            },
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));
      viewport.setScale(scale);
      await tester.pump(const Duration(milliseconds: 100));

      final from = tester.getCenter(find.byKey(const Key('axis-person-102')));
      final to = tester.getCenter(find.byKey(const Key('axis-person-104')));
      final gesture = await tester.startGesture(from);
      await tester.pump();
      await gesture.moveTo(to);
      await tester.pump(const Duration(milliseconds: 400));
      await gesture.up();
      await tester.pump(const Duration(milliseconds: 100));

      expect(dragged?.id, 102);
      expect(target?.id, 104);
    });
  }

  testWidgets('拖动过程中连线实时跟随：画布拿到实时的拖拽位移', (tester) async {
    bigView(tester);
    final viewport = AxisViewportController();
    await tester.pumpWidget(
      host(
        AxisCanvas(
          nodes: defaultNodes,
          orientation: AxisOrientation.vertical,
          spacing: AxisSpacing.standard,
          sort: AxisSort.tree,
          viewportController: viewport,
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));
    viewport.setScale(1.0);
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
      final viewport = AxisViewportController();
      await tester.pumpWidget(
        host(
          AxisCanvas(
            nodes: nodes,
            orientation: AxisOrientation.vertical,
            spacing: AxisSpacing.standard,
            sort: AxisSort.tree,
            edgeStyle: style,
            viewportController: viewport,
            onLayoutChanged: (node, value) async {
              if (node.id == 2) saved = value;
            },
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));
      viewport.setScale(1.0);
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
      final viewport = AxisViewportController();
      await tester.pumpWidget(
        host(
          AxisCanvas(
            nodes: nodes,
            orientation: AxisOrientation.vertical,
            spacing: AxisSpacing.standard,
            sort: AxisSort.tree,
            edgeStyle: AxisEdgeStyle.straight,
            viewportController: viewport,
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));
      viewport.setScale(1.0);
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

    testWidgets('卡片固定 240x168；最多显示 2 条任务，查看全部与暂无任务', (tester) async {
      await withClock(Clock.fixed(today), () async {
        await pumpCards(tester);
        expect(
          tester.getSize(find.byKey(const Key('axis-person-1'))),
          const Size(240, 168),
        );
        expect(find.text('已逾期任务'), findsOneWidget);
        expect(find.text('本周任务'), findsOneWidget);
        expect(find.text('没有日期'), findsNothing);
        expect(find.text('查看全部 →'), findsNWidgets(2));
        expect(find.text('暂无任务'), findsOneWidget);
        expect(find.text('终责'), findsOneWidget);
      });
    });

    testWidgets('截止日期显示 MM/DD 与状态胶囊，逾期用危险色，未逾期不用', (tester) async {
      await withClock(Clock.fixed(today), () async {
        await pumpCards(tester);
        Color? colorOf(String text) =>
            tester.widget<Text>(find.text(text)).style?.color;
        expect(colorOf('逾期 2 天'), AppColors.danger);
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

        await tester.tap(find.text('查看全部 →').first);
        await tester.pump(const Duration(milliseconds: 50));
        expect(openedPerson?.id, 1);
      });
    });
  });

  group('批次 4A 新增特性（A5 要求）', () {
    final today = DateTime(2026, 11, 3, 9);

    testWidgets('1. 选中卡片后出现「新增下级」「更多」按钮，未选中不出现；只读用户不出现', (tester) async {
      bigView(tester);
      final nodes = sampleTree();

      // 情况 A：可编辑权限，未选中时按钮不出现
      await tester.pumpWidget(
        host(
          AxisCanvas(
            nodes: nodes,
            orientation: AxisOrientation.vertical,
            spacing: AxisSpacing.standard,
            sort: AxisSort.tree,
            permissions: const AxisPermissions(
              canEditAll: true,
              nodePermissions: {
                '2': {
                  'can_add_subordinate': true,
                  'can_edit': true,
                  'can_change_supervisor': true,
                },
              },
            ),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byTooltip('新增下级'), findsNothing);
      expect(find.byTooltip('更多'), findsNothing);

      // 点按选中 node 2 后出现
      final card2 = find.byKey(const Key('axis-person-2'));
      final tapAt = tester.getTopLeft(card2) + const Offset(30, 20);
      await tester.tapAt(tapAt);
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byTooltip('新增下级'), findsOneWidget);
      expect(find.byTooltip('更多'), findsOneWidget);

      // 情况 B：只读用户选中也不出现
      await tester.pumpWidget(
        host(
          AxisCanvas(
            nodes: nodes,
            orientation: AxisOrientation.vertical,
            spacing: AxisSpacing.standard,
            sort: AxisSort.tree,
            selectedNodeId: 2,
            permissions: const AxisPermissions(
              role: 'reader',
              canEditAll: false,
            ),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byTooltip('新增下级'), findsNothing);
      expect(find.byTooltip('更多'), findsNothing);
    });

    testWidgets('2. 拖到另一人员卡片停留 400ms 后松手 → 回调 onReparentPerson；停留 100ms 就松手 → 不回调、走 onLayoutChanged', (tester) async {
      bigView(tester);
      final nodes = [
        person(1, null),
        person(2, 1),
        person(3, 1),
      ];

      // 停留 400ms 后松手
      AxisPersonNode? reparentDragged;
      AxisPersonNode? reparentTarget;
      Offset? layoutOffset;

      Widget buildApp({
        required void Function(AxisPersonNode, AxisPersonNode)? onReparent,
        required Future<void> Function(AxisPersonNode, Offset)? onLayout,
      }) => host(
        AxisCanvas(
          nodes: nodes,
          orientation: AxisOrientation.vertical,
          spacing: AxisSpacing.standard,
          sort: AxisSort.tree,
          permissions: const AxisPermissions(
            canEditAll: true,
            nodePermissions: {
              '2': {'can_change_supervisor': true},
              '3': {'can_add_subordinate': true},
            },
          ),
          onReparentPerson: onReparent,
          onLayoutChanged: onLayout,
        ),
      );

      await tester.pumpWidget(
        buildApp(
          onReparent: (d, t) {
            reparentDragged = d;
            reparentTarget = t;
          },
          onLayout: (node, offset) async {
            layoutOffset = offset;
          },
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));

      final from = tester.getCenter(find.byKey(const Key('axis-person-2')));
      final to = tester.getCenter(find.byKey(const Key('axis-person-3')));

      // 拖动停留 400ms
      var gesture = await tester.startGesture(from);
      await tester.pump();
      await gesture.moveTo(to);
      await tester.pump(const Duration(milliseconds: 400));
      await gesture.up();
      await tester.pump(const Duration(milliseconds: 100));

      expect(reparentDragged?.id, 2);
      expect(reparentTarget?.id, 3);
      expect(layoutOffset, isNull);

      // 停留 100ms 就松手：不回调 onReparentPerson，走 onLayoutChanged
      reparentDragged = null;
      reparentTarget = null;
      layoutOffset = null;

      await tester.pumpWidget(
        buildApp(
          onReparent: (d, t) {
            reparentDragged = d;
            reparentTarget = t;
          },
          onLayout: (node, offset) async {
            layoutOffset = offset;
          },
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));

      gesture = await tester.startGesture(from);
      await tester.pump();
      await gesture.moveTo(to);
      await tester.pump(const Duration(milliseconds: 100)); // 仅停留 100ms
      await gesture.up();
      await tester.pump(const Duration(milliseconds: 100));

      expect(reparentDragged, isNull);
      expect(reparentTarget, isNull);
      expect(layoutOffset, isNotNull);
    });

    testWidgets('3. 拖到自己下属上停留 400ms → 显示「不能挂到自己的下属下面」', (tester) async {
      bigView(tester);
      final nodes = [
        person(1, null),
        person(2, 1),
        person(3, 2),
      ];

      await tester.pumpWidget(
        host(
          AxisCanvas(
            nodes: nodes,
            orientation: AxisOrientation.vertical,
            spacing: AxisSpacing.standard,
            sort: AxisSort.tree,
            permissions: const AxisPermissions(canEditAll: true),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));

      final from = tester.getCenter(find.byKey(const Key('axis-person-2')));
      final to = tester.getCenter(find.byKey(const Key('axis-person-3')));

      final gesture = await tester.startGesture(from);
      await tester.pump();
      await gesture.moveTo(to);
      await tester.pump(const Duration(milliseconds: 400));

      // 300ms 后判定得出 rejected，气泡显示「不能挂到自己的下属下面」
      expect(find.text('不能挂到自己的下属下面'), findsOneWidget);

      await gesture.up();
      await tester.pump(const Duration(milliseconds: 100));
    });

    testWidgets('目标卡片在视口右缘时气泡全文可见（tester.getRect 在视口内）', (tester) async {
      tester.view.physicalSize = const Size(800, 600);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final nodes = [
        person(1, null),
        person(2, 1),
      ];
      final viewport = AxisViewportController();
      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData(platform: TargetPlatform.android, useMaterial3: true),
          home: Scaffold(
            body: SizedBox(
              width: 800,
              height: 600,
              child: AxisCanvas(
                nodes: nodes,
                orientation: AxisOrientation.vertical,
                spacing: AxisSpacing.standard,
                sort: AxisSort.tree,
                offsets: const {
                  1: Offset(40, 200),
                  2: Offset(530, 200),
                },
                viewportController: viewport,
                permissions: const AxisPermissions(canEditAll: true),
              ),
            ),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));
      viewport.reset();
      await tester.pump(const Duration(milliseconds: 100));

      final from = tester.getCenter(find.byKey(const Key('axis-person-1')));
      final to = tester.getCenter(find.byKey(const Key('axis-person-2')));
      final card2Rect = tester.getRect(find.byKey(const Key('axis-person-2')));
      expect(card2Rect.right, greaterThan(700));

      final gesture = await tester.startGesture(from);
      await tester.pump();
      await gesture.moveTo(to);
      await tester.pump(const Duration(milliseconds: 400));

      final bubbleFinder = find.byKey(const Key('axis-drop-bubble'));
      expect(bubbleFinder, findsOneWidget);

      final bubbleRect = tester.getRect(bubbleFinder);
      // 气泡全文在视口内：左右留 8 逻辑像素，上下在视口内
      expect(bubbleRect.left, greaterThanOrEqualTo(8.0));
      expect(bubbleRect.right, lessThanOrEqualTo(800.0 - 8.0));
      expect(bubbleRect.top, greaterThanOrEqualTo(0.0));
      expect(bubbleRect.bottom, lessThanOrEqualTo(600.0));

      await gesture.up();
      await tester.pump(const Duration(milliseconds: 100));
    });

    testWidgets('4. 缩放 0.5 时卡片显示「逾期」大标签、不显示任务行', (tester) async {
      await withClock(Clock.fixed(today), () async {
        bigView(tester);
        final viewport = AxisViewportController();
        final tasks = [
          task(1, '逾期任务A', dueAt: DateTime(2026, 11, 1)),
          task(2, '未到期任务B', dueAt: DateTime(2026, 11, 8)),
        ];

        await tester.pumpWidget(
          host(
            AxisCanvas(
              nodes: [person(1, null, workItems: tasks)],
              orientation: AxisOrientation.vertical,
              spacing: AxisSpacing.standard,
              sort: AxisSort.tree,
              viewportController: viewport,
            ),
          ),
        );
        await tester.pump(const Duration(milliseconds: 100));

        // 默认 scale >= 0.6，显示任务行
        expect(find.text('逾期任务A'), findsOneWidget);

        // 设置缩放到 0.5 (< 0.6)
        viewport.setScale(0.5);
        await tester.pump(const Duration(milliseconds: 100));

        // 精简模式：显示「逾期 1」大标签，不显示任务行
        expect(find.text('逾期 1'), findsOneWidget);
        expect(find.text('逾期任务A'), findsNothing);
        expect(find.text('未到期任务B'), findsNothing);
      });
    });

    testWidgets('4b. 缩放 0.5 时根卡片显示姓名与「终责」标签', (tester) async {
      await withClock(Clock.fixed(today), () async {
        bigView(tester);
        final viewport = AxisViewportController();
        await tester.pumpWidget(
          host(
            AxisCanvas(
              nodes: [person(1, null), person(2, 1)],
              orientation: AxisOrientation.vertical,
              spacing: AxisSpacing.standard,
              sort: AxisSort.tree,
              viewportController: viewport,
            ),
          ),
        );
        await tester.pump(const Duration(milliseconds: 100));

        viewport.setScale(0.5);
        await tester.pump(const Duration(milliseconds: 100));

        final root = find.byKey(const Key('axis-person-1'));
        expect(
          find.descendant(of: root, matching: find.text('人员1')),
          findsOneWidget,
        );
        expect(
          find.descendant(of: root, matching: find.text('终责')),
          findsOneWidget,
        );
        final child = find.byKey(const Key('axis-person-2'));
        expect(
          find.descendant(of: child, matching: find.text('人员2')),
          findsOneWidget,
        );
      });
    });

    testWidgets('5. 卡片「暂无任务」只出现一次', (tester) async {
      await withClock(Clock.fixed(today), () async {
        bigView(tester);
        await tester.pumpWidget(
          host(
            AxisCanvas(
              nodes: [person(1, null, workItems: const [])],
              orientation: AxisOrientation.vertical,
              spacing: AxisSpacing.standard,
              sort: AxisSort.tree,
            ),
          ),
        );
        await tester.pump(const Duration(milliseconds: 100));

        expect(find.text('暂无任务'), findsOneWidget);
        expect(find.textContaining('共 0 项'), findsNothing);
      });
    });

    testWidgets('A2-1. 初始缩放 0.75 且"我"居中', (tester) async {
      // 树：1 是根，2 是下属（"我"）
      tester.view.physicalSize = const Size(1000, 800);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final viewport = AxisViewportController();
      final nodes = [person(1, null), person(2, 1)];

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SizedBox(
              width: 1000,
              height: 800,
              child: AxisCanvas(
                nodes: nodes,
                selfNodeId: 2,
                orientation: AxisOrientation.vertical,
                spacing: AxisSpacing.standard,
                sort: AxisSort.tree,
                viewportController: viewport,
              ),
            ),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump(const Duration(milliseconds: 100));

      // 缩放初始为 0.75
      expect(viewport.scale.value, closeTo(0.75, 0.01));

      // 验证"我"（person 2）的卡片中心居中在视口 (500, 400) 附近
      final meCard = find.byKey(const Key('axis-person-2'));
      expect(meCard, findsOneWidget);
      final center = tester.getCenter(meCard);
      expect(center.dx, closeTo(500, 5.0));
      expect(center.dy, closeTo(400, 5.0));
    });

    testWidgets('A2-2. 树较大时，适应屏幕后缩放 < 0.75', (tester) async {
      tester.view.physicalSize = const Size(800, 600);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final viewport = AxisViewportController();
      // 构建一个较宽的树
      final nodes = [
        person(1, null),
        person(2, 1),
        person(3, 1),
        person(4, 1),
        person(5, 1),
        person(6, 1),
      ];

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SizedBox(
              width: 800,
              height: 600,
              child: AxisCanvas(
                nodes: nodes,
                selfNodeId: 1,
                orientation: AxisOrientation.vertical,
                spacing: AxisSpacing.standard,
                sort: AxisSort.tree,
                viewportController: viewport,
              ),
            ),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump(const Duration(milliseconds: 100));

      expect(viewport.scale.value, closeTo(0.75, 0.01));

      // 点击或调用适应屏幕
      viewport.fitToScreen();
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump(const Duration(milliseconds: 100));

      // 树宽度超过 800，缩放后应该小于 0.75
      expect(viewport.scale.value < 0.75, isTrue);
      expect(viewport.scale.value >= 0.25, isTrue);
    });

    testWidgets('A3-1. 横向保存偏移后切纵向不带该偏移', (tester) async {
      bigView(tester);
      final nodes = [person(1, null), person(2, 1)];

      // 1. 横向渲染，带偏移 (100, 50)
      await tester.pumpWidget(
        host(
          AxisCanvas(
            nodes: nodes,
            orientation: AxisOrientation.horizontal,
            spacing: AxisSpacing.standard,
            sort: AxisSort.tree,
            offsets: const {2: Offset(100, 50)},
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));

      // 2. 切纵向，纵向 offsets 为空
      await tester.pumpWidget(
        host(
          AxisCanvas(
            nodes: nodes,
            orientation: AxisOrientation.vertical,
            spacing: AxisSpacing.standard,
            sort: AxisSort.tree,
            offsets: const {},
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));

      // 纵向无偏移时，子卡片 x 坐标应与根节点对齐（水平居中对齐）
      final rootPos =
          tester.getCenter(find.byKey(const Key('axis-person-1')));
      final vCardPos =
          tester.getCenter(find.byKey(const Key('axis-person-2')));
      expect(vCardPos.dx, closeTo(rootPos.dx, 1.0));
      expect(vCardPos.dy > rootPos.dy, isTrue);
    });

    testWidgets('画布宽度从大变小时，原中心点仍在新视口中心、缩放不变', (tester) async {
      final nodes = [person(1, null), person(2, 1)];
      final viewport = AxisViewportController();

      // 1. 初始视口尺寸为 800 x 600
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: SizedBox(
                width: 800,
                height: 600,
                child: AxisCanvas(
                  nodes: nodes,
                  selfNodeId: 1,
                  orientation: AxisOrientation.vertical,
                  spacing: AxisSpacing.standard,
                  sort: AxisSort.tree,
                  viewportController: viewport,
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump(const Duration(milliseconds: 100));

      final initialController = tester
          .widget<InteractiveViewer>(find.byType(InteractiveViewer))
          .transformationController!;
      final initialMatrix = initialController.value.clone();
      final initialScale = initialMatrix.getMaxScaleOnAxis();

      // 原视口中心点 (400, 300) 在旧矩阵下对应的画布点
      final oldCenter = const Offset(400, 300);
      final invertedInitial = Matrix4.inverted(initialMatrix);
      final canvasPointAtCenter =
          MatrixUtils.transformPoint(invertedInitial, oldCenter);

      // 2. 宽度变小为 400 x 600
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: SizedBox(
                width: 400,
                height: 600,
                child: AxisCanvas(
                  nodes: nodes,
                  selfNodeId: 1,
                  orientation: AxisOrientation.vertical,
                  spacing: AxisSpacing.standard,
                  sort: AxisSort.tree,
                  viewportController: viewport,
                ),
              ),
            ),
          ),
        ),
      );
      // 等待下一帧 postFrameCallback 执行
      await tester.pump(const Duration(milliseconds: 100));

      final updatedMatrix = tester
          .widget<InteractiveViewer>(find.byType(InteractiveViewer))
          .transformationController!
          .value;

      // 验证缩放不变
      expect(updatedMatrix.getMaxScaleOnAxis(), closeTo(initialScale, 0.001));

      // 验证原中心点落到新视口中心 (200, 300)
      final newScreenPoint =
          MatrixUtils.transformPoint(updatedMatrix, canvasPointAtCenter);
      expect(newScreenPoint.dx, closeTo(200.0, 0.001));
      expect(newScreenPoint.dy, closeTo(300.0, 0.001));
    });

    testWidgets('只改高度时变换矩阵不变', (tester) async {
      final nodes = [person(1, null), person(2, 1)];
      final viewport = AxisViewportController();

      // 1. 初始视口尺寸为 400 x 600
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: SizedBox(
                width: 400,
                height: 600,
                child: AxisCanvas(
                  nodes: nodes,
                  selfNodeId: 1,
                  orientation: AxisOrientation.vertical,
                  spacing: AxisSpacing.standard,
                  sort: AxisSort.tree,
                  viewportController: viewport,
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump(const Duration(milliseconds: 100));

      final matrixBefore = tester
          .widget<InteractiveViewer>(find.byType(InteractiveViewer))
          .transformationController!
          .value
          .clone();

      // 2. 只改高度为 400 x 400（如键盘弹起）
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: SizedBox(
                width: 400,
                height: 400,
                child: AxisCanvas(
                  nodes: nodes,
                  selfNodeId: 1,
                  orientation: AxisOrientation.vertical,
                  spacing: AxisSpacing.standard,
                  sort: AxisSort.tree,
                  viewportController: viewport,
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));

      final matrixAfter = tester
          .widget<InteractiveViewer>(find.byType(InteractiveViewer))
          .transformationController!
          .value;

      // 变换矩阵严格相等（完全不平移）
      expect(matrixAfter, equals(matrixBefore));
    });

    testWidgets('手动平移后再变宽度，平移结果按同样规则保留', (tester) async {
      final nodes = [person(1, null), person(2, 1)];
      final viewport = AxisViewportController();

      // 1. 初始尺寸 400 x 600
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: SizedBox(
                width: 400,
                height: 600,
                child: AxisCanvas(
                  nodes: nodes,
                  selfNodeId: 1,
                  orientation: AxisOrientation.vertical,
                  spacing: AxisSpacing.standard,
                  sort: AxisSort.tree,
                  viewportController: viewport,
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump(const Duration(milliseconds: 100));

      // 用户手动平移画布
      final controller = tester
          .widget<InteractiveViewer>(find.byType(InteractiveViewer))
          .transformationController!;
      controller.value = Matrix4.identity()
        ..translateByDouble(50, 80, 0, 1)
        ..multiply(controller.value);
      await tester.pump(const Duration(milliseconds: 100));

      final matrixManual = controller.value.clone();
      final scaleManual = matrixManual.getMaxScaleOnAxis();

      // 手动平移后，原视口中心 (200, 300) 对应的画布点
      final oldCenter = const Offset(200, 300);
      final canvasPoint = MatrixUtils.transformPoint(
        Matrix4.inverted(matrixManual),
        oldCenter,
      );

      // 2. 宽度变化为 600 x 600（如折叠屏展开）
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: SizedBox(
                width: 600,
                height: 600,
                child: AxisCanvas(
                  nodes: nodes,
                  selfNodeId: 1,
                  orientation: AxisOrientation.vertical,
                  spacing: AxisSpacing.standard,
                  sort: AxisSort.tree,
                  viewportController: viewport,
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));

      final updatedMatrix = tester
          .widget<InteractiveViewer>(find.byType(InteractiveViewer))
          .transformationController!
          .value;

      // 缩放保持不变
      expect(updatedMatrix.getMaxScaleOnAxis(), closeTo(scaleManual, 0.001));

      // 原视口中心对应的画布点落到新视口中心 (300, 300)
      final newScreenPoint =
          MatrixUtils.transformPoint(updatedMatrix, canvasPoint);
      expect(newScreenPoint.dx, closeTo(300.0, 0.001));
      expect(newScreenPoint.dy, closeTo(300.0, 0.001));
    });

    testWidgets('拖拽进行中发生宽度变化不会崩溃', (tester) async {
      final nodes = [person(1, null), person(2, 1)];
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: SizedBox(
                width: 800,
                height: 600,
                child: AxisCanvas(
                  nodes: nodes,
                  selfNodeId: 1,
                  orientation: AxisOrientation.vertical,
                  spacing: AxisSpacing.standard,
                  sort: AxisSort.tree,
                  permissions: const AxisPermissions(canEditAll: true),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump(const Duration(milliseconds: 100));

      final cardFinder = find.byKey(const Key('axis-person-1'));
      final gesture = await tester.startGesture(tester.getCenter(cardFinder));
      await gesture.moveBy(const Offset(30, 30));
      await tester.pump();

      // 在拖拽未结束时，改变视口宽度
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: SizedBox(
                width: 500,
                height: 600,
                child: AxisCanvas(
                  nodes: nodes,
                  selfNodeId: 1,
                  orientation: AxisOrientation.vertical,
                  spacing: AxisSpacing.standard,
                  sort: AxisSort.tree,
                  permissions: const AxisPermissions(canEditAll: true),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));
      await gesture.moveBy(const Offset(20, 20));
      await gesture.up();
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.byType(AxisCanvas), findsOneWidget);
    });
  });
}
