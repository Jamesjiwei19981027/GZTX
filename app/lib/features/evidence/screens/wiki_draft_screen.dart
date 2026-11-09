import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/app_error.dart';
import '../../../core/time/time_utils.dart';
import '../../../design/design.dart';
import '../data/evidence_api.dart';
import '../models/evidence_models.dart';
import '../widgets/evidence_widgets.dart';

/// 知识草稿查看与发布（对齐 `WikiDraftEditorScreen`）
///
/// 网页版的“保存草稿”按钮没有对应后端接口（仅关闭页面），原生版不提供
/// 伪保存，改为直接返回草稿列表，已写入回传报告的差异清单。
class WikiDraftScreen extends StatefulWidget {
  const WikiDraftScreen({
    super.key,
    required this.api,
    required this.projectId,
    required this.draftId,
  });

  final EvidenceApi api;
  final int projectId;
  final int draftId;

  @override
  State<WikiDraftScreen> createState() => _WikiDraftScreenState();
}

class _WikiDraftScreenState extends State<WikiDraftScreen> {
  WikiCatalog? _catalog;
  WikiPage? _draft;
  bool _loading = true;
  bool _publishing = false;
  String? _error;
  bool _forbidden = false;
  bool _notFound = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _forbidden = false;
      _notFound = false;
    });
    try {
      final catalog = await widget.api.getWiki(widget.projectId);
      final draft = catalog.draftById(widget.draftId);
      if (!mounted) return;
      setState(() {
        _catalog = catalog;
        _draft = draft;
        _loading = false;
        _notFound = draft == null;
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
      _fail('加载知识草稿失败，请稍后重试');
    }
  }

  void _fail(String message) {
    if (!mounted) return;
    setState(() {
      _loading = false;
      _error = message;
    });
  }

  Future<void> _publish() async {
    final draft = _draft;
    final catalog = _catalog;
    if (draft == null) return;
    if (catalog?.canPublish != true) {
      setState(() => _error = '仅有项目知识管理权限的人员可以发布正式版本');
      return;
    }
    final confirmed = await showAppConfirmDialog(
      context: context,
      title: '确认发布知识草稿',
      message: '发布后项目成员可见。请先核实 AI 生成的结论与引用来源，确认发布这份草稿？',
      confirmLabel: '确认发布',
    );
    if (confirmed != true || !mounted) return;

    setState(() {
      _publishing = true;
      _error = null;
    });
    try {
      await widget.api.publishDraft(
        projectId: widget.projectId,
        draftId: draft.id,
      );
      if (!mounted) return;
      setState(() => _publishing = false);
      showAppToast(context, '知识草稿已正式发布', type: ToastType.success);
      context.pop(true);
    } on AuthException catch (error) {
      _publishFailed(error.message);
    } on NetworkException catch (error) {
      _publishFailed('${error.message}，请检查网络后重试');
    } on ApiException catch (error) {
      _publishFailed(error.message);
    } catch (error) {
      _publishFailed('发布草稿失败，请稍后重试');
    }
  }

  void _publishFailed(String message) {
    if (!mounted) return;
    setState(() {
      _publishing = false;
      _error = message;
    });
  }

  Future<void> _showFactSheet(WikiFact fact) async {
    await showAppBottomSheet<void>(
      context: context,
      title: '证据来源追溯',
      builder: (sheetContext) {
        final isDark = isDarkMode(sheetContext);
        return Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.sm,
            AppSpacing.lg,
            AppSpacing.xxl,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                fact.lineLabel,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                  letterSpacing: 0.3,
                  color: isDark ? const Color(0xFF9EC7FF) : AppColors.primary,
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(AppSpacing.md),
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF10263F) : const Color(0xFFF2F7FF),
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                  border: Border.all(
                    color:
                        isDark ? const Color(0xFF1C3F63) : const Color(0xFFCFE0FA),
                  ),
                ),
                child: Text(
                  '“${fact.quotePreview}”',
                  style: TextStyle(
                    fontSize: 14,
                    height: 1.6,
                    fontStyle: FontStyle.italic,
                    color: isDark
                        ? AppColors.darkTextPrimary
                        : AppColors.textPrimary,
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              _FactMetaRow(label: '来源文件', value: fact.sourceName ?? '材料证据'),
              _FactMetaRow(
                label: '证据包编号',
                value: fact.packageId == null ? '—' : '#${fact.packageId}',
              ),
              const SizedBox(height: AppSpacing.md),
              AppButton(
                label: '查看原始证据包',
                isFullWidth: true,
                onPressed: fact.packageId == null
                    ? null
                    : () {
                        final id = fact.packageId!;
                        Navigator.of(sheetContext).maybePop();
                        context.push('/evidence/package/$id');
                      },
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: '知识草稿',
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const EvidenceLoadingState(message: '正在加载知识草稿…');
    }
    if (_forbidden) return const AppErrorState(isForbidden: true);
    if (_error != null && _draft == null) {
      return AppErrorState(message: _error!, onRetry: _load);
    }
    if (_notFound || _draft == null) {
      return AppErrorState(
        title: '草稿不可用',
        message: '该草稿不存在或已发布，请返回项目知识查看最新内容。',
        retryLabel: '刷新',
        onRetry: _load,
      );
    }
    return _buildContent(_draft!);
  }

  Widget _buildContent(WikiPage draft) {
    final isDark = isDarkMode(context);
    final canPublish = _catalog?.canPublish == true;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const EvidenceStatusChip(
            label: '草稿 · 尚未发布',
            tone: EvidenceChipTone.warning,
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            draft.title,
            style: TextStyle(
              fontSize: 20,
              height: 1.3,
              fontWeight: FontWeight.w500,
              color: isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            draft.updatedAt == null
                ? 'AI 整理草稿'
                : 'AI 整理草稿 · 生成于 ${formatRelativeDate(parseApiDateTime(draft.updatedAt))}',
            style: TextStyle(
              fontSize: 12,
              color:
                  isDark ? AppColors.darkTextTertiary : AppColors.textTertiary,
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.md),
            EvidenceBanner(
              message: _error!,
              type: EvidenceBannerType.danger,
              icon: 'alert',
            ),
          ],
          const SizedBox(height: AppSpacing.lg),
          const EvidenceSectionTitle('正文'),
          EvidenceCard(
            child: Text(
              (draft.bodyText ?? '').trim().isEmpty
                  ? '本次草稿没有正文，请回到材料重新生成。'
                  : draft.bodyText!.trim(),
              style: TextStyle(
                fontSize: 14,
                height: 1.6,
                color: isDark
                    ? AppColors.darkTextSecondary
                    : AppColors.textSecondary,
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          EvidenceSectionTitle('引用来源（${draft.facts.length}）'),
          if (draft.facts.isEmpty)
            const EvidenceCard(
              child: Text(
                '本次草稿未附带原文引用。',
                style: TextStyle(fontSize: 13, color: AppColors.textTertiary),
              ),
            )
          else
            EvidenceCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  for (var index = 0; index < draft.facts.length; index++) ...[
                    if (index > 0) const EvidenceDivider(),
                    EvidenceFileTile(
                      name: draft.facts[index].text.trim().isEmpty
                          ? '引用片段 ${index + 1}'
                          : draft.facts[index].text.trim(),
                      subtitle: draft.facts[index].sourceName == null
                          ? '点击查看原文引述与来源'
                          : '来源：${draft.facts[index].sourceName}',
                      onTap: () => _showFactSheet(draft.facts[index]),
                    ),
                  ],
                ],
              ),
            ),
          const SizedBox(height: AppSpacing.lg),
          EvidenceBanner(
            message: canPublish
                ? '发布后项目成员可见；请先核实 AI 生成的结论与引用。'
                : '当前账号没有项目知识管理权限，只能查看草稿，发布请联系项目知识管理员。',
            type: canPublish
                ? EvidenceBannerType.warning
                : EvidenceBannerType.info,
            icon: canPublish ? 'warning' : 'info',
          ),
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            label: _publishing ? '正在发布…' : '确认发布',
            size: AppButtonSize.lg,
            isFullWidth: true,
            isLoading: _publishing,
            onPressed: (_publishing || !canPublish) ? null : _publish,
          ),
          const SizedBox(height: AppSpacing.sm),
          AppButton(
            label: '返回草稿列表',
            variant: AppButtonVariant.secondary,
            isFullWidth: true,
            onPressed: () => context.pop(false),
          ),
          const SizedBox(height: AppSpacing.xxl),
        ],
      ),
    );
  }
}

class _FactMetaRow extends StatelessWidget {
  const _FactMetaRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xs),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 84,
            child: Text(
              label,
              style: TextStyle(
                fontSize: 13,
                color:
                    isDark ? AppColors.darkTextTertiary : AppColors.textTertiary,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                fontSize: 13,
                color:
                    isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

