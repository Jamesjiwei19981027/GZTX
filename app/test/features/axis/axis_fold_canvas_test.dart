import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/axis/data/axis_edge_rules.dart';
import 'package:worktodo_app/features/axis/data/axis_fold.dart';
import 'package:worktodo_app/features/axis/data/axis_models.dart';
import 'package:worktodo_app/features/axis/data/axis_view_models.dart';
import 'package:worktodo_app/features/axis/widgets/axis_canvas.dart';
import 'package:worktodo_app/features/axis/widgets/axis_flow_layout.dart';

AxisPersonNode person(
  int id,
  int? parentId, {
  int sortOrder = 0,
  String? name,
  String role = '岗位',
  List<AxisWorkItem> items = const [],
}) =>
    AxisPersonNode(
      id: id,
      parentId: parentId,
      title: '人员$id',
      description: null,
      name: name ?? '人员$id',
      roleTitle: role,
      department: '部门',
      nodeOrigin: parentId == null ? 'project' : 'subordinate',
      isTerminalPm: parentId == null,
      ownerUserIds: const [],
      workItems: items,
      responsibilityPermissions: const {},
      sortOrder: sortOrder,
    );

/// 1 是根；2、3 是 1 的下属；4 是 2 的下属。
List<AxisPersonNode> tree() => [
      person(1, null),
      person(2, 1, sortOrder: 0),
      person(3, 1, sortOrder: 1),
      person(4, 2),
    ];

/// 自带折叠状态的宿主，等价于项目全貌页把控制器状态喂给画布。
class _FoldHost extends StatefulWidget {
  const _FoldHost({
    this.initial = const AxisFoldSpec(),
    this.onLayout,
    this.onReparent,
    this.selfId,
    this.controller,
    this.width = 1400,
    this.height = 1300,
  });

  final AxisFoldSpec initial;
  final void Function(AxisPersonNode, Offset)? onLayout;
  final void Function(AxisPersonNode, AxisPersonNode)? onReparent;
  final int? selfId;
  final AxisViewportController? controller;
  final double width;
  final double height;

  @override
  State<_FoldHost> createState() => _FoldHostState();
}

class _FoldHostState extends State<_FoldHost> {
  late Set<int> pulled = {...widget.initial.pulled};
  Set<int> expanded = {};

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        body: Align(
          alignment: Alignment.topLeft,
          child: SizedBox(
          width: widget.width,
          height: widget.height,
          child: AxisCanvas(
            viewportController: widget.controller,
            nodes: tree(),
            orientation: AxisOrientation.vertical,
            spacing: AxisSpacing.standard,
            sort: AxisSort.tree,
            fold: AxisFoldSpec(
              pulled: pulled,
              expandedRows: expanded,
              selfId: widget.selfId,
            ),
            onToggleFoldedRow: (id) => setState(() {
              expanded = expanded.contains(id)
                  ? ({...expanded}..remove(id))
                  : {...expanded, id};
            }),
            onPullToAxis: (id) => setState(() {
              pulled = {...pulled, id};
              expanded = {...expanded}..remove(id);
            }),
            onReturnFromAxis: (id) => setState(() {
              pulled = {...pulled}..removeAll(pulledSubtree(tree(), id, pulled));
            }),
            onLayoutChanged: (node, offset) async =>
                widget.onLayout?.call(node, offset),
            onReparentPerson: widget.onReparent,
          ),
        ),
        ),
      ),
    );
  }
}

void bigView(WidgetTester tester) {
  tester.view.physicalSize = const Size(1500, 1400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    // 连线有持续的流动动画，按“减少动态效果”渲染才能 pumpAndSettle。
    final dispatcher = TestWidgetsFlutterBinding.instance.platformDispatcher;
    dispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(
      disableAnimations: true,
    );
    addTearDown(dispatcher.clearAccessibilityFeaturesTestValue);
  });

  Finder key(String k) => find.byKey(Key(k));

  testWidgets('默认只有根是完整卡片，其余是折叠行（显示姓名、职责、任务数）', (tester) async {
    bigView(tester);
    await tester.pumpWidget(const _FoldHost());
    await tester.pumpAndSettle();

    expect(key('axis-person-1'), findsOneWidget);
    expect(key('axis-person-2'), findsNothing);
    expect(key('axis-person-3'), findsNothing);
    expect(key('axis-folded-row-2'), findsOneWidget);
    expect(key('axis-folded-row-3'), findsOneWidget);
    // 4 的父级 2 没上轴，不单独出现。
    expect(key('axis-folded-row-4'), findsNothing);
    expect(
      find.descendant(
        of: key('axis-folded-row-2'),
        matching: find.text('人员2'),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(of: key('axis-folded-row-2'), matching: find.text('任务 0')),
      findsOneWidget,
    );
    // 逾期为 0 时不显示逾期。
    expect(find.textContaining('逾期'), findsNothing);
  });

  testWidgets('点折叠行就地展开成带“下属”标签的完整卡片，可折叠回去', (tester) async {
    bigView(tester);
    await tester.pumpWidget(const _FoldHost());
    await tester.pumpAndSettle();

    await tester.tap(key('axis-folded-row-2'));
    await tester.pumpAndSettle();
    expect(key('axis-folded-row-2'), findsNothing);
    expect(key('axis-person-2'), findsOneWidget);
    expect(
      find.descendant(of: key('axis-person-2'), matching: find.text('下属')),
      findsOneWidget,
    );
    expect(key('axis-fold-2'), findsOneWidget);
    expect(key('axis-pull-2'), findsOneWidget);
    // 其余行仍然折叠，且不重叠。
    expect(key('axis-folded-row-3'), findsOneWidget);
    expect(
      tester.getRect(key('axis-person-2')).overlaps(
            tester.getRect(key('axis-folded-row-3')),
          ),
      isFalse,
    );

    await tester.tap(key('axis-fold-2'));
    await tester.pumpAndSettle();
    expect(key('axis-person-2'), findsNothing);
    expect(key('axis-folded-row-2'), findsOneWidget);
  });

  testWidgets('拉到人轴后成为完整上轴卡片（无“下属”标签），他的下属折叠在下方；收回后恢复', (tester) async {
    bigView(tester);
    await tester.pumpWidget(const _FoldHost());
    await tester.pumpAndSettle();

    await tester.tap(key('axis-folded-row-2'));
    await tester.pumpAndSettle();
    await tester.tap(key('axis-pull-2'));
    await tester.pumpAndSettle();

    expect(key('axis-person-2'), findsOneWidget);
    expect(
      find.descendant(of: key('axis-person-2'), matching: find.text('下属')),
      findsNothing,
    );
    expect(key('axis-fold-2'), findsNothing);
    expect(key('axis-folded-row-4'), findsOneWidget);
    expect(
      tester.getTopLeft(key('axis-folded-row-4')).dy,
      greaterThan(tester.getBottomLeft(key('axis-person-2')).dy),
    );
    // 根不提供收回；拉出的人提供。
    expect(key('axis-return-1'), findsNothing);
    expect(key('axis-return-2'), findsOneWidget);

    await tester.tap(key('axis-return-2'));
    await tester.pumpAndSettle();
    expect(key('axis-person-2'), findsNothing);
    expect(key('axis-folded-row-2'), findsOneWidget);
    expect(key('axis-folded-row-4'), findsNothing);
  });

  testWidgets('当前用户上级链上的人不提供“收回”', (tester) async {
    bigView(tester);
    // 自己是 4：上级 2 默认上轴；即使 2 同时在拉出集合里也不给收回。
    await tester.pumpWidget(
      const _FoldHost(initial: AxisFoldSpec(pulled: {2}), selfId: 4),
    );
    await tester.pumpAndSettle();
    expect(key('axis-person-2'), findsOneWidget);
    expect(key('axis-return-2'), findsNothing);
  });

  testWidgets('拖动领导时折叠组跟随同样的位移', (tester) async {
    bigView(tester);
    await tester.pumpWidget(const _FoldHost());
    await tester.pumpAndSettle();

    final leaderBefore = tester.getTopLeft(key('axis-person-1'));
    final rowBefore = tester.getTopLeft(key('axis-folded-row-2'));
    final gesture = await tester.startGesture(
      tester.getCenter(key('axis-person-1')) + const Offset(0, -20),
    );
    await gesture.moveBy(const Offset(60, 40));
    await tester.pump();
    await gesture.moveBy(const Offset(20, 10));
    await tester.pump();

    final leaderDelta = tester.getTopLeft(key('axis-person-1')) - leaderBefore;
    final rowDelta = tester.getTopLeft(key('axis-folded-row-2')) - rowBefore;
    expect(leaderDelta.distance, greaterThan(20));
    expect(rowDelta.dx, closeTo(leaderDelta.dx, 0.01));
    expect(rowDelta.dy, closeTo(leaderDelta.dy, 0.01));
    await gesture.up();
    await tester.pumpAndSettle();
  });

  testWidgets('折叠行不能拖动：不触发保存位置，也不是换上级的放置目标', (tester) async {
    bigView(tester);
    final saved = <int>[];
    final reparented = <int>[];
    await tester.pumpWidget(
      _FoldHost(
        onLayout: (node, _) => saved.add(node.id),
        onReparent: (d, t) => reparented.add(t.id),
      ),
    );
    await tester.pumpAndSettle();

    // 拖折叠行：只是平移画布，不保存任何卡片位置。
    await tester.drag(key('axis-folded-row-2'), const Offset(80, 30));
    await tester.pumpAndSettle();
    expect(saved, isEmpty);
    expect(reparented, isEmpty);

    // 把根拖到折叠行 3 上停留后松手：折叠行不是放置目标，不会换上级。
    final gesture = await tester.startGesture(
      tester.getCenter(key('axis-person-1')) + const Offset(0, -20),
    );
    final target = tester.getCenter(key('axis-folded-row-3'));
    await gesture.moveTo(target);
    await tester.pump(const Duration(milliseconds: 400));
    await gesture.up();
    await tester.pumpAndSettle();
    expect(reparented, isEmpty);
  });

  // ---- FOLDUA2 回归 ----

  Rect union(Iterable<Rect> rects) =>
      rects.reduce((a, b) => a.expandToInclude(b));

  testWidgets('适应屏幕：根有负偏移时内容在视口内纵横居中', (tester) async {
    bigView(tester);
    final controller = AxisViewportController();
    addTearDown(controller.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Align(
            alignment: Alignment.topLeft,
            child: SizedBox(
              width: 800,
              height: 600,
              child: AxisCanvas(
                nodes: tree(),
                orientation: AxisOrientation.vertical,
                spacing: AxisSpacing.standard,
                sort: AxisSort.tree,
                offsets: const {1: Offset(-400, -150)},
                fold: const AxisFoldSpec(),
                viewportController: controller,
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    controller.fitToScreen();
    await tester.pumpAndSettle();

    final content = union([
      tester.getRect(key('axis-person-1')),
      tester.getRect(key('axis-folded-row-2')),
      tester.getRect(key('axis-folded-row-3')),
    ]);
    expect(content.center.dx, closeTo(400, 2));
    expect(content.center.dy, closeTo(300, 2));
  });

  test('contentBounds 是卡片与折叠组的真实外接范围（不含原点和边距）', () {
    final layout = AxisFlowLayout.compute(
      nodes: tree(),
      orientation: AxisOrientation.vertical,
      spacing: AxisSpacing.standard,
      sort: AxisSort.tree,
      offsets: const {1: Offset(-400, -150)},
      fold: const AxisFoldSpec(),
    );
    final rects = [
      for (final p in layout.people) p.rect,
      for (final st in layout.stacks)
        for (final m in st.members) m.rect,
    ];
    final real = union(rects);
    expect(layout.contentBounds.left, closeTo(real.left, 0.01));
    expect(layout.contentBounds.top, closeTo(real.top, 0.01));
    expect(layout.contentBounds.right, closeTo(real.right, 0.01));
    expect(layout.contentBounds.bottom, closeTo(real.bottom, 0.01));
  });

  testWidgets('收回后目标人员仍在屏幕内（布局收缩不留空白）', (tester) async {
    bigView(tester);
    final controller = AxisViewportController();
    addTearDown(controller.dispose);
    await tester.pumpWidget(
      _FoldHost(
        initial: const AxisFoldSpec(pulled: {2}),
        width: 800,
        height: 300,
        controller: controller,
      ),
    );
    await tester.pumpAndSettle();
    // 视口移到最深处（2 的折叠行 4）。
    controller.focusNode(4);
    await tester.pumpAndSettle();
    expect(key('axis-folded-row-4'), findsOneWidget);

    // 视口已移走，按钮不在屏幕内，直接触发收回。
    tester.widget<InkWell>(key('axis-return-2')).onTap!();
    await tester.pumpAndSettle();
    final row = tester.getRect(key('axis-folded-row-2'));
    expect(const Rect.fromLTWH(0, 0, 800, 300).overlaps(row), isTrue);
  });

  testWidgets('折叠行按固定列对齐：逾期为 0 时留空、任务数同列、五字职责不截断', (tester) async {
    bigView(tester);
    final overdueItem = AxisWorkItem(
      id: 1,
      title: '逾期事项',
      nodeTypeKey: 'work_item',
      status: 'in_progress',
      percent: 10,
      dueAt: DateTime.now().subtract(const Duration(days: 5)),
    );
    final nodes = [
      person(1, null),
      person(2, 1,
          sortOrder: 0, name: '张三丰丰', role: '产品负责人', items: [overdueItem]),
      person(3, 1, sortOrder: 1, name: '李四', role: '研发负责人'),
    ];
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 1400,
            height: 1300,
            child: AxisCanvas(
              nodes: nodes,
              orientation: AxisOrientation.vertical,
              spacing: AxisSpacing.standard,
              sort: AxisSort.tree,
              fold: const AxisFoldSpec(),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    Finder col(int id, String name) => find.descendant(
          of: key('axis-folded-row-$id'),
          matching: key('folded-col-$name'),
        );
    double rel(int id, String name) =>
        tester.getTopLeft(col(id, name)).dx -
        tester.getTopLeft(key('axis-folded-row-$id')).dx;
    // 姓名、职责、任务数、逾期各列在不同行里起点一致。
    for (final name in ['name', 'role', 'total', 'overdue']) {
      expect(rel(2, name), closeTo(rel(3, name), 0.01), reason: name);
    }
    // 箭头固定靠右。
    double arrow(int id) => tester
        .getTopRight(find.descendant(
          of: key('axis-folded-row-$id'),
          matching: find.byIcon(Icons.keyboard_arrow_down),
        ))
        .dx;
    expect(arrow(2), closeTo(arrow(3), 0.01));
    // 逾期为 0 的行不显示逾期文字，有逾期的行显示。
    expect(
      find.descendant(
          of: key('axis-folded-row-3'), matching: find.textContaining('逾期')),
      findsNothing,
    );
    expect(
      find.descendant(
          of: key('axis-folded-row-2'), matching: find.textContaining('逾期')),
      findsOneWidget,
    );
    // 五字职责完整显示：列宽放得下，FittedBox 不需要缩小，也没有省略。
    for (final id in [2, 3]) {
      final text = find.descendant(of: col(id, 'role'), matching: find.byType(Text));
      final para = tester.renderObject<RenderParagraph>(text);
      expect(para.didExceedMaxLines, isFalse);
      expect(para.size.width, lessThanOrEqualTo(col(id, 'role').evaluate().first.size!.width));
      expect(tester.getSize(text).width, closeTo(para.size.width, 0.01));
    }
  });

  testWidgets('缩放低于 60% 的精简形态下，展开卡片有折叠/拉到人轴，拉出卡片有收回，且可点', (tester) async {
    bigView(tester);
    final controller = AxisViewportController();
    addTearDown(controller.dispose);
    await tester.pumpWidget(_FoldHost(controller: controller));
    await tester.pumpAndSettle();
    await tester.tap(key('axis-folded-row-2'));
    await tester.pumpAndSettle();
    controller.setScale(0.4);
    await tester.pumpAndSettle();

    expect(key('axis-fold-2'), findsOneWidget);
    expect(key('axis-pull-2'), findsOneWidget);
    await tester.tap(key('axis-pull-2'));
    await tester.pumpAndSettle();
    expect(key('axis-return-2'), findsOneWidget);
    await tester.tap(key('axis-return-2'));
    await tester.pumpAndSettle();
    expect(key('axis-person-2'), findsNothing);
    expect(key('axis-folded-row-2'), findsOneWidget);

    // 精简形态下展开后点“折叠”也能收回成一行。
    await tester.tap(key('axis-folded-row-2'));
    await tester.pumpAndSettle();
    await tester.tap(key('axis-fold-2'));
    await tester.pumpAndSettle();
    expect(key('axis-person-2'), findsNothing);
    expect(key('axis-folded-row-2'), findsOneWidget);
  });

  test('有折叠组时连线从折叠组底部出发，不穿过折叠行（纵向、横向）', () {
    for (final orientation in AxisOrientation.values) {
      final layout = AxisFlowLayout.compute(
        nodes: tree(),
        orientation: orientation,
        spacing: AxisSpacing.standard,
        sort: AxisSort.tree,
        fold: const AxisFoldSpec(pulled: {2}, expandedRows: {3}),
      );
      final conn = layout.connections.single; // 1 -> 2
      final stack = layout.stacks.firstWhere((s) => s.leaderId == 1);
      final stackRects = [for (final m in stack.members) m.rect];
      final lastBottom =
          stackRects.map((r) => r.bottom).reduce((a, b) => a > b ? a : b);
      if (orientation == AxisOrientation.vertical) {
        expect(conn.start.dy, greaterThanOrEqualTo(lastBottom));
      }
      final from = conn.fromRect ?? layout.personById(1)!.rect;
      final to = layout.personById(2)!.rect;
      final path = floatingEdgeToPath(from, to);
      for (final metric in path.computeMetrics()) {
        for (var d = 2.0; d < metric.length - 2; d += 4) {
          final pt = metric.getTangentForOffset(d)!.position;
          for (final r in stackRects) {
            expect(r.deflate(1).contains(pt), isFalse,
                reason: '$orientation 连线穿过折叠行 $r @ $pt');
          }
        }
      }
    }
  });
}
