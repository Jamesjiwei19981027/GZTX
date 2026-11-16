import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/axis/data/axis_fold.dart';
import 'package:worktodo_app/features/axis/data/axis_edge_rules.dart';
import 'package:worktodo_app/features/axis/data/axis_models.dart';
import 'package:worktodo_app/features/axis/data/axis_view_models.dart';
import 'package:worktodo_app/features/axis/data/person_cards.dart';
import 'package:worktodo_app/features/axis/widgets/axis_canvas.dart';

import 'axis_canvas_test.dart' show person, painterOf;

void main() {
  test('不同高度的父子卡片水平吸附按各自中心对齐', () {
    final snap = snapToParentAxis(
      childTopLeft: const Offset(328, 140),
      cardSize: const Size(240, 300),
      parentTopLeft: Offset.zero,
      parentSize: const Size(240, 600),
      orientation: AxisOrientation.horizontal,
    );
    expect(snap.snapped, isTrue);
    expect(snap.position, const Offset(328, 150));
    expect(snap.referenceLineStart, const Offset(120, 300));
    expect(snap.referenceLineEnd, const Offset(448, 300));
  });
  for (final density in ['compact', 'standard', 'detailed']) {
    for (final orientation in AxisOrientation.values) {
      testWidgets('$density / ${orientation.label} 全字段和长文本完整展示，布局按实际卡高避让',
          (tester) async {
        tester.view.physicalSize = const Size(1200, 2400);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final config = mergePersonCard({
          'density': density,
          'tags': List.generate(8, (i) => {'text': '人员标签$i', 'color': 'sage'}),
          'custom_fields': List.generate(
              10, (i) => {'key': '字段$i', 'value': '需要完整显示的较长字段内容' * 4}),
        });
        final nodes = [
          person(1, null).copyWith(cardConfig: config),
          person(2, 1)
        ];
        final viewport = AxisViewportController();
        addTearDown(viewport.dispose);
        await tester.pumpWidget(MaterialApp(
          home: MediaQuery(
            data: const MediaQueryData(
                disableAnimations: true, textScaler: TextScaler.linear(1.15)),
            child: Scaffold(
                body: AxisCanvas(
              nodes: nodes,
              selfNodeId: 1,
              orientation: orientation,
              spacing: AxisSpacing.standard,
              sort: AxisSort.tree,
              viewportController: viewport,
            )),
          ),
        ));
        await tester.pumpAndSettle();
        final card = find.byKey(const Key('axis-person-1'));
        // 固定卡高 + 内部滚动即使不报 overflow，也仍然是内容被截断。
        for (final scroll in tester.widgetList<Scrollable>(
            find.descendant(of: card, matching: find.byType(Scrollable)))) {
          final state = tester.state<ScrollableState>(find.byWidget(scroll));
          expect(state.position.maxScrollExtent, 0);
        }
        final last = find.text('需要完整显示的较长字段内容' * 4).last;
        final lastBox = tester.renderObject<RenderParagraph>(last);
        expect(lastBox.didExceedMaxLines, isFalse);
        expect(
            tester.getRect(card).contains(tester.getBottomRight(last)), isTrue);
        final layout = painterOf(tester).layout;
        expect(layout.personById(1)!.rect.height, greaterThan(168));
        if (orientation == AxisOrientation.vertical) {
          expect(layout.personById(2)!.rect.top,
              greaterThan(layout.personById(1)!.rect.bottom));
          expect(layout.connections.single.start.dy,
              layout.personById(1)!.rect.bottom);
        } else {
          expect(layout.personById(2)!.rect.left,
              greaterThan(layout.personById(1)!.rect.right));
          expect(layout.connections.single.start.dy,
              layout.personById(1)!.rect.center.dy);
        }
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('配置卡片保留终责与我，单圆点，选中后才出现操作，整卡打开详情', (tester) async {
    int? opened;
    await tester.pumpWidget(MaterialApp(
        home: MediaQuery(
      data: const MediaQueryData(disableAnimations: true),
      child: Scaffold(
          body: AxisCanvas(
        nodes: [
          person(1, null).copyWith(
              cardConfig: mergePersonCard({
            'fields': ['name']
          }))
        ],
        selfNodeId: 1,
        permissions: const AxisPermissions(isPm: true),
        orientation: AxisOrientation.vertical,
        spacing: AxisSpacing.standard,
        sort: AxisSort.tree,
        onOpenPerson: (node) => opened = node.id,
      )),
    )));
    await tester.pumpAndSettle();
    expect(find.text('终责'), findsOneWidget);
    expect(find.text('我'), findsOneWidget);
    final dots = tester
        .widgetList<Container>(find.descendant(
          of: find.byKey(const Key('axis-person-1')),
          matching: find.byType(Container),
        ))
        .where((w) =>
            w.decoration is BoxDecoration &&
            (w.decoration as BoxDecoration).shape == BoxShape.circle &&
            w.constraints?.maxWidth == 8);
    expect(dots, hasLength(1));
    expect(find.byKey(const Key('axis-person-more-1')), findsNothing);
    await tester.tap(find.byKey(const Key('axis-person-select-1')));
    await tester.pumpAndSettle();
    expect(opened, isNull);
    expect(find.byKey(const Key('axis-person-more-1')), findsOneWidget);
    await tester.tap(find.text('人员1'));
    await tester.pumpAndSettle();
    expect(opened, 1);
  });

  testWidgets('展开折叠成员按真实卡高分配位置并连接到折叠组底部', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: MediaQuery(
      data: const MediaQueryData(disableAnimations: true),
      child: Scaffold(
          body: AxisCanvas(
        nodes: [
          person(1, null),
          person(2, 1),
          person(3, 2).copyWith(cardConfig: mergePersonCard()),
          person(4, 2),
          person(5, 4)
        ],
        fold: const AxisFoldSpec(expandedRows: {3}, pulled: {4, 5}),
        orientation: AxisOrientation.vertical,
        spacing: AxisSpacing.standard,
        sort: AxisSort.tree,
      )),
    )));
    await tester.pumpAndSettle();
    final layout = painterOf(tester).layout;
    final member = layout.stacks.single.members.single;
    expect(member.rect.height, greaterThan(168));
    expect(layout.personById(4)!.rect.top, greaterThan(member.rect.bottom));
    expect(layout.connections.firstWhere((c) => c.toId == 4).start.dy,
        member.rect.bottom);
    expect(tester.takeException(), isNull);
  });
  testWidgets('靠近手机底部首次展开配置卡，按测量后高度平移到视口内', (tester) async {
    tester.view.physicalSize = const Size(430, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final viewport = AxisViewportController();
    final nodes = [
      person(1, null),
      person(2, 1),
      person(3, 2).copyWith(
          cardConfig: mergePersonCard({
        'custom_fields':
            List.generate(2, (i) => {'key': '字段$i', 'value': '事项说明' * 8}),
      }))
    ];
    var expanded = <int>{};
    await tester.pumpWidget(MaterialApp(
        home: MediaQuery(
      data: const MediaQueryData(disableAnimations: true),
      child: Scaffold(
          body: StatefulBuilder(
              builder: (context, update) => AxisCanvas(
                    nodes: nodes,
                    fold: AxisFoldSpec(expandedRows: expanded),
                    orientation: AxisOrientation.vertical,
                    spacing: AxisSpacing.standard,
                    sort: AxisSort.tree,
                    viewportController: viewport,
                    onToggleFoldedRow: (id) => update(() => expanded = {id}),
                  ))),
    )));
    await tester.pumpAndSettle();
    viewport.focusNode(2);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('axis-folded-row-3')));
    await tester.pumpAndSettle();
    final card = tester.getRect(find.byKey(const Key('axis-person-3')));
    expect(card.top, greaterThanOrEqualTo(0));
    expect(card.bottom, lessThanOrEqualTo(800));
    expect(tester.takeException(), isNull);
  });
}
