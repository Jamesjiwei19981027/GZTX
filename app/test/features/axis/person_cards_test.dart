import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/axis/data/person_cards.dart';
import 'package:worktodo_app/features/axis/widgets/person_card_editor.dart';
import 'package:worktodo_app/features/axis/widgets/person_card_fields.dart';
import 'package:worktodo_app/features/axis/data/axis_models.dart';
import 'package:worktodo_app/features/axis/data/axis_tree_mapper.dart';
import 'package:worktodo_app/features/axis/data/axis_view_models.dart';
import 'package:worktodo_app/features/axis/widgets/axis_canvas.dart';
import 'package:worktodo_app/features/axis/state/axis_controller.dart';
import 'axis_test_harness.dart';

const node = AxisPersonNode(
    id: 1,
    parentId: null,
    title: '林悦',
    description: '交付验收',
    name: '林悦',
    roleTitle: '设计师',
    department: '产品',
    nodeOrigin: 'project',
    isTerminalPm: true,
    ownerUserIds: [2],
    workItems: [],
    responsibilityPermissions: {});

void main() {
  test('控制器读取三层配置并用现有偏好接口保存当前项目', () async {
    final harness = await AxisTestHarness.create();
    final id = AxisTestHarness.projectId;
    harness.helper.whenGet('/projects/$id', {
      ...AxisTestHarness.projectJson(),
      'card_template_json': {
        'fields': ['name', 'role'],
        'color': 'sage'
      }
    });
    harness.helper.whenGet('/projects/$id/tree', {
      'nodes': [
        {
          ...AxisTestHarness.personNode(
              id: 1,
              parentId: null,
              name: '林悦',
              role: '设计师',
              department: '产品',
              userId: 2),
          'card_style_json': {
            'fields': ['tags'],
            'tags': [
              {'text': '驻场', 'color': 'clay'}
            ]
          },
          'can_edit_card_style': true
        }
      ]
    }, query: {
      'format': 'nested'
    });
    harness.helper.whenGet('/users/me/ui-prefs', {
      'ui': {
        'person_cards': {
          '$id': {
            'fields': ['name'],
            'show_tags': false
          },
          '999': {'fields': []}
        }
      }
    });
    harness.helper.whenPut('/users/me/ui-prefs', {'ui': {}});
    final controller =
        AxisController(api: harness.api, projectId: id, currentUserId: 2);
    await controller.load();
    expect(controller.error, isNull);
    expect(controller.nodes.single.cardConfig!['fields'], ['name']);
    expect(controller.nodes.single.cardConfig!['tags'], isEmpty);
    expect(controller.nodes.single.canEditCardStyle, isTrue);
    await controller.saveCardView({
      'fields': ['role'],
      'density': 'compact'
    });
    expect(controller.nodes.single.cardConfig!['fields'], ['role']);
    final request = harness.helper.history.lastWhere((r) => r.method == 'PUT');
    expect(request.url.path, '/api/v1/users/me/ui-prefs');
    expect(request.body, {
      'person_cards': {
        '$id': {
          'fields': ['role'],
          'density': 'compact'
        }
      }
    });
    controller.dispose();
  });

  testWidgets('真实画布的配置卡片有独立编辑菜单，普通树权限不影响卡片能力', (tester) async {
    var edited = false;
    final mapped = AxisTreeMapper.mapTree([
      {
        ...AxisTestHarness.personNode(
            id: 1,
            parentId: null,
            name: '林悦',
            role: '设计师',
            department: '产品',
            userId: 2),
        'card_style_json': {
          'tags': [
            {'text': '驻场', 'color': 'sage'}
          ]
        },
        'can_edit_card_style': true
      }
    ]).single;
    await tester.pumpWidget(MaterialApp(
        home: MediaQuery(
            data: const MediaQueryData(
                size: Size(800, 600), disableAnimations: true),
            child: Scaffold(
                body: AxisCanvas(
                    nodes: [
                  mapped.copyWith(
                      cardConfig: mergePersonCard({
                    'fields': ['name', 'tags']
                  }, mapped.cardStyle!))
                ],
                    orientation: AxisOrientation.vertical,
                    spacing: AxisSpacing.standard,
                    sort: AxisSort.tree,
                    onEditCard: (_) => edited = true)))));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.byKey(const Key('axis-person-more-1')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('编辑卡片'), findsOneWidget);
    await tester.tap(find.text('编辑卡片'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(edited, isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('删除首标签后界面与实际保存的剩余标签一致', (tester) async {
    Map<String, dynamic>? saved;
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: PersonCardEditor(
                mode: 'style',
                node: node,
                initial: const {
                  'tags': [
                    {'text': '首个', 'color': 'sage'},
                    {'text': '第二个', 'color': 'clay'}
                  ]
                },
                onClose: () {},
                onSave: (v) async => saved = v))));
    await tester.scrollUntilVisible(find.byTooltip('删除标签1'), 300,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(find.byTooltip('删除标签1'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextFormField, '首个'), findsNothing);
    expect(find.widgetWithText(TextFormField, '第二个'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('card-tag-1')), '剩余标签');
    await tester.tap(find.byKey(const Key('card-save')));
    await tester.pumpAndSettle();
    expect(saved!['tags'], [
      {'text': '剩余标签', 'color': 'clay'}
    ]);
  });
  test('个人偏好优先，空数组隐藏全部字段且不修改源配置', () {
    final template = <String, dynamic>{
      'fields': ['name', 'role'],
      'density': 'detailed',
      'color': 'sage'
    };
    final style = <String, dynamic>{
      'fields': [],
      'color': 'clay',
      'tags': [
        {'text': '驻场', 'color': 'rose'}
      ]
    };
    expect(mergePersonCard(template, style)['fields'], isEmpty);
    final result = mergePersonCard(template, style, {
      'fields': ['name'],
      'show_colors': false,
      'show_tags': false
    });
    expect(result['fields'], ['name']);
    expect(result['density'], 'detailed');
    expect(result['color'], 'ink');
    expect(result['tags'], isEmpty);
    expect(style['color'], 'clay');
  });

  testWidgets('卡片按顺序渲染并尊重隐藏与首标签', (tester) async {
    final config = mergePersonCard({}, {
      'fields': ['custom_fields', 'name', 'tags'],
      'tags': [
        {'text': '驻场', 'color': 'sage'}
      ],
      'custom_fields': [
        {'key': '地点', 'value': '上海'}
      ]
    });
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: PersonCardFields(node: node, config: config))));
    expect(find.text('上海'), findsOneWidget);
    expect(find.text('林悦'), findsOneWidget);
    expect(find.text('设计师'), findsNothing);
    expect(tester.getTopLeft(find.text('上海')).dy,
        lessThan(tester.getTopLeft(find.text('林悦')).dy));
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: PersonCardFields(node: node, config: config, folded: true))));
    expect(find.text('林悦'), findsOneWidget);
    expect(find.text('驻场'), findsOneWidget);
    expect(find.text('上海'), findsNothing);
  });

  testWidgets('编辑弹层预览、保存失败保留草稿、成功保存与恢复默认', (tester) async {
    Map<String, dynamic>? saved;
    var fail = true;
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: PersonCardEditor(
                mode: 'style',
                node: node,
                initial: const {
                  'tags': [
                    {'text': '驻场', 'color': 'sage'}
                  ]
                },
                onClose: () {},
                onSave: (value) async {
                  if (fail) {
                    fail = false;
                    throw Exception('无权修改卡片');
                  }
                  saved = value;
                }))));
    await tester.scrollUntilVisible(find.byKey(const Key('card-tag-0')), 300,
        scrollable: find.byType(Scrollable).first);
    await tester.enterText(find.byKey(const Key('card-tag-0')), '交付');
    expect(find.text('交付'), findsWidgets);
    await tester.ensureVisible(find.byKey(const Key('card-save')));
    await tester.tap(find.byKey(const Key('card-save')));
    await tester.pumpAndSettle();
    expect(find.textContaining('无权修改卡片'), findsOneWidget);
    expect(find.widgetWithText(TextFormField, '交付'), findsOneWidget);
    await tester.tap(find.byKey(const Key('card-save')));
    await tester.pumpAndSettle();
    expect((saved!['tags'] as List).first['text'], '交付');
    await tester.tap(find.byKey(const Key('card-reset')));
    await tester.pumpAndSettle();
    expect(saved, isEmpty);
    expect(tester.takeException(), isNull);
  });
}
