import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/axis/data/axis_tree_mapper.dart';
import 'package:worktodo_app/features/axis/widgets/axis_flow_layout.dart';
import 'package:worktodo_app/features/axis/data/axis_view_models.dart';
import 'package:worktodo_app/features/axis/data/axis_models.dart';

import 'axis_test_harness.dart';

void main() {
  group('人树映射（对齐 frontend mapTreeToPeopleAxis）', () {
    test('只把人员放进主干，事项归到所属人员下', () {
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

    test('终责人排在轴末', () {
      final nodes = AxisTreeMapper.mapTree(
        AxisTestHarness.defaultTree(),
        finalOwnerUserId: AxisTestHarness.pmUserId,
      );
      expect(nodes.last.id, 103);
      expect(nodes.last.isTerminalPm, isTrue);
      expect(nodes.where((n) => n.isTerminalPm).length, 1);
    });

    test('@axis-person 元信息读写保留自由备注', () {
      const original = '@axis-person {"name":"林悦","roleTitle":"设计负责人"}\n'
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

  group('画布布局', () {
    final nodes = AxisTreeMapper.mapTree(
      AxisTestHarness.defaultTree(),
      finalOwnerUserId: AxisTestHarness.pmUserId,
    );

    test('纵向：人员卡片在同一主干上，终责在最后且带偏移', () {
      final layout = AxisFlowLayout.compute(
        nodes: nodes,
        orientation: AxisOrientation.vertical,
        spacing: AxisSpacing.standard,
        sort: AxisSort.tree,
      );
      expect(layout.people.length, 4);
      final xs = layout.people.map((p) => p.rect.center.dx).toSet();
      expect(xs.length, 1, reason: '所有人员卡片应排在同一条主干上');

      final terminal = layout.people.last;
      expect(terminal.node.id, 103);
      expect(terminal.isTerminal, isTrue);
      for (var i = 1; i < layout.people.length; i++) {
        expect(
          layout.people[i].rect.center.dy,
          greaterThan(layout.people[i - 1].rect.center.dy),
        );
      }

      final moved = AxisFlowLayout.compute(
        nodes: nodes,
        orientation: AxisOrientation.vertical,
        spacing: AxisSpacing.standard,
        sort: AxisSort.tree,
        finalOwnerAlongDelta: 120,
      );
      expect(
        moved.people.last.rect.center.dy - terminal.rect.center.dy,
        120,
      );
    });

    test('横向：主干改为水平，事项挂在人员下方', () {
      final layout = AxisFlowLayout.compute(
        nodes: nodes,
        orientation: AxisOrientation.horizontal,
        spacing: AxisSpacing.standard,
        sort: AxisSort.tree,
      );
      final ys = layout.people.map((p) => p.rect.center.dy).toSet();
      expect(ys.length, 1);
      for (final matter in layout.matters) {
        final owner =
            layout.people.firstWhere((p) => p.node.id == matter.ownerId);
        expect(matter.rect.top, greaterThan(owner.rect.bottom));
      }
    });

    test('事项挂在人员右侧，连线数量覆盖人员关系与事项', () {
      final layout = AxisFlowLayout.compute(
        nodes: nodes,
        orientation: AxisOrientation.vertical,
        spacing: AxisSpacing.standard,
        sort: AxisSort.tree,
      );
      for (final matter in layout.matters) {
        final owner =
            layout.people.firstWhere((p) => p.node.id == matter.ownerId);
        expect(matter.rect.left, greaterThan(owner.rect.right));
      }
      expect(
        layout.connections
            .where((c) => c.type == AxisConnectionType.personToPerson)
            .length,
        1,
      );
      expect(
        layout.connections
            .where((c) => c.type == AxisConnectionType.personToMatter)
            .length,
        layout.matters.length,
      );
    });

    test('时间序按到期时间排序，并在主干上生成刻度', () {
      final withDates = [
        _dated(101, DateTime(2026, 12, 1)),
        _dated(102, DateTime(2026, 10, 1)),
      ];
      final layout = AxisFlowLayout.compute(
        nodes: withDates,
        orientation: AxisOrientation.vertical,
        spacing: AxisSpacing.compact,
        sort: AxisSort.time,
      );
      // 两个都是根人员时，时间早的排在前。
      expect(layout.people.first.node.id, 102);
      expect(layout.ticks.length, 2);
      expect(layout.ticks.first.label, '10-01');
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
            isTerminalPm: i == 49,
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
      AxisFlowLayout.compute(
        nodes: many,
        orientation: AxisOrientation.vertical,
        spacing: AxisSpacing.standard,
        sort: AxisSort.tree,
      );
      final watch = Stopwatch()..start();
      for (var i = 0; i < 30; i++) {
        AxisFlowLayout.compute(
          nodes: many,
          orientation: AxisOrientation.vertical,
          spacing: AxisSpacing.standard,
          sort: AxisSort.tree,
        );
      }
      watch.stop();
      final averageMs = watch.elapsedMicroseconds / 30 / 1000;
      // 拖动时每帧都会重算一次布局；50 个节点平均应远低于 16ms 一帧。
      // ignore: avoid_print
      print('50 节点布局平均耗时: ${averageMs.toStringAsFixed(3)} ms/次');
      expect(averageMs, lessThan(16));
    });

    test('手动偏移叠加在自动位置上，重置布局忽略偏移', () {
      final offset = {nodes.first.id: const Offset(30, 40)};
      final shifted = AxisFlowLayout.compute(
        nodes: nodes,
        orientation: AxisOrientation.vertical,
        spacing: AxisSpacing.standard,
        sort: AxisSort.tree,
        offsets: offset,
      );
      final auto = shifted.autoRects[nodes.first.id]!;
      expect(shifted.people.first.rect.left, auto.left + 30);
      expect(shifted.people.first.rect.top, auto.top + 40);

      final reset = AxisFlowLayout.compute(
        nodes: nodes,
        orientation: AxisOrientation.vertical,
        spacing: AxisSpacing.standard,
        sort: AxisSort.tree,
        offsets: offset,
        resetLayout: true,
      );
      expect(reset.people.first.rect.left, reset.autoRects[nodes.first.id]!.left);
    });
  });
}

AxisPersonNode _dated(int id, DateTime due) => AxisPersonNode(
      id: id,
      parentId: null,
      title: '人员$id',
      description: null,
      name: '人员$id',
      roleTitle: '岗位',
      department: '部门',
      nodeOrigin: 'project',
      isTerminalPm: false,
      ownerUserIds: const [],
      workItems: const [],
      responsibilityPermissions: const {},
      dueAt: due,
    );
