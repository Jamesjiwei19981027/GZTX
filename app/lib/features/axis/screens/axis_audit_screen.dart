import 'package:flutter/material.dart';

import 'package:provider/provider.dart';

import '../../../core/auth/auth_provider.dart';
import '../../../core/auth/auth_state.dart';
import '../../../design/design.dart';
import '../data/axis_api.dart';
import '../data/axis_models.dart';
import '../data/axis_rules.dart';
import '../widgets/axis_common.dart';

/// AI 责任链审计（axis-audit）。
///
/// 后端 `POST /projects/{id}/axis-audit` 是基于进度与证据的启发式审计；
/// 未配置模型时后端会返回可读中文原因，本页把它转成“未配置审计模型”状态并允许重试。
class AxisAuditScreen extends StatefulWidget {
  const AxisAuditScreen({
    super.key,
    this.api,
    this.authState,
    this.projectId,
  });

  final AxisApi? api;
  final AuthState? authState;
  final int? projectId;

  @override
  State<AxisAuditScreen> createState() => _AxisAuditScreenState();
}

class _AxisAuditScreenState extends State<AxisAuditScreen> {
  AxisApi? _api;
  AuthState? _auth;
  bool _running = true;
  Object? _error;
  AxisAuditResult? _result;
  bool _modelUnconfigured = false;
  int _epoch = 0;

  int? get _projectId => widget.projectId ?? _auth?.currentProject?.id;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_api != null) return;
    _auth = widget.authState ?? _readAuth();
    _api = widget.api ?? AxisApi(context.read<AuthState>().api);
    _run();
  }

  AuthState? _readAuth() {
    try {
      return context.read<AuthState>();
    } catch (_) {
      return null;
    }
  }

  @override
  void dispose() {
    _epoch++;
    super.dispose();
  }

  Future<void> _run() async {
    final epoch = ++_epoch;
    final projectId = _projectId;
    setState(() {
      _running = true;
      _error = null;
      _modelUnconfigured = false;
    });
    if (projectId == null) {
      setState(() {
        _running = false;
        _error = '缺少项目上下文，请重新进入项目';
      });
      return;
    }
    try {
      final result = await _api!.runAudit(projectId);
      if (!mounted || epoch != _epoch) return;
      setState(() {
        _result = result;
        _running = false;
      });
    } catch (e) {
      if (!mounted || epoch != _epoch) return;
      final message = axisErrorMessage(e);
      setState(() {
        _running = false;
        _error = e;
        _modelUnconfigured = message.contains('模型') ||
            message.contains('LLM') ||
            message.contains('422') ||
            message.contains('503') ||
            message.contains('未配置');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return AppScaffold(
      title: 'AI 责任链审计',
      body: _running
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const AppLoading(),
                  const SizedBox(height: AppSpacing.md),
                  Text(
                    '正在运行责任链审计…',
                    style: TextStyle(
                      fontSize: 13,
                      color: AppColors.textSecondaryOf(isDark),
                    ),
                  ),
                ],
              ),
            )
          : ListView(
              padding: const EdgeInsets.all(AppSpacing.lg),
              children: [
                if (_modelUnconfigured)
                  AxisCard(
                    color: AppColors.warningLight,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Row(
                          children: [
                            Icon(Icons.warning_amber_rounded,
                                color: AppColors.warning),
                            SizedBox(width: AppSpacing.sm),
                            Expanded(
                              child: Text(
                                '未配置审计模型',
                                style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w500,
                                  color: AppColors.warning,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        const Text(
                          '当前项目或企业尚未在设置中配置并启用可用的审计模型。'
                          '真实审计功能需要配置模型后方可执行。',
                          style: TextStyle(fontSize: 12, height: 1.5),
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        AppButton(
                          label: '重试运行审计',
                          size: AppButtonSize.sm,
                          onPressed: _run,
                        ),
                      ],
                    ),
                  )
                else if (_error != null)
                  AxisErrorBanner(
                    message: axisErrorMessage(_error!),
                    onRetry: _run,
                  )
                else ...[
                  _SummaryCard(result: _result),
                  const AxisSectionTitle('待确认问题'),
                  AxisCard(
                    padding: EdgeInsets.zero,
                    child: (_result?.nodes.isEmpty ?? true)
                        ? const Padding(
                            padding: EdgeInsets.all(AppSpacing.lg),
                            child: Text(
                              '本次审计未发现需要处理的责任链风险。',
                              style: TextStyle(fontSize: 13),
                            ),
                          )
                        : Column(
                            children: [
                              for (var i = 0;
                                  i < _result!.nodes.length;
                                  i++) ...[
                                _AuditNodeRow(node: _result!.nodes[i]),
                                if (i != _result!.nodes.length - 1)
                                  const Divider(height: 1),
                              ],
                            ],
                          ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  const AxisInfoBanner(
                    text: 'AI 结果交由管理者确认，可在核验后处理责任和任务。',
                  ),
                ],
                const SizedBox(height: AppSpacing.lg),
                AppButton(
                  label: '重新运行审计',
                  variant: AppButtonVariant.secondary,
                  isFullWidth: true,
                  isLoading: _running,
                  onPressed: _running ? null : _run,
                ),
              ],
            ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.result});

  final AxisAuditResult? result;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final pending = result?.pendingCount ?? 0;
    return AxisCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.description_outlined, size: 18),
              const SizedBox(width: AppSpacing.sm),
              const Expanded(
                child: Text(
                  '责任链审计完成',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
                ),
              ),
              AxisStatusChip(
                label: '$pending 项待处理',
                color: pending == 0 ? AppColors.success : AppColors.warning,
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            '${result?.overallRiskLabel ?? '整体风险较低'}'
            ' · ${AxisRules.formatDateTime(result?.generatedAt)}',
            style: TextStyle(
              fontSize: 12,
              color: AppColors.textSecondaryOf(isDark),
            ),
          ),
        ],
      ),
    );
  }
}

class _AuditNodeRow extends StatelessWidget {
  const _AuditNodeRow({required this.node});

  final AxisAuditNode node;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final color = node.riskLevel == 'high'
        ? AppColors.danger
        : node.riskLevel == 'medium'
            ? AppColors.warning
            : AppColors.success;
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  node.title,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              AxisStatusChip(label: '${node.riskLabel}风险', color: color),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            node.summary,
            style: TextStyle(
              fontSize: 12,
              height: 1.4,
              color: AppColors.textSecondaryOf(isDark),
            ),
          ),
          if (node.suggestedActions.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xs),
            for (final action in node.suggestedActions)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('· ', style: TextStyle(fontSize: 12)),
                    Expanded(
                      child: Text(
                        action,
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondaryOf(isDark),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ],
      ),
    );
  }
}

