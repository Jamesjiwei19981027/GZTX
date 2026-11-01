/// 快速添加任务（work-quick-add）。
///
/// 对应网页 `MobileQuickAddSheet`：只填标题即可创建，归属采用
/// `normalizeTaskScope` 的结果（个人 / 当前项目）。
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/auth/auth_provider.dart';
import '../../../core/auth/auth_state.dart';
import '../../../design/design.dart';
import '../data/work_api.dart';
import '../data/work_models.dart';
import '../data/work_scope.dart';
import '../widgets/work_widgets.dart';

class WorkQuickAddScreen extends StatefulWidget {
  const WorkQuickAddScreen({
    super.key,
    this.initialDate,
    this.api,
    this.authState,
  });

  final String? initialDate;
  final WorkApi? api;
  final AuthState? authState;

  @override
  State<WorkQuickAddScreen> createState() => _WorkQuickAddScreenState();
}

class _WorkQuickAddScreenState extends State<WorkQuickAddScreen> {
  final _controller = TextEditingController();
  bool _busy = false;
  String? _error;

  WorkApi get _api => widget.api ?? WorkApi(context.read<AuthState>().api);

  TaskScope get _scope {
    final auth = widget.authState ?? _tryReadAuth();
    return TaskScope.normalizeOrPersonal(auth?.currentProject?.id.toString());
  }

  AuthState? _tryReadAuth() {
    try {
      return context.read<AuthState>();
    } catch (_) {
      return null;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final title = _controller.text.trim();
    if (title.isEmpty) {
      setState(() => _error = '请输入待办内容');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _api.createTask({
        'title': title,
        'project_id': _scope.projectId,
        'origin': _scope.origin,
        if (widget.initialDate != null)
          'due_date': TaskTime.toApiDueDate(widget.initialDate),
      });
      if (!mounted) return;
      showAppToast(context, '任务已创建', type: ToastType.success);
      context.pop(true);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = describeError(error).message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = widget.authState ?? _tryReadAuth();
    return AppScaffold(
      title: '快速添加任务',
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          Text(
            _scope.isPersonal
                ? '归属：个人待办事项'
                : '归属：${auth?.currentProject?.name ?? '项目 #${_scope.projectId}'}',
            style: const TextStyle(fontSize: 12, color: AppColors.primary),
          ),
          if (widget.initialDate != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                '日期：${widget.initialDate}',
                style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
              ),
            ),
          const SizedBox(height: AppSpacing.md),
          if (_error != null)
            Container(
              margin: const EdgeInsets.only(bottom: AppSpacing.md),
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: AppColors.dangerLight,
                borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
              ),
              child: Text(
                _error!,
                style: const TextStyle(fontSize: 12, color: AppColors.danger),
              ),
            ),
          AppTextField(
            controller: _controller,
            placeholder: '输入待办事项…',
            prefix: const AppIcon('plus', size: 18),
            autofocus: true,
            onSubmitted: (_) => _submit(),
          ),
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            label: _busy ? '正在创建…' : '立即添加',
            isFullWidth: true,
            size: AppButtonSize.lg,
            isLoading: _busy,
            onPressed: _busy ? null : _submit,
          ),
        ],
      ),
    );
  }
}
