import '../../../core/api/api_client.dart';
import '../../../core/errors/app_error.dart';
import '../models/report_models.dart';

/// T07 AI 汇报接口封装。
///
/// 只读后端既有接口（Swagger「智能体」「智能体汇报」），不新增后端能力：
/// - `GET/POST /projects/{id}/report-agents/bindings`
/// - `GET /projects/{id}/agent-reports`、`POST .../agent-reports`
/// - `POST /projects/{id}/agent-reports/aggregate`
/// - `GET /reports/my`、`GET /reports/inbox`、`GET /reports/{id}`
/// - `POST /reports/generate`、`POST /reports/{id}/submit`
/// - `PUT /reports/inbox/{id}/read`
/// - `POST /companies/{id}/leadership-reports/aggregate`、`GET .../latest`
/// - `POST /agents/chat`
/// - `GET /projects/{id}/members`（仅用于展示姓名，不参与权限判断）
class ReportsApi {
  const ReportsApi(this._client);

  final ApiClient _client;

  Future<ReportSummaryList> listSummaries(int projectId) async {
    final data = await _client.get('/projects/$projectId/report-summaries');
    return ReportSummaryList(
        items: _parseItems(data, PublishedReportSummary.fromJson),
        canPublish: data is Map && data['can_publish'] == true);
  }

  Future<PublishedReportSummary> publishSummary(
      int projectId, int summaryId) async {
    final data = await _client.post(
        '/projects/$projectId/report-summaries/$summaryId/publish',
        body: const <String, dynamic>{});
    return _parseObject(data, PublishedReportSummary.fromJson, '项目汇总发布');
  }

  Future<AgentReport> reviewReport(int reportId,
      {required String decision, required String comment}) async {
    final data = await _client.post('/reports/$reportId/review',
        body: {'decision': decision, 'comment': comment.trim()});
    return _parseObject(data, AgentReport.fromJson, '汇报核验');
  }

  Future<List<ReportAgentBinding>> listBindings(int projectId) async {
    final data =
        await _client.get('/projects/$projectId/report-agents/bindings');
    return _parseItems(data, ReportAgentBinding.fromJson);
  }

  Future<List<ReportAgentBinding>> ensureBindings(int projectId) async {
    final data = await _client.post(
      '/projects/$projectId/report-agents/bindings',
      body: const <String, dynamic>{},
    );
    return _parseItems(data, ReportAgentBinding.fromJson);
  }

  Future<List<AgentReport>> listProjectReports(int projectId) async {
    final data = await _client.get('/projects/$projectId/agent-reports');
    return _parseItems(data, AgentReport.fromJson);
  }

  Future<List<AgentReport>> listMyReports({int? projectId}) async {
    final data = await _client.get(
      '/reports/my',
      query: projectId != null && projectId > 0
          ? {'project_id': '$projectId'}
          : null,
    );
    return _parseItems(data, AgentReport.fromJson);
  }

  Future<List<AgentReport>> listInbox() async {
    final data = await _client.get('/reports/inbox');
    return _parseItems(data, AgentReport.fromJson);
  }

  Future<AgentReport> getReport(int reportId) async {
    final data = await _client.get('/reports/$reportId');
    return _parseObject(data, AgentReport.fromJson, '汇报详情');
  }

  Future<void> markRead(int reportId) async {
    await _client.put(
      '/reports/inbox/$reportId/read',
      body: const <String, dynamic>{},
    );
  }

  Future<AgentReport> generateDraft({int? projectId}) async {
    final data = await _client.post(
      '/reports/generate',
      body: projectId != null && projectId > 0
          ? {'project_id': projectId}
          : const <String, dynamic>{},
    );
    return _parseObject(data, AgentReport.fromJson, '汇报草稿');
  }

  Future<AgentReport> submitDraft(
    int reportId, {
    required String summary,
    List<ReportSource> sources = const [],
  }) async {
    final additions = sources.where((source) => source.id == null).toList();
    final data = await _client.post(
      '/reports/$reportId/submit',
      body: {
        'summary': summary,
        if (additions.isNotEmpty)
          'sources': additions.map((source) => source.toJson()).toList(),
      },
    );
    return _parseObject(data, AgentReport.fromJson, '汇报提交结果');
  }

  Future<AgentReport> submitReport({
    required int projectId,
    required int bindingId,
    required String summary,
    List<ReportSource> sources = const [],
  }) async {
    final data = await _client.post(
      '/projects/$projectId/agent-reports',
      body: {
        'binding_id': bindingId,
        'summary': summary,
        'sources': sources.map((source) => source.toJson()).toList(),
        'payload': const <String, dynamic>{},
      },
    );
    return _parseObject(data, AgentReport.fromJson, '汇报提交结果');
  }

  Future<ProjectReportAggregate> aggregateProject(int projectId) async {
    final data = await _client.post(
      '/projects/$projectId/agent-reports/aggregate',
      body: const <String, dynamic>{},
    );
    return _parseObject(data, ProjectReportAggregate.fromJson, '项目汇总');
  }

  Future<LeadershipReport> aggregateLeadership(
    int companyId, {
    List<int>? projectIds,
  }) async {
    final data = await _client.post(
      '/companies/$companyId/leadership-reports/aggregate',
      body: {
        'project_ids':
            projectIds == null || projectIds.isEmpty ? null : projectIds
      },
    );
    return _parseObject(data, LeadershipReport.fromJson, '领导层汇报');
  }

  /// 未生成过时后端返回 `data: null`，这里返回 null 而不是抛异常。
  Future<LeadershipReport?> latestLeadership(int companyId) async {
    final data =
        await _client.get('/companies/$companyId/leadership-reports/latest');
    if (data == null) return null;
    return _parseObject(data, LeadershipReport.fromJson, '领导层汇报');
  }

  Future<List<ReportMember>> listProjectMembers(int projectId) async {
    final data = await _client.get('/projects/$projectId/members');
    final members = _parseItems(data, ReportMember.fromJson);
    return members.where((member) => member.isActive).toList(growable: false);
  }

  Future<AgentChatReply> chat({
    required int companyId,
    required int projectId,
    required String message,
  }) async {
    final data = await _client.post(
      '/agents/chat',
      body: {
        'company_id': companyId,
        'project_id': projectId,
        'channel': 'web',
        'message': message,
      },
    );
    return _parseObject(data, AgentChatReply.fromJson, '智能体回复');
  }

  List<T> _parseItems<T>(
    dynamic data,
    T Function(Map<String, dynamic>) build,
  ) {
    final raw = data is Map ? data['items'] : null;
    if (raw is! List) return <T>[];
    final items = <T>[];
    for (final item in raw) {
      if (item is Map) {
        items.add(build(item.cast<String, dynamic>()));
      }
    }
    return items;
  }

  T _parseObject<T>(
    dynamic data,
    T Function(Map<String, dynamic>) build,
    String label,
  ) {
    if (data is! Map) {
      throw ApiException('$label返回格式异常');
    }
    return build(data.cast<String, dynamic>());
  }
}
