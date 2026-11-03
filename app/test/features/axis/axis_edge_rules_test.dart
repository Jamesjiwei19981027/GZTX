import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/axis/data/axis_edge_rules.dart';
import 'package:worktodo_app/features/axis/data/axis_models.dart';
import 'package:worktodo_app/features/axis/data/axis_view_models.dart';

AxisPersonNode person(int id, int? parentId) => AxisPersonNode(
  id: id,
  parentId: parentId,
  title: '$id',
  description: null,
  name: '$id',
  roleTitle: '岗位',
  department: '部门',
  nodeOrigin: parentId == null ? 'project' : 'subordinate',
  isTerminalPm: parentId == null,
  ownerUserIds: const [],
  workItems: const [],
  responsibilityPermissions: const {},
);

const cardSize = Size(240, 168);

void main() {
  group('highlightConnectionIds 高亮连线', () {
    // 1 -> 2 -> 3 -> {4, 5}；1 -> 6
    final nodes = [
      person(1, null),
      person(2, 1),
      person(3, 2),
      person(4, 3),
      person(5, 3),
      person(6, 1),
    ];

    test('聚焦 3：到根的整条链路（1-2、2-3）+ 到直接下属（3-4、3-5）共 4 条', () {
      expect(highlightConnectionIds(nodes, 3), {'1-2', '2-3', '3-4', '3-5'});
    });

    test('聚焦根：只有到直接下属的连线', () {
      expect(highlightConnectionIds(nodes, 1), {'1-2', '1-6'});
    });

    test('聚焦叶子：只有到根的链路，不含兄弟分支', () {
      expect(highlightConnectionIds(nodes, 6), {'1-6'});
      expect(highlightConnectionIds(nodes, 4), {'1-2', '2-3', '3-4'});
    });

    test('没有聚焦或聚焦不存在的人：空集合', () {
      expect(highlightConnectionIds(nodes, null), isEmpty);
      expect(highlightConnectionIds(nodes, 999), isEmpty);
    });
  });

  group('snapToParentAxis 吸附', () {
    // 父卡片在原点，中心 (120, 84)。
    test('横向：中心 y 差 15px 吸附，17px 不吸附，正好 16px 不吸附', () {
      final near = snapToParentAxis(
        childTopLeft: const Offset(328, 15),
        cardSize: cardSize,
        parentTopLeft: Offset.zero,
        orientation: AxisOrientation.horizontal,
      );
      expect(near.snapped, isTrue);
      expect(near.position, const Offset(328, 0));
      expect(near.referenceLineStart, isNotNull);
      expect(near.referenceLineEnd, isNotNull);

      final far = snapToParentAxis(
        childTopLeft: const Offset(328, 17),
        cardSize: cardSize,
        parentTopLeft: Offset.zero,
        orientation: AxisOrientation.horizontal,
      );
      expect(far.snapped, isFalse);
      expect(far.position, const Offset(328, 17));
      expect(far.referenceLineStart, isNull);
      expect(far.referenceLineEnd, isNull);

      final edge = snapToParentAxis(
        childTopLeft: const Offset(328, 16),
        cardSize: cardSize,
        parentTopLeft: Offset.zero,
        orientation: AxisOrientation.horizontal,
      );
      expect(edge.snapped, isFalse);
    });

    test('纵向：中心 x 差 15px 吸附，17px 不吸附', () {
      final near = snapToParentAxis(
        childTopLeft: const Offset(15, 256),
        cardSize: cardSize,
        parentTopLeft: Offset.zero,
        orientation: AxisOrientation.vertical,
      );
      expect(near.snapped, isTrue);
      expect(near.position, const Offset(0, 256));

      final far = snapToParentAxis(
        childTopLeft: const Offset(17, 256),
        cardSize: cardSize,
        parentTopLeft: Offset.zero,
        orientation: AxisOrientation.vertical,
      );
      expect(far.snapped, isFalse);
      expect(far.position, const Offset(17, 256));
    });

    test('偏向负方向同样吸附；只改垂直于展开方向的坐标', () {
      final h = snapToParentAxis(
        childTopLeft: const Offset(400, 100 - 12),
        cardSize: cardSize,
        parentTopLeft: const Offset(0, 100),
        orientation: AxisOrientation.horizontal,
      );
      expect(h.snapped, isTrue);
      expect(h.position, const Offset(400, 100));

      final v = snapToParentAxis(
        childTopLeft: const Offset(200 - 12, 300),
        cardSize: cardSize,
        parentTopLeft: const Offset(200, 0),
        orientation: AxisOrientation.vertical,
      );
      expect(v.snapped, isTrue);
      expect(v.position, const Offset(200, 300));
    });

    test('参考线沿父卡片中心所在的直线，从父卡片中心画到子卡片中心', () {
      final h = snapToParentAxis(
        childTopLeft: const Offset(328, 10),
        cardSize: cardSize,
        parentTopLeft: Offset.zero,
        orientation: AxisOrientation.horizontal,
      );
      expect(h.referenceLineStart, const Offset(120, 84));
      expect(h.referenceLineEnd, const Offset(328 + 120, 84));
      final v = snapToParentAxis(
        childTopLeft: const Offset(10, 256),
        cardSize: cardSize,
        parentTopLeft: Offset.zero,
        orientation: AxisOrientation.vertical,
      );
      expect(v.referenceLineStart, const Offset(120, 84));
      expect(v.referenceLineEnd, const Offset(120, 256 + 84));
    });
  });
}
