/// T02 工作 Tab 接口封装。
///
/// 路径与查询参数严格对齐后端 `app/api/v1/tasks.py`、`shell.py` 与
/// `projects.py`；所有时间字段收发均为 UTC ISO 串。
library;

import '../../../core/api/api_client.dart';
import 'work_models.dart';

class WorkApi {
  WorkApi(this._client);

  final ApiClient _client;

  /// 时间轴统计用的本地时区偏移（分钟，东八区为 480）。
  static int get timezoneOffsetMinutes => DateTime.now().timeZoneOffset.inMinutes;

  Future<WorkTaskPage> listTasks({
    int page = 1,
    int pageSize = 100,
    String? search,
  }) async {
    final data = await _client.get('/tasks', query: {
      'page': '$page',
      'page_size': '$pageSize',
      if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
    });
    return WorkTaskPage.fromJson(_asMap(data));
  }

  /// 循环拉取所有分页，直到获取完整任务集。
  Future<List<WorkTask>> listAllTasks({
    String? search,
    int pageSize = 100,
  }) async {
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

  Future<WorkTask> getTask(int id) async {
    final data = await _client.get('/tasks/$id');
    return WorkTask.fromJson(_asMap(data));
  }

  Future<WorkTask> createTask(Map<String, dynamic> body) async {
    final data = await _client.post('/tasks', body: body);
    return WorkTask.fromJson(_asMap(data));
  }

  Future<WorkTask> updateTask(int id, Map<String, dynamic> body) async {
    final data = await _client.put('/tasks/$id', body: body);
    return WorkTask.fromJson(_asMap(data));
  }

  Future<void> completeTask(int id) async {
    await _client.patch('/tasks/$id/complete', body: const <String, dynamic>{});
  }

  Future<void> uncompleteTask(int id) async {
    await _client.patch('/tasks/$id/uncomplete',
        body: const <String, dynamic>{});
  }

  Future<void> deleteTask(int id) async {
    await _client.delete('/tasks/$id');
  }

  Future<WorkTaskPage> listTrash({int page = 1, int pageSize = 50}) async {
    final data = await _client.get('/tasks/trash', query: {
      'page': '$page',
      'page_size': '$pageSize',
    });
    return WorkTaskPage.fromJson(_asMap(data));
  }

  Future<WorkTask> restoreTask(int id) async {
    final data =
        await _client.post('/tasks/$id/restore', body: const <String, dynamic>{});
    return WorkTask.fromJson(_asMap(data));
  }

  /// 批量完成：后端只完成本人名下、可编辑的任务，只读投影任务单独计数跳过
  Future<BatchCompleteResult> batchComplete(List<int> ids) async {
    final data = await _client.patch(
      '/tasks/batch/complete',
      body: {'task_ids': ids},
    );
    final map = _asMap(data);
    return BatchCompleteResult(
      completed: (map['completed_count'] as num?)?.toInt() ?? 0,
      skippedReadonly: (map['skipped_readonly'] as num?)?.toInt() ?? 0,
    );
  }

  Future<int> batchReschedule(List<int> ids, String dueDate) async {
    final data = await _client.patch(
      '/tasks/batch/reschedule',
      body: {'task_ids': ids, 'due_date': dueDate},
    );
    return (_asMap(data)['updated_count'] as num?)?.toInt() ?? 0;
  }

  /// 批量删除。
  ///
  /// 底座 `ApiClient.delete` 暂不支持请求体，后端 `DELETE /tasks/batch` 需要
  /// `{task_ids: [...]}`，因此这里逐条调用单条软删除接口（语义等价，均为软删）。
  /// 已提交共享改动申请：给 `ApiClient.delete` 增加 `body` 参数。
  Future<int> batchDelete(List<int> ids) async {
    var deleted = 0;
    for (final id in ids) {
      await deleteTask(id);
      deleted++;
    }
    return deleted;
  }

  Future<List<TaskCategory>> listCategories() async {
    final data = await _client.get('/categories');
    return _asList(data)
        .map((e) => TaskCategory.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<List<TaskTag>> listTags() async {
    final data = await _client.get('/tags');
    return _asList(data)
        .map((e) => TaskTag.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<List<ScheduleChange>> scheduleHistory(int taskId) async {
    final data = await _client.get('/tasks/$taskId/schedule-history');
    final items = _asMap(data)['items'];
    if (items is! List) return const [];
    return items
        .whereType<Map>()
        .map((e) => ScheduleChange.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<TaskExtractDraft> extractFromChat({
    required String chatText,
    int? companyId,
    int? projectId,
  }) async {
    final data = await _client.post('/tasks/extract-from-chat', body: {
      'chat_text': chatText,
      if (companyId != null) 'company_id': companyId,
      if (projectId != null) 'project_id': projectId,
    });
    final draft = _asMap(data)['draft'];
    return TaskExtractDraft.fromJson(_asMap(draft));
  }

  Future<TaskStatsSummary> stats(String period, {int? projectId}) async {
    final data = await _client.get('/tasks/stats', query: _statsQuery(period, projectId));
    return TaskStatsSummary.fromJson(_asMap(data));
  }

  Future<TaskTrend> trend(String period, {int? projectId}) async {
    final data =
        await _client.get('/tasks/stats/trend', query: _statsQuery(period, projectId));
    return TaskTrend.fromJson(_asMap(data));
  }

  Map<String, String> _statsQuery(String period, int? projectId) => {
        'period': period,
        'timezone_offset': '$timezoneOffsetMinutes',
        if (projectId != null && projectId > 0) 'project_id': '$projectId',
      };

  Future<List<ProjectMember>> projectMembers(int projectId) async {
    final data = await _client.get('/projects/$projectId/members');
    final items = _asMap(data)['items'];
    if (items is! List) return const [];
    return items
        .whereType<Map>()
        .map((e) => ProjectMember.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  /// 项目人树（仅取事项与里程碑做进度汇总）。
  Future<ProjectProgressSummary> projectProgress({
    required int projectId,
    required String projectName,
  }) async {
    final data =
        await _client.get('/projects/$projectId/tree', query: {'format': 'nested'});
    final nodes = _asMap(data)['nodes'];
    return ProjectProgressSummary.fromTree(
      projectId: projectId,
      projectName: projectName,
      nodes: nodes is List ? nodes : const [],
    );
  }
}

Map<String, dynamic> _asMap(dynamic value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  return <String, dynamic>{};
}

List<dynamic> _asList(dynamic value) {
  if (value is List) return value;
  if (value is Map) {
    final items = value['items'];
    if (items is List) return items;
  }
  return const [];
}

/// 批量完成结果（对齐后端 `completed_count` / `skipped_readonly`）
class BatchCompleteResult {
  const BatchCompleteResult({required this.completed, required this.skippedReadonly});

  final int completed;
  final int skippedReadonly;
}
