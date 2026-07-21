import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/models/models.dart';
import 'package:worktodo_app/work_tree/work_tree_layout.dart';
import 'package:worktodo_app/work_tree/work_tree_prefs.dart';

void main() {
  TreeNodeItem node(
    int id, {
    int? parentId,
    List<TreeNodeItem> children = const [],
    List<int> assignees = const [],
    String? status,
    String? updatedAt,
  }) {
    return TreeNodeItem(
      id: id,
      title: 'N$id',
      parentId: parentId,
      children: children,
      assigneeIds: assignees,
      progressStatus: status,
      updatedAt: updatedAt,
    );
  }

  test('tree flatten is DFS order', () {
    final roots = [
      node(1, children: [
        node(2, parentId: 1, children: [node(3, parentId: 2)]),
        node(4, parentId: 1),
      ]),
    ];
    final flat = WorkTreeLayout.flatten(roots, WorkTreeSort.tree);
    expect(flat.map((e) => e.node.id).toList(), [1, 2, 3, 4]);
  });

  test('time flatten sorts by updated_at', () {
    final roots = [
      node(1, updatedAt: '2024-01-03T00:00:00Z', children: [
        node(2, parentId: 1, updatedAt: '2024-01-01T00:00:00Z'),
        node(3, parentId: 1, updatedAt: '2024-01-02T00:00:00Z'),
      ]),
    ];
    final flat = WorkTreeLayout.flatten(roots, WorkTreeSort.time);
    expect(flat.map((e) => e.node.id).toList(), [2, 3, 1]);
  });

  test('focus prefers open assigned then last then root', () {
    final roots = [
      node(1, children: [
        node(2, parentId: 1, assignees: [9], status: 'done', updatedAt: '2024-02-01'),
        node(3, parentId: 1, assignees: [9], status: 'doing', updatedAt: '2024-01-01'),
      ]),
    ];
    final flat = WorkTreeLayout.flatten(roots, WorkTreeSort.tree);
    expect(
      WorkTreeLayout.resolveFocusId(flat: flat, userId: 9, lastNodeId: 1),
      3,
    );
    expect(
      WorkTreeLayout.resolveFocusId(flat: flat, userId: 1, lastNodeId: 2),
      2,
    );
    expect(
      WorkTreeLayout.resolveFocusId(flat: flat, userId: 1, lastNodeId: null),
      1,
    );
  });

  test('vertical layout places nodes on alternating sides', () {
    final roots = [
      node(1, children: [node(2, parentId: 1), node(3, parentId: 1)]),
    ];
    final layout = WorkTreeLayout.layout(
      roots: roots,
      axis: WorkTreeAxis.vertical,
      sort: WorkTreeSort.tree,
      userId: null,
      lastNodeId: null,
      expandedNodeId: 1,
    );
    expect(layout.placed.length, 3);
    expect(layout.placed[0].side, -1);
    expect(layout.placed[1].side, 1);
    expect(layout.previews, isNotEmpty);
  });

  test('layout normalizes coordinates into origin-based bounds', () {
    final kids = [
      for (var i = 0; i < 10; i++) node(100 + i, parentId: 1),
    ];
    final roots = [node(1, children: kids)];
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
    expect(layout.previews.last.overflowCount, greaterThan(0));
    expect(layout.previews.last.firstHiddenChild?.id, 108);
  });
}
