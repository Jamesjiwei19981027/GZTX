import '../models/models.dart';
import 'api_client.dart';

class TaskService {
  TaskService(this._api);

  final ApiClient _api;

  Future<List<TaskItem>> listTasks({int page = 1, int pageSize = 50}) async {
    final data = await _api.get('/tasks', query: {
      'page': '$page',
      'page_size': '$pageSize',
    }) as JsonMap;
    final items = (data['items'] as List<dynamic>? ?? [])
        .whereType<Map>()
        .map((e) => TaskItem.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    return items;
  }

  Future<TaskItem> completeTask(int id) async {
    final data = await _api.patch(
      '/tasks/$id/complete',
      body: {'completion_rate': 100},
    ) as JsonMap;
    return TaskItem.fromJson(data);
  }

  Future<TaskItem> createTask(String title) async {
    final data = await _api.post('/tasks', body: {
      'title': title.trim(),
      'priority': 1,
    }) as JsonMap;
    return TaskItem.fromJson(data);
  }
}
