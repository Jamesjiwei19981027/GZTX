import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:provider/provider.dart';

import '../../../core/auth/auth_provider.dart';
import '../../../core/time/time_utils.dart';
import '../../../design/design.dart';
import '../data/axis_api.dart';
import '../data/axis_models.dart';
import '../widgets/axis_common.dart';

/// 节点进度与进度记录（axis-progress）。
///
/// 数据来自 `GET /nodes/{id}` 与 `GET /nodes/{id}/progress`；
/// 进度本身由正式进度账本维护，本页只读，不直接写 `progress_json`。
class AxisProgressScreen extends StatefulWidget {
  const AxisProgressScreen({
    super.key,
    required this.nodeId,
    this.api,
  });

  final int nodeId;
  final AxisApi? api;

  @override
  State<AxisProgressScreen> createState() => _AxisProgressScreenState();
}

class _AxisProgressScreenState extends State<AxisProgressScreen> {
  AxisApi? _api;
  bool _loading = true;
  Object? _error;
  String _title = '';
  AxisProgressSnapshot? _snapshot;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_api != null) return;
    _api = widget.api ?? AxisApi(context.read<AuthState>().api);
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = _api!;
      final node = await api.fetchNode(widget.nodeId);
      final progress = await api.fetchProgress(widget.nodeId);
      if (!mounted) return;
      setState(() {
        _title = (node['title'] ?? '').toString();
        _snapshot = progress;
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

  @override
  Widget build(BuildContext context) {
    final snapshot = _snapshot;
    return AppScaffold(
      title: '进度与记录',
      body: _loading
          ? const Center(child: AppLoading())
          : _error != null
              ? AppErrorState(
                  title: '无法加载进度',
                  message: axisErrorMessage(_error!),
                  onRetry: _load,
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(AppSpacing.lg),
                    children: [
                      AxisCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    _title.isEmpty ? '节点进度' : _title,
                                    style: const TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                                Text(
                                  '${snapshot?.percent ?? 0}%',
                                  style: const TextStyle(
                                    fontSize: 20,
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.primary,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: AppSpacing.sm),
                            ClipRRect(
                              borderRadius: BorderRadius.circular(4),
                              child: LinearProgressIndicator(
                                value: (snapshot?.percent ?? 0) / 100,
                                minHeight: 8,
                                color: AppColors.primary,
                                backgroundColor: AppColors.primaryLight,
                              ),
                            ),
                            const SizedBox(height: AppSpacing.sm),
                            Text(
                              snapshot?.statusLabel ?? '未开始',
                              style: const TextStyle(
                                fontSize: 12,
                                color: AppColors.textSecondary,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const AxisSectionTitle('进度记录'),
                      AxisCard(
                        child: (snapshot?.records.isEmpty ?? true)
                            ? const Padding(
                                padding: EdgeInsets.all(AppSpacing.lg),
                                child: Text(
                                  '暂无进度记录。上传材料、评审确认或正式进度录入后，'
                                  '这里会按时间倒序显示。',
                                  style: TextStyle(
                                    fontSize: 12,
                                    height: 1.5,
                                    color: AppColors.textSecondary,
                                  ),
                                ),
                              )
                            : Column(
                                children: [
                                  for (var i = 0;
                                      i < snapshot!.records.length;
                                      i++)
                                    _RecordRow(
                                      record: snapshot.records[i],
                                      isLast:
                                          i == snapshot.records.length - 1,
                                    ),
                                ],
                              ),
                      ),
                      const SizedBox(height: AppSpacing.lg),
                      const AxisInfoBanner(
                        text: '汇报中的完成描述需要与进度和材料对照；材料提交由「材料」模块负责。',
                      ),
                      const SizedBox(height: AppSpacing.md),
                      AppButton(
                        label: '提交材料',
                        isFullWidth: true,
                        onPressed: () =>
                            context.push('/evidence/submit?nodeId=${widget.nodeId}'),
                      ),
                    ],
                  ),
                ),
    );
  }
}

class _RecordRow extends StatelessWidget {
  const _RecordRow({required this.record, required this.isLast});

  final AxisProgressRecord record;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final when = record.createdAt == null
        ? ''
        : formatRelativeDate(record.createdAt);
    return Padding(
      padding: EdgeInsets.only(bottom: isLast ? 0 : AppSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: const BoxDecoration(
                  color: AppColors.primary,
                  shape: BoxShape.circle,
                ),
              ),
              if (!isLast)
                Container(
                  width: 2,
                  height: 42,
                  color: AppColors.primary.withValues(alpha: 0.25),
                ),
            ],
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${record.eventLabel}'
                  '${record.percent == null ? '' : ' · ${record.percent}%'}'
                  '${when.isEmpty ? '' : ' · $when'}',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (record.reason != null &&
                    record.reason!.trim().isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    record.reason!,
                    style: const TextStyle(
                      fontSize: 12,
                      height: 1.5,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
