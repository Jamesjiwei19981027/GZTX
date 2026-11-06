import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/axis/data/axis_fold.dart';
import 'package:worktodo_app/features/axis/data/axis_models.dart';
import 'package:worktodo_app/features/axis/data/axis_view_models.dart';
import 'package:worktodo_app/features/axis/widgets/axis_flow_layout.dart';

AxisPersonNode person(int id, int? parentId, {int sortOrder = 0}) =>
    AxisPersonNode(
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
      workItems: const [],
      responsibilityPermissions: const {},
      sortOrder: sortOrder,
    );

/// 1 是根；2、3、4 是 1 的下属；5 是 2 的下属；6 是 5 的下属。
List<AxisPersonNode> chain() => [
      person(1, null),
      person(2, 1, sortOrder: 0),
      person(3, 1, sortOrder: 1),
      person(4, 1, sortOrder: 2),
      person(5, 2),
      person(6, 5),
    ];

AxisFlowResult compute(
  List<AxisPersonNode> nodes,
  AxisOrientation orientation, {
  AxisFoldSpec? fold,
  Map<int, Offset> offsets = const {},
}) =>
    AxisFlowLayout.compute(
      nodes: nodes,
      orientation: orientation,
      spacing: AxisSpacing.standard,
      sort: AxisSort.tree,
      offsets: offsets,
      fold: fold,
    );

List<Rect> allRects(AxisFlowResult layout) => [
      for (final p in layout.people) p.rect,
      for (final s in layout.stacks)
        for (final m in s.members) m.rect,
    ];

void expectNoOverlap(AxisFlowResult layout) {
  final rects = allRects(layout);
  for (var i = 0; i < rects.length; i++) {
    for (var j = i + 1; j < rects.length; j++) {
      expect(
        rects[i].overlaps(rects[j]),
        isFalse,
        reason: '矩形 ${rects[i]} 与 ${rects[j]} 重叠',
      );
    }
  }
}

void main() {
  group('axisMemberIds', () {
    test('默认只有根上轴', () {
      expect(axisMemberIds(chain(), const AxisFoldSpec()), {1});
    });

    test('被拉出者只有父级也上轴才算；循环算到稳定', () {
      // 6 的父级 5 没上轴 -> 不算；2 拉出后 5 拉出，再带出 6。
      expect(axisMemberIds(chain(), const AxisFoldSpec(pulled: {6})), {1});
      expect(axisMemberIds(chain(), const AxisFoldSpec(pulled: {6, 5, 2})), {
        1,
        2,
        5,
        6,
      });
    });

    test('当前用户本人的所有上级上轴，本人不算', () {
      expect(axisMemberIds(chain(), const AxisFoldSpec(selfId: 6)), {
        1,
        2,
        5,
      });
    });

    test('失效 id（已删除）直接忽略', () {
      expect(axisMemberIds(chain(), const AxisFoldSpec(pulled: {99, 2})), {
        1,
        2,
      });
    });

    test('数据成环不死循环', () {
      final cyclic = [person(1, 2), person(2, 1), person(3, null)];
      final ids =
          axisMemberIds(cyclic, const AxisFoldSpec(pulled: {1, 2}, selfId: 1));
      expect(ids, contains(3));
    });
  });

  group('revealAncestors', () {
    test('返回全部上级，不含自己', () {
      expect(revealAncestors(chain(), 6), {5, 2, 1});
      expect(revealAncestors(chain(), 1), isEmpty);
    });

    test('未知 id 返回空；成环防死循环且不含自己', () {
      expect(revealAncestors(chain(), 99), isEmpty);
      final cyclic = [person(1, 2), person(2, 1)];
      expect(revealAncestors(cyclic, 1), {2});
    });
  });

  group('pulledSubtree', () {
    test('只收 id 及其下被拉出的人', () {
      expect(pulledSubtree(chain(), 2, {2, 5, 3}), {2, 5});
      expect(pulledSubtree(chain(), 2, {2}), {2});
    });

    test('中间有人没被拉出就断开；成环防死循环', () {
      expect(pulledSubtree(chain(), 2, {2, 6}), {2});
      final cyclic = [person(1, 2), person(2, 1)];
      expect(pulledSubtree(cyclic, 1, {1, 2}), {1, 2});
    });
  });

  group('折叠布局', () {
    const pulledChain = AxisFoldSpec(pulled: {2, 3});

    for (final orientation in AxisOrientation.values) {
      test('${orientation.name}：卡片与折叠组两两不重叠', () {
        final specs = [
          const AxisFoldSpec(),
          pulledChain,
          const AxisFoldSpec(pulled: {2, 3, 5, 6}, expandedRows: {4, 5}),
          const AxisFoldSpec(pulled: {2}, expandedRows: {3, 4}),
        ];
        for (final spec in specs) {
          expectNoOverlap(compute(chain(), orientation, fold: spec));
        }
      });
    }

    test('fold 为 null 时与旧逻辑一致：与全部拉出的结果逐卡片相同', () {
      for (final orientation in AxisOrientation.values) {
        final plain = compute(chain(), orientation);
        final allPulled = compute(
          chain(),
          orientation,
          fold: const AxisFoldSpec(pulled: {2, 3, 4, 5, 6}),
        );
        expect(plain.stacks, isEmpty);
        expect(allPulled.stacks, isEmpty);
        expect(allPulled.size, plain.size);
        expect(allPulled.minCorner, plain.minCorner);
        for (final p in plain.people) {
          expect(allPulled.personById(p.node.id)!.rect, p.rect);
        }
      }
      // 纵向旧坐标：层高 168 + 间距 88。
      final vertical = compute(chain(), AxisOrientation.vertical);
      expect(vertical.personById(2)!.rect.top, 256);
      expect(vertical.personById(5)!.rect.top, 512);
    });

    test('默认折叠：根下方排出一行一张的折叠组，同宽，竖线连到领导', () {
      final layout = compute(
        chain(),
        AxisOrientation.vertical,
        fold: const AxisFoldSpec(),
      );
      expect(layout.people.map((p) => p.node.id), [1]);
      final stack = layout.stacks.single;
      final root = layout.personById(1)!.rect;
      expect(stack.leaderId, 1);
      expect(stack.members.map((m) => m.node.id), [2, 3, 4]);
      expect(stack.stemStart, Offset(root.center.dx, root.bottom));
      expect(
        stack.stemEnd,
        Offset(root.center.dx, root.bottom + AxisFlowLayout.foldedStemHeight),
      );
      var top = stack.stemEnd.dy;
      for (final m in stack.members) {
        expect(m.rect.left, root.left);
        expect(m.rect.width, AxisFlowLayout.personCardSize.width);
        expect(m.rect.height, AxisFlowLayout.foldedRowHeight);
        expect(m.rect.top, top);
        expect(m.expanded, isFalse);
        top += AxisFlowLayout.foldedRowHeight + AxisFlowLayout.foldedRowGap;
      }
      // contentBounds 与 size 含折叠组。
      final lastBottom = stack.members.last.rect.bottom;
      expect(layout.size.height, greaterThanOrEqualTo(lastBottom));
      expect(layout.contentBounds.bottom, greaterThanOrEqualTo(lastBottom));
    });

    test('纵向：展开一行后，下一层与同组的下一行让开', () {
      // 1 -> 2（拉出）-> 5（拉出）；3、4 折叠在 1 下，6 折叠在 5 下。
      const base = AxisFoldSpec(pulled: {2, 5});
      final before = compute(chain(), AxisOrientation.vertical, fold: base);
      final after = compute(
        chain(),
        AxisOrientation.vertical,
        fold: const AxisFoldSpec(pulled: {2, 5}, expandedRows: {3}),
      );
      const grow =
          168.0 - AxisFlowLayout.foldedRowHeight; // 展开一行多出的高度
      final stackBefore = before.stacks.firstWhere((s) => s.leaderId == 1);
      final stackAfter = after.stacks.firstWhere((s) => s.leaderId == 1);
      // 1 的折叠组是 [3, 4]；展开 3 后它变成完整卡片，4 往下让开。
      expect(stackAfter.members[0].rect.top, stackBefore.members[0].rect.top);
      expect(stackAfter.members[0].rect.height, 168);
      expect(
        stackAfter.members[1].rect.top,
        stackBefore.members[1].rect.top + grow,
      );
      // 第 1 层（2）以及更深的 5 整体下移，不压到折叠组。
      expect(
        after.personById(2)!.rect.top,
        before.personById(2)!.rect.top + grow,
      );
      expect(
        after.personById(5)!.rect.top,
        before.personById(5)!.rect.top + grow,
      );
      expectNoOverlap(after);
    });

    test('横向：展开一行后，同层下方的兄弟卡片让开', () {
      const base = AxisFoldSpec(pulled: {2, 3});
      final before = compute(chain(), AxisOrientation.horizontal, fold: base);
      // 2 下有折叠的 5；展开 5。
      final after = compute(
        chain(),
        AxisOrientation.horizontal,
        fold: const AxisFoldSpec(pulled: {2, 3}, expandedRows: {5}),
      );
      expect(
        after.personById(3)!.rect.top,
        greaterThan(before.personById(3)!.rect.top),
      );
      expectNoOverlap(before);
      expectNoOverlap(after);
    });

    test('折叠组跟随领导的手动偏移；折叠成员已保存的偏移不参与', () {
      const spec = AxisFoldSpec();
      final base = compute(chain(), AxisOrientation.vertical, fold: spec);
      final moved = compute(
        chain(),
        AxisOrientation.vertical,
        fold: spec,
        offsets: const {1: Offset(30, 20), 2: Offset(500, 500)},
      );
      final a = base.stacks.single;
      final b = moved.stacks.single;
      expect(b.stemStart, a.stemStart + const Offset(30, 20));
      for (var i = 0; i < a.members.length; i++) {
        expect(b.members[i].rect, a.members[i].rect.shift(const Offset(30, 20)));
      }
    });

    test('被隐藏的折叠组不占位', () {
      final layout = compute(
        chain(),
        AxisOrientation.vertical,
        fold: const AxisFoldSpec(hiddenStacks: {1}),
      );
      expect(layout.stacks, isEmpty);
      // 只剩根卡片：与单独排一个根的结果相同。
      expect(
        layout.size,
        compute([person(1, null)], AxisOrientation.vertical).size,
      );
    });

    test('拉出人员的已保存偏移照常生效', () {
      final layout = compute(
        chain(),
        AxisOrientation.vertical,
        fold: const AxisFoldSpec(pulled: {2}),
        offsets: const {2: Offset(40, 0)},
      );
      final plain = compute(
        chain(),
        AxisOrientation.vertical,
        fold: const AxisFoldSpec(pulled: {2}),
      );
      expect(
        layout.personById(2)!.rect,
        plain.personById(2)!.rect.shift(const Offset(40, 0)),
      );
    });
  });
}
