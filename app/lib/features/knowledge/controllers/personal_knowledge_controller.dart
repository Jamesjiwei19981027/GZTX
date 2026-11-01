import 'package:flutter/foundation.dart';

import 'package:worktodo_app/core/errors/app_error.dart';

import '../data/knowledge_repository.dart';
import '../models/knowledge_models.dart';

/// 知识空间的两种展示方式
enum KnowledgeViewMode { list, graph }

/// 个人知识空间状态控制器。
///
/// 只负责数据与状态，不依赖任何全局 Provider，方便组件测试直接构造。
class PersonalKnowledgeController extends ChangeNotifier {
  PersonalKnowledgeController({
    required this.repository,
    required this.projectId,
    required this.userId,
  });

  final KnowledgeRepository repository;
  final int projectId;
  final int userId;

  bool _disposed = false;
  int _readVersion = 0;

  bool isLoading = true;
  bool isPending = false;
  String pendingLabel = '';
  String? error;
  bool networkError = false;

  /// 服务端判定无访问权限（403）
  bool forbidden = false;
  String? notice;

  KnowledgeScope? scope;
  List<PersonalKnowledgeEntry> entries = const [];
  List<PersonalKnowledgeLink> links = const [];

  String search = '';
  KnowledgeViewMode viewMode = KnowledgeViewMode.list;
  bool organizing = false;

  /// 最近一次 AI 整理返回的建议（采纳前不写入）
  List<KnowledgeSuggestion> suggestions = const [];

  /// 空空间：加载完成、没有错误、且确实一条都没有
  bool get isEmpty =>
      !isLoading && error == null && entries.isEmpty && search.trim().isEmpty;

  /// 搜索无结果
  bool get isSearchEmpty =>
      !isLoading &&
      error == null &&
      entries.isNotEmpty &&
      visibleEntries.isEmpty;

  List<PersonalKnowledgeEntry> get visibleEntries {
    final query = search.trim().toLowerCase();
    if (query.isEmpty) return entries;
    return entries
        .where((entry) =>
            '${entry.title}\n${entry.bodyText}\n${entry.tags.join(' ')}'
                .toLowerCase()
                .contains(query))
        .toList(growable: false);
  }

  List<PersonalKnowledgeLink> get visibleLinks {
    final ids = visibleEntries.map((entry) => entry.id).toSet();
    return links
        .where((link) =>
            ids.contains(link.sourceEntryId) && ids.contains(link.targetEntryId))
        .toList(growable: false);
  }

  String? entryTitleOf(int entryId) {
    for (final entry in entries) {
      if (entry.id == entryId) return entry.title;
    }
    return null;
  }

  void _notify() {
    if (_disposed) return;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  void setSearch(String value) {
    if (search == value) return;
    search = value;
    _notify();
  }

  void setViewMode(KnowledgeViewMode mode) {
    if (viewMode == mode) return;
    viewMode = mode;
    _notify();
  }

  void clearError() {
    if (error == null) return;
    error = null;
    networkError = false;
    _notify();
  }

  void clearNotice() {
    if (notice == null) return;
    notice = null;
    _notify();
  }

  void _fail(Object cause) {
    error = knowledgeErrorMessage(cause);
    networkError = isNetworkFailure(cause);
    forbidden = cause is ApiException && cause.statusCode == 403;
  }

  /// 读取本人当前项目的知识空间
  Future<void> load() async {
    final version = ++_readVersion;
    isLoading = true;
    error = null;
    networkError = false;
    forbidden = false;
    _notify();
    try {
      final space = await repository.loadPersonalSpace(projectId);
      if (_disposed || version != _readVersion) return;
      if (space.scope.projectId != projectId ||
          space.scope.ownerUserId != userId) {
        error = '知识空间归属不匹配，请重新选择项目。';
      } else {
        scope = space.scope;
        entries = space.entries;
        links = space.links;
      }
    } catch (cause) {
      if (_disposed || version != _readVersion) return;
      _fail(cause);
    } finally {
      if (!_disposed && version == _readVersion) {
        isLoading = false;
        _notify();
      }
    }
  }

  Future<T?> _guard<T>(String label, Future<T> Function() action) async {
    if (isPending || isLoading) return null;
    isPending = true;
    pendingLabel = label;
    error = null;
    networkError = false;
    forbidden = false;
    notice = null;
    _notify();
    try {
      return await action();
    } catch (cause) {
      if (!_disposed) _fail(cause);
      return null;
    } finally {
      if (!_disposed) {
        isPending = false;
        pendingLabel = '';
        _notify();
      }
    }
  }

  void _upsertEntry(PersonalKnowledgeEntry entry) {
    if (entries.any((item) => item.id == entry.id)) {
      entries = entries
          .map((item) => item.id == entry.id ? entry : item)
          .toList(growable: false);
    } else {
      entries = [...entries, entry];
    }
  }

  /// 新建或修改一条笔记。返回 null 表示失败（错误已写入 error）
  Future<PersonalKnowledgeEntry?> saveEntry({
    int? entryId,
    required String title,
    required String bodyText,
    required List<String> tags,
  }) async {
    final effectiveTitle = deriveKnowledgeTitle(title, bodyText);
    if (effectiveTitle.isEmpty) {
      error = '请先写点内容，再保存这条笔记';
      _notify();
      return null;
    }
    return _guard('正在保存…', () async {
      final entry = entryId == null
          ? await repository.createEntry(
              projectId,
              title: effectiveTitle,
              bodyText: bodyText,
              tags: tags,
            )
          : await repository.updateEntry(
              projectId,
              entryId,
              title: effectiveTitle,
              bodyText: bodyText,
              tags: tags,
            );
      _upsertEntry(entry);
      notice = '笔记已保存，可让 AI 帮你整理关联';
      return entry;
    });
  }

  /// 删除笔记；关联会一起从前端移除，原始材料仍保留在来源里
  Future<bool> deleteEntry(int entryId) async {
    final result = await _guard('正在删除…', () async {
      await repository.deleteEntry(projectId, entryId);
      entries = entries.where((item) => item.id != entryId).toList(growable: false);
      links = links
          .where((link) =>
              link.sourceEntryId != entryId && link.targetEntryId != entryId)
          .toList(growable: false);
      notice = '条目已删除，原始来源保留';
      return true;
    });
    return result ?? false;
  }

  /// 保存关联图上的节点位置
  Future<void> savePosition(int entryId, KnowledgePoint position) async {
    await _guard('正在保存位置…', () async {
      final updated = await repository.updateEntry(
        projectId,
        entryId,
        position: position,
      );
      _upsertEntry(updated);
      return updated;
    });
  }

  Future<PersonalKnowledgeLink?> saveLink({
    int? linkId,
    required int sourceEntryId,
    required int targetEntryId,
    required String label,
  }) async {
    return _guard('正在保存关联…', () async {
      final link = linkId == null
          ? await repository.createLink(
              projectId,
              sourceEntryId: sourceEntryId,
              targetEntryId: targetEntryId,
              label: label,
            )
          : await repository.updateLink(projectId, linkId, label);
      if (links.any((item) => item.id == link.id)) {
        links = links
            .map((item) => item.id == link.id ? link : item)
            .toList(growable: false);
      } else {
        links = [...links, link];
      }
      notice = '关联已保存';
      return link;
    });
  }

  Future<bool> deleteLink(int linkId) async {
    final result = await _guard('正在删除关联…', () async {
      await repository.deleteLink(projectId, linkId);
      links = links.where((item) => item.id != linkId).toList(growable: false);
      notice = '关联已删除';
      return true;
    });
    return result ?? false;
  }

  /// 仅收集资料：把本人材料、汇报与 AI 输入收进知识空间
  Future<bool> collectOnly() async {
    final result = await _guard('正在收集资料…', () async {
      final syncResult = await repository.sync(projectId);
      notice = '已收集 ${syncResult.created} 条新资料';
      final space = await repository.loadPersonalSpace(projectId);
      if (_disposed) return false;
      scope = space.scope;
      entries = space.entries;
      links = space.links;
      return true;
    });
    return result ?? false;
  }

  /// AI 整理：先收集资料，再请 AI 找出有依据的关联。
  /// 不要求先有一条“成功记录”；没有可读内容时只提示，不调用模型。
  Future<List<KnowledgeSuggestion>> organize() async {
    if (isPending || isLoading) return const [];
    isPending = true;
    organizing = true;
    pendingLabel = 'AI 正在整理…';
    error = null;
    networkError = false;
    notice = null;
    suggestions = const [];
    _notify();
    try {
      await repository.sync(projectId);
      final space = await repository.loadPersonalSpace(projectId);
      if (_disposed) return const [];
      scope = space.scope;
      entries = space.entries;
      links = space.links;
      final ids = search.trim().isEmpty
          ? null
          : visibleEntries.map((entry) => entry.id).toList(growable: false);
      final result =
          await repository.suggestRelationships(projectId, entryIds: ids);
      if (_disposed) return const [];
      suggestions = result.suggestions;
      if (result.suggestions.isNotEmpty) {
        notice = 'AI 找到了 ${result.suggestions.length} 条关联建议';
      } else if (result.analyzed < 2) {
        notice = '资料已收集，再积累几条笔记就能发现更多关联。';
      } else {
        notice = '已整理 ${result.analyzed} 条笔记，暂无需要新增的关联。';
      }
      return result.suggestions;
    } catch (cause) {
      if (!_disposed) _fail(cause);
      return const [];
    } finally {
      if (!_disposed) {
        isPending = false;
        organizing = false;
        pendingLabel = '';
        _notify();
      }
    }
  }

  /// 采纳勾选的建议
  Future<bool> applySuggestions(List<KnowledgeSuggestion> chosen) async {
    if (chosen.isEmpty) return false;
    final result = await _guard('正在加入关联…', () async {
      final applied = await repository.applySuggestions(projectId, chosen);
      links = [...links, ...applied.links];
      suggestions = const [];
      viewMode = KnowledgeViewMode.graph;
      notice = '已加入 ${applied.created} 条关联';
      return true;
    });
    return result ?? false;
  }
}
