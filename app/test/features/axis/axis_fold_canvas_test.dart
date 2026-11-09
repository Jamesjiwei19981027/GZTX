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

/// 1 是根；11~15 是 1 的前 5 位下属（占满第 2 层默认名额）；
/// 2、3 是 1 的超名额下属（第 2 层超名额，默认折叠）；4 是 2 的下属（第 3 层）。
List<AxisPersonNode> tree() => [
      person(1, null),
      person(11, 1, sortOrder: -5),
      person(12, 1, sortOrder: -4),
      person(13, 1, sortOrder: -3),
      person(14, 1, sortOrder: -2),
      person(15, 1, sortOrder: -1),
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
                pulled = {...pulled}
                  ..removeAll(pulledSubtree(tree(), id, pulled));
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
      find.descendant(
          of: key('axis-folded-row-2'), matching: find.text('任务 0')),
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
      for (final id in [1, 11, 12, 13, 14, 15])
        tester.getRect(key('axis-person-$id')),
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
      for (var i = 11; i <= 15; i++) person(i, 1, sortOrder: -i),
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
      final text =
          find.descendant(of: col(id, 'role'), matching: find.byType(Text));
      final para = tester.renderObject<RenderParagraph>(text);
      expect(para.didExceedMaxLines, isFalse);
      expect(para.size.width,
          lessThanOrEqualTo(col(id, 'role').evaluate().first.size!.width));
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
      final conn = layout.connections
          .firstWhere((c) => c.fromId == 1 && c.toId == 2); // 1 -> 2
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

  testWidgets('精简形态（27% 缩放）：有逾期与暂无任务的卡片都放得下，无溢出，操作按钮可点', (tester) async {
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
      for (var i = 11; i <= 15; i++) person(i, 1, sortOrder: -i),
      person(2, 1, sortOrder: 0, name: '赵晨', items: [overdueItem]),
      person(3, 1, sortOrder: 1, name: '孙琪'),
      person(4, 2, name: '陈宇', items: [overdueItem]),
      person(5, 2, sortOrder: 1, name: '刘洋'),
    ];
    final controller = AxisViewportController();
    addTearDown(controller.dispose);
    final returned = <int>[];
    final folded = <int>[];
    await tester.pumpWidget(
      MaterialApp(
        // 系统字体放大时（卡片内最多放大到 1.15）也不能溢出。
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: const TextScaler.linear(1.3),
          ),
          child: child!,
        ),
        home: Scaffold(
          body: SizedBox(
            width: 1400,
            height: 1300,
            child: AxisCanvas(
              nodes: nodes,
              orientation: AxisOrientation.vertical,
              spacing: AxisSpacing.standard,
              sort: AxisSort.tree,
              viewportController: controller,
              fold: const AxisFoldSpec(
                pulled: {2, 3},
                expandedRows: {4, 5},
              ),
              onReturnFromAxis: returned.add,
              onToggleFoldedRow: folded.add,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    controller.setScale(0.27);
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    for (final id in [2, 3]) {
      expect(key('axis-return-$id'), findsOneWidget);
      final card = tester.getRect(key('axis-person-$id'));
      final btn = tester.getRect(key('axis-return-$id'));
      expect(card.inflate(0.01).contains(btn.center), isTrue);
      expect(btn.bottom, lessThanOrEqualTo(card.bottom + 0.01));
    }
    for (final id in [4, 5]) {
      for (final a in ['fold', 'pull']) {
        final btn = tester.getRect(key('axis-$a-$id'));
        final card = tester.getRect(key('axis-person-$id'));
        expect(btn.bottom, lessThanOrEqualTo(card.bottom + 0.01));
      }
    }
    await tester.tap(key('axis-return-2'));
    await tester.tap(key('axis-fold-4'));
    expect(returned, [2]);
    expect(folded, [4]);
  });

  testWidgets('FOLDUA3-1: 点折叠行展开后若卡片超出可视区则画布平移至整张卡片可见且不改缩放，已完全可见时不动',
      (tester) async {
    final controller = AxisViewportController();
    addTearDown(controller.dispose);
    Set<int> expanded = {};

    // 视口高 380；给根人员偏移，使折叠行 3 展开前在视口内（bottom 约 302），展开后（高度 168）bottom 达约 434，超出 380。
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Align(
            alignment: Alignment.topLeft,
            child: SizedBox(
              width: 800,
              height: 380,
              child: StatefulBuilder(
                builder: (context, setState) => AxisCanvas(
                  nodes: tree(),
                  orientation: AxisOrientation.vertical,
                  spacing: AxisSpacing.standard,
                  sort: AxisSort.tree,
                  viewportController: controller,
                  fold: AxisFoldSpec(expandedRows: expanded),
                  onToggleFoldedRow: (id) => setState(() {
                    expanded = expanded.contains(id)
                        ? ({...expanded}..remove(id))
                        : {...expanded, id};
                  }),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // 此时 scale 为 0.75（初始缩放），设置到 100% 缩放进行测试。
    controller.setScale(1.0);
    await tester.pumpAndSettle();

    // 验证折叠行 3 目前在视口内可见
    expect(key('axis-folded-row-3'), findsOneWidget);
    final row3Before = tester.getRect(key('axis-folded-row-3'));
    expect(row3Before.top, greaterThanOrEqualTo(0.0));
    expect(row3Before.bottom, lessThanOrEqualTo(380.0));

    // 点击折叠行 3 进行展开
    await tester.tap(key('axis-folded-row-3'));
    await tester.pumpAndSettle();

    // 展开后成为完整卡片
    expect(key('axis-person-3'), findsOneWidget);
    final card3Rect = tester.getRect(key('axis-person-3'));
    // 缩放保持为 1.0 不变
    expect(controller.scale.value, closeTo(1.0, 0.001));
    // 整张卡片（含底部按钮）必须完全平移到可视区内
    expect(card3Rect.bottom, lessThanOrEqualTo(380.0));
    expect(card3Rect.top, greaterThanOrEqualTo(0.0));

    // 此时整张卡片已完全可见，再次 pump 不发生任何移动
    final card3RectAfter = tester.getRect(key('axis-person-3'));
    expect(card3RectAfter, equals(card3Rect));
  });

  testWidgets('FOLDUA3-2: 卡片操作按钮（折叠/拉到人轴/收回）在100%缩放下高度不小于44且可命中，不抢查看全部与下属n',
      (tester) async {
    bigView(tester);
    const taskItem = AxisWorkItem(
      id: 99,
      title: '事项A',
      nodeTypeKey: 'work_item',
      status: 'in_progress',
      percent: 20,
    );
    final nodes = [
      person(1, null, items: [taskItem]),
      for (var i = 11; i <= 15; i++) person(i, 1, sortOrder: -i),
      person(2, 1, items: [taskItem]),
      person(3, 1),
      person(4, 2),
    ];
    int? openedPersonId;
    int? stackToggledLeaderId;
    int? returnedId;
    int? foldedId;
    int? pulledId;
    final controller = AxisViewportController();
    addTearDown(controller.dispose);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 1400,
            height: 1300,
            child: AxisCanvas(
              viewportController: controller,
              nodes: nodes,
              orientation: AxisOrientation.vertical,
              spacing: AxisSpacing.standard,
              sort: AxisSort.tree,
              fold: const AxisFoldSpec(
                pulled: {2}, // 2 被拉到人轴，有下属 4，提供“收回”与“下属 1 ⌄”，有任务
                expandedRows: {3}, // 3 是展开卡片，提供“折叠”与“拉到人轴”
              ),
              onOpenPerson: (node) => openedPersonId = node.id,
              onToggleStack: (leaderId) => stackToggledLeaderId = leaderId,
              onReturnFromAxis: (id) => returnedId = id,
              onToggleFoldedRow: (id) => foldedId = id,
              onPullToAxis: (id) => pulledId = id,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    controller.setScale(1.0);
    await tester.pumpAndSettle();

    // 1. 验证文字大小和卡片高度不变
    final foldText = tester.widget<Text>(find.descendant(
      of: key('axis-fold-3'),
      matching: find.byType(Text),
    ));
    expect(foldText.style?.fontSize, 12);
    expect(
      tester.getSize(key('axis-person-3')).height,
      closeTo(AxisFlowLayout.personCardSize.height, 0.01),
    );

    // 2. 验证加大后的区域通过自定义命中测试 _hitKey 确认真的能点中：
    // 在 100% 缩放下，屏幕上高度不小于 44 逻辑像素。
    // 原按钮文字高度仅约 14~18 像素（半高仅 7~9 像素），
    // 点击偏离中心垂直方向 15 像素处（跨度达 30 像素，落在 44 像素高度内）：
    final foldCenter = tester.getCenter(key('axis-fold-3'));
    await tester.tapAt(foldCenter + const Offset(0, 15));
    await tester.pumpAndSettle();
    expect(foldedId, 3, reason: '折叠按钮加大后下方 15px 处能点中');

    final pullCenter = tester.getCenter(key('axis-pull-3'));
    await tester.tapAt(pullCenter + const Offset(0, -15));
    await tester.pumpAndSettle();
    expect(pulledId, 3, reason: '拉到人轴按钮加大后上方 15px 处能点中');

    final returnCenter = tester.getCenter(key('axis-return-2'));
    await tester.tapAt(returnCenter + const Offset(0, 18));
    await tester.pumpAndSettle();
    expect(returnedId, 2, reason: '收回按钮加大后下方 18px 处能点中');

    // 3. 验证不抢“查看全部”与“下属 n”的点击
    await tester.tap(find.descendant(
      of: key('axis-person-2'),
      matching: find.textContaining('查看全部'),
    ));
    await tester.pumpAndSettle();
    expect(openedPersonId, 2);

    await tester.tap(key('axis-stack-toggle-2'));
    await tester.pumpAndSettle();
    expect(stackToggledLeaderId, 2);

    // 4. 验证没有溢出异常
    expect(tester.takeException(), isNull);
  });
}
