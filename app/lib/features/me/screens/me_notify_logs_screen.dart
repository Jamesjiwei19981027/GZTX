import 'package:flutter/material.dart';

import '../../../core/auth/auth_state.dart';
import '../../../core/time/time_utils.dart';
import '../../../design/design.dart';
import '../appearance/me_appearance.dart';
import '../data/me_api.dart';
import '../data/me_models.dart';
import '../state/me_runtime.dart';
import '../widgets/me_common.dart';

enum _MeNotifyFilter { all, success, failed }

/// 通知发送记录（对应网页 `MobileNotificationLogsScreen`，设计 ID 63）
class MeNotifyLogsScreen extends StatefulWidget {
  const MeNotifyLogsScreen({
    super.key,
    this.api,
    this.authState,
    this.appearance,
  });

  final MeApi? api;
  final AuthState? authState;
  final MeAppearanceController? appearance;

  @override
  State<MeNotifyLogsScreen> createState() => _MeNotifyLogsScreenState();
}

class _MeNotifyLogsScreenState extends State<MeNotifyLogsScreen> {
  bool _loading = true;
  Object? _error;
  List<MeNotifyRecord> _records = const [];
  _MeNotifyFilter _filter = _MeNotifyFilter.all;

  MeApi get _api => resolveMeApi(context, widget.api);

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final items = await _api.listNotifyRecords(limit: 50);
      if (!mounted) return;
      setState(() {
        _records = items;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  List<MeNotifyRecord> get _filtered {
    return switch (_filter) {
      _MeNotifyFilter.all => _records,
      _MeNotifyFilter.success => _records.where((r) => r.isSuccess).toList(),
      _MeNotifyFilter.failed => _records.where((r) => r.isFailed).toList(),
    };
  }

  @override
  Widget build(BuildContext context) {
    return MeScreenAppearance(
      controller: widget.appearance,
      child: AppScaffold(
        title: '通知发送记录',
        actions: [
          IconButton(
            tooltip: '刷新',
            icon: const AppIcon('refresh', size: 18),
            onPressed: _loading ? null : _load,
          ),
        ],
        body: MePageBody(
          children: [
            AppSegmentedControl<_MeNotifyFilter>(
              selectedValue: _filter,
              onValueChanged: (value) => setState(() => _filter = value),
              segments: {
                _MeNotifyFilter.all: '全部 (${_records.length})',
                _MeNotifyFilter.success: '成功',
                _MeNotifyFilter.failed: '失败',
              },
            ),
            const SizedBox(height: AppSpacing.md),
            if (_loading)
              const MeLoadingState(message: '正在加载发送记录…')
            else if (_error != null)
              MeErrorState(
                message: meErrorMessage(_error!),
                onRetry: _load,
              )
            else if (_filtered.isEmpty)
              MeCard(
                children: [
                  Padding(
                    padding:
                        const EdgeInsets.symmetric(vertical: AppSpacing.xl),
                    child: Column(
                      children: [
                        AppIcon(
                          'clock',
                          size: 18,
                          color: isDarkMode(context)
                              ? AppColors.darkTextTertiary
                              : AppColors.textTertiary,
                        ),
                        const SizedBox(height: AppSpacing.md),
                        const Text(
                          '暂无通知记录',
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.xs),
                        Text(
                          '当前筛选条件下没有产生通知发送日志',
                          style: TextStyle(
                            fontSize: 13,
                            color: isDarkMode(context)
                                ? AppColors.darkTextSecondary
                                : AppColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              )
            else
              for (final record in _filtered) ...[
                _recordCard(record),
                const SizedBox(height: AppSpacing.sm),
              ],
          ],
        ),
      ),
    );
  }

  Widget _recordCard(MeNotifyRecord record) {
    final isDark = isDarkMode(context);
    final failed = record.isFailed;
    return MeCard(
      children: [
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.xs,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            MeBadge(
              label: _channelLabel(record.channel),
              tone: MeTone.neutral,
            ),
            MeBadge(
              label: failed ? '发送失败' : '送达成功',
              tone: failed ? MeTone.danger : MeTone.success,
            ),
            Text(
              formatDisplayDateTime(record.createdAt),
              style: TextStyle(
                fontSize: 12,
                color: isDark
                    ? AppColors.darkTextTertiary
                    : AppColors.textTertiary,
              ),
            ),
          ],
        ),
        if ((record.taskTitle ?? '').trim().isNotEmpty) ...[
          const SizedBox(height: AppSpacing.sm),
          Text(
            '事项：${record.taskTitle}',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
            ),
          ),
        ],
        if (failed && (record.error ?? '').trim().isNotEmpty) ...[
          const SizedBox(height: AppSpacing.sm),
          MeBanner(
            message: '失败原因：${record.error}',
            tone: MeTone.danger,
          ),
        ],
      ],
    );
  }

  static String _channelLabel(String channel) {
    return switch (channel) {
      'email' => '邮件',
      'webpush' => '推送',
      'wechat' => '微信',
      'sms' => '短信',
      '' => '未知渠道',
      _ => channel,
    };
  }
}
