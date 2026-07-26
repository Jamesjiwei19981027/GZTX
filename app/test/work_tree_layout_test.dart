import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/models/models.dart';
import 'package:worktodo_app/work_tree/work_tree_layout.dart';
import 'package:worktodo_app/work_tree/work_tree_prefs.dart';

/// 人轴画布布局测试。
///
/// 这个文件曾长期无法编译（调用的是重构前的 `flatten` 与 `assigneeIds:` 构造参数），
/// 因为仓库没有 CI，`flutter test` 全红一直没人发现，画布逻辑实际零覆盖。
void main() {
  /// 人节点：只有 person 才上主干
  TreeNodeItem person(
    int id, {
    int? parentId,
    List<TreeNodeItem> children = const [],
    List<int> assignees = const [],
    String? status,
    String? updatedAt,
  }) {
    return TreeNodeItem(
      id: id,
      title: 'P$id',
      parentId: parentId,
      nodeTypeKey: 'person',
      children: children,
      assignees: [
        for (final uid in assignees)
          NodeAssignee(userId: uid, roleKey: 'primary', displayName: 'U$uid'),
      ],
      progressStatus: status,
      updatedAt: updatedAt,
    );
  }

  /// 事项节点：工作项/里程碑/范围，挂在人下面，不进主干
  TreeNodeItem matter(
    int id, {
    int? parentId,
    String typeKey = 'work_item',
    String? updatedAt,
  }) {
    return TreeNodeItem(
      id: id,
      title: 'M$id',
      parentId: parentId,
      nodeTypeKey: typeKey,
      updatedAt: updatedAt,
    );
  }

  group('flattenPersons', () {
    test('主干只排人，事项挂到所属人的 children 上', () {
      final roots = [
        person(1, children: [
          matter(10, parentId: 1),
          person(2, parentId: 1, children: [matter(20, parentId: 2)]),
        ]),
      ];

      final flat = WorkTreeLayout.flattenPersons(roots, WorkTreeSort.tree);

      expect(flat.map((e) => e.node.id).toList(), [1, 2],
          reason: '主干上只应有 person');
      expect(flat[0].children.map((e) => e.id).toList(), [10]);
      expect(flat[1].children.map((e) => e.id).toList(), [20]);
    });

    test('人挂人 = 下级，按 DFS 展开', () {
      final roots = [
        person(1, children: [
          person(2, parentId: 1, children: [person(3, parentId: 2)]),
          person(4, parentId: 1),
        ]),
      ];
      final flat = WorkTreeLayout.flattenPersons(roots, WorkTreeSort.tree);
      expect(flat.map((e) => e.node.id).toList(), [1, 2, 3, 4]);
    });

    test('终责被钉在主干终点', () {
      final roots = [
        person(1, assignees: [7], children: [
          person(2, parentId: 1),
          person(3, parentId: 1),
        ]),
      ];
      final flat = WorkTreeLayout.flattenPersons(
        roots,
        WorkTreeSort.tree,
        finalOwnerUserId: 7,
      );
      expect(flat.last.node.id, 1, reason: '终责必须落在轴终点');
    });

    test('时间序下终责仍钉在终点', () {
      final roots = [
        person(1, assignees: [7], updatedAt: '2024-01-01T00:00:00Z'),
        person(2, updatedAt: '2024-03-01T00:00:00Z'),
        person(3, updatedAt: '2024-02-01T00:00:00Z'),
      ];
      final flat = WorkTreeLayout.flattenPersons(
        roots,
        WorkTreeSort.time,
        finalOwnerUserId: 7,
      );
      expect(flat.last.node.id, 1);
      // 其余按时间升序
      expect(flat.map((e) => e.node.id).take(2).toList(), [3, 2]);
    });
  });

  group('resolveFocusId', () {
    test('优先聚焦我负责的节点，其次上次位置，最后首个', () {
      final flat = WorkTreeLayout.flattenPersons(
        [
          person(1, children: [
            person(2, parentId: 1, assignees: [9]),
            person(3, parentId: 1),
          ]),
        ],
        WorkTreeSort.tree,
      );

      expect(
        WorkTreeLayout.resolveFocusId(flat: flat, userId: 9, lastNodeId: 1),
        2,
        reason: '我负责的节点优先',
      );
      expect(
        WorkTreeLayout.resolveFocusId(flat: flat, userId: 999, lastNodeId: 3),
        3,
        reason: '没有我负责的则回到上次位置',
      );
      expect(
        WorkTreeLayout.resolveFocusId(flat: flat, userId: 999, lastNodeId: null),
        1,
      );
    });
  });

  group('layout', () {
    test('纵轴下事项在主干两侧交替排布', () {
      final roots = [
        person(1, children: [
          matter(10, parentId: 1),
          matter(11, parentId: 1),
        ]),
      ];
      final layout = WorkTreeLayout.layout(
        roots: roots,
        axis: WorkTreeAxis.vertical,
        sort: WorkTreeSort.tree,
        userId: null,
        lastNodeId: null,
        expandedNodeId: 1,
      );
      expect(layout.placed, isNotEmpty);
      expect(layout.previews, isNotEmpty, reason: '人下的事项应渲染为侧挂预览');
    });

    test('坐标归一化到以原点为基准的包围盒内', () {
      final kids = [for (var i = 0; i < 10; i++) matter(100 + i, parentId: 1)];
      final roots = [person(1, children: kids)];
      final layout = WorkTreeLayout.layout(
        roots: roots,
        axis: WorkTreeAxis.vertical,
        sort: WorkTreeSort.tree,
        userId: null,
        lastNodeId: null,
        expandedNodeId: 1,
      );

      expect(layout.contentBounds.left, 0);
      expect(layout.contentBounds.top, 0);
      for (final p in layout.placed) {
        expect(p.center.dx, greaterThanOrEqualTo(0));
        expect(p.center.dy, greaterThanOrEqualTo(0));
        expect(p.center.dx, lessThanOrEqualTo(layout.contentBounds.width));
        expect(p.center.dy, lessThanOrEqualTo(layout.contentBounds.height));
      }
      for (final p in layout.previews) {
        expect(p.center.dx, greaterThanOrEqualTo(0));
        expect(p.center.dy, greaterThanOrEqualTo(0));
      }
    });

    test('leaderAlongDelta 把终责沿主干推远', () {
      final roots = [
        person(1, children: [person(2, parentId: 1, assignees: [7])]),
      ];

      Offset ownerCenter(double delta) {
        final layout = WorkTreeLayout.layout(
          roots: roots,
          axis: WorkTreeAxis.horizontal,
          sort: WorkTreeSort.tree,
          userId: null,
          lastNodeId: null,
          expandedNodeId: null,
          finalOwnerUserId: 7,
          leaderAlongDelta: delta,
        );
        return layout.placed.firstWhere((p) => p.node.id == 2).center;
      }

      final base = ownerCenter(0);
      final moved = ownerCenter(300);
      expect(moved.dx, greaterThan(base.dx),
          reason: '横轴下增大偏移应把终责沿轴推远');
    });
  });

  group('hasLeaderOnSpine', () {
    test('终责人在主干上才算已就位', () {
      final withLeader = [
        person(1, children: [person(2, parentId: 1, assignees: [7])]),
      ];
      final withoutLeader = [person(1, children: [person(2, parentId: 1)])];

      expect(WorkTreeLayout.hasLeaderOnSpine(withLeader, 7), isTrue);
      expect(WorkTreeLayout.hasLeaderOnSpine(withoutLeader, 7), isFalse);
      expect(WorkTreeLayout.hasLeaderOnSpine(withLeader, null), isFalse);
    });
  });
}
