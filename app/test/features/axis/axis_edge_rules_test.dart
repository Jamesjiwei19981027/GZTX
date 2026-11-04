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

Rect testRect(
  double centerX,
  double centerY, [
  double width = 200,
  double height = 100,
]) {
  return Rect.fromCenter(
    center: Offset(centerX, centerY),
    width: width,
    height: height,
  );
}

void main() {
  group('与网页连线算法一致性测试（对齐 frontend/scripts/test-people-axis-edges.ts）', () {
    // 1. Target straight to the right: anchor sits on right border midpoint.
    test('1. 目标在正右方：锚点落在右边框中点 (100, 0)', () {
      final a = borderAnchor(testRect(0, 0), 500, 0);
      expect(a.side, RectSide.right);
      expect(a.x, 100);
      expect(a.y, 0);
    });

    // 2. Target straight below: anchor sits on bottom border midpoint.
    test('2. 目标在正下方：锚点落在底边框中点 (0, 50)', () {
      final a = borderAnchor(testRect(0, 0), 0, 400);
      expect(a.side, RectSide.bottom);
      expect(a.x, 0);
      expect(a.y, 50);
    });

    // 3. Diagonal target: anchor slides along the border (not stuck at midpoints)
    // and always stays exactly on the rectangle outline.
    test('3. 对角方向目标：锚点沿边框滑动，不卡在中点 (100, 40)', () {
      final a = borderAnchor(testRect(0, 0), 300, 120);
      expect(a.side, RectSide.right);
      expect(a.x, 100);
      expect(a.y, 40); // 120 * (100 / 300) = 40
    });

    // 4. Continuity across the corner: just before/after the diagonal where the
    // binding side flips, both anchors converge to the same corner point.
    test('4. 跨拐角连续性：对角线翻转前后锚点平滑过渡到同一拐点', () {
      final r = testRect(0, 0);
      final before = borderAnchor(r, 200, 99.99);
      final after = borderAnchor(r, 200, 100.01);
      final dist = (before.offset - after.offset).distance;
      expect(dist < 0.5, isTrue);
    });

    // 5. Moving the target moves the anchor: edges follow dragged nodes.
    test('5. 移动目标节点时锚点跟随移动', () {
      final r = testRect(0, 0);
      final a1 = borderAnchor(r, 400, -80);
      final a2 = borderAnchor(r, 400, 80);
      expect(a1.y != a2.y, isTrue);
    });

    // 6. floatingEdgePath produces a single smooth cubic bezier anchored on both borders.
    test('6. floatingEdgePath 生成以两卡片边框为锚点的光滑三次贝塞尔曲线', () {
      final d = floatingEdgePath(testRect(0, 0), testRect(600, 300));
      expect(RegExp(r'^M 100 \S+ C .+, .+, 500 \S+$').hasMatch(d), isTrue);
    });

    // 7. Degenerate case (same center) must not produce NaN.
    test('7. 退化用例（相同中心）不产生 NaN', () {
      final d = floatingEdgePath(testRect(0, 0), testRect(0, 0));
      expect(d.contains('NaN'), isFalse);
    });

    // 8. Subordinate ports follow the group and remain distinct from project anchors.
    test('8. 下属端口跟随群体且独立于主项目锚点', () {
      final source = testRect(0, 0);
      final right = subordinatePortAnchor(
        source,
        [testRect(400, 0)],
        AxisOrientation.horizontal,
      );
      final left = subordinatePortAnchor(
        source,
        [testRect(-400, 0)],
        AxisOrientation.horizontal,
      );
      expect(right.side, RectSide.right);
      expect(left.side, RectSide.left);
      expect(right.y != 0, isTrue);
      final curve = floatingEdgePath(source, testRect(400, 0), right);
      expect(curve.startsWith('M ${right.x.toInt()} ${right.y.toInt()} C '), isTrue);
    });

    // 9. All subordinate edges share the port facing their visible group centroid.
    test('9. 同一下属群体共享朝向质心的下属端口', () {
      final source = testRect(0, 0);
      final group = subordinatePortAnchor(
        source,
        [testRect(400, 100), testRect(400, -100)],
        AxisOrientation.vertical,
      );
      expect(
        group,
        subordinatePortAnchor(
          source,
          [testRect(400, 0)],
          AxisOrientation.vertical,
        ),
      );
    });

    // 10. Sliding around a corner must not jump the separate attachment point.
    test('10. 绕角滑动时下属端口不突变跳跃', () {
      final source = testRect(0, 0);
      final before = subordinatePortAnchor(
        source,
        [testRect(200, 99.99)],
        AxisOrientation.vertical,
      );
      final after = subordinatePortAnchor(
        source,
        [testRect(200, 100.01)],
        AxisOrientation.vertical,
      );
      final dist = (before.offset - after.offset).distance;
      expect(dist < 0.5, isTrue);
    });

    test('直线连线 straightEdgePath 纯文本路径严格对齐网页', () {
      expect(
        straightEdgePath(testRect(0, 0), testRect(600, 0)),
        'M 100 0 L 500 0',
      );
      expect(
        straightEdgePath(testRect(0, 0), testRect(600, 300)),
        'M 100 50 L 500 250',
      );
    });

    test('floatingEdgeGeometry 控制点距离系数与网页严格一致', () {
      final geom = floatingEdgeGeometry(testRect(0, 0), testRect(600, 0));
      expect(geom.from.x, 100);
      expect(geom.from.y, 0);
      expect(geom.to.x, 500);
      expect(geom.to.y, 0);
      // dist = 400, k = round2(min(160, max(28, 400 * 0.42))) = round2(160) = 160
      expect(geom.control1, const Offset(260, 0));
      expect(geom.control2, const Offset(340, 0));
    });
  });

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
