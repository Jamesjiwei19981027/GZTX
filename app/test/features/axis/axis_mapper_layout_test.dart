import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/axis/data/axis_models.dart';
import 'package:worktodo_app/features/axis/data/axis_tree_mapper.dart';
import 'package:worktodo_app/features/axis/data/axis_view_models.dart';
import 'package:worktodo_app/features/axis/widgets/axis_flow_layout.dart';

import 'axis_test_harness.dart';

AxisPersonNode person(
  int id,
  int? parentId, {
  int sortOrder = 0,
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
  sortOrder: sortOrder,
);

AxisWorkItem task(int id, DateTime? dueAt) => AxisWorkItem(
  id: id,
  title: '任务$id',
  nodeTypeKey: 'work_item',
  status: 'in_progress',
  percent: 10,
  dueAt: dueAt,
);

AxisFlowResult layoutOf(
  List<AxisPersonNode> nodes,
  AxisOrientation orientation, {
  AxisSpacing spacing = AxisSpacing.standard,
  AxisSort sort = AxisSort.tree,
}) => AxisFlowLayout.compute(
  nodes: nodes,
  orientation: orientation,
  spacing: spacing,
  sort: sort,
);

Offset topLeft(AxisFlowResult layout, int id) =>
    layout.personById(id)!.rect.topLeft;

void main() {
  group('人树映射', () {
    test('只把人员放进树，事项归到所属人员下', () {
      final nodes = AxisTreeMapper.mapTree(
        AxisTestHarness.defaultTree(),
        finalOwnerUserId: AxisTestHarness.pmUserId,
      );
      expect(nodes.map((n) => n.id), containsAll([101, 102, 104, 103]));
      expect(nodes.length, 4);

      final self = nodes.firstWhere((n) => n.id == 102);
      expect(self.parentId, 101);
      expect(self.name, '林悦');
      expect(self.roleTitle, '设计负责人');
      expect(self.department, '设计部');
      expect(self.nodeOrigin, 'subordinate');
      expect(self.workItems.single.id, 201);
      expect(self.workItems.single.percent, 70);
      expect(self.ownerUserIds, [AxisTestHarness.memberUserId]);
    });

    test('第一个根（按 sort_order、id）就是终责根，与指派人无关', () {
      // 默认夹具有 3 个根：101(sort 0)、104(sort 1)、103(sort 2)。
      for (final pm in [AxisTestHarness.pmUserId, 999, null]) {
        final nodes = AxisTreeMapper.mapTree(
          AxisTestHarness.defaultTree(),
          finalOwnerUserId: pm,
        );
        expect(nodes.where((n) => n.isTerminalPm).map((n) => n.id), [101]);
        // 不再把终责排到末尾：保持树的原始顺序。
        expect(nodes.first.id, 101);
        expect(nodes.last.isTerminalPm, isFalse);
      }
    });

    test('extraRootIds：除第一个根以外的根按 sort_order、id 返回', () {
      final nodes = AxisTreeMapper.mapTree(AxisTestHarness.defaultTree());
      expect(AxisTreeMapper.extraRootIds(nodes), [104, 103]);
      expect(AxisTreeMapper.extraRootIds(const []), isEmpty);
      final single = nodes.where((n) => n.id == 101 || n.id == 102).toList();
      expect(AxisTreeMapper.extraRootIds(single), isEmpty);
    });

    test('任务截止日期：due_at 优先，没有则取 milestone_at', () {
      Map<String, dynamic> raw(Map<String, dynamic> extra) => {
        'id': 1,
        'node_type_key': 'person',
        'title': '根',
        'sort_order': 0,
        'children': [
          {
            'id': 2,
            'node_type_key': 'milestone',
            'title': '里程碑',
            'progress_json': {'status': 'in_progress', 'percent': 0},
            ...extra,
          },
        ],
      };
      final byMilestone = AxisTreeMapper.mapTree([
        raw({'milestone_at': '2026-11-20T00:00:00'}),
      ]);
      expect(byMilestone.single.workItems.single.dueAt, DateTime(2026, 11, 20));
      final byDue = AxisTreeMapper.mapTree([
        raw({
          'due_at': '2026-11-05T00:00:00',
          'milestone_at': '2026-11-20T00:00:00',
        }),
      ]);
      expect(byDue.single.workItems.single.dueAt, DateTime(2026, 11, 5));
    });

    test('@axis-person 元信息读写保留自由备注', () {
      const original =
          '@axis-person {"name":"林悦","roleTitle":"设计负责人"}\n'
          '自由备注：周三在客户现场';
      final meta = readAxisPersonMetadata(original);
      expect(meta['name'], '林悦');
      expect(meta['roleTitle'], '设计负责人');

      final rewritten = withAxisPersonMetadata(original, {
        'name': '林悦',
        'roleTitle': '高级设计负责人',
        'department': '设计部',
      });
      expect(rewritten, contains('高级设计负责人'));
      expect(rewritten, contains('自由备注：周三在客户现场'));
      expect(
        rewritten.split('\n').where((l) => l.startsWith('@axis-person')).length,
        1,
      );
    });

    test('损坏的元信息不抛异常', () {
      expect(readAxisPersonMetadata('@axis-person {bad json'), isEmpty);
      expect(readAxisPersonMetadata(null), isEmpty);
    });
  });

  group('画布布局（单根多叉树；卡片 240x168、层距 88、兄弟间隙 48，与网页一致）', () {
    test('单根放在原点，尺寸固定为 240x168', () {
      for (final o in AxisOrientation.values) {
        final layout = layoutOf([person(1, null)], o);
        expect(
          layout.personById(1)!.rect,
          const Rect.fromLTWH(0, 0, 240, 168),
        );
        expect(layout.connections, isEmpty);
      }
    });

    test('层距：横向 328（240+88）、纵向 256（168+88）', () {
      final nodes = [person(1, null), person(2, 1)];
      final h = layoutOf(nodes, AxisOrientation.horizontal);
      expect(topLeft(h, 2).dx - topLeft(h, 1).dx, 328);
      final v = layoutOf(nodes, AxisOrientation.vertical);
      expect(topLeft(v, 2).dy - topLeft(v, 1).dy, 256);
    });

    test('兄弟间隙 48，并随间距选项按系数缩放（紧凑 0.75、宽松 1.5）', () {
      final nodes = [person(1, null), person(2, 1), person(3, 1)];
      final h = layoutOf(nodes, AxisOrientation.horizontal);
      expect(h.personById(3)!.rect.top - h.personById(2)!.rect.bottom, 48);
      final v = layoutOf(nodes, AxisOrientation.vertical);
      expect(v.personById(3)!.rect.left - v.personById(2)!.rect.right, 48);
      final compact = layoutOf(
        nodes,
        AxisOrientation.horizontal,
        spacing: AxisSpacing.compact,
      );
      expect(
        compact.personById(3)!.rect.top - compact.personById(2)!.rect.bottom,
        36,
      );
      final loose = layoutOf(
        nodes,
        AxisOrientation.horizontal,
        spacing: AxisSpacing.loose,
      );
      expect(
        loose.personById(3)!.rect.top - loose.personById(2)!.rect.bottom,
        72,
      );
    });

    test('父节点在子树跨度内居中', () {
      final nodes = [
        person(1, null),
        person(2, 1),
        person(3, 1),
        person(4, 1),
      ];
      for (final o in AxisOrientation.values) {
        final layout = layoutOf(nodes, o);
        double cross(int id) {
          final c = layout.personById(id)!.center;
          return o == AxisOrientation.horizontal ? c.dy : c.dx;
        }

        expect(cross(1), (cross(2) + cross(4)) / 2);
        expect(cross(1), cross(3));
      }
    });

    test('收起的子树不占跨度：只传入可见节点时按无子节点处理', () {
      // 展开：R 下有 A、B；A 下有 A1、A2。
      final expanded = [
        person(1, null),
        person(2, 1),
        person(3, 1),
        person(4, 2),
        person(5, 2),
      ];
      // 收起 A：A1、A2 不在可见列表里。
      final collapsed = expanded.where((n) => n.id <= 3).toList();
      final full = layoutOf(expanded, AxisOrientation.horizontal);
      final folded = layoutOf(collapsed, AxisOrientation.horizontal);
      // 展开时 span(A)=384，R 居中 y=216；收起后 span(A)=168，R 居中 y=108。
      expect(topLeft(full, 1).dy, 216);
      expect(topLeft(folded, 1).dy, 108);
      expect(topLeft(folded, 2), const Offset(328, 0));
      expect(topLeft(folded, 3), const Offset(328, 216));
    });

    test('多根并排：后一棵接在前一棵跨度之后再加 2 倍兄弟间隙', () {
      // 根 1 下有两个孩子，跨度横向 384、纵向 528；根 2 紧随其后。
      final nodes = [
        person(1, null, sortOrder: 0),
        person(2, 1),
        person(3, 1),
        person(9, null, sortOrder: 1),
      ];
      final h = layoutOf(nodes, AxisOrientation.horizontal);
      expect(topLeft(h, 9), const Offset(0, 384 + 96));
      final v = layoutOf(nodes, AxisOrientation.vertical);
      expect(topLeft(v, 9), const Offset(528 + 96, 0));
    });

    test('时间序：兄弟按该人名下最近截止日期排，无日期的排最后', () {
      final nodes = [
        person(1, null),
        person(
          2,
          1,
          sortOrder: 0,
          workItems: [task(21, DateTime(2026, 12, 1))],
        ),
        person(3, 1, sortOrder: 1),
        person(
          4,
          1,
          sortOrder: 2,
          workItems: [
            task(41, DateTime(2026, 12, 20)),
            task(42, DateTime(2026, 10, 1)),
          ],
        ),
      ];
      List<int> orderOf(AxisFlowResult l) =>
          ([2, 3, 4]..sort((a, b) => topLeft(l, a).dy.compareTo(topLeft(l, b).dy)));
      expect(orderOf(layoutOf(nodes, AxisOrientation.horizontal)), [2, 3, 4]);
      final time = layoutOf(
        nodes,
        AxisOrientation.horizontal,
        sort: AxisSort.time,
      );
      // 4 最近 10-01，其次 2 的 12-01，3 没有日期排最后。
      expect(orderOf(time), [4, 2, 3]);
    });

    test('与网页一致性：三层样例树各节点左上角坐标', () {
      // 样例树：根 R(1) 下有 A(2)、B(3)；A 下有 A1(4)、A2(5)；B 无下属。
      //
      // 手算（卡片 240x168，层距 88，兄弟间隙 48）：
      // 横向（沿 x 展开，跨度沿 y，层距 328）：
      //   span(A1)=span(A2)=span(B)=168；span(A)=168+168+48=384；
      //   span(R)=384+168+48=600。
      //   R  : x=0,   y=(600-168)/2=216
      //   A  : x=328, y=0+(384-168)/2=108
      //   B  : x=328, y=384+48=432
      //   A1 : x=656, y=0
      //   A2 : x=656, y=168+48=216
      // 纵向（沿 y 展开，跨度沿 x，层距 256）：
      //   span(A1)=span(A2)=span(B)=240；span(A)=240+240+48=528；
      //   span(R)=528+240+48=816。
      //   R  : x=(816-240)/2=288, y=0
      //   A  : x=(528-240)/2=144, y=256
      //   B  : x=528+48=576,      y=256
      //   A1 : x=0,               y=512
      //   A2 : x=240+48=288,      y=512
      final nodes = [
        person(1, null),
        person(2, 1, sortOrder: 0),
        person(3, 1, sortOrder: 1),
        person(4, 2, sortOrder: 0),
        person(5, 2, sortOrder: 1),
      ];
      final h = layoutOf(nodes, AxisOrientation.horizontal);
      expect(topLeft(h, 1), const Offset(0, 216));
      expect(topLeft(h, 2), const Offset(328, 108));
      expect(topLeft(h, 3), const Offset(328, 432));
      expect(topLeft(h, 4), const Offset(656, 0));
      expect(topLeft(h, 5), const Offset(656, 216));

      final v = layoutOf(nodes, AxisOrientation.vertical);
      expect(topLeft(v, 1), const Offset(288, 0));
      expect(topLeft(v, 2), const Offset(144, 256));
      expect(topLeft(v, 3), const Offset(576, 256));
      expect(topLeft(v, 4), const Offset(0, 512));
      expect(topLeft(v, 5), const Offset(288, 512));
    });

    test('连线只有人到人，起止点在卡片边缘中点，id 为“父-子”', () {
      final nodes = [person(1, null), person(2, 1), person(3, 1)];
      final h = layoutOf(nodes, AxisOrientation.horizontal);
      expect(h.connections.map((c) => c.id), ['1-2', '1-3']);
      final first = h.connections.first;
      final parent = h.personById(1)!.rect;
      final child = h.personById(2)!.rect;
      expect(first.start, Offset(parent.right, parent.center.dy));
      expect(first.end, Offset(child.left, child.center.dy));
      final v = layoutOf(nodes, AxisOrientation.vertical);
      final vp = v.personById(1)!.rect;
      final vc = v.personById(2)!.rect;
      expect(v.connections.first.start, Offset(vp.center.dx, vp.bottom));
      expect(v.connections.first.end, Offset(vc.center.dx, vc.top));
    });

    test('50 个节点的布局计算开销（画布性能的代码级测量）', () {
      final many = <AxisPersonNode>[
        for (var i = 0; i < 50; i++)
          AxisPersonNode(
            id: 1000 + i,
            parentId: i < 10 ? null : 1000 + (i % 10),
            title: '人员$i',
            description: null,
            name: '人员$i',
            roleTitle: '岗位$i',
            department: '部门',
            nodeOrigin: i < 10 ? 'project' : 'subordinate',
            isTerminalPm: i == 0,
            ownerUserIds: [i],
            workItems: [
              for (var m = 0; m < 3; m++)
                AxisWorkItem(
                  id: 9000 + i * 3 + m,
                  title: '事项$m',
                  nodeTypeKey: 'work_item',
                  status: 'in_progress',
                  percent: 40,
                ),
            ],
            responsibilityPermissions: const {},
          ),
      ];
      // 预热，避免把首次 JIT 计入。
      layoutOf(many, AxisOrientation.vertical);
      final watch = Stopwatch()..start();
      for (var i = 0; i < 30; i++) {
        layoutOf(many, AxisOrientation.vertical);
      }
      watch.stop();
      final averageMs = watch.elapsedMicroseconds / 30 / 1000;
      // 拖动时每帧都会重算一次布局；50 个节点平均应远低于 16ms 一帧。
      // ignore: avoid_print
      print('50 节点布局平均耗时: ${averageMs.toStringAsFixed(3)} ms/次');
      expect(averageMs, lessThan(16));
    });

    test('手动偏移叠加在自动位置上，重置布局忽略偏移', () {
      final nodes = [person(1, null), person(2, 1)];
      final offset = {1: const Offset(30, 40)};
      final shifted = AxisFlowLayout.compute(
        nodes: nodes,
        orientation: AxisOrientation.vertical,
        spacing: AxisSpacing.standard,
        sort: AxisSort.tree,
        offsets: offset,
      );
      final auto = shifted.autoRects[1]!;
      expect(shifted.personById(1)!.rect.left, auto.left + 30);
      expect(shifted.personById(1)!.rect.top, auto.top + 40);

      final reset = AxisFlowLayout.compute(
        nodes: nodes,
        orientation: AxisOrientation.vertical,
        spacing: AxisSpacing.standard,
        sort: AxisSort.tree,
        offsets: offset,
        resetLayout: true,
      );
      expect(reset.personById(1)!.rect.left, reset.autoRects[1]!.left);
    });
  });
}
