import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/knowledge/models/knowledge_models.dart';
import 'package:worktodo_app/features/knowledge/widgets/knowledge_graph.dart';

void main() {
  Future<void> pumpGraph(WidgetTester tester, Widget graph) async {
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: const [Locale('zh', 'CN')],
        home: Scaffold(
          body: SizedBox(width: 390, height: 700, child: graph),
        ),
      ),
    );
    await tester.pump();
  }

  testWidgets('点开节点触发回调', (tester) async {
    String? opened;
    await pumpGraph(
      tester,
      KnowledgeGraph(
        nodes: const [
          KnowledgeGraphNode(
            id: '21',
            title: '客户需求确认',
            subtitle: '客户确认先做验收清单',
            position: KnowledgePoint(0, 0),
          ),
          KnowledgeGraphNode(
            id: '22',
            title: '接口联调记录',
            subtitle: '接口全部通过',
            position: KnowledgePoint(0, 180),
          ),
        ],
        edges: const [
          KnowledgeGraphEdge(fromId: '21', toId: '22', label: '提供依据'),
        ],
        onTapNode: (node) => opened = node.id,
      ),
    );

    expect(find.text('客户需求确认'), findsOneWidget);
    expect(find.text('接口联调记录'), findsOneWidget);
    expect(find.text('拖动空白处移动画面，点开节点看内容'), findsOneWidget);

    await tester.tap(find.text('客户需求确认'));
    await tester.pump();
    expect(opened, '21');
  });

  testWidgets('拖动节点后回传新坐标', (tester) async {
    KnowledgePoint? moved;
    await pumpGraph(
      tester,
      KnowledgeGraph(
        nodes: const [
          KnowledgeGraphNode(
            id: '21',
            title: '客户需求确认',
            subtitle: '客户确认先做验收清单',
            position: KnowledgePoint(0, 0),
          ),
        ],
        onMoveNode: (node, position) => moved = position,
      ),
    );

    final gesture = await tester.startGesture(
      tester.getCenter(find.text('客户需求确认')),
    );
    await tester.pump();
    await gesture.moveBy(const Offset(40, 30));
    await tester.pump();
    await gesture.up();
    await tester.pumpAndSettle();

    expect(moved, isNotNull);
    expect(moved!.x, greaterThan(0));
    expect(moved!.y, greaterThan(0));
  });

  testWidgets('超出初始视口的节点平移进可见区后可以点开', (tester) async {
    String? opened;
    await pumpGraph(
      tester,
      KnowledgeGraph(
        nodes: const [
          KnowledgeGraphNode(
            id: '21',
            title: '客户需求确认',
            subtitle: '客户确认先做验收清单',
            position: KnowledgePoint(0, 0),
          ),
          KnowledgeGraphNode(
            id: '23',
            title: '第三行笔记',
            subtitle: '网页版存过的坐标',
            position: KnowledgePoint(0, 500),
          ),
        ],
        height: 320,
        onTapNode: (node) => opened = node.id,
      ),
    );

    // 初始视口里点不到第三行节点
    expect(find.text('第三行笔记').hitTestable(), findsNothing);

    // 在画布空白处向上平移，把 y=500 的节点移进可见区
    final canvas = tester.getRect(find.byType(KnowledgeGraph));
    await tester.dragFrom(
      Offset(canvas.right - 20, canvas.top + 200),
      const Offset(0, -460),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('第三行笔记'));
    await tester.pump();
    expect(opened, '23');
  });

  testWidgets('空节点列表不报错', (tester) async {
    await pumpGraph(tester, const KnowledgeGraph(nodes: []));
    expect(tester.takeException(), isNull);
    expect(find.text('拖动空白处移动画面，点开节点看内容'), findsOneWidget);
  });
}
