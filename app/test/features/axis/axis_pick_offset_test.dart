import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/axis/data/axis_tree_mapper.dart';
import 'package:worktodo_app/features/axis/data/axis_view_models.dart';

void main() {
  group('pickUiOffset 按方向取偏移纯函数测试（对齐 MOBILE-SPEC 第 6 节）', () {
    test('同时存在两个方向 ui_offsets 时，按请求方向精准提取', () {
      final node = {
        'ui_offsets': {
          'horizontal': {'x': 12.5, 'y': 34.0},
          'vertical': {'x': 56.0, 'y': 78.5},
        },
      };

      expect(
        pickUiOffset(node, AxisOrientation.horizontal),
        const Offset(12.5, 34.0),
      );
      expect(
        pickUiOffset(node, AxisOrientation.vertical),
        const Offset(56.0, 78.5),
      );
    });

    test('嵌套在 progress_json.ui_offsets 中的双方向偏移也能正确解析', () {
      final node = {
        'progress_json': {
          'ui_offsets': {
            'horizontal': {'x': 100, 'y': 200},
            'vertical': {'x': 300, 'y': 400},
          },
        },
      };

      expect(
        pickUiOffset(node, AxisOrientation.horizontal),
        const Offset(100, 200),
      );
      expect(
        pickUiOffset(node, AxisOrientation.vertical),
        const Offset(300, 400),
      );
    });

    test('只有旧字段 ui_offset 时：横向读取该偏移，纵向严格返回 Offset.zero', () {
      final node = {
        'ui_offset': {'x': 45.0, 'y': 80.0},
      };

      expect(
        pickUiOffset(node, AxisOrientation.horizontal),
        const Offset(45.0, 80.0),
      );
      expect(
        pickUiOffset(node, AxisOrientation.vertical),
        Offset.zero,
      );
    });

    test('嵌套在 progress_json.ui_offset 中的旧字段：横向读取，纵向为 Offset.zero', () {
      final node = {
        'progress_json': {
          'ui_offset': {'x': 77, 'y': 88},
        },
      };

      expect(
        pickUiOffset(node, AxisOrientation.horizontal),
        const Offset(77, 88),
      );
      expect(
        pickUiOffset(node, AxisOrientation.vertical),
        Offset.zero,
      );
    });

    test('ui_offsets 存在但缺少该方向：横向退回到 ui_offset，纵向返回 Offset.zero', () {
      final node = {
        'ui_offsets': {
          'vertical': {'x': 15, 'y': 25},
        },
        'ui_offset': {'x': 99, 'y': 99},
      };

      expect(
        pickUiOffset(node, AxisOrientation.horizontal),
        const Offset(99, 99),
      );
      expect(
        pickUiOffset(node, AxisOrientation.vertical),
        const Offset(15, 25),
      );
    });

    test('无任何偏移字段或数据格式异常：返回 Offset.zero 不崩溃', () {
      expect(pickUiOffset({}, AxisOrientation.horizontal), Offset.zero);
      expect(pickUiOffset({}, AxisOrientation.vertical), Offset.zero);
      expect(
        pickUiOffset({
          'ui_offsets': 'invalid',
          'ui_offset': null,
        }, AxisOrientation.horizontal),
        Offset.zero,
      );
      expect(
        pickUiOffset({
          'ui_offsets': {
            'horizontal': {'x': 'invalid', 'y': null},
          },
        }, AxisOrientation.horizontal),
        Offset.zero,
      );
    });
  });
}
