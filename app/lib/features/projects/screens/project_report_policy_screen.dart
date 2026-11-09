import 'package:flutter/material.dart';
import 'package:worktodo_app/core/auth/auth_provider.dart';
import 'package:worktodo_app/core/errors/app_error.dart';
import 'package:worktodo_app/design/design.dart';

import '../data/projects_repository.dart';
import '../models/project_management_models.dart';
import '../widgets/project_error_view.dart';
import '../widgets/project_widgets.dart';

class ProjectReportPolicyScreen extends StatefulWidget {
  const ProjectReportPolicyScreen({super.key, required this.projectId});
  final int projectId;

  @override
  State<ProjectReportPolicyScreen> createState() =>
      _ProjectReportPolicyScreenState();
}

class _ProjectReportPolicyScreenState extends State<ProjectReportPolicyScreen> {
  final _deadline = TextEditingController();
  bool _loading = true;
  bool _busy = false;
  bool _dirty = false;
  Object? _error;
  String? _message;
  String? _saveError;
  String _period = 'weekly';
  int _weekday = 5;
  int _monthDay = 25;
  bool _remind = false;
  bool _enabled = true;
  int _seq = 0;

  ProjectsRepository get _repo => ProjectsRepository(context.authStateRead.api);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void didUpdateWidget(ProjectReportPolicyScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.projectId != widget.projectId) _load();
  }

  @override
  void dispose() {
    _deadline.dispose();
    super.dispose();
  }

  void _apply(ProjectReportPolicy policy) {
    _period = policy.period;
    _deadline.text = policy.deadlineTime;
    _weekday = policy.weekday;
    _monthDay = policy.monthDay;
    _remind = policy.remind;
    _enabled = policy.enabled;
    _dirty = false;
  }

  Future<void> _load() async {
    final seq = ++_seq;
    final projectId = widget.projectId;
    setState(() {
      _loading = true;
      _error = null;
      _message = null;
      _saveError = null;
      _dirty = false;
    });
    try {
      final project = await _repo.fetchProject(projectId);
      final permissions = await _repo.fetchPermissions(projectId);
      if (!permissions.isPm && !permissions.isSuperadmin) {
        throw ApiException('仅项目负责人或超级管理员可设置汇报策略', statusCode: 403);
      }
      if (project.isArchived) {
        throw ApiException('项目已归档，请先取消归档', statusCode: 403);
      }
      final policy = await _repo.fetchReportPolicy(projectId);
      if (!mounted || seq != _seq) return;
      setState(() {
        _apply(policy);
        _loading = false;
        _busy = false;
      });
    } catch (error) {
      if (!mounted || seq != _seq) return;
      setState(() {
        _error = error;
        _loading = false;
        _busy = false;
      });
    }
  }

  Future<void> _save() async {
    if (_busy) return;
    final time = _deadline.text.trim();
    if (!RegExp(r'^([01]?\d|2[0-3]):[0-5]\d$').hasMatch(time)) {
      setState(() => _saveError = '请输入有效截止时间，例如 18:00');
      return;
    }
    final seq = _seq;
    setState(() {
      _busy = true;
      _saveError = null;
      _message = null;
    });
    try {
      final saved = await _repo.saveReportPolicy(
          widget.projectId,
          ProjectReportPolicy(
            period: _period,
            deadlineTime: time,
            weekday: _weekday,
            monthDay: _monthDay,
            remind: _remind,
            enabled: _enabled,
          ));
      if (!mounted || seq != _seq) return;
      setState(() {
        _apply(saved);
        _busy = false;
        _message = '汇报策略已保存';
      });
    } catch (error) {
      if (!mounted || seq != _seq) return;
      setState(() {
        _busy = false;
        _saveError = projectErrorMessage(error);
      });
    }
  }

  void _change(VoidCallback action) => setState(() {
        action();
        _dirty = true;
        _message = null;
      });

  @override
  Widget build(BuildContext context) => AppScaffold(
        title: '汇报策略',
        isDirty: _dirty && !_busy,
        body: _loading
            ? const Center(child: AppLoading())
            : _error != null
                ? ProjectErrorView(
                    error: _error!,
                    onRetry: _load,
                    onBack: () => Navigator.maybePop(context))
                : ListView(
                    padding: const EdgeInsets.all(AppSpacing.lg),
                    children: [
                        if (_message != null) ...[
                          InfoBanner(
                              message: _message!, tone: InfoBannerTone.success),
                          const SizedBox(height: AppSpacing.md)
                        ],
                        if (_saveError != null) ...[
                          InfoBanner(
                              message: _saveError!,
                              tone: InfoBannerTone.danger),
                          const SizedBox(height: AppSpacing.md)
                        ],
                        DropdownButtonFormField<String>(
                          initialValue: _period,
                          decoration: const InputDecoration(labelText: '汇报周期'),
                          items: const [
                            DropdownMenuItem(value: 'daily', child: Text('每日')),
                            DropdownMenuItem(
                                value: 'weekly', child: Text('每周')),
                            DropdownMenuItem(
                                value: 'monthly', child: Text('每月'))
                          ],
                          onChanged: _busy
                              ? null
                              : (value) => _change(() => _period = value!),
                        ),
                        const SizedBox(height: AppSpacing.lg),
                        AppTextField(
                            key: const ValueKey('report-deadline-time'),
                            controller: _deadline,
                            label: '截止时间',
                            placeholder: '18:00',
                            enabled: !_busy,
                            keyboardType: TextInputType.datetime,
                            onChanged: (_) => _change(() {})),
                        const SizedBox(height: AppSpacing.lg),
                        if (_period == 'weekly')
                          DropdownButtonFormField<int>(
                            initialValue: _weekday,
                            decoration:
                                const InputDecoration(labelText: '每周截止日'),
                            items: [
                              for (var i = 1; i <= 7; i++)
                                DropdownMenuItem(
                                    value: i,
                                    child: Text([
                                      '周一',
                                      '周二',
                                      '周三',
                                      '周四',
                                      '周五',
                                      '周六',
                                      '周日'
                                    ][i - 1]))
                            ],
                            onChanged: _busy
                                ? null
                                : (value) => _change(() => _weekday = value!),
                          ),
                        if (_period == 'monthly')
                          DropdownButtonFormField<int>(
                            initialValue: _monthDay,
                            decoration:
                                const InputDecoration(labelText: '每月截止日'),
                            items: [
                              for (var i = 1; i <= 28; i++)
                                DropdownMenuItem(
                                    value: i, child: Text('每月 $i 日'))
                            ],
                            onChanged: _busy
                                ? null
                                : (value) => _change(() => _monthDay = value!),
                          ),
                        const SizedBox(height: AppSpacing.md),
                        SwitchListTile(
                            contentPadding: EdgeInsets.zero,
                            title: const Text('启用汇报策略'),
                            value: _enabled,
                            onChanged: _busy
                                ? null
                                : (value) => _change(() => _enabled = value)),
                        SwitchListTile(
                            contentPadding: EdgeInsets.zero,
                            title: const Text('截止前提醒'),
                            subtitle: const Text('按项目汇报周期提醒尚未提交的成员'),
                            value: _remind,
                            onChanged: _busy
                                ? null
                                : (value) => _change(() => _remind = value)),
                        const SizedBox(height: AppSpacing.lg),
                        AppButton(
                            label: '保存策略',
                            isFullWidth: true,
                            isLoading: _busy,
                            onPressed: _busy ? null : _save),
                      ]),
      );
}
