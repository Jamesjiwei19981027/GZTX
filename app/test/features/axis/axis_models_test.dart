import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/axis/data/axis_models.dart';

import 'axis_test_harness.dart';

/// 里程碑 / 普通事项的进度状态解析，夹具严格按后端真实结构：
/// - 里程碑完成写 `progress_json.status == 'reached'`，通常没有 `percent`；
/// - 未达成为 `not_reached`；
/// - 普通事项完成写 `done` 或 `completed`。
void main() {
  Map<String, dynamic> progressSnapshot({
    required Map<String, dynamic> progress,
  }) =>
      {'node_id': 301, 'progress_json': progress, 'recent_records': <dynamic>[]};

  test('里程碑 reached 且没有 percent 时按已完成、100% 展示', () {
    final item = AxisWorkItem.fromJson(
      AxisTestHarness.milestone(
        id: 301,
        parentId: 101,
        title: 'V1 上线',
        status: 'reached',
      ),
    );

    expect(item.isMilestone, isTrue);
    expect(item.isDone, isTrue);
    expect(item.percent, 100);
    expect(item.statusLabel, '已完成');
  });

  test('里程碑 not_reached 显示未达成而不是进行中', () {
    final item = AxisWorkItem.fromJson(
      AxisTestHarness.milestone(
        id: 302,
        parentId: 101,
        title: 'V2 上线',
      ),
    );

    expect(item.isDone, isFalse);
    expect(item.percent, 0);
    expect(item.statusLabel, '未达成');
  });

  test('普通事项 completed 时百分比同样归一为 100', () {
    final item = AxisWorkItem.fromJson(
      AxisTestHarness.workItem(
        id: 303,
        parentId: 101,
        title: '需求评审',
        percent: 60,
        status: 'completed',
      ),
    );

    expect(item.isDone, isTrue);
    expect(item.percent, 100);
    expect(item.statusLabel, '已完成');
  });

  test('进度快照对里程碑 reached 使用同一口径', () {
    final done = AxisProgressSnapshot.fromJson(
      progressSnapshot(
        progress: const {'template': 'milestone', 'status': 'reached'},
      ),
    );
    expect(done.percent, 100);
    expect(done.statusLabel, '已完成');

    final pending = AxisProgressSnapshot.fromJson(
      progressSnapshot(
        progress: const {'template': 'milestone', 'status': 'not_reached'},
      ),
    );
    expect(pending.percent, 0);
    expect(pending.statusLabel, '未达成');
  });
}
