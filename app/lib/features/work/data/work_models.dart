/// T02 工作 Tab 数据模型。
///
/// 字段与后端响应严格对齐（`app/schemas/task.py::TaskResponse`）：
/// - 时间一律为 UTC ISO 串（带 `Z`），模型内统一解析为**本地时间**；
/// - 日期分组一律使用本地日期键 `YYYY-MM-DD`（见 [TaskTime]）；
/// - 状态 0/1/2 = 待办/进行中/已完成，优先级 0/1/2 = 低/中/高。
library;

import '../../../core/time/time_utils.dart';

/// 本地日期与后端 UTC 时间的双向换算。
class TaskTime {
  TaskTime._();

  static String _pad(int n) => n.toString().padLeft(2, '0');

  /// 本地时间 → 本地日期键 `YYYY-MM-DD`（供页面直接调用）。
  static String localDateKey(DateTime local) =>
      '${local.year.toString().padLeft(4, '0')}-${_pad(local.month)}-${_pad(local.day)}';

  /// 本地日期（`YYYY-MM-DD`）+ 可选本地时刻（`HH:mm`）→ UTC ISO 串。
  ///
  /// 与网页 `utils/datetime.ts::toApiDueDate` 同口径：没有时刻按当天 00:00。
  static String? toApiDueDate(String? date, [String? time]) {
    if (date == null) return null;
    final match = RegExp(r'^(\d{4})-(\d{1,2})-(\d{1,2})$').firstMatch(date.trim());
    if (match == null) return null;
    final clock = RegExp(r'^(\d{1,2}):(\d{2})').firstMatch((time ?? '').trim());
    final local = DateTime(
      int.parse(match.group(1)!),
      int.parse(match.group(2)!),
      int.parse(match.group(3)!),
      clock == null ? 0 : int.parse(clock.group(1)!),
      clock == null ? 0 : int.parse(clock.group(2)!),
    );
    return localToApi(local);
  }

  /// UTC ISO → 本地 `date` / `time`。
  ///
  /// 本地时刻正好 00:00 视为「只有日期、没有具体时刻」，与后端全天事件同口径。
  static ({String date, String? time}) fromApiDueDate(String? iso) {
    final local = parseApiDateTime(iso);
    if (local == null) return (date: '', time: null);
    final date = localDateKey(local);
    final isMidnight =
        local.hour == 0 && local.minute == 0 && local.second == 0;
    if (isMidnight) return (date: date, time: null);
    return (date: date, time: '${_pad(local.hour)}:${_pad(local.minute)}');
  }

  /// UTC ISO → 本地日期键；空值返回空串。
  static String localDayOf(String? iso) => apiDateToLocalKey(iso);

  /// 本地日期键 → 当天 00:00 的本地 `DateTime`。
  static DateTime? parseLocalDay(String? key) {
    if (key == null || key.isEmpty) return null;
    final parts = key.split('-');
    if (parts.length != 3) return null;
    final y = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    final d = int.tryParse(parts[2]);
    if (y == null || m == null || d == null) return null;
    return DateTime(y, m, d);
  }

  static String todayKey([DateTime? now]) => localDateKey(now ?? DateTime.now());

  static String monthKey(DateTime day) =>
      '${day.year.toString().padLeft(4, '0')}-${_pad(day.month)}';

  /// 本地日期键 ± 天数（用于日历翻页、区间判断）。
  static String shiftDay(String key, int days) {
    final day = parseLocalDay(key) ?? DateTime.now();
    return localDateKey(day.add(Duration(days: days)));
  }
}

/// 清单项（`checklist` JSON 数组元素）。
class ChecklistItem {
  const ChecklistItem({
    required this.id,
    required this.title,
    this.completed = false,
  });

  final String id;
  final String title;
  final bool completed;

  ChecklistItem copyWith({String? title, bool? completed}) => ChecklistItem(
        id: id,
        title: title ?? this.title,
        completed: completed ?? this.completed,
      );

  factory ChecklistItem.fromJson(Map<String, dynamic> json) => ChecklistItem(
        id: (json['id'] ?? '').toString(),
        title: (json['title'] ?? '').toString(),
        completed: json['completed'] == true,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'completed': completed,
      };
}

/// 任务执行人（后端 `assignees` 数组元素）。
class TaskAssignee {
  const TaskAssignee({
    required this.userId,
    required this.displayName,
    this.roleKey,
    this.username,
  });

  final int userId;
  final String displayName;
  final String? roleKey;
  final String? username;

  factory TaskAssignee.fromJson(Map<String, dynamic> json) => TaskAssignee(
        userId: (json['user_id'] as num?)?.toInt() ?? 0,
        displayName: (json['display_name'] ??
                json['nickname'] ??
                json['username'] ??
                '')
            .toString(),
        roleKey: json['role_key']?.toString(),
        username: json['username']?.toString(),
      );
}

/// 分类。
class TaskCategory {
  const TaskCategory({required this.id, required this.name, this.color});

  final int id;
  final String name;
  final String? color;

  factory TaskCategory.fromJson(Map<String, dynamic> json) => TaskCategory(
        id: (json['id'] as num?)?.toInt() ?? 0,
        name: (json['name'] ?? '').toString(),
        color: json['color']?.toString(),
      );
}

/// 标签。
class TaskTag {
  const TaskTag({required this.id, required this.name, this.color});

  final int id;
  final String name;
  final String? color;

  factory TaskTag.fromJson(Map<String, dynamic> json) => TaskTag(
        id: (json['id'] as num?)?.toInt() ?? 0,
        name: (json['name'] ?? '').toString(),
        color: json['color']?.toString(),
      );
}

/// 任务。后端出参的时间字段统一为 UTC ISO 串。
class WorkTask {
  const WorkTask({
    required this.id,
    required this.title,
    this.description,
    this.priority = 1,
    this.status = 0,
    this.dueDate,
    this.dueTime,
    this.rawDueDate,
    this.categoryId,
    this.categoryName,
    this.tags = const [],
    this.isRecurring = false,
    this.recurrenceRule,
    this.rawRecurrenceRule,
    this.checklist = const [],
    this.assignees = const [],
    this.origin = 'personal',
    this.projectId,
    this.projectNodeId,
    this.linkedReadonly = true,
    this.createdAt,
    this.completedAt,
    this.deletedAt,
    this.sourceChannel,
    this.sourceTitle,
  });

  final int id;
  final String title;
  final String? description;

  /// 0 低 / 1 中 / 2 高。
  final int priority;

  /// 0 待办 / 1 进行中 / 2 已完成。
  final int status;

  /// 本地日期键 `YYYY-MM-DD`；无截止时间为 null。
  final String? dueDate;

  /// 本地时刻 `HH:mm`；全天事项为 null。
  final String? dueTime;

  /// 原始 UTC ISO 串，回填表单与判断是否变更时使用。
  final String? rawDueDate;

  final int? categoryId;
  final String? categoryName;
  final List<TaskTag> tags;
  final bool isRecurring;
  final String? recurrenceRule;
  final dynamic rawRecurrenceRule;
  final List<ChecklistItem> checklist;
  final List<TaskAssignee> assignees;
  final String origin;
  final int? projectId;
  final int? projectNodeId;

  /// 人轴责任链投影任务：只读，不可在待办里直接勾选或编辑。
  final bool linkedReadonly;

  final DateTime? createdAt;
  final DateTime? completedAt;
  final DateTime? deletedAt;
  final String? sourceChannel;
  final String? sourceTitle;

  bool get isDone => status == 2;

  bool get isOverdue {
    if (isDone) return false;
    final day = dueDate;
    if (day == null || day.isEmpty) return false;
    return day.compareTo(TaskTime.todayKey()) < 0;
  }

  bool get isDueToday => !isDone && dueDate == TaskTime.todayKey();

  /// 人轴投影的只读任务（网页 `task.linkedNodeId` 判断的等价物）。
  bool get isAxisLocked => linkedReadonly && origin == 'project_link';

  String get statusLabel => switch (status) {
        1 => '进行中',
        2 => '已完成',
        _ => '待办',
      };

  String get priorityLabel => switch (priority) {
        2 => '高优先级',
        0 => '低优先级',
        _ => '中优先级',
      };

  String get priorityShortLabel => switch (priority) {
        2 => '高优',
        0 => '低',
        _ => '中',
      };

  String get assigneeText {
    if (assignees.isEmpty) return '未指派';
    return assignees.map((a) => a.displayName).join('、');
  }

  /// 截止时间展示：`2026-03-01 18:00` / `2026-03-01` / `未指定`。
  String get dueText {
    if (dueDate == null || dueDate!.isEmpty) return '未指定';
    if (dueTime == null) return dueDate!;
    return '$dueDate $dueTime';
  }

  /// 首页重点待办排序键：同网页口径 `dueDate + dueTime`，无截止时间排最后。
  String get dueSortKey => '${dueDate ?? '9999-12-31'}T${dueTime ?? '23:59'}';

  WorkTask copyWith({
    int? status,
    DateTime? completedAt,
    bool clearCompletedAt = false,
  }) =>
      WorkTask(
        id: id,
        title: title,
        description: description,
        priority: priority,
        status: status ?? this.status,
        dueDate: dueDate,
        dueTime: dueTime,
        rawDueDate: rawDueDate,
        categoryId: categoryId,
        categoryName: categoryName,
        tags: tags,
        isRecurring: isRecurring,
        recurrenceRule: recurrenceRule,
        rawRecurrenceRule: rawRecurrenceRule,
        checklist: checklist,
        assignees: assignees,
        origin: origin,
        projectId: projectId,
        projectNodeId: projectNodeId,
        linkedReadonly: linkedReadonly,
        createdAt: createdAt,
        completedAt: clearCompletedAt ? null : (completedAt ?? this.completedAt),
        deletedAt: deletedAt,
        sourceChannel: sourceChannel,
        sourceTitle: sourceTitle,
      );

  factory WorkTask.fromJson(Map<String, dynamic> json) {
    final due = TaskTime.fromApiDueDate(json['due_date']?.toString());
    final category = json['category'];
    final tags = json['tags'];
    final checklist = json['checklist'];
    final assignees = json['assignees'];
    final rule = json['recurrence_rule'];
    String? ruleText;
    if (rule is String) {
      ruleText = rule;
    } else if (rule is Map) {
      ruleText = rule['frequency']?.toString();
    }
    return WorkTask(
      id: (json['id'] as num?)?.toInt() ?? 0,
      title: (json['title'] ?? '').toString(),
      description: json['description']?.toString(),
      priority: (json['priority'] as num?)?.toInt() ?? 1,
      status: (json['status'] as num?)?.toInt() ?? 0,
      dueDate: due.date.isEmpty ? null : due.date,
      dueTime: due.time,
      rawDueDate: json['due_date']?.toString(),
      categoryId: category is Map
          ? (category['id'] as num?)?.toInt()
          : (json['category_id'] as num?)?.toInt(),
      categoryName: category is Map ? category['name']?.toString() : null,
      tags: tags is List
          ? tags
              .whereType<Map>()
              .map((e) => TaskTag.fromJson(Map<String, dynamic>.from(e)))
              .toList()
          : const [],
      isRecurring: json['is_recurring'] == true,
      recurrenceRule: ruleText,
      rawRecurrenceRule: rule,
      checklist: checklist is List
          ? checklist
              .whereType<Map>()
              .map((e) => ChecklistItem.fromJson(Map<String, dynamic>.from(e)))
              .toList()
          : const [],
      assignees: assignees is List
          ? assignees
              .whereType<Map>()
              .map((e) => TaskAssignee.fromJson(Map<String, dynamic>.from(e)))
              .toList()
          : const [],
      origin: (json['origin'] ?? 'personal').toString(),
      projectId: (json['project_id'] as num?)?.toInt(),
      projectNodeId: (json['project_node_id'] as num?)?.toInt(),
      linkedReadonly: json['linked_readonly'] != false,
      createdAt: parseApiDateTime(json['created_at']?.toString()),
      completedAt: parseApiDateTime(json['completed_at']?.toString()),
      deletedAt: parseApiDateTime(json['deleted_at']?.toString()),
      sourceChannel: json['source_channel']?.toString(),
      sourceTitle: json['source_title']?.toString(),
    );
  }
}

/// 分页结果（后端 `PaginatedData`）。
class WorkTaskPage {
  const WorkTaskPage({
    required this.items,
    required this.total,
    this.page = 1,
    this.pageSize = 20,
    this.totalPages = 1,
  });

  final List<WorkTask> items;
  final int total;
  final int page;
  final int pageSize;
  final int totalPages;

  static const empty = WorkTaskPage(items: [], total: 0);

  factory WorkTaskPage.fromJson(Map<String, dynamic> json) {
    final items = json['items'];
    return WorkTaskPage(
      items: items is List
          ? items
              .whereType<Map>()
              .map((e) => WorkTask.fromJson(Map<String, dynamic>.from(e)))
              .toList()
          : const [],
      total: (json['total'] as num?)?.toInt() ?? 0,
      page: (json['page'] as num?)?.toInt() ?? 1,
      pageSize: (json['page_size'] as num?)?.toInt() ?? 20,
      totalPages: (json['total_pages'] as num?)?.toInt() ?? 1,
    );
  }
}

typedef TrashTaskPage = WorkTaskPage;

/// 统计（后端 `TaskStatsResponse` 的子集，含 `completion_rate`）。
class TaskStatsSummary {
  const TaskStatsSummary({
    this.total = 0,
    this.completed = 0,
    this.pending = 0,
    this.inProgress = 0,
    this.overdue = 0,
    this.completionRate = 0,
  });

  final int total;
  final int completed;
  final int pending;
  final int inProgress;
  final int overdue;
  final double completionRate;

  factory TaskStatsSummary.fromJson(Map<String, dynamic> json) =>
      TaskStatsSummary(
        total: (json['total'] as num?)?.toInt() ?? 0,
        completed: (json['completed'] as num?)?.toInt() ?? 0,
        pending: (json['pending'] as num?)?.toInt() ?? 0,
        inProgress: (json['in_progress'] as num?)?.toInt() ?? 0,
        overdue: (json['overdue'] as num?)?.toInt() ?? 0,
        completionRate: (json['completion_rate'] as num?)?.toDouble() ?? 0,
      );
}

/// 每日趋势点。
class TrendPoint {
  const TrendPoint({
    required this.date,
    required this.created,
    required this.completed,
  });

  final String date;
  final int created;
  final int completed;

  factory TrendPoint.fromJson(Map<String, dynamic> json) => TrendPoint(
        date: (json['date'] ?? '').toString(),
        created: (json['created'] as num?)?.toInt() ?? 0,
        completed: (json['completed'] as num?)?.toInt() ?? 0,
      );
}

/// 趋势序列。
class TaskTrend {
  const TaskTrend({this.period = 'week', this.series = const []});

  final String period;
  final List<TrendPoint> series;

  int get totalCreated =>
      series.fold(0, (sum, point) => sum + point.created);

  int get totalCompleted =>
      series.fold(0, (sum, point) => sum + point.completed);

  factory TaskTrend.fromJson(Map<String, dynamic> json) {
    final series = json['series'];
    return TaskTrend(
      period: (json['period'] ?? 'week').toString(),
      series: series is List
          ? series
              .whereType<Map>()
              .map((e) => TrendPoint.fromJson(Map<String, dynamic>.from(e)))
              .toList()
          : const [],
    );
  }
}

/// 排期变更记录（`/tasks/{id}/schedule-history`）。
class ScheduleChange {
  const ScheduleChange({
    required this.id,
    this.oldDueDate,
    this.newDueDate,
    this.createdAt,
  });

  final int id;
  final DateTime? oldDueDate;
  final DateTime? newDueDate;
  final DateTime? createdAt;

  factory ScheduleChange.fromJson(Map<String, dynamic> json) => ScheduleChange(
        id: (json['id'] as num?)?.toInt() ?? 0,
        oldDueDate: parseApiDateTime(json['old_due_date']?.toString()),
        newDueDate: parseApiDateTime(json['new_due_date']?.toString()),
        createdAt: parseApiDateTime(json['created_at']?.toString()),
      );
}

/// 从聊天文本提取的任务草稿（`/tasks/extract-from-chat`）。
class TaskExtractDraft {
  const TaskExtractDraft({
    required this.title,
    this.description,
    this.priority = 1,
    this.status = 0,
    this.dueDateIso,
    this.origin = 'personal',
    this.sourceChannel,
    this.sourceTitle,
  });

  final String title;
  final String? description;
  final int priority;
  final int status;

  /// 后端下发的 UTC ISO 串（原样回传创建接口）。
  final String? dueDateIso;
  final String origin;
  final String? sourceChannel;
  final String? sourceTitle;

  String get dueLocalDate => TaskTime.localDayOf(dueDateIso);

  factory TaskExtractDraft.fromJson(Map<String, dynamic> json) =>
      TaskExtractDraft(
        title: (json['title'] ?? '').toString(),
        description: json['description']?.toString(),
        priority: (json['priority'] as num?)?.toInt() ?? 1,
        status: (json['status'] as num?)?.toInt() ?? 0,
        dueDateIso: json['due_date']?.toString(),
        origin: (json['origin'] ?? 'personal').toString(),
        sourceChannel: json['source_channel']?.toString(),
        sourceTitle: json['source_title']?.toString(),
      );
}

/// 项目成员（`/projects/{id}/members`）。
class ProjectMember {
  const ProjectMember({
    required this.userId,
    required this.displayName,
    this.role,
    this.nickname,
  });

  final int userId;
  final String displayName;
  final String? role;
  final String? nickname;

  factory ProjectMember.fromJson(Map<String, dynamic> json) => ProjectMember(
        userId: (json['user_id'] as num?)?.toInt() ?? 0,
        displayName: (json['display_name'] ??
                json['nickname'] ??
                json['username'] ??
                '')
            .toString(),
        role: json['role']?.toString(),
        nickname: json['nickname']?.toString(),
      );
}

/// 项目进度摘要（首页「项目进度简介」，来自人轴事项与里程碑）。
class ProjectProgressSummary {
  const ProjectProgressSummary({
    required this.projectId,
    required this.projectName,
    this.percent = 0,
    this.total = 0,
    this.completed = 0,
    this.overdue = 0,
    this.next,
  });

  final int projectId;
  final String projectName;
  final int percent;
  final int total;
  final int completed;
  final int overdue;
  final String? next;

  /// 人树节点（`/projects/{id}/tree?format=nested`）只取事项与里程碑。
  static ProjectProgressSummary fromTree({
    required int projectId,
    required String projectName,
    required List<dynamic> nodes,
  }) {
    final items = <Map<String, dynamic>>[];
    void walk(List<dynamic> input) {
      for (final raw in input) {
        if (raw is! Map) continue;
        final node = Map<String, dynamic>.from(raw);
        final type = node['node_type_key'];
        if (type == 'work_item' || type == 'milestone') items.add(node);
        final children = node['children'];
        if (children is List) walk(children);
      }
    }

    walk(nodes);

    int percentOf(Map<String, dynamic> node) {
      final progress = node['progress_json'];
      final status = progress is Map ? progress['status']?.toString() : null;
      if (status == 'done' || status == 'completed' || status == 'reached') {
        return 100;
      }
      final raw = progress is Map ? (progress['percent'] as num?)?.toInt() : 0;
      return (raw ?? 0).clamp(0, 100);
    }

    String? deadlineOf(Map<String, dynamic> node) {
      final due = node['due_at']?.toString();
      if (due != null && due.isNotEmpty) return due;
      final milestone = node['milestone_at']?.toString();
      if (milestone != null && milestone.isNotEmpty) return milestone;
      return null;
    }

    final pending = items.where((node) => percentOf(node) < 100).toList();
    final withDeadline = pending
        .where((node) => deadlineOf(node) != null)
        .toList()
      ..sort((a, b) => deadlineOf(a)!.compareTo(deadlineOf(b)!));
    final now = DateTime.now().toUtc();
    final overdue = pending.where((node) {
      final deadline = parseApiDateTime(deadlineOf(node));
      return deadline != null && deadline.isBefore(now);
    }).length;

    final total = items.length;
    final sum = items.fold(0, (acc, node) => acc + percentOf(node));
    return ProjectProgressSummary(
      projectId: projectId,
      projectName: projectName,
      percent: total == 0 ? 0 : (sum / total).round(),
      total: total,
      completed: total - pending.length,
      overdue: overdue,
      next: withDeadline.isEmpty ? null : withDeadline.first['title']?.toString(),
    );
  }
}
