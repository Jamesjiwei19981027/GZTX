/// T02 工作模块测试夹具与假接口。
///
/// 结构严格对齐后端真实接口：
/// - `backend/app/schemas/task.py` (TaskResponse, TaskStatsResponse)
/// - `backend/app/api/v1/tasks.py` (list, detail, create, trash, schedule-history)
/// - `backend/app/api/v1/shell.py` (tasks/stats/trend)
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/core/errors/app_error.dart';
import 'package:worktodo_app/features/work/data/work_api.dart';
import 'package:worktodo_app/features/work/data/work_models.dart';

import '../../helpers/mock_api_client.dart';

/// 构造真实格式的任务 JSON。
Map<String, dynamic> buildTaskJson({
  required int id,
  required String title,
  String? description,
  int priority = 1,
  int status = 0,
  String? dueDate,
  String? completedAt,
  bool isRecurring = false,
  String? recurrenceRule,
  Map<String, dynamic>? category,
  List<Map<String, dynamic>> tags = const [],
  List<Map<String, dynamic>> reminders = const [],
  List<Map<String, dynamic>> checklist = const [],
  String origin = 'personal',
  int? companyId,
  int? projectId,
  int? projectNodeId,
  bool linkedReadonly = true,
  bool isDeleted = false,
  String? deletedAt,
}) {
  final priorityLabels = {0: '低', 1: '中', 2: '高'};
  final statusLabels = {0: '待办', 1: '进行中', 2: '已完成'};
  return {
    'id': id,
    'title': title,
    'description': description,
    'priority': priority,
    'priority_label': priorityLabels[priority] ?? '中',
    'status': status,
    'status_label': statusLabels[status] ?? '待办',
    'due_date': dueDate,
    'completed_at': completedAt,
    'is_recurring': isRecurring,
    'recurrence_rule': recurrenceRule,
    'parent_task_id': null,
    'checklist': checklist,
    'category': category,
    'tags': tags,
    'reminders': reminders,
    'is_deleted': isDeleted,
    'deleted_at': deletedAt,
    'completion_rate': 100,
    'completion_comment': null,
    'needs_follow_up': false,
    'follow_up_reason': null,
    'follow_up_remind_at': null,
    'follow_up_notify_channels': null,
    'origin': origin,
    'company_id': companyId,
    'project_id': projectId,
    'project_node_id': projectNodeId,
    'linked_readonly': linkedReadonly,
    'source_channel': null,
    'source_title': null,
    'source_url': null,
    'source_message_id': null,
    'source_meta': null,
    'assignees': const [],
    'assignee': null,
    'created_at': '2026-10-31T08:00:00Z',
    'updated_at': '2026-10-31T08:00:00Z',
  };
}

/// 预置的代表性任务列表。
List<WorkTask> sampleWorkTasks() => [
      // 1. 今日截止高优先级待办
      WorkTask.fromJson(buildTaskJson(
        id: 101,
        title: '编制第三季度财务复核报告',
        description: '核实各部门报销单据并出具初步审计意见',
        priority: 2,
        status: 0,
        dueDate: '2026-11-02T10:00:00Z',
        category: {'id': 1, 'name': '财务', 'color': '#F56C6C'},
        tags: [
          {'id': 11, 'name': '重点', 'color': '#E6A23C'},
          {'id': 12, 'name': '本周必清', 'color': '#F56C6C'},
        ],
        checklist: [
          {'id': 'c1', 'title': '核对收支明细账', 'completed': true},
          {'id': 'c2', 'title': '核查大额发票真伪', 'completed': false},
        ],
      )),
      // 2. 跨时区边界任务（UTC 15:30 对应东八区次日 23:30）
      WorkTask.fromJson(buildTaskJson(
        id: 102,
        title: '服务器跨时区日志备份',
        description: '验证数据在 UTC 零点前后的平滑归档',
        priority: 1,
        status: 0,
        dueDate: '2026-11-02T15:30:00Z',
        category: {'id': 2, 'name': '运维', 'color': '#409EFF'},
      )),
      // 3. 已逾期进行中任务
      WorkTask.fromJson(buildTaskJson(
        id: 103,
        title: '梳理移动端离线缓存方案',
        description: '解决断网时列表白屏问题',
        priority: 1,
        status: 1,
        dueDate: '2026-10-30T09:00:00Z',
      )),
      // 4. 人轴责任链关联任务（只读锁定）
      WorkTask.fromJson(buildTaskJson(
        id: 104,
        title: '人轴一期代码审查与架构验收',
        description: '人轴节点同步，只读不可直接勾选完成',
        priority: 2,
        status: 0,
        dueDate: '2026-11-05T12:00:00Z',
        origin: 'project_link',
        projectId: 1,
        projectNodeId: 88,
        linkedReadonly: true,
      )),
      // 5. 无截止时间的日常待办
      WorkTask.fromJson(buildTaskJson(
        id: 105,
        title: '收集办公用品采购意向',
        description: '下周前整理成汇总表即可',
        priority: 0,
        status: 0,
        dueDate: null,
      )),
      // 6. 已完成任务
      WorkTask.fromJson(buildTaskJson(
        id: 106,
        title: '搭建自动化测试与截图校验流水线',
        description: '已跑通并合入主干',
        priority: 1,
        status: 2,
        dueDate: '2026-11-01T08:00:00Z',
        completedAt: '2026-11-01T11:00:00Z',
      )),
      // 7. 明日截止任务
      WorkTask.fromJson(buildTaskJson(
        id: 107,
        title: '客户需求澄清远程沟通会',
        description: '明确二期原型修改细节',
        priority: 2,
        status: 0,
        dueDate: '2026-11-03T06:30:00Z',
      )),
    ];

/// 分类预置数据。
List<TaskCategory> sampleCategories() => const [
      TaskCategory(id: 1, name: '工作', color: '#409EFF'),
      TaskCategory(id: 2, name: '运维', color: '#67C23A'),
      TaskCategory(id: 3, name: '财务', color: '#F56C6C'),
    ];

/// 标签预置数据。
List<TaskTag> sampleTags() => const [
      TaskTag(id: 11, name: '重点', color: '#E6A23C'),
      TaskTag(id: 12, name: '本周必清', color: '#F56C6C'),
      TaskTag(id: 13, name: '日常', color: '#909399'),
    ];

/// 统计数据预置。
TaskStatsSummary sampleStatsSummary() => const TaskStatsSummary(
      total: 10,
      completed: 4,
      pending: 4,
      inProgress: 2,
      overdue: 1,
      completionRate: 40.0,
    );

/// 趋势数据预置。
TaskTrend sampleTrend() => const TaskTrend(
      period: 'week',
      series: [
        TrendPoint(date: '2026-10-27', created: 2, completed: 1),
        TrendPoint(date: '2026-10-28', created: 3, completed: 2),
        TrendPoint(date: '2026-10-29', created: 1, completed: 1),
        TrendPoint(date: '2026-10-30', created: 4, completed: 3),
        TrendPoint(date: '2026-10-31', created: 2, completed: 2),
        TrendPoint(date: '2026-11-01', created: 3, completed: 2),
        TrendPoint(date: '2026-11-02', created: 1, completed: 0),
      ],
    );

/// 排期变更历史。
List<ScheduleChange> sampleScheduleHistory() => [
      ScheduleChange(
        id: 1,
        oldDueDate: DateTime.parse('2026-10-29T10:00:00Z'),
        newDueDate: DateTime.parse('2026-11-02T10:00:00Z'),
        createdAt: DateTime.parse('2026-10-29T08:00:00Z'),
      ),
    ];

/// 聊天提取草稿。
TaskExtractDraft sampleExtractDraft() => const TaskExtractDraft(
      title: '周三上午组织产品评审会议',
      description: '讨论关于移动端离线体验和手势操作的改动',
      priority: 2,
      dueDateIso: '2026-11-04T02:00:00Z',
      origin: 'personal',
      sourceChannel: 'wechat',
    );

/// 项目成员。
List<ProjectMember> sampleProjectMembers() => const [
      ProjectMember(userId: 1, displayName: '张经理', role: 'admin'),
      ProjectMember(userId: 2, displayName: '李工程师', role: 'member'),
      ProjectMember(userId: 3, displayName: '王测试员', role: 'member'),
    ];

/// 项目进度简介。
ProjectProgressSummary sampleProjectProgress({int projectId = 1}) =>
    ProjectProgressSummary(
      projectId: projectId,
      projectName: '示例企业协作项目',
      total: 20,
      completed: 12,
      percent: 60,
    );

/// 全量可插拔 MockWorkApi。
class MockWorkApi extends Fake implements WorkApi {
  MockWorkApi({
    List<WorkTask>? tasks,
    List<WorkTask>? trashTasks,
    List<TaskCategory>? categories,
    List<TaskTag>? tags,
    TaskStatsSummary? statsSummary,
    TaskTrend? trend,
    this.shouldThrowNetworkError = false,
    this.shouldThrowAuthError = false,
  })  : tasks = tasks ?? sampleWorkTasks(),
        trash = trashTasks ??
            [
              WorkTask.fromJson(buildTaskJson(
                id: 991,
                title: '已弃用的旧版导出脚本',
                description: '已迁移至后端微服务',
                isDeleted: true,
                deletedAt: '2026-10-28T10:00:00Z',
              )),
            ],
        categories = categories ?? sampleCategories(),
        tags = tags ?? sampleTags(),
        statsData = statsSummary ?? sampleStatsSummary(),
        trendData = trend ?? sampleTrend();

  List<WorkTask> tasks;
  List<WorkTask> trash;
  List<TaskCategory> categories;
  List<TaskTag> tags;
  TaskStatsSummary statsData;
  TaskTrend trendData;
  bool shouldThrowNetworkError;
  bool shouldThrowAuthError;

  int nextTaskId = 200;

  void _checkErrors() {
    if (shouldThrowNetworkError) {
      throw NetworkException('无法连接网络');
    }
    if (shouldThrowAuthError) {
      throw AuthException('登录已失效，请重新登录', code: 401);
    }
  }

  @override
  Future<WorkTaskPage> listTasks({
    int page = 1,
    int pageSize = 100,
    String? search,
  }) async {
    _checkErrors();
    var list = List<WorkTask>.from(tasks);
    if (search != null && search.trim().isNotEmpty) {
      final q = search.trim().toLowerCase();
      list = list
          .where((t) =>
              t.title.toLowerCase().contains(q) ||
              (t.description?.toLowerCase().contains(q) ?? false))
          .toList();
    }
    final total = list.length;
    final totalPages = total == 0 ? 1 : (total + pageSize - 1) ~/ pageSize;
    final startIndex = (page - 1) * pageSize;
    final items = startIndex >= total
        ? <WorkTask>[]
        : list.sublist(startIndex, (startIndex + pageSize).clamp(0, total));
    return WorkTaskPage(
      items: items,
      total: total,
      page: page,
      pageSize: pageSize,
      totalPages: totalPages,
    );
  }

  @override
  Future<List<WorkTask>> listAllTasks({
    String? search,
    int pageSize = 100,
  }) async {
    _checkErrors();
    final all = <WorkTask>[];
    var page = 1;
    while (true) {
      final res =
          await listTasks(page: page, pageSize: pageSize, search: search);
      all.addAll(res.items);
      if (all.length >= res.total ||
          res.items.isEmpty ||
          page >= res.totalPages) {
        break;
      }
      page++;
    }
    return all;
  }

  @override
  Future<WorkTask> getTask(int id) async {
    _checkErrors();
    final task = tasks.firstWhere(
      (t) => t.id == id,
      orElse: () => throw ApiException('任务不存在', statusCode: 404),
    );
    return task;
  }

  @override
  Future<WorkTask> createTask(Map<String, dynamic> body) async {
    _checkErrors();
    final title = (body['title'] as String?)?.trim() ?? '';
    if (title.isEmpty) {
      throw ValidationException('任务标题不能为空', errors: const {'title': '任务标题不能为空'});
    }
    final created = WorkTask.fromJson(buildTaskJson(
      id: nextTaskId++,
      title: title,
      description: body['description'] as String?,
      priority: (body['priority'] as int?) ?? 1,
      status: (body['status'] as int?) ?? 0,
      dueDate: body['due_date'] as String?,
      origin: (body['origin'] as String?) ?? 'personal',
      projectId: body['project_id'] as int?,
    ));
    tasks.insert(0, created);
    return created;
  }

  @override
  Future<WorkTask> updateTask(int id, Map<String, dynamic> body) async {
    _checkErrors();
    final index = tasks.indexWhere((t) => t.id == id);
    if (index < 0) {
      throw ApiException('任务不存在', statusCode: 404);
    }
    final current = tasks[index];
    final updated = WorkTask.fromJson(buildTaskJson(
      id: current.id,
      title: body['title'] as String? ?? current.title,
      description: body.containsKey('description')
          ? body['description'] as String?
          : current.description,
      priority: body['priority'] as int? ?? current.priority,
      status: body['status'] as int? ?? current.status,
      dueDate: body.containsKey('due_date')
          ? body['due_date'] as String?
          : current.rawDueDate,
      origin: current.origin,
      projectId: current.projectId,
      projectNodeId: current.projectNodeId,
      linkedReadonly: current.linkedReadonly,
    ));
    tasks[index] = updated;
    return updated;
  }

  @override
  Future<void> completeTask(int id) async {
    _checkErrors();
    final index = tasks.indexWhere((t) => t.id == id);
    if (index >= 0) {
      tasks[index] = tasks[index].copyWith(status: 2);
    }
  }

  @override
  Future<void> uncompleteTask(int id) async {
    _checkErrors();
    final index = tasks.indexWhere((t) => t.id == id);
    if (index >= 0) {
      tasks[index] = tasks[index].copyWith(status: 0);
    }
  }

  @override
  Future<void> deleteTask(int id) async {
    _checkErrors();
    final index = tasks.indexWhere((t) => t.id == id);
    if (index >= 0) {
      final removed = tasks.removeAt(index);
      trash.insert(0, removed);
    }
  }

  @override
  Future<WorkTaskPage> listTrash({int page = 1, int pageSize = 50}) async {
    _checkErrors();
    return WorkTaskPage(items: List.of(trash), total: trash.length);
  }

  @override
  Future<WorkTask> restoreTask(int id) async {
    _checkErrors();
    final index = trash.indexWhere((t) => t.id == id);
    if (index < 0) {
      throw ApiException('回收站任务不存在', statusCode: 404);
    }
    final item = trash.removeAt(index);
    tasks.insert(0, item);
    return item;
  }

  @override
  Future<void> purgeTrash(int id) async {
    _checkErrors();
    final index = trash.indexWhere((t) => t.id == id);
    if (index >= 0) {
      trash.removeAt(index);
    }
  }

  @override
  Future<int> batchComplete(List<int> ids) async {
    _checkErrors();
    var count = 0;
    for (final id in ids) {
      final index = tasks.indexWhere((t) => t.id == id);
      if (index >= 0) {
        tasks[index] = tasks[index].copyWith(status: 2);
        count++;
      }
    }
    return count;
  }

  @override
  Future<int> batchReschedule(List<int> ids, String dueDate) async {
    _checkErrors();
    var count = 0;
    for (final id in ids) {
      final index = tasks.indexWhere((t) => t.id == id);
      if (index >= 0) {
        tasks[index] = WorkTask.fromJson(buildTaskJson(
          id: tasks[index].id,
          title: tasks[index].title,
          description: tasks[index].description,
          priority: tasks[index].priority,
          status: tasks[index].status,
          dueDate: dueDate,
        ));
        count++;
      }
    }
    return count;
  }

  @override
  Future<int> batchDelete(List<int> ids) async {
    _checkErrors();
    var count = 0;
    for (final id in ids) {
      await deleteTask(id);
      count++;
    }
    return count;
  }

  @override
  Future<List<TaskCategory>> listCategories() async {
    _checkErrors();
    return categories;
  }

  @override
  Future<List<TaskTag>> listTags() async {
    _checkErrors();
    return tags;
  }

  @override
  Future<List<ScheduleChange>> scheduleHistory(int taskId) async {
    _checkErrors();
    return sampleScheduleHistory();
  }

  @override
  Future<TaskExtractDraft> extractFromChat({
    required String chatText,
    int? companyId,
    int? projectId,
  }) async {
    _checkErrors();
    return sampleExtractDraft();
  }

  @override
  Future<TaskStatsSummary> stats(String period, {int? projectId}) async {
    _checkErrors();
    return statsData;
  }

  @override
  Future<TaskTrend> trend(String period, {int? projectId}) async {
    _checkErrors();
    return trendData;
  }

  @override
  Future<List<ProjectMember>> projectMembers(int projectId) async {
    _checkErrors();
    return sampleProjectMembers();
  }

  @override
  Future<ProjectProgressSummary> projectProgress({
    required int projectId,
    String? projectName,
  }) async {
    _checkErrors();
    return sampleProjectProgress(projectId: projectId);
  }
}

/// 构造标准测试用 AuthState。
Future<AuthState> createTestAuthState({
  int userId = 1,
  String username = 'e2e_user',
  String displayName = '张三',
  int companyId = 1,
  int projectId = 1,
  String projectName = '工作台核心项目',
}) async {
  SharedPreferences.setMockInitialValues({});
  final helper = MockApiClientHelper();
  helper.whenGet('/users/me', {
    'id': userId,
    'username': username,
    'nickname': displayName,
    'email': '$username@example.com',
  });
  helper.whenGet('/companies/mine', {
    'items': [
      {'id': companyId, 'name': '示例企业', 'status': 'active'},
    ],
  });
  helper.whenGet(
    '/projects',
    {
      'items': [
        {
          'id': projectId,
          'name': projectName,
          'company_id': companyId,
          'status': 'active',
          'role': 'pm',
        },
      ],
    },
    query: {'company_id': '$companyId', 'as_admin': 'true'},
  );

  final authState = AuthState(apiClient: helper.buildClient());
  await authState.bootstrap();
  return authState;
}

/// 测试脚手架：提供 AuthState、MockWorkApi 以及统一 MaterialApp/Provider 包裹。
class WorkTestHarness {
  WorkTestHarness({
    required this.authState,
    required this.api,
  });

  final AuthState authState;
  final MockWorkApi api;

  static Future<WorkTestHarness> create({
    MockWorkApi? api,
    bool withProjects = true,
  }) async {
    final auth = await createTestAuthState(
      projectId: withProjects ? 1 : 0,
      projectName: withProjects ? '工作台核心项目' : '',
    );
    return WorkTestHarness(
      authState: auth,
      api: api ?? MockWorkApi(),
    );
  }

  Widget wrap(Widget child, {ThemeData? theme}) {
    final router = GoRouter(
      initialLocation: '/',
      routes: [
        GoRoute(
          path: '/',
          builder: (context, state) => child,
        ),
        GoRoute(
          path: '/work/tasks',
          builder: (context, state) => const Scaffold(body: Text('任务列表目标页')),
        ),
        GoRoute(
          path: '/work/task/:id',
          builder: (context, state) =>
              Scaffold(body: Text('任务详情目标页 #${state.pathParameters['id']}')),
        ),
        GoRoute(
          path: '/projects/:id',
          builder: (context, state) =>
              Scaffold(body: Text('项目详情目标页 #${state.pathParameters['id']}')),
        ),
        GoRoute(
          path: '/reports/chat',
          builder: (context, state) => const Scaffold(body: Text('汇报对话目标页')),
        ),
        GoRoute(
          path: '/reports',
          builder: (context, state) => const Scaffold(body: Text('汇报总览目标页')),
        ),
        GoRoute(
          path: '/work/search',
          builder: (context, state) => const Scaffold(body: Text('全局搜索目标页')),
        ),
        GoRoute(
          path: '/work/kanban',
          builder: (context, state) => const Scaffold(body: Text('看板目标页')),
        ),
        GoRoute(
          path: '/work/calendar',
          builder: (context, state) => const Scaffold(body: Text('日历目标页')),
        ),
        GoRoute(
          path: '/work/statistics',
          builder: (context, state) => const Scaffold(body: Text('统计目标页')),
        ),
        GoRoute(
          path: '/work/trash',
          builder: (context, state) => const Scaffold(body: Text('回收站目标页')),
        ),
        GoRoute(
          path: '/work/task-edit',
          builder: (context, state) => const Scaffold(body: Text('任务编辑目标页')),
        ),
      ],
    );
    return ChangeNotifierProvider<AuthState>.value(
      value: authState,
      child: MaterialApp.router(
        theme: theme ?? ThemeData.light(useMaterial3: true),
        routerConfig: router,
      ),
    );
  }
}
