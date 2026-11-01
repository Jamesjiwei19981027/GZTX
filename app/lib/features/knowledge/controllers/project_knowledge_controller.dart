import 'package:flutter/foundation.dart';

import 'package:worktodo_app/core/errors/app_error.dart';

import '../data/knowledge_repository.dart';
import '../models/knowledge_models.dart';

/// 项目知识空间状态控制器：共享资料、成员授权、AI 总结与沉淀。
///
/// 权限一律以服务端返回为准（`permissions`、`members`），前端只做展示开关，
/// 不做任何本地提升权限的判断。
class ProjectKnowledgeController extends ChangeNotifier {
  ProjectKnowledgeController({
    required this.repository,
    required this.projectId,
  });

  final KnowledgeRepository repository;
  final int projectId;

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

  ProjectKnowledgeCatalog? catalog;
  List<int> selectedPageIds = const [];
  String instruction = '';

  /// 生成后的总结草稿，确认保存前只有本人可见
  ProjectKnowledgeSummary? summary;

  List<ProjectKnowledgePage> get pages => catalog?.pages ?? const [];

  bool get canSummarize => catalog?.permissions.canSummarize ?? false;

  bool get canManageGrants => catalog?.permissions.canManageGrants ?? false;

  bool get isEmpty =>
      !isLoading && error == null && pages.isEmpty;

  void _notify() {
    if (_disposed) return;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
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

  void setInstruction(String value) {
    instruction = value;
    _notify();
  }

  void togglePage(int pageId) {
    if (selectedPageIds.contains(pageId)) {
      selectedPageIds =
          selectedPageIds.where((id) => id != pageId).toList(growable: false);
    } else {
      selectedPageIds = [...selectedPageIds, pageId];
    }
    _notify();
  }

  void clearSummary() {
    if (summary == null) return;
    summary = null;
    _notify();
  }

  void _fail(Object cause) {
    error = knowledgeErrorMessage(cause);
    networkError = isNetworkFailure(cause);
    forbidden = cause is ApiException && cause.statusCode == 403;
  }

  Future<void> load() async {
    final version = ++_readVersion;
    isLoading = true;
    error = null;
    networkError = false;
    forbidden = false;
    _notify();
    try {
      final result = await repository.loadProjectCatalog(projectId);
      if (_disposed || version != _readVersion) return;
      if (result.scope.projectId != projectId) {
        error = '项目知识归属不匹配，请重新选择项目。';
      } else {
        catalog = result;
        // 已选中的页被删除时同步清理，避免提交过期 id
        final pageIds = result.pages.map((page) => page.id).toSet();
        selectedPageIds = selectedPageIds
            .where(pageIds.contains)
            .toList(growable: false);
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

  /// 请 AI 依据共享资料生成总结草稿（不写入个人知识）
  Future<ProjectKnowledgeSummary?> generateSummary() async {
    if (!canSummarize) {
      error = '请联系项目经理开通 AI 总结权限';
      _notify();
      return null;
    }
    if (pages.isEmpty) {
      error = '暂无共享资料，暂时无法总结';
      _notify();
      return null;
    }
    final pageIds = selectedPageIds.isEmpty
        ? pages.map((page) => page.id).toList(growable: false)
        : selectedPageIds;
    return _guard('正在整理…', () async {
      final draft = await repository.generateSummary(
        projectId,
        pageIds: pageIds,
        instruction: instruction,
      );
      summary = draft;
      notice = '总结已准备好，确认后即可存入我的知识。';
      return draft;
    });
  }

  /// 确认把总结存进本人知识库；重复保存不复制条目
  Future<bool> saveSummary({
    required String title,
    required String bodyText,
    required List<String> tags,
  }) async {
    final current = summary;
    if (current == null) return false;
    if (!canSummarize) {
      error = '总结权限已被收回，无法存入我的知识';
      _notify();
      return false;
    }
    if (title.trim().isEmpty) {
      error = '请填写总结标题';
      _notify();
      return false;
    }
    final result = await _guard('正在存入我的知识…', () async {
      final saved = await repository.saveSummary(
        projectId,
        current.id,
        title: title.trim(),
        bodyText: bodyText,
        tags: tags,
      );
      summary = ProjectKnowledgeSummary(
        id: current.id,
        title: current.title,
        bodyText: current.bodyText,
        sources: current.sources,
        pageIds: current.pageIds,
        status: 'saved',
        provider: current.provider,
        modelSource: current.modelSource,
        personalEntryId: saved.entry.id,
      );
      notice = saved.alreadySaved
          ? '这份总结已存在于我的知识，保留原有条目。'
          : '已存入我的知识。';
      return true;
    });
    return result ?? false;
  }

  /// 项目经理/公司管理员给成员开通或收回“总结”授权
  Future<bool> setGrant(int userId, bool canSummarize) async {
    final result = await _guard('正在更新授权…', () async {
      final member = await repository.setGrant(
        projectId,
        userId,
        canSummarize: canSummarize,
      );
      final current = catalog;
      if (current != null) {
        final members = current.members
            .map((item) => item.userId == member.userId ? member : item)
            .toList(growable: false);
        final self = member.userId == current.scope.ownerUserId;
        catalog = ProjectKnowledgeCatalog(
          scope: current.scope,
          pages: current.pages,
          permissions: self
              ? ProjectKnowledgePermissions(
                  canSummarize: member.canSummarize,
                  canManageGrants: current.permissions.canManageGrants,
                )
              : current.permissions,
          members: members,
        );
      }
      notice = '总结授权已更新';
      return true;
    });
    return result ?? false;
  }
}
