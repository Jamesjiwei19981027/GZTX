/// 回收站（work-trash）。
///
/// 对应网页 `MobileTrashScreen` 与 `components/views/TrashView.tsx`：
/// 软删任务分页列表、30 天保留提示、逐条恢复。
/// 后端未提供「彻底删除」接口（只有定时清理），因此不提供该入口。
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/auth/auth_provider.dart';
import '../../../core/auth/auth_state.dart';
import '../../../core/time/time_utils.dart';
import '../../../design/design.dart';
import '../data/work_api.dart';
import '../data/work_models.dart';
import '../widgets/work_widgets.dart';

class WorkTrashScreen extends StatefulWidget {
  const WorkTrashScreen(
      {super.key, this.api, this.authState, this.pageSize = 20});

  final WorkApi? api;
  final AuthState? authState;
  final int pageSize;

  @override
  State<WorkTrashScreen> createState() => _WorkTrashScreenState();
}

class _WorkTrashScreenState extends State<WorkTrashScreen> {
  bool _bootstrapped = false;

  List<WorkTask> _items = const [];
  int _page = 1;
  int _total = 0;
  int _totalPages = 1;
  bool _loading = true;
  Object? _error;
  int? _restoringId;
  final Set<int> _restored = {};

  WorkApi get _api => widget.api ?? WorkApi(context.read<AuthState>().api);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_bootstrapped) return;
    _bootstrapped = true;
    _load(1);
  }

  Future<void> _load(int page) async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result =
          await _api.listTrash(page: page, pageSize: widget.pageSize);
      if (!mounted) return;
      setState(() {
        _items = result.items;
        _page = result.page;
        _total = result.total;
        _totalPages = result.totalPages <= 0 ? 1 : result.totalPages;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error;
        _loading = false;
      });
    }
  }

  Future<void> _restore(WorkTask task) async {
    setState(() => _restoringId = task.id);
    try {
      await _api.restoreTask(task.id);
      if (!mounted) return;
      setState(() {
        _restoringId = null;
        _restored.add(task.id);
      });
      showAppToast(context, '已恢复「${task.title}」', type: ToastType.success);
      await _load(_page);
    } catch (error) {
      if (!mounted) return;
      setState(() => _restoringId = null);
      showAppToast(context, describeError(error).message,
          type: ToastType.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return AppScaffold(
      title: '回收站',
      actions: [
        IconButton(
          tooltip: '刷新',
          onPressed: () => _load(_page),
          icon: const AppIcon('refresh', size: 18),
        ),
      ],
      body: WorkStateContainer(
        isLoading: _loading && _items.isEmpty,
        error: _error,
        onRetry: () => _load(_page),
        loadingLabel: '载入回收站事项…',
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.md,
            AppSpacing.lg,
            AppSpacing.xxxl,
          ),
          children: [
            Container(
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: AppColors.infoContainerOf(isDarkMode(context)),
                borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: AppIcon('info',
                        size: 18,
                        color:
                            AppColors.onInfoContainerOf(isDarkMode(context))),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      '回收站中的任务将保留 30 天，期间可随时一键恢复到项目待办中；逾期将由系统自动永久清除',
                      style: TextStyle(
                        fontSize: 12,
                        height: 1.5,
                        color: AppColors.onInfoContainerOf(isDarkMode(context)),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            if (_items.isEmpty)
              WorkSection(
                child: Column(
                  children: [
                    const WorkEmptyHint(text: '回收站空空如也', icon: 'trash'),
                    Text(
                      '最近未有被删除的任务',
                      style: TextStyle(
                        fontSize: 12,
                        color: isDark
                            ? AppColors.darkTextTertiary
                            : AppColors.textTertiary,
                      ),
                    ),
                  ],
                ),
              )
            else ...[
              Text(
                '软删事项（共 $_total 项）',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: isDark
                      ? AppColors.darkTextSecondary
                      : AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              WorkSection(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    for (var i = 0; i < _items.length; i++) ...[
                      _TrashRow(
                        task: _items[i],
                        restoring: _restoringId == _items[i].id,
                        restored: _restored.contains(_items[i].id),
                        onRestore: () => _restore(_items[i]),
                      ),
                      if (i < _items.length - 1)
                        const Divider(height: 0.5, thickness: 0.5),
                    ],
                  ],
                ),
              ),
              if (_totalPages > 1)
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.md),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      TextButton(
                        onPressed: _page <= 1 ? null : () => _load(_page - 1),
                        child: const Text('上一页'),
                      ),
                      Text(
                        '$_page / $_totalPages',
                        style: const TextStyle(fontSize: 12),
                      ),
                      TextButton(
                        onPressed: _page >= _totalPages
                            ? null
                            : () => _load(_page + 1),
                        child: const Text('下一页'),
                      ),
                    ],
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _TrashRow extends StatelessWidget {
  const _TrashRow({
    required this.task,
    required this.restoring,
    required this.restored,
    required this.onRestore,
  });

  final WorkTask task;
  final bool restoring;
  final bool restored;
  final VoidCallback onRestore;

  @override
  Widget build(BuildContext context) {
    final busy = restoring;
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.md,
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  task.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    height: 1.3,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  task.deletedAt == null
                      ? '已软删除'
                      : '删除时间: ${formatDisplayDateTime(task.deletedAt)}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textTertiary,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          AppButton(
            label: restored ? '已恢复' : (restoring ? '恢复中…' : '恢复'),
            size: AppButtonSize.sm,
            isLoading: restoring,
            onPressed: busy || restored ? null : onRestore,
          ),
        ],
      ),
    );
  }
}
