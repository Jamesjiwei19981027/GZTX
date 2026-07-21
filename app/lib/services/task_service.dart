import '../models/models.dart';
import 'api_client.dart';

class TaskService {
  TaskService(this._api);

  final ApiClient _api;

  Future<List<TaskItem>> listTasks({
    int page = 1,
    int pageSize = 100,
    int? status,
    String? dueFrom,
    String? dueTo,
    String? search,
  }) async {
    final query = <String, String>{
      'page': '$page',
      'page_size': '$pageSize',
      if (status != null) 'status': '$status',
      if (dueFrom != null) 'due_date_from': dueFrom,
      if (dueTo != null) 'due_date_to': dueTo,
      if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
    };
    final data = await _api.get('/tasks', query: query) as JsonMap;
    final items = (data['items'] as List<dynamic>? ?? [])
        .whereType<Map>()
        .map((e) => TaskItem.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    return items;
  }

  Future<List<TaskItem>> todayTasks() async {
    final data = await _api.get('/tasks/today');
    if (data is List) {
      return data
          .whereType<Map>()
          .map((e) => TaskItem.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    }
    if (data is Map && data['items'] is List) {
      return (data['items'] as List)
          .whereType<Map>()
          .map((e) => TaskItem.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    }
    return [];
  }

  Future<TaskStats> stats({String period = 'week'}) async {
    final data = await _api.get('/tasks/stats', query: {'period': period}) as JsonMap;
    return TaskStats.fromJson(data);
  }

  Future<TaskItem> getTask(int id) async {
    final data = await _api.get('/tasks/$id') as JsonMap;
    return TaskItem.fromJson(data);
  }

  Future<TaskItem> createTask({
    required String title,
    String? description,
    int priority = 1,
    String? dueDate,
  }) async {
    final data = await _api.post('/tasks', body: {
      'title': title.trim(),
      'priority': priority,
      if (description != null && description.trim().isNotEmpty)
        'description': description.trim(),
      if (dueDate != null && dueDate.isNotEmpty) 'due_date': dueDate,
    }) as JsonMap;
    return TaskItem.fromJson(data);
  }

  Future<TaskItem> updateTask(
    int id, {
    String? title,
    String? description,
    int? priority,
    int? status,
    String? dueDate,
    bool clearDueDate = false,
  }) async {
    final body = <String, dynamic>{
      if (title != null) 'title': title.trim(),
      if (description != null) 'description': description.trim(),
      if (priority != null) 'priority': priority,
      if (status != null) 'status': status,
      if (clearDueDate) 'due_date': null,
      if (!clearDueDate && dueDate != null) 'due_date': dueDate,
    };
    final data = await _api.put('/tasks/$id', body: body) as JsonMap;
    return TaskItem.fromJson(data);
  }

  Future<TaskItem> completeTask(
    int id, {
    int completionRate = 100,
    String? comment,
  }) async {
    final data = await _api.patch('/tasks/$id/complete', body: {
      'completion_rate': completionRate,
      if (comment != null && comment.trim().isNotEmpty)
        'completion_comment': comment.trim(),
    }) as JsonMap;
    return TaskItem.fromJson(data);
  }

  Future<TaskItem> uncompleteTask(int id) async {
    final data = await _api.patch('/tasks/$id/uncomplete') as JsonMap;
    return TaskItem.fromJson(data);
  }

  Future<void> deleteTask(int id) async {
    await _api.delete('/tasks/$id');
  }
}
