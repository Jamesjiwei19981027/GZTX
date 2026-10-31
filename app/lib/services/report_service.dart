import '../models/models.dart';
import 'api_client.dart';

class ReportService {
  ReportService(this._api);
  final ApiClient _api;

  List<dynamic> _items(dynamic data) {
    if (data is List) return data;
    if (data is JsonMap && data['items'] is List) return data['items'] as List;
    return const [];
  }

  Future<List<ReportItem>> myReports({int? projectId}) async {
    final data = await _api.get('/reports/my', query: {
      if (projectId != null) 'project_id': '$projectId',
    });
    return _items(data)
        .whereType<Map>()
        .map((e) => ReportItem.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<List<ReportInboxItem>> inbox() async {
    final data = await _api.get('/reports/inbox');
    return _items(data)
        .whereType<Map>()
        .map((e) => ReportInboxItem.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<ReportItem> get(int id) async {
    final data = await _api.get('/reports/$id');
    return ReportItem.fromJson(Map<String, dynamic>.from(data as Map));
  }

  Future<ReportItem?> generate({int? projectId}) async {
    final data = await _api.post('/reports/generate', body: {
      if (projectId != null) 'project_id': projectId,
    });
    if (data is! Map) return null;
    return ReportItem.fromJson(Map<String, dynamic>.from(data));
  }

  Future<ReportItem?> submit(int id,
      {String? summary, List<Map<String, dynamic>>? sources}) async {
    final data = await _api.post('/reports/$id/submit', body: {
      if (summary != null) 'summary': summary,
      if (sources != null) 'sources': sources,
    });
    if (data is! Map) return null;
    return ReportItem.fromJson(Map<String, dynamic>.from(data));
  }

  Future<void> markRead(int id) async {
    await _api.put('/reports/inbox/$id/read', body: {});
  }

  Future<List<ReportItem>> projectReports(int projectId) async {
    final data = await _api.get('/projects/$projectId/agent-reports');
    return _items(data)
        .whereType<Map>()
        .map((e) => ReportItem.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<ReportItem?> aggregateProject(int projectId) async {
    final data = await _api
        .post('/projects/$projectId/agent-reports/aggregate', body: {});
    if (data is! Map) return null;
    return ReportItem.fromJson(Map<String, dynamic>.from(data));
  }

  Future<List<Map<String, dynamic>>> bindProjectAgents(int projectId) async {
    final data = await _api
        .post('/projects/$projectId/report-agents/bindings', body: {});
    return _items(data)
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  Future<ReportItem?> leadershipLatest(int companyId) async {
    final data =
        await _api.get('/companies/$companyId/leadership-reports/latest');
    if (data is! Map) return null;
    return ReportItem.fromJson(Map<String, dynamic>.from(data));
  }

  Future<ReportItem?> aggregateLeadership(int companyId,
      {List<int>? projectIds}) async {
    final data = await _api
        .post('/companies/$companyId/leadership-reports/aggregate', body: {
      if (projectIds != null) 'project_ids': projectIds,
    });
    if (data is! Map) return null;
    return ReportItem.fromJson(Map<String, dynamic>.from(data));
  }
}
