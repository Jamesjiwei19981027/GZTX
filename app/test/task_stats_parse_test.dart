import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/models/models.dart';

/// TaskStats 解析回归测试。
///
/// 历史缺陷：后端 by_priority 的实际形状是
///   {"high": {"total": n, "completed": m}, "medium": {...}, "low": {...}}
/// 而解析写成 `byPriority['high'] as num?` —— 拿 Map 强转 num 在 Dart 里直接
/// 抛 TypeError（as num? 只放行 null 与 num）。异常冲出 app_state 的
/// Future.wait([listTasks(), stats()])，taskItems 从来赋不上值 ——
/// APP 的任务列表与仪表盘一直是空的，界面只显示"暂无任务"。
void main() {
  test('解析后端真实形状的 by_priority（嵌套 Map）', () {
    final stats = TaskStats.fromJson({
      'total': 7,
      'completed': 2,
      'pending': 4,
      'in_progress': 1,
      'overdue': 2,
      'completion_rate': 28.6,
      'by_priority': {
        'high': {'total': 2, 'completed': 0},
        'medium': {'total': 3, 'completed': 1},
        'low': {'total': 2, 'completed': 1},
      },
    });

    expect(stats.total, 7);
    expect(stats.completed, 2);
    expect(stats.inProgress, 1);
    expect(stats.overdue, 2);
    expect(stats.completionRate, 28.6);
    // 未完成的高优数量，与 Web 的 bp.high.total - bp.high.completed 同口径
    expect(stats.highPriority, 2);
  });

  test('兼容扁平计数形状 {"high": n}', () {
    final stats = TaskStats.fromJson({
      'total': 1,
      'by_priority': {'high': 5},
    });
    expect(stats.highPriority, 5);
  });

  test('兼容列表形状与缺失字段', () {
    expect(
      TaskStats.fromJson({
        'by_priority': [
          {'priority': 2, 'count': 3},
        ],
      }).highPriority,
      3,
    );
    expect(TaskStats.fromJson({}).highPriority, 0);
    expect(TaskStats.fromJson({}).total, 0);
  });

  test('completion_rate 是百分数而非 0-1 比率', () {
    expect(TaskStats.fromJson({'completion_rate': 28.6}).completionRate, 28.6);
  });
}
