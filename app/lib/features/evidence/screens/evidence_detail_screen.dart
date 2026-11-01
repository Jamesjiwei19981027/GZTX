import 'package:flutter/material.dart';

import '../../../core/errors/app_error.dart';
import '../../../core/time/time_utils.dart';
import '../../../design/design.dart';
import '../data/evidence_api.dart';
import '../models/evidence_models.dart';
import '../widgets/evidence_widgets.dart';

/// 材料包详情（对齐 `MobileEvidencePackageDetailScreen`）
///
/// 网页版该页是硬编码演示数据；原生版改为真实读取 `/evidence/{package_id}`。
class EvidenceDetailScreen extends StatefulWidget {
  const EvidenceDetailScreen({
    super.key,
    required this.api,
    required this.packageId,
    this.currentUserId,
  });

  final EvidenceApi api;
  final int packageId;
  final int? currentUserId;

  @override
  State<EvidenceDetailScreen> createState() => _EvidenceDetailScreenState();
}

class _EvidenceDetailScreenState extends State<EvidenceDetailScreen> {
  EvidencePackage? _package;
  String? _nodeTitle;
  bool _loading = true;
  String? _error;
  bool _forbidden = false;

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
    });
    try {
      final package = await widget.api.getPackage(widget.packageId);
      if (!mounted) return;
      setState(() {
        _package = package;
        _loading = false;
      });
      final title = await widget.api.loadNodeTitle(package.nodeId);
      if (!mounted || title == null) return;
      setState(() => _nodeTitle = title);
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
      _fail('加载材料详情失败，请稍后重试');
    }
  }

  void _fail(String message) {
    if (!mounted) return;
    setState(() {
      _loading = false;
      _error = message;
    });
  }

  Future<void> _showFileSheet(EvidenceFileRef file) async {
    await showAppBottomSheet<void>(
      context: context,
      title: '文件信息',
      builder: (context) {
        final isDark = isDarkMode(context);
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
                file.name,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: isDark
                      ? AppColors.darkTextPrimary
                      : AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              _MetaRow(label: '类型', value: evidenceKindLabel(file.kind)),
              _MetaRow(label: '大小', value: file.sizeLabel),
              _MetaRow(label: '文件编号', value: '#${file.fileId}'),
              const SizedBox(height: AppSpacing.md),
              const EvidenceBanner(
                message: '后端暂未提供材料文件下载接口，当前只能查看文件信息，'
                    '无法在应用内预览或下载（已写入回传报告的接口问题）。',
                type: EvidenceBannerType.warning,
                icon: 'info',
              ),
              const SizedBox(height: AppSpacing.md),
              AppButton(
                label: '知道了',
                variant: AppButtonVariant.secondary,
                isFullWidth: true,
                onPressed: () => Navigator.of(context).maybePop(),
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
      title: '材料包详情',
      actions: [
        if (!_loading && _error == null)
          GestureDetector(
            onTap: _load,
            behavior: HitTestBehavior.opaque,
            child: const Padding(
              padding: EdgeInsets.symmetric(horizontal: AppSpacing.md),
              child: AppIcon('refresh', size: 20, color: AppColors.primary),
            ),
          ),
      ],
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const EvidenceLoadingState(message: '正在加载材料详情…');
    }
    if (_forbidden) {
      return const AppErrorState(isForbidden: true);
    }
    if (_error != null) {
      return AppErrorState(message: _error!, onRetry: _load);
    }
    final package = _package;
    if (package == null) {
      return AppErrorState(message: '材料不存在或已被删除', onRetry: _load);
    }
    return _buildContent(package);
  }

  Widget _buildContent(EvidencePackage package) {
    final isDark = isDarkMode(context);
    final submittedAt =
        formatDisplayDateTime(parseApiDateTime(package.submittedAt));
    final isMine = widget.currentUserId != null &&
        package.submitterUserId == widget.currentUserId;
    final submitterLabel = isMine
        ? '我'
        : (package.submitterUserId == null
            ? '未知提报人'
            : '用户 #${package.submitterUserId}');

    return SingleChildScrollView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.xs,
            children: [
              EvidenceStatusChip(
                label: package.statusLabel,
                tone: package.isRejected
                    ? EvidenceChipTone.danger
                    : EvidenceChipTone.success,
              ),
              EvidenceStatusChip(
                label: package.kindLabel,
                tone: EvidenceChipTone.primary,
              ),
              EvidenceStatusChip(
                label: '材料编号 #${package.id}',
                tone: EvidenceChipTone.neutral,
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            package.summaryText?.trim().isNotEmpty == true
                ? package.summaryText!.trim()
                : '（无提交说明）',
            style: TextStyle(
              fontSize: 18,
              height: 1.4,
              fontWeight: FontWeight.w700,
              color: isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            submittedAt.isEmpty
                ? '提报人 · $submitterLabel'
                : '$submitterLabel 提交于 $submittedAt',
            style: TextStyle(
              fontSize: 12,
              color: isDark ? AppColors.darkTextTertiary : AppColors.textTertiary,
            ),
          ),
          if (package.precheckErrors.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            EvidenceBanner(
              message: '提交校验提示：${package.precheckErrors.join('；')}',
              type: EvidenceBannerType.danger,
              icon: 'alert',
            ),
          ],
          const SizedBox(height: AppSpacing.lg),
          EvidenceSectionTitle('支撑文件（${package.files.length}）'),
          if (package.files.isEmpty)
            const EvidenceCard(
              child: Text(
                '本次材料没有附件，仅提交了文字说明。',
                style: TextStyle(fontSize: 13, color: AppColors.textTertiary),
              ),
            )
          else
            EvidenceCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  for (var index = 0; index < package.files.length; index++) ...[
                    if (index > 0) const EvidenceDivider(),
                    EvidenceFileTile(
                      name: package.files[index].name,
                      subtitle: package.files[index].typeLabel,
                      onTap: () => _showFileSheet(package.files[index]),
                    ),
                  ],
                ],
              ),
            ),
          const SizedBox(height: AppSpacing.lg),
          const EvidenceSectionTitle('关联信息'),
          EvidenceCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                _InfoRow(
                  label: '责任事项',
                  value: _nodeTitle ?? '责任事项 #${package.nodeId}',
                ),
                const EvidenceDivider(),
                _InfoRow(label: '所属项目', value: '项目 #${package.projectId}'),
                const EvidenceDivider(),
                _InfoRow(label: '提报人', value: submitterLabel),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          const EvidenceSectionTitle('材料信息'),
          EvidenceCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                _InfoRow(label: '材料类型', value: package.kindLabel),
                const EvidenceDivider(),
                _InfoRow(label: '当前状态', value: package.statusLabel),
                const EvidenceDivider(),
                _InfoRow(
                  label: '提交时间',
                  value: submittedAt.isEmpty ? '未记录' : submittedAt,
                ),
                const EvidenceDivider(),
                _InfoRow(label: '材料编号', value: '#${package.id}'),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          const EvidenceBanner(
            message: '材料提交后进入待验收状态，请等待授权负责人确认。',
          ),
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            label: '刷新状态',
            variant: AppButtonVariant.secondary,
            isFullWidth: true,
            onPressed: _load,
          ),
          const SizedBox(height: AppSpacing.xxl),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.md,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 13,
              color: isDark ? AppColors.darkTextTertiary : AppColors.textTertiary,
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
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

class _MetaRow extends StatelessWidget {
  const _MetaRow({required this.label, required this.value});

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
            width: 64,
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
