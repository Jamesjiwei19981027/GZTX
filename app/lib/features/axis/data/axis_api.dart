import '../../../core/api/api_client.dart';
import '../../../core/errors/app_error.dart';
import '../../reports/models/report_models.dart';
import 'axis_models.dart';
import 'axis_view_models.dart' show AxisOrientation;

/// T04 人轴接口层。
///
/// 全部走底座 [ApiClient]（自动带令牌、30 秒超时、401 续期、信封解包）。
/// 接口来源：Swagger「项目」「人轴节点与材料」「委托授权」「频道私聊与界面偏好」。
class AxisApi {
  AxisApi(this._client);

  final ApiClient _client;

  Map<String, dynamic> _map(Object? data) =>
      data is Map<String, dynamic> ? data : <String, dynamic>{};

  List<Map<String, dynamic>> _list(Object? data, String key) {
    if (data is Map && data[key] is List) {
      return (data[key] as List)
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    }
    return const [];
  }

  /// 项目嵌套人树（`GET /projects/{id}/tree?format=nested`）。
  Future<List<Map<String, dynamic>>> fetchProjectTree(int projectId) async {
    final data = await _client.get(
      '/projects/$projectId/tree',
      query: {'format': 'nested'},
    );
    return _list(data, 'nodes');
  }

  /// 获取项目汇报列表（`GET /projects/{id}/agent-reports`）。
  Future<List<AgentReport>> fetchProjectReports(int projectId) async {
    final data = await _client.get('/projects/$projectId/agent-reports');
    if (data is List) {
      return data
          .whereType<Map>()
          .map((e) => AgentReport.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    }
    return _list(data, 'items').map(AgentReport.fromJson).toList();
  }

  /// 项目成员（`GET /projects/{id}/members`）。
  Future<List<AxisMember>> fetchMembers(int projectId) async {
    final data = await _client.get('/projects/$projectId/members');
    return _list(data, 'items').map(AxisMember.fromJson).toList();
  }

  /// 当前用户的项目能力快照（`GET /projects/{id}/my-permissions`）。
  Future<AxisPermissions> fetchPermissions(int projectId) async {
    final data = await _client.get('/projects/$projectId/my-permissions');
    return AxisPermissions.fromJson(_map(data));
  }

  /// 项目详情：终责位置与 PM/创建者判断需要 `pm_user_id`、`created_by`，
  /// 底座 `core/models/project.dart` 没有这两个字段，因此在这里单独读取。
  Future<AxisProjectInfo> fetchProject(int projectId) async {
    final data = await _client.get('/projects/$projectId');
    return AxisProjectInfo.fromJson(_map(data));
  }

  /// 节点详情（`GET /nodes/{id}`）。
  Future<Map<String, dynamic>> fetchNode(int nodeId) async {
    final data = await _client.get('/nodes/$nodeId');
    return _map(data);
  }

  /// 节点所属项目。
  ///
  /// 后端 `GET /nodes/{id}` 的 DTO 没有 `project_id`，深链进入详情页时改用
  /// `/users/me/people-axis` 反查；从人轴页跳转时会直接带上 projectId 免去这次查询。
  Future<int?> findProjectIdForNode(int nodeId) async {
    final data = await _client.get('/users/me/people-axis');
    if (data is! Map || data['projects'] is! List) return null;
    for (final project in data['projects'] as List) {
      if (project is! Map) continue;
      final nodes = project['nodes'];
      if (nodes is! List) continue;
      for (final node in nodes) {
        if (node is Map && (node['id'] as num?)?.toInt() == nodeId) {
          return (project['project_id'] as num?)?.toInt();
        }
      }
    }
    return null;
  }

  /// 新增人员节点（`POST /projects/{id}/nodes`）。
  Future<void> createPerson({
    required int projectId,
    required String name,
    required String roleTitle,
    required String department,
    required String description,
    int? parentId,
    required String nodeOrigin,
    int? assigneeUserId,
  }) {
    return _client.post(
      '/projects/$projectId/nodes',
      body: {
        'node_type_key': 'person',
        'title': name,
        'description': description,
        'parent_id': parentId,
        'node_origin': nodeOrigin,
        'assignees': assigneeUserId == null
            ? <Map<String, dynamic>>[]
            : [
                {'user_id': assigneeUserId, 'role_key': 'primary'}
              ],
      },
    );
  }

  /// 修改节点标题、描述、指派或权限（`PATCH /nodes/{id}`）。
  Future<void> updateNode(
    int nodeId, {
    String? title,
    String? description,
    List<Map<String, dynamic>>? assignees,
    Map<String, dynamic>? responsibilityPermissions,
  }) {
    final body = <String, dynamic>{};
    if (title != null) body['title'] = title;
    if (description != null) body['description'] = description;
    if (assignees != null) body['assignees'] = assignees;
    if (responsibilityPermissions != null) {
      body['responsibility_permissions'] = responsibilityPermissions;
    }
    return _client.patch('/nodes/$nodeId', body: body);
  }

  /// 调整上级 / 改变挂载（`POST /nodes/{id}/move`）。
  Future<void> moveNode(int nodeId, {int? newParentId}) {
    return _client.post(
      '/nodes/$nodeId/move',
      body: {'new_parent_id': newParentId},
    );
  }

  /// 保存卡片位置（`PUT /nodes/{id}/layout`）。
  Future<void> saveNodeLayout(
    int nodeId, {
    required double offsetX,
    required double offsetY,
    AxisOrientation? orientation,
  }) {
    final body = <String, dynamic>{'offset_x': offsetX, 'offset_y': offsetY};
    if (orientation != null) {
      body['orientation'] = orientation == AxisOrientation.horizontal
          ? 'horizontal'
          : 'vertical';
    }
    return _client.put(
      '/nodes/$nodeId/layout',
      body: body,
    );
  }

  /// 删除预览（`GET /nodes/{id}/deletion-preview`）。
  Future<AxisDeletionPreview> previewDeletion(int nodeId) async {
    final data = await _client.get('/nodes/$nodeId/deletion-preview');
    return AxisDeletionPreview.fromJson(_map(data));
  }

  /// 删除 / 交接（`DELETE /nodes/{id}`）。
  ///
  /// 后端要求先拿到最新 `preview_token`，并明确二选一：级联删除或选择移交人。
  Future<void> deletePerson(
    int nodeId, {
    required String previewToken,
    bool cascade = false,
    int? handoverToNodeId,
  }) {
    final query = <String, String>{'preview_token': previewToken};
    if (cascade) query['cascade'] = 'true';
    if (handoverToNodeId != null) {
      query['handover_to_node_id'] = handoverToNodeId.toString();
    }
    return _client.delete('/nodes/$nodeId', query: query);
  }

  /// 委托授权列表（`GET /delegations?company_id=&project_id=`）。
  Future<List<AxisDelegation>> fetchDelegations({
    required int companyId,
    required int projectId,
  }) async {
    final data = await _client.get(
      '/delegations',
      query: {
        'company_id': companyId.toString(),
        'project_id': projectId.toString(),
      },
    );
    return _list(data, 'items').map(AxisDelegation.fromJson).toList();
  }

  /// 创建委托授权（`POST /delegations`）。
  Future<AxisDelegation> createDelegation({
    required int companyId,
    required int projectId,
    required int granteeUserId,
    required List<String> actions,
    String? validTo,
    String? reason,
  }) async {
    final data = await _client.post(
      '/delegations',
      body: {
        'company_id': companyId,
        'project_id': projectId,
        'grantee_user_id': granteeUserId,
        'actions': actions,
        'valid_to': validTo,
        if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
      },
    );
    return AxisDelegation.fromJson(_map(data));
  }

  /// 撤销委托（`POST /delegations/{id}/revoke`）。
  Future<void> revokeDelegation(int delegationId) {
    return _client.post('/delegations/$delegationId/revoke', body: const {});
  }

  /// AI 责任链审计（`POST /projects/{id}/axis-audit`）。
  Future<AxisAuditResult> runAudit(int projectId) async {
    final data = await _client.post(
      '/projects/$projectId/axis-audit',
      body: const {},
    );
    return AxisAuditResult.fromJson(_map(data));
  }

  /// 节点进度与最近记录（`GET /nodes/{id}/progress`）。
  Future<AxisProgressSnapshot> fetchProgress(int nodeId) async {
    final data = await _client.get('/nodes/$nodeId/progress');
    return AxisProgressSnapshot.fromJson(_map(data));
  }
}

/// 把底座结构化异常转成可展示的中文提示。
///
/// 明确区分网络异常、登录过期、业务拒绝三种，避免静默吞掉。
String axisErrorMessage(Object error) {
  if (error is String) return error;
  if (error is ValidationException) return error.message;
  if (error is ApiException) return error.message;
  if (error is NetworkException) return '网络连接异常或请求超时，请检查网络后重试';
  if (error is AuthException) return '登录已过期，请重新登录';
  return '操作失败，请稍后重试';
}

bool axisErrorIsNetwork(Object error) =>
    error is NetworkException || error is AuthException;
