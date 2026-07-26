import '../models/models.dart';
import 'api_client.dart';

class CollabService {
  CollabService(this._api);

  final ApiClient _api;

  Future<List<CompanyItem>> myCompanies() async {
    final data = await _api.get('/companies/mine') as JsonMap;
    return (data['items'] as List<dynamic>? ?? [])
        .whereType<Map>()
        .map((e) => CompanyItem.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<CompanyItem> getCompany(int id) async {
    final data = await _api.get('/companies/$id') as JsonMap;
    return CompanyItem.fromJson(data);
  }

  Future<Map<String, dynamic>> getCompanyRaw(int id) async {
    return await _api.get('/companies/$id') as JsonMap;
  }

  Future<Map<String, dynamic>> patchPolicy(
    int companyId, {
    String? policyPreset,
    Map<String, dynamic>? policyJson,
    Map<String, dynamic>? loginMethods,
  }) async {
    return await _api.patch('/companies/$companyId/policy', body: {
      if (policyPreset != null) 'policy_preset': policyPreset,
      if (policyJson != null) 'policy_json': policyJson,
      if (loginMethods != null) 'login_methods': loginMethods,
    }) as JsonMap;
  }

  Future<Map<String, dynamic>> patchLoginMethods(
    int companyId,
    Map<String, bool> methods,
  ) async {
    return await _api.patch(
      '/companies/$companyId/login-methods',
      body: methods,
    ) as JsonMap;
  }

  Future<SmtpConfig> getCompanySmtp(int companyId) async {
    final data = await _api.get('/companies/$companyId/smtp') as JsonMap;
    return SmtpConfig.fromJson(data);
  }

  Future<SmtpConfig> saveCompanySmtp(
    int companyId, {
    required String host,
    required int port,
    required String user,
    required String from,
    String? password,
  }) async {
    final data = await _api.put('/companies/$companyId/smtp', body: {
      'smtp_host': host.trim(),
      'smtp_port': port,
      'smtp_user': user.trim(),
      'smtp_from': from.trim(),
      if (password != null && password.isNotEmpty) 'smtp_password': password,
    }) as JsonMap;
    return SmtpConfig.fromJson(data);
  }

  Future<void> testCompanySmtp(int companyId) async {
    await _api.post('/companies/$companyId/smtp/test');
  }

  Future<LlmConfig> getCompanyLlm(int companyId) async {
    final data = await _api.get('/companies/$companyId/llm') as JsonMap;
    return LlmConfig.fromJson(data);
  }

  Future<LlmConfig> saveCompanyLlm(
    int companyId, {
    required String provider,
    required String baseUrl,
    required String model,
    double temperature = 0.2,
    int maxTokens = 1024,
    bool enabled = true,
    bool useForAgent = true,
    bool useForJudge = false,
    String? apiKey,
  }) async {
    final data = await _api.put('/companies/$companyId/llm', body: {
      'provider': provider,
      'base_url': baseUrl.trim(),
      'model': model.trim(),
      'temperature': temperature,
      'max_tokens': maxTokens,
      'enabled': enabled,
      'use_for_agent': useForAgent,
      'use_for_judge': useForJudge,
      if (apiKey != null && apiKey.isNotEmpty) 'api_key': apiKey,
    }) as JsonMap;
    return LlmConfig.fromJson(data);
  }

  Future<Map<String, dynamic>> testCompanyLlm(int companyId) async {
    return await _api.post('/companies/$companyId/llm/test') as JsonMap;
  }

  Future<Map<String, dynamic>> companyFeatures(int companyId) async {
    return await _api.get('/companies/$companyId/features') as JsonMap;
  }

  Future<Map<String, dynamic>> orgTree(int companyId) async {
    return await _api.get('/companies/$companyId/org-tree') as JsonMap;
  }

  Future<Map<String, dynamic>> bindings(int companyId) async {
    return await _api.get('/companies/$companyId/bindings') as JsonMap;
  }

  Future<List<ProjectItem>> listProjects(int companyId) async {
    final data = await _api.get('/projects', query: {
      'company_id': '$companyId',
      'page': '1',
    }) as JsonMap;
    return (data['items'] as List<dynamic>? ?? [])
        .whereType<Map>()
        .map((e) => ProjectItem.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<ProjectItem> createProject({
    required int companyId,
    required String name,
  }) async {
    final data = await _api.post('/projects', body: {
      'company_id': companyId,
      'name': name.trim(),
    }) as JsonMap;
    return ProjectItem.fromJson(data);
  }

  Future<ProjectItem> getProject(int id) async {
    final data = await _api.get('/projects/$id') as JsonMap;
    return ProjectItem.fromJson(data);
  }

  /// 保存终责卡片沿主干的偏移。仅项目 PM / created_by 有权，后端强制。
  Future<double> setFinalOwnerPosition(int projectId, double alongDelta) async {
    final data = await _api.put(
      '/projects/$projectId/final-owner-position',
      body: {'along_delta': alongDelta < 0 ? 0 : alongDelta.round()},
    ) as JsonMap;
    return (data['final_owner_along_delta'] as num?)?.toDouble() ?? 0;
  }

  Future<List<TreeNodeItem>> projectTree(int projectId) async {
    final data = await _api.get('/projects/$projectId/tree', query: {
      'format': 'nested',
    }) as JsonMap;
    final roots = (data['nodes'] as List<dynamic>? ?? [])
        .whereType<Map>()
        .map((e) => TreeNodeItem.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    return _withDepth(roots, 0);
  }

  List<TreeNodeItem> _withDepth(List<TreeNodeItem> nodes, int depth) {
    return [
      for (final n in nodes)
        TreeNodeItem(
          id: n.id,
          title: n.title,
          parentId: n.parentId,
          nodeTypeKey: n.nodeTypeKey,
          progressStatus: n.progressStatus,
          progressPercent: n.progressPercent,
          description: n.description,
          depth: depth,
          sortOrder: n.sortOrder,
          startAt: n.startAt,
          dueAt: n.dueAt,
          milestoneAt: n.milestoneAt,
          updatedAt: n.updatedAt,
          assignees: n.assignees,
          children: _withDepth(n.children, depth + 1),
        ),
    ];
  }

  Future<TreeNodeItem> createNode({
    required int projectId,
    required String title,
    String nodeTypeKey = 'person',
    int? parentId,
    String? description,
    String? dueAt,
  }) async {
    final data = await _api.post('/projects/$projectId/nodes', body: {
      'title': title.trim().isEmpty ? '未命名' : title.trim(),
      'node_type_key': nodeTypeKey,
      if (parentId != null) 'parent_id': parentId,
      if (description != null && description.trim().isNotEmpty)
        'description': description.trim(),
      if (dueAt != null) 'due_at': dueAt,
    }) as JsonMap;
    return TreeNodeItem.fromJson(data);
  }

  Future<TreeNodeItem> patchNode({
    required int nodeId,
    String? title,
    String? description,
    String? nodeTypeKey,
    String? dueAt,
  }) async {
    final body = <String, dynamic>{};
    if (title != null) body['title'] = title.trim();
    if (description != null) body['description'] = description;
    if (nodeTypeKey != null) body['node_type_key'] = nodeTypeKey;
    if (dueAt != null) body['due_at'] = dueAt;
    final data = await _api.patch('/nodes/$nodeId', body: body) as JsonMap;
    return TreeNodeItem.fromJson(data);
  }

  Future<List<NodeAssignee>> setAssignees({
    required int nodeId,
    required List<int> userIds,
  }) async {
    final data = await _api.put('/nodes/$nodeId/assignees', body: {
      'assignees': [
        for (var i = 0; i < userIds.length; i++)
          {
            'user_id': userIds[i],
            'role_key': i == 0 ? 'primary' : 'member',
          },
      ],
    }) as JsonMap;
    final items = data['assignees'];
    if (items is! List) return const [];
    return items
        .whereType<Map>()
        .map((e) => NodeAssignee.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<List<ProjectMemberItem>> listProjectMembers(int projectId) async {
    final data = await _api.get('/projects/$projectId/members') as JsonMap;
    return (data['items'] as List<dynamic>? ?? [])
        .whereType<Map>()
        .map((e) => ProjectMemberItem.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<TreeNodeItem> moveNode({
    required int nodeId,
    int? newParentId,
    int sortOrder = 0,
  }) async {
    final data = await _api.post('/nodes/$nodeId/move', body: {
      'new_parent_id': newParentId,
      'sort_order': sortOrder,
    }) as JsonMap;
    return TreeNodeItem.fromJson(data);
  }

  Future<void> deleteNode(int nodeId) async {
    await _api.delete('/nodes/$nodeId');
  }

  Future<List<EvidenceItem>> nodeEvidence(int nodeId) async {
    final data = await _api.get('/nodes/$nodeId/evidence') as JsonMap;
    return (data['items'] as List<dynamic>? ?? [])
        .whereType<Map>()
        .map((e) => EvidenceItem.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<Map<String, dynamic>> submitEvidence({
    required int nodeId,
    required String summary,
  }) async {
    return await _api.post('/nodes/$nodeId/evidence', body: {
      'summary_text': summary.trim(),
    }) as JsonMap;
  }

  Future<List<AgentItem>> listAgents(int companyId) async {
    final data = await _api.get('/agents', query: {
      'company_id': '$companyId',
    }) as JsonMap;
    return (data['items'] as List<dynamic>? ?? [])
        .whereType<Map>()
        .map((e) => AgentItem.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<AgentItem> createAgent({
    required int companyId,
    required String name,
    String scene = 'general',
    String? systemPrompt,
  }) async {
    final data = await _api.post('/agents', body: {
      'company_id': companyId,
      'name': name.trim(),
      'scene': scene,
      if (systemPrompt != null && systemPrompt.trim().isNotEmpty)
        'system_prompt': systemPrompt.trim(),
    }) as JsonMap;
    return AgentItem.fromJson(data);
  }

  Future<AgentItem> updateAgent(
    int id, {
    String? name,
    String? scene,
    String? systemPrompt,
  }) async {
    final data = await _api.patch('/agents/$id', body: {
      if (name != null) 'name': name.trim(),
      if (scene != null) 'scene': scene,
      if (systemPrompt != null) 'system_prompt': systemPrompt.trim(),
    }) as JsonMap;
    return AgentItem.fromJson(data);
  }

  Future<void> deleteAgent(int id) async {
    await _api.delete('/agents/$id');
  }

  Future<Map<String, dynamic>> chat({
    required int companyId,
    required String message,
    int? projectId,
    int? agentDefinitionId,
  }) async {
    return await _api.post('/agents/chat', body: {
      'company_id': companyId,
      'message': message.trim(),
      if (projectId != null) 'project_id': projectId,
      if (agentDefinitionId != null) 'agent_definition_id': agentDefinitionId,
      'channel': 'app',
    }) as JsonMap;
  }
}
