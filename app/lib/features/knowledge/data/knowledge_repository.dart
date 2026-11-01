import 'package:worktodo_app/core/api/api_client.dart';
import 'package:worktodo_app/core/errors/app_error.dart';

import '../models/knowledge_models.dart';

/// 知识空间接口封装。
///
/// 路径与网页版 `frontend/src/api/personalKnowledge.ts`、
/// `frontend/src/api/projectKnowledge.ts` 逐条对齐；接口一律走底座 `ApiClient`，
/// 由底座统一处理令牌、信封解包、超时与 401 续期。
class KnowledgeRepository {
  KnowledgeRepository(this._api);

  final ApiClient _api;

  String _personalBase(int projectId) =>
      '/projects/$projectId/personal-knowledge';

  String _projectBase(int projectId) => '/projects/$projectId/knowledge-space';

  // ---------------- 个人知识空间 ----------------

  Future<PersonalKnowledgeSpace> loadPersonalSpace(int projectId) async {
    final data = await _api.get(_personalBase(projectId));
    return PersonalKnowledgeSpace.fromJson(_asMap(data));
  }

  Future<PersonalKnowledgeEntry> createEntry(
    int projectId, {
    required String title,
    required String bodyText,
    required List<String> tags,
  }) async {
    final data = await _api.post(
      '${_personalBase(projectId)}/entries',
      body: {'title': title, 'body_text': bodyText, 'tags': tags},
    );
    return PersonalKnowledgeEntry.fromJson(_asMap(data));
  }

  Future<PersonalKnowledgeEntry> updateEntry(
    int projectId,
    int entryId, {
    String? title,
    String? bodyText,
    List<String>? tags,
    KnowledgePoint? position,
  }) async {
    final body = <String, dynamic>{};
    if (title != null) body['title'] = title;
    if (bodyText != null) body['body_text'] = bodyText;
    if (tags != null) body['tags'] = tags;
    if (position != null) body['position'] = position.toJson();
    final data = await _api.patch(
      '${_personalBase(projectId)}/entries/$entryId',
      body: body,
    );
    return PersonalKnowledgeEntry.fromJson(_asMap(data));
  }

  Future<void> deleteEntry(int projectId, int entryId) async {
    await _api.delete('${_personalBase(projectId)}/entries/$entryId');
  }

  /// 收集本人材料、汇报与 AI 输入；不要求先有一条成功记录
  Future<KnowledgeSyncResult> sync(int projectId) async {
    final data =
        await _api.post('${_personalBase(projectId)}/sync', body: const {});
    return KnowledgeSyncResult.fromJson(_asMap(data));
  }

  Future<PersonalKnowledgeLink> createLink(
    int projectId, {
    required int sourceEntryId,
    required int targetEntryId,
    required String label,
  }) async {
    final data = await _api.post(
      '${_personalBase(projectId)}/links',
      body: {
        'source_entry_id': sourceEntryId,
        'target_entry_id': targetEntryId,
        'label': label,
      },
    );
    return PersonalKnowledgeLink.fromJson(_asMap(data));
  }

  Future<PersonalKnowledgeLink> updateLink(
    int projectId,
    int linkId,
    String label,
  ) async {
    final data = await _api.patch(
      '${_personalBase(projectId)}/links/$linkId',
      body: {'label': label},
    );
    return PersonalKnowledgeLink.fromJson(_asMap(data));
  }

  Future<void> deleteLink(int projectId, int linkId) async {
    await _api.delete('${_personalBase(projectId)}/links/$linkId');
  }

  /// 请 AI 找出笔记之间有原文依据的关联；只返回建议，不写任何关联
  Future<KnowledgeSuggestionResult> suggestRelationships(
    int projectId, {
    List<int>? entryIds,
  }) async {
    final data = await _api.post(
      '${_personalBase(projectId)}/assist',
      body: entryIds == null || entryIds.isEmpty
          ? const <String, dynamic>{}
          : {'entry_ids': entryIds},
    );
    return KnowledgeSuggestionResult.fromJson(_asMap(data));
  }

  /// 采纳用户勾选的建议
  Future<KnowledgeApplyResult> applySuggestions(
    int projectId,
    List<KnowledgeSuggestion> suggestions,
  ) async {
    final data = await _api.post(
      '${_personalBase(projectId)}/assist/apply',
      body: {
        'suggestions': suggestions.map((item) => item.toJson()).toList(),
      },
    );
    return KnowledgeApplyResult.fromJson(_asMap(data));
  }

  // ---------------- 项目知识空间 ----------------

  Future<ProjectKnowledgeCatalog> loadProjectCatalog(int projectId) async {
    final data = await _api.get(_projectBase(projectId));
    return ProjectKnowledgeCatalog.fromJson(_asMap(data));
  }

  Future<ProjectKnowledgeMember> setGrant(
    int projectId,
    int userId, {
    required bool canSummarize,
  }) async {
    final data = await _api.put(
      '${_projectBase(projectId)}/grants/$userId',
      body: {'can_summarize': canSummarize},
    );
    return ProjectKnowledgeMember.fromJson(_asMap(data));
  }

  Future<ProjectKnowledgeSummary> generateSummary(
    int projectId, {
    required List<int> pageIds,
    String instruction = '',
  }) async {
    final data = await _api.post(
      '${_projectBase(projectId)}/summaries',
      body: {
        'page_ids': pageIds,
        if (instruction.trim().isNotEmpty) 'instruction': instruction.trim(),
      },
    );
    return ProjectKnowledgeSummary.fromJson(_asMap(data));
  }

  Future<ProjectKnowledgeSummary> loadSummary(
      int projectId, int summaryId) async {
    final data =
        await _api.get('${_projectBase(projectId)}/summaries/$summaryId');
    return ProjectKnowledgeSummary.fromJson(_asMap(data));
  }

  Future<KnowledgeSaveResult> saveSummary(
    int projectId,
    int summaryId, {
    required String title,
    required String bodyText,
    required List<String> tags,
  }) async {
    final data = await _api.post(
      '${_projectBase(projectId)}/summaries/$summaryId/save',
      body: {'title': title, 'body_text': bodyText, 'tags': tags},
    );
    return KnowledgeSaveResult.fromJson(_asMap(data));
  }

  Map<String, dynamic> _asMap(dynamic data) {
    if (data is Map<String, dynamic>) return data;
    if (data is Map) return data.cast<String, dynamic>();
    throw ApiException('接口返回格式不符合预期，请稍后重试');
  }
}

/// 把各类异常翻译成用户能看懂的中文提示。
///
/// 断网、登录过期、服务端错误必须给出可见状态，不允许静默吞掉。
String knowledgeErrorMessage(Object error) {
  if (error is NetworkException) {
    return '网络连接异常，请检查网络后重试';
  }
  if (error is AuthException) {
    return error.message.isEmpty ? '登录已过期，请重新登录' : error.message;
  }
  if (error is ValidationException) {
    return error.message.isEmpty ? '填写内容有误，请检查后重试' : error.message;
  }
  if (error is ApiException) {
    return error.message.isEmpty ? '服务暂时不可用，请稍后重试' : error.message;
  }
  if (error is AppException) {
    return error.message.isEmpty ? '操作失败，请重试' : error.message;
  }
  return '操作失败，请重试';
}

/// 是否为断网/超时类异常（用于显示断网横条）
bool isNetworkFailure(Object error) => error is NetworkException;
