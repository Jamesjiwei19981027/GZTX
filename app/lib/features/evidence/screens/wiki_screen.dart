import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/app_error.dart';
import '../../../core/time/time_utils.dart';
import '../../../design/design.dart';
import '../data/evidence_api.dart';
import '../models/evidence_models.dart';
import '../widgets/evidence_widgets.dart';

enum WikiTab { published, drafts, search }

/// 项目 AI 知识库（对齐 `MobileWikiScreens`：已发布 / 草稿 / 资料搜索）
class WikiScreen extends StatefulWidget {
  const WikiScreen({
    super.key,
    required this.api,
    required this.projectId,
    this.projectName = '当前项目',
    this.initialTab = WikiTab.published,
  });

  final EvidenceApi api;
  final int projectId;
  final String projectName;
  final WikiTab initialTab;

  @override
  State<WikiScreen> createState() => _WikiScreenState();
}

class _WikiScreenState extends State<WikiScreen> {
  late WikiTab _tab = widget.initialTab;
  WikiCatalog? _catalog;
  bool _loading = true;
  String? _error;
  bool _forbidden = false;

  bool _generating = false;
  String? _generateError;

  final TextEditingController _query = TextEditingController();
  List<KnowledgeHit> _hits = const [];
  bool _searching = false;
  String? _searchError;
  bool _searched = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _forbidden = false;
    });
    try {
      final catalog = await widget.api.getWiki(widget.projectId);
      if (!mounted) return;
      setState(() {
        _catalog = catalog;
        _loading = false;
      });
    } on AuthException catch (error) {
      _fail(error.message);
    } on NetworkException catch (error) {
      _fail('${error.message}，请检查网络后重试');
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _forbidden = error.statusCode == 403;
        _error = error.message;
      });
    } catch (error) {
      _fail('加载项目知识失败，请稍后重试');
    }
  }

  void _fail(String message) {
    if (!mounted) return;
    setState(() {
      _loading = false;
      _error = message;
    });
  }

  Future<void> _generateDraft() async {
    final catalog = _catalog;
    final material = catalog?.preferredMaterial;
    if (material == null) {
      setState(() => _generateError = '暂无可用于整理知识的有效材料，请先在责任事项下提交材料。');
      return;
    }
    setState(() {
      _generating = true;
      _generateError = null;
    });
    try {
      await widget.api.generateDraft(
        projectId: widget.projectId,
        packageId: material.id,
      );
      if (!mounted) return;
      setState(() {
        _generating = false;
        _tab = WikiTab.drafts;
      });
      showAppToast(context, '知识草稿已生成', type: ToastType.success);
      await _load();
    } on AuthException catch (error) {
      _generateFailed(error.message);
    } on NetworkException catch (error) {
      _generateFailed('${error.message}，请检查网络后重试');
    } on ApiException catch (error) {
      _generateFailed(error.message);
    } catch (error) {
      _generateFailed('生成知识草稿失败，请稍后重试');
    }
  }

  void _generateFailed(String message) {
    if (!mounted) return;
    setState(() {
      _generating = false;
      _generateError = message;
    });
  }

  Future<void> _search() async {
    final keyword = _query.text.trim();
    if (keyword.isEmpty) {
      setState(() {
        _hits = const [];
        _searchError = null;
        _searched = false;
      });
      return;
    }
    setState(() {
      _searching = true;
      _searchError = null;
    });
    try {
      final hits = await widget.api.searchKnowledge(widget.projectId, keyword);
      if (!mounted) return;
      setState(() {
        _hits = hits;
        _searching = false;
        _searched = true;
      });
    } on AuthException catch (error) {
      _searchFailed(error.message);
    } on NetworkException catch (error) {
      _searchFailed('${error.message}，请检查网络后重试');
    } on ApiException catch (error) {
      _searchFailed(error.message);
    } catch (error) {
      _searchFailed('检索失败，请稍后重试');
    }
  }

  void _searchFailed(String message) {
    if (!mounted) return;
    setState(() {
      _searching = false;
      _hits = const [];
      _searched = true;
      _searchError = message;
    });
  }

  Future<void> _openDraft(WikiPage draft) async {
    final published = await context.push<bool>(
      '/evidence/wiki/draft/${draft.id}?projectId=${widget.projectId}',
    );
    if (published == true) {
      await _load();
      if (!mounted) return;
      setState(() => _tab = WikiTab.published);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: '项目知识',
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.md,
              AppSpacing.lg,
              AppSpacing.sm,
            ),
            child: AppSegmentedControl<WikiTab>(
              segments: {
                WikiTab.published: '已发布',
                WikiTab.drafts: '草稿（${_catalog?.drafts.length ?? 0}）',
                WikiTab.search: '资料搜索',
              },
              selectedValue: _tab,
              onValueChanged: (tab) => setState(() => _tab = tab),
            ),
          ),
          Expanded(child: _buildTabBody()),
        ],
      ),
    );
  }

  Widget _buildTabBody() {
    if (_tab == WikiTab.search) return _buildSearch();
    if (_loading) {
      return const EvidenceLoadingState(message: '正在加载项目知识…');
    }
    if (_forbidden) return const AppErrorState(isForbidden: true);
    if (_error != null) {
      return AppErrorState(message: _error!, onRetry: _load);
    }
    if (_tab == WikiTab.drafts) return _buildDrafts();
    return _buildPublished();
  }

  Widget _buildPublished() {
    final isDark = isDarkMode(context);
    final catalog = _catalog;
    final pages = catalog?.pages ?? const <WikiPage>[];
    final mainPage = pages.isEmpty ? null : pages.first;

    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.sm,
        AppSpacing.lg,
        AppSpacing.xxl,
      ),
      children: [
        if (_generateError != null) ...[
          EvidenceBanner(
            message: _generateError!,
            type: EvidenceBannerType.warning,
            icon: 'alert',
          ),
          const SizedBox(height: AppSpacing.md),
        ],
        if (mainPage == null)
          AppEmptyState(
            title: '还没有已发布的项目知识',
            description: '选择一份材料生成知识草稿，发布后项目成员可检索。',
            icon: const AppIcon('ai', size: 44, color: AppColors.primary),
            actionLabel: '生成知识草稿',
            onAction: _generating ? null : _generateDraft,
          )
        else ...[
          Text(
            mainPage.title,
            style: TextStyle(
              fontSize: 20,
              height: 1.3,
              fontWeight: FontWeight.w800,
              color: isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            '项目知识 · 第 ${mainPage.revision ?? 1} 版'
            '${mainPage.updatedAt == null ? '' : ' · 更新于 ${formatRelativeDate(parseApiDateTime(mainPage.updatedAt))}'}',
            style: TextStyle(
              fontSize: 12,
              color:
                  isDark ? AppColors.darkTextTertiary : AppColors.textTertiary,
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          for (var index = 0; index < pages.length; index++) ...[
            if (index > 0) EvidenceSectionTitle(pages[index].title),
            EvidenceCard(
              child: Text(
                (pages[index].bodyText ?? '').trim().isEmpty
                    ? '本页暂无正文内容。'
                    : pages[index].bodyText!.trim(),
                style: TextStyle(
                  fontSize: 14,
                  height: 1.6,
                  color: isDark
                      ? AppColors.darkTextSecondary
                      : AppColors.textSecondary,
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.md),
          ],
          const SizedBox(height: AppSpacing.sm),
          const EvidenceSectionTitle('参考材料与证据'),
          EvidenceCard(
            padding: EdgeInsets.zero,
            child: (catalog?.materials.isEmpty ?? true)
                ? const Padding(
                    padding: EdgeInsets.all(AppSpacing.lg),
                    child: Text(
                      '当前项目还没有可用于整理的材料。',
                      style: TextStyle(fontSize: 13, color: AppColors.textTertiary),
                    ),
                  )
                : Column(
                    children: [
                      for (var index = 0;
                          index < catalog!.materials.length;
                          index++) ...[
                        if (index > 0) const EvidenceDivider(),
                        EvidenceFileTile(
                          name: catalog.materials[index].title,
                          subtitle:
                              '材料 · ${catalog.materials[index].statusLabel}'
                              '${catalog.materials[index].canGenerate ? ' · 可整理' : ''}',
                          onTap: () => context.push(
                            '/evidence/package/${catalog.materials[index].id}',
                          ),
                        ),
                      ],
                    ],
                  ),
          ),
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            label: _generating ? '正在依据材料生成草稿…' : '生成知识草稿',
            size: AppButtonSize.lg,
            isFullWidth: true,
            isLoading: _generating,
            onPressed: _generating ? null : _generateDraft,
          ),
          const SizedBox(height: AppSpacing.md),
          EvidenceBanner(
            message: catalog?.canPublish == true
                ? '你有项目知识管理权限，草稿确认后可发布。'
                : '仅拥有项目知识管理权限的人员可以确认发布，当前草稿会保存在草稿列表。',
            type: EvidenceBannerType.info,
            icon: 'info',
          ),
        ],
      ],
    );
  }

  Widget _buildDrafts() {
    final isDark = isDarkMode(context);
    final drafts = _catalog?.drafts ?? const <WikiPage>[];
    if (drafts.isEmpty) {
      return const AppEmptyState(
        title: '暂无草稿',
        description: '在已发布页点击“生成知识草稿”后，草稿会显示在这里。',
        icon: AppIcon('file', size: 44, color: AppColors.primary),
      );
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.sm,
        AppSpacing.lg,
        AppSpacing.xxl,
      ),
      children: [
        EvidenceCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (var index = 0; index < drafts.length; index++) ...[
                if (index > 0) const EvidenceDivider(),
                EvidenceFileTile(
                  name: drafts[index].title,
                  subtitle: '草稿 · 点击查看并确认发布',
                  onTap: () => _openDraft(drafts[index]),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        Text(
          _catalog?.canPublish == true
              ? '你有发布权限，可直接确认发布。'
              : '你可查看自己的草稿；发布需要项目知识管理权限。',
          style: TextStyle(
            fontSize: 12,
            color: isDark ? AppColors.darkTextTertiary : AppColors.textTertiary,
          ),
        ),
      ],
    );
  }

  Widget _buildSearch() {
    final isDark = isDarkMode(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.sm,
        AppSpacing.lg,
        AppSpacing.xxl,
      ),
      children: [
        AppTextField(
          controller: _query,
          placeholder: '搜索项目知识、任务与材料…',
          prefix: const Padding(
            padding: EdgeInsets.only(left: AppSpacing.md),
            child: AppIcon('search', size: 16),
          ),
          textInputAction: TextInputAction.search,
          onSubmitted: (_) => _search(),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          '仅搜索“${widget.projectName}”授权范围内的资料与知识库',
          style: TextStyle(
            fontSize: 11,
            color: isDark ? AppColors.darkTextTertiary : AppColors.textTertiary,
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        AppButton(
          label: _searching ? '正在检索…' : '检索',
          isFullWidth: true,
          isLoading: _searching,
          onPressed: _searching ? null : _search,
        ),
        if (_searchError != null) ...[
          const SizedBox(height: AppSpacing.md),
          EvidenceBanner(
            message: _searchError!,
            type: EvidenceBannerType.danger,
            icon: 'alert',
            actionLabel: '重试',
            onAction: _search,
          ),
        ],
        const SizedBox(height: AppSpacing.lg),
        if (_searching)
          const EvidenceLoadingState(message: '正在检索项目资料…')
        else if (_searched && _hits.isEmpty && _searchError == null)
          const AppEmptyState(
            title: '没有检索到相关内容',
            description: '换个关键词再试试，或确认相关材料已发布为知识。',
          )
        else
          for (final hit in _hits) ...[
            EvidenceCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${hit.sourceLabel} #${hit.sourceId}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: isDark
                                ? AppColors.darkTextPrimary
                                : AppColors.textPrimary,
                          ),
                        ),
                      ),
                      EvidenceStatusChip(
                        label: hit.sourceLabel,
                        tone: EvidenceChipTone.primary,
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    hit.chunkText.trim().isEmpty ? '（无正文）' : hit.chunkText.trim(),
                    maxLines: 4,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 13,
                      height: 1.55,
                      color: isDark
                          ? AppColors.darkTextSecondary
                          : AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),
          ],
        if (_hits.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.sm),
          const EvidenceBanner(message: '结果保留来源与项目范围，点击材料可回到原始内容。'),
        ],
      ],
    );
  }
}
