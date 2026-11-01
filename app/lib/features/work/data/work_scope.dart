/// 任务范围与筛选规则。
///
/// 与网页 `utils/taskScope.ts`、`utils/taskWorkspace.ts` 以及
/// `MobileWorkScreens.tsx` 的重点待办排序逐条对齐。
library;

import 'work_models.dart';

/// 任务归属范围。`all` / `null` 表示个人待办，正整数字符串表示项目任务。
class TaskScope {
  const TaskScope({required this.projectId, required this.origin});

  final int? projectId;

  /// `personal` 或 `project_link`，与后端 `TaskCreate.origin` 一致。
  final String origin;

  bool get isPersonal => origin == 'personal';

  /// 网页 `normalizeTaskScope`：非法输入抛错，绝不用首个项目顶替个人范围。
  factory TaskScope.normalize(String? projectId) {
    final value = projectId?.trim();
    if (value == null || value.isEmpty || value == 'all') {
      return const TaskScope(projectId: null, origin: 'personal');
    }
    final parsed = int.tryParse(value);
    if (parsed != null && parsed > 0 && parsed.toString() == value) {
      return TaskScope(projectId: parsed, origin: 'project_link');
    }
    throw FormatException('无法识别的任务范围: $projectId');
  }

  /// 宽松版本：非法输入退回个人范围（表单初始化用，避免整页崩溃）。
  factory TaskScope.normalizeOrPersonal(String? projectId) {
    try {
      return TaskScope.normalize(projectId);
    } on FormatException {
      return const TaskScope(projectId: null, origin: 'personal');
    }
  }

  String describe(String? projectName) => isPersonal
      ? '任务所属范围：个人私有待办（跨项目总览可见）'
      : '任务所属范围：项目【${projectName ?? '项目 #$projectId'}】';

  String get shortLabel => isPersonal ? '归属：个人待办事项' : '归属：项目 #$projectId';
}

/// 任务工作区范围（对应网页 `TaskWorkspaceScope`）。
enum TaskWorkspaceScope {
  all('全部任务'),
  pending('未完成'),
  today('今日到期'),
  overdue('已逾期');

  const TaskWorkspaceScope(this.label);

  final String label;

  static TaskWorkspaceScope fromQuery(String? value) => switch (value) {
        'pending' => TaskWorkspaceScope.pending,
        'today' => TaskWorkspaceScope.today,
        'overdue' => TaskWorkspaceScope.overdue,
        _ => TaskWorkspaceScope.all,
      };

  String get queryValue => switch (this) {
        TaskWorkspaceScope.pending => 'pending',
        TaskWorkspaceScope.today => 'today',
        TaskWorkspaceScope.overdue => 'overdue',
        TaskWorkspaceScope.all => 'all',
      };
}

/// 状态筛选（任务列表底部三颗胶囊）。
enum TaskStatusFilter {
  all('全部'),
  pending('未完成'),
  done('已完成');

  const TaskStatusFilter(this.label);

  final String label;
}

/// 优先级筛选。
enum TaskPriorityFilter {
  all('全部优先级', null),
  high('高优先级', 2),
  medium('中优先级', 1),
  low('低优先级', 0);

  const TaskPriorityFilter(this.label, this.value);

  final String label;
  final int? value;
}

/// 按工作区范围筛选（与 `filterTaskWorkspace` 完全一致）。
List<WorkTask> filterTaskWorkspace(
  List<WorkTask> tasks,
  TaskWorkspaceScope scope, {
  DateTime? now,
}) {
  final today = TaskTime.todayKey(now);
  return tasks.where((task) {
    if (scope == TaskWorkspaceScope.all) return true;
    if (task.isDone) return false;
    return switch (scope) {
      TaskWorkspaceScope.pending => true,
      TaskWorkspaceScope.today => task.dueDate == today,
      TaskWorkspaceScope.overdue =>
        task.dueDate != null &&
            task.dueDate!.isNotEmpty &&
            task.dueDate!.compareTo(today) < 0,
      TaskWorkspaceScope.all => true,
    };
  }).toList();
}

/// 首页「重点待办与跟进」：未完成 + 按截止时间升序 + 无截止时间排最后，最多 5 条。
///
/// 排序键与网页一致：`dueDate ?? '9999-12-31'` 拼接 `dueTime ?? '23:59'`。
List<WorkTask> focusTasks(List<WorkTask> tasks, {int limit = 5}) {
  final pending = tasks.where((task) => !task.isDone).toList()
    ..sort((a, b) => a.dueSortKey.compareTo(b.dueSortKey));
  return pending.take(limit).toList();
}

/// 未完成数量（首页底部「共 N 项」）。
int pendingCount(List<WorkTask> tasks) =>
    tasks.where((task) => !task.isDone).length;

/// 按本地日期分组，组内按截止时刻升序。键为本地 `YYYY-MM-DD`。
Map<String, List<WorkTask>> groupTasksByLocalDay(List<WorkTask> tasks) {
  final map = <String, List<WorkTask>>{};
  for (final task in tasks) {
    final day = task.dueDate;
    if (day == null || day.isEmpty) continue;
    map.putIfAbsent(day, () => <WorkTask>[]).add(task);
  }
  for (final entry in map.entries) {
    entry.value.sort(
      (a, b) => (a.dueTime ?? '23:59').compareTo(b.dueTime ?? '23:59'),
    );
  }
  return map;
}

/// 任务列表筛选（搜索 + 状态 + 优先级），与 `MobileMyTasksScreen` 一致。
List<WorkTask> filterTaskList(
  List<WorkTask> tasks, {
  required TaskStatusFilter status,
  required TaskPriorityFilter priority,
  String search = '',
}) {
  final query = search.trim().toLowerCase();
  return tasks.where((task) {
    final matchesStatus = switch (status) {
      TaskStatusFilter.all => true,
      TaskStatusFilter.pending => !task.isDone,
      TaskStatusFilter.done => task.isDone,
    };
    final matchesPriority =
        priority.value == null || task.priority == priority.value;
    final matchesSearch = query.isEmpty ||
        task.title.toLowerCase().contains(query) ||
        (task.description ?? '').toLowerCase().contains(query);
    return matchesStatus && matchesPriority && matchesSearch;
  }).toList();
}

/// 看板三列的顺序与文案。
const kanbanColumns = <int, String>{
  0: '待办事项',
  1: '进行中',
  2: '已完成',
};

int countByStatus(List<WorkTask> tasks, int status) =>
    tasks.where((task) => task.status == status).length;

/// 首页待办汇总卡数据：待办（含进行中）、今日到期、已逾期。
({int pending, int dueToday, int overdue}) summaryCounts(
  List<WorkTask> tasks, {
  DateTime? now,
}) {
  final today = TaskTime.todayKey(now);
  return (
    pending: tasks.where((task) => task.status == 0 || task.status == 1).length,
    dueToday: tasks
        .where((task) => !task.isDone && task.dueDate == today)
        .length,
    overdue: tasks
        .where((task) =>
            !task.isDone &&
            task.dueDate != null &&
            task.dueDate!.isNotEmpty &&
            task.dueDate!.compareTo(today) < 0)
        .length,
  );
}
