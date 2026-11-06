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

/// 1 是根；2、3、4 是 1 的下属（第 2 层）；5、7 是 2 的下属（第 3 层）；6 是 5 的下属（第 4 层）。
List<AxisPersonNode> chain() => [
      person(1, null),
      person(2, 1, sortOrder: 0),
      person(3, 1, sortOrder: 1),
      person(4, 1, sortOrder: 2),
      person(5, 2, sortOrder: 0),
      person(7, 2, sortOrder: 1),
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
      // 门槛规则下：第 1 层的 1 上轴；第 2 层人员（2、3、4 共 3 人 <= 5）在默认名额内上轴；
      // 第 3 层的 5、7 与第 4 层的 6 默认折叠不上轴。
      expect(axisMemberIds(chain(), const AxisFoldSpec()), {1, 2, 3, 4});
    });

    test('被拉出者只有父级也上轴才算；循环算到稳定', () {
      // 6 的父级 5 没上轴 -> 6 不上轴；2、3、4 在名额内已在轴上；
      // 拉出 5 后，6 的父级 5 上轴，从而带出 6。
      expect(axisMemberIds(chain(), const AxisFoldSpec(pulled: {6})), {
        1,
        2,
        3,
        4,
      });
      expect(axisMemberIds(chain(), const AxisFoldSpec(pulled: {6, 5, 2})), {
        1,
        2,
        3,
        4,
        5,
        6,
      });
    });

    test('当前用户本人的所有上级上轴，本人不算', () {
      // selfId 为 6：其所有上级（5、2、1）上轴；第 2 层 3、4 亦在名额内上轴；本人 6 不算。
      expect(axisMemberIds(chain(), const AxisFoldSpec(selfId: 6)), {
        1,
        2,
        3,
        4,
        5,
      });
    });

    test('失效 id（已删除）直接忽略', () {
      expect(axisMemberIds(chain(), const AxisFoldSpec(pulled: {99, 2})), {
        1,
        2,
        3,
        4,
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
          fold: const AxisFoldSpec(pulled: {2, 3, 4, 5, 6, 7}),
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
      // 领导 2 下方折叠第 3 层人员 5、7
      final layout = compute(
        chain(),
        AxisOrientation.vertical,
        fold: const AxisFoldSpec(),
      );
      expect(layout.people.map((p) => p.node.id), [1, 2, 3, 4]);
      final stack = layout.stacks.single;
      final leader = layout.personById(2)!.rect;
      expect(stack.leaderId, 2);
      expect(stack.members.map((m) => m.node.id), [5, 7]);
      expect(stack.stemStart, Offset(leader.center.dx, leader.bottom));
      expect(
        stack.stemEnd,
        Offset(leader.center.dx, leader.bottom + AxisFlowLayout.foldedStemHeight),
      );
      var top = stack.stemEnd.dy;
      for (final m in stack.members) {
        expect(m.rect.left, leader.left);
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
      // 2 为领导，折叠组是 [5, 7]；展开 5 后 5 变为卡片，7 往下让开。
      const base = AxisFoldSpec();
      final before = compute(chain(), AxisOrientation.vertical, fold: base);
      final after = compute(
        chain(),
        AxisOrientation.vertical,
        fold: const AxisFoldSpec(expandedRows: {5}),
      );
      const grow =
          168.0 - AxisFlowLayout.foldedRowHeight; // 展开一行多出的高度
      final stackBefore = before.stacks.firstWhere((s) => s.leaderId == 2);
      final stackAfter = after.stacks.firstWhere((s) => s.leaderId == 2);
      expect(stackAfter.members[0].rect.top, stackBefore.members[0].rect.top);
      expect(stackAfter.members[0].rect.height, 168);
      expect(
        stackAfter.members[1].rect.top,
        stackBefore.members[1].rect.top + grow,
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
        offsets: const {2: Offset(30, 20), 5: Offset(500, 500)},
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
        fold: const AxisFoldSpec(hiddenStacks: {2}),
      );
      expect(layout.stacks, isEmpty);
      // 2 的折叠组被隐藏后，不再占位。
    });

    test('拉出人员的已保存偏移照常生效', () {
      final layout = compute(
        chain(),
        AxisOrientation.vertical,
        fold: const AxisFoldSpec(pulled: {5}),
        offsets: const {5: Offset(40, 0)},
      );
      final plain = compute(
        chain(),
        AxisOrientation.vertical,
        fold: const AxisFoldSpec(pulled: {5}),
      );
      expect(
        layout.personById(5)!.rect,
        plain.personById(5)!.rect.shift(const Offset(40, 0)),
      );
    });
  });

  group('折叠门槛规则纯函数覆盖', () {
    // 纯函数必须覆盖：不足 5 人、正好 5 人、6 人、多根合计、
    // 拉出者占名额挤出原第 5 人、上级链占名额、第 3 层默认折叠、
    // 收回显示条件、失效 id、“我的职责”不受影响。

    test('不足 5 人：第 2 层不足 5 人时全部默认上轴', () {
      final nodes = [
        person(1, null),
        person(2, 1, sortOrder: 0),
        person(3, 1, sortOrder: 1),
        person(4, 1, sortOrder: 2),
      ];
      final members = axisMemberIds(nodes, const AxisFoldSpec());
      expect(members, {1, 2, 3, 4});
    });

    test('正好 5 人：第 2 层正好 5 人时全部默认上轴', () {
      final nodes = [
        person(1, null),
        person(2, 1, sortOrder: 0),
        person(3, 1, sortOrder: 1),
        person(4, 1, sortOrder: 2),
        person(5, 1, sortOrder: 3),
        person(6, 1, sortOrder: 4),
      ];
      final members = axisMemberIds(nodes, const AxisFoldSpec());
      expect(members, {1, 2, 3, 4, 5, 6});
    });

    test('6 人：第 2 层有 6 人时前 5 人默认上轴，第 6 人默认折叠', () {
      final nodes = [
        person(1, null),
        person(2, 1, sortOrder: 0),
        person(3, 1, sortOrder: 1),
        person(4, 1, sortOrder: 2),
        person(5, 1, sortOrder: 3),
        person(6, 1, sortOrder: 4),
        person(7, 1, sortOrder: 5),
      ];
      final members = axisMemberIds(nodes, const AxisFoldSpec());
      expect(members, {1, 2, 3, 4, 5, 6});
      expect(members.contains(7), isFalse);
    });

    test('多根合计：多个根节点时第 2 层跨根合并统计 5 个名额', () {
      final nodes = [
        person(1, null, sortOrder: 0),
        person(10, null, sortOrder: 1),
        // 根 1 的下属 3 人
        person(2, 1, sortOrder: 0),
        person(3, 1, sortOrder: 1),
        person(4, 1, sortOrder: 2),
        // 根 10 的下属 3 人
        person(11, 10, sortOrder: 0),
        person(12, 10, sortOrder: 1),
        person(13, 10, sortOrder: 2),
      ];
      // 跨根合计第 2 层共 6 人，顺序为 2, 3, 4, 11, 12, 13。
      // 前 5 人（2, 3, 4, 11, 12）上轴，13 折叠。
      final members = axisMemberIds(nodes, const AxisFoldSpec());
      expect(members, {1, 10, 2, 3, 4, 11, 12});
      expect(members.contains(13), isFalse);
    });

    test('拉出者占名额挤出原第 5 人：第 2 层第 6 人拉出先占名额，挤出原第 5 人折叠', () {
      final nodes = [
        person(1, null),
        person(2, 1, sortOrder: 0),
        person(3, 1, sortOrder: 1),
        person(4, 1, sortOrder: 2),
        person(5, 1, sortOrder: 3),
        person(6, 1, sortOrder: 4),
        person(7, 1, sortOrder: 5),
      ];
      // 拉出 7：7 占名额，剩余 4 个名额给 2, 3, 4, 5；6 被挤出折叠。
      final members =
          axisMemberIds(nodes, const AxisFoldSpec(pulled: {7}));
      expect(members, {1, 2, 3, 4, 5, 7});
      expect(members.contains(6), isFalse);
    });

    test('上级链占名额：当前用户上级链在第 2 层时先占名额，其余名额按顺序分配', () {
      final nodes = [
        person(1, null),
        person(2, 1, sortOrder: 0),
        person(3, 1, sortOrder: 1),
        person(4, 1, sortOrder: 2),
        person(5, 1, sortOrder: 3),
        person(6, 1, sortOrder: 4),
        person(7, 1, sortOrder: 5),
        person(8, 7), // 8 是 7 的下属
      ];
      // selfId = 8：上级链为 7 和 1；7 在第 2 层先占名额，剩余 4 个名额给 2, 3, 4, 5；6 折叠。
      final members =
          axisMemberIds(nodes, const AxisFoldSpec(selfId: 8));
      expect(members, {1, 2, 3, 4, 5, 7});
      expect(members.contains(6), isFalse);
      expect(members.contains(8), isFalse); // 本人不上轴
    });

    test('第 3 层默认折叠：第 3 层及以下人员即使名额未满也默认折叠', () {
      final nodes = [
        person(1, null),
        person(2, 1),
        person(3, 2), // 第 3 层
        person(4, 3), // 第 4 层
      ];
      final members = axisMemberIds(nodes, const AxisFoldSpec());
      // 只有根 1 和第 2 层的 2 上轴，3 和 4 默认折叠。
      expect(members, {1, 2});
    });

    test('收回显示条件：默认名额内不显示、根与上级链不显示、超额拉出与第 3 层拉出显示', () {
      final nodes = [
        person(1, null),
        person(2, 1, sortOrder: 0),
        person(3, 1, sortOrder: 1),
        person(4, 1, sortOrder: 2),
        person(5, 1, sortOrder: 3),
        person(6, 1, sortOrder: 4),
        person(7, 1, sortOrder: 5), // 第 2 层超名额人员
        person(8, 2), // 第 3 层人员
      ];

      // 1. 根人员不提供收回
      expect(canReturnPerson(nodes, const AxisFoldSpec(pulled: {1}), 1), isFalse);

      // 2. 未被拉出的人不提供收回
      expect(canReturnPerson(nodes, const AxisFoldSpec(), 7), isFalse);

      // 3. 第 2 层在名额内的人（例如 2）：即使被拉出，收回后依然在名额内上轴，不显示收回
      expect(canReturnPerson(nodes, const AxisFoldSpec(pulled: {2}), 2), isFalse);

      // 4. 第 2 层超名额人员 7：被拉出后上轴，收回后确实会离开人轴回到折叠，显示收回
      expect(canReturnPerson(nodes, const AxisFoldSpec(pulled: {7}), 7), isTrue);

      // 5. 第 3 层人员 8：被拉出后上轴，收回后离开人轴回到折叠，显示收回
      expect(canReturnPerson(nodes, const AxisFoldSpec(pulled: {8}), 8), isTrue);

      // 6. 当前用户上级链上的人不提供收回：即使 7 被拉出，若 7 是 selfId 的上级，也不提供
      expect(
        canReturnPerson(
          [...nodes, person(9, 7)],
          const AxisFoldSpec(pulled: {7}, selfId: 9),
          7,
        ),
        isFalse,
      );

      // 7. returnableMemberIds 集合返回结果准确
      final returnable = returnableMemberIds(
        nodes,
        const AxisFoldSpec(pulled: {1, 2, 7, 8}),
      );
      expect(returnable, {7, 8});
    });

    test('失效 id：不存在的拉出 id 忽略，不占名额且不报错', () {
      final nodes = [
        person(1, null),
        person(2, 1, sortOrder: 0),
        person(3, 1, sortOrder: 1),
        person(4, 1, sortOrder: 2),
        person(5, 1, sortOrder: 3),
        person(6, 1, sortOrder: 4),
        person(7, 1, sortOrder: 5),
      ];
      // 999 不存在，直接忽略；前 5 人正常上轴，7 折叠
      final members = axisMemberIds(nodes, const AxisFoldSpec(pulled: {999}));
      expect(members, {1, 2, 3, 4, 5, 6});
      expect(canReturnPerson(nodes, const AxisFoldSpec(pulled: {999}), 999), isFalse);
    });

    test('“我的职责”不受影响：项目全貌折叠计算为纯函数，不污染节点数据与独立视图逻辑', () {
      final nodes = [
        person(1, null),
        person(2, 1),
        person(3, 2),
      ];
      final copy = List<AxisPersonNode>.of(nodes);
      final members = axisMemberIds(nodes, const AxisFoldSpec());
      expect(members, {1, 2});
      // 输入的节点列表与节点字段均未被修改
      expect(nodes.length, copy.length);
      for (var i = 0; i < nodes.length; i++) {
        expect(nodes[i].id, copy[i].id);
        expect(nodes[i].parentId, copy[i].parentId);
      }
      // “我的职责”视图 (AxisViewTab.mine) 独立于 foldSpec 且无折叠需求
      expect(AxisViewTab.mine.label, '我的职责');
      expect(AxisViewTab.overview.label, '项目全貌');
    });
  });
}
