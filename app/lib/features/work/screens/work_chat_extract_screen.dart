/// 从聊天文本提取任务（work-chat-extract）。
///
/// 对应网页 `MobileTaskExtractChatSheet`：AI 生成草稿后由用户确认入库。
/// 模型不可用或网络异常时保留原文并给出明确原因，绝不伪造成功。
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

class WorkChatExtractScreen extends StatefulWidget {
  const WorkChatExtractScreen({
    super.key,
    this.api,
    this.authState,
    this.initialText,
  });

  final WorkApi? api;
  final AuthState? authState;
  final String? initialText;

  @override
  State<WorkChatExtractScreen> createState() => _WorkChatExtractScreenState();
}

class _WorkChatExtractScreenState extends State<WorkChatExtractScreen> {
  late final TextEditingController _controller =
      TextEditingController(text: widget.initialText ?? '');
  TaskExtractDraft? _draft;
  bool _extracting = false;
  bool _creating = false;
  String? _error;

  WorkApi get _api => widget.api ?? WorkApi(context.read<AuthState>().api);

  AuthState? get _auth => widget.authState ?? _tryReadAuth();

  AuthState? _tryReadAuth() {
    try {
      return context.read<AuthState>();
    } catch (_) {
      return null;
    }
  }

  TaskScope get _scope =>
      TaskScope.normalizeOrPersonal(_auth?.currentProject?.id.toString());

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _extract() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    setState(() {
      _extracting = true;
      _error = null;
      _draft = null;
    });
    try {
      final draft = await _api.extractFromChat(
        chatText: text,
        companyId: _auth?.currentCompany?.id,
        projectId: _scope.projectId,
      );
      if (!mounted) return;
      setState(() {
        _draft = draft;
        _extracting = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _extracting = false;
        // 关键：保留原始聊天文本，只提示原因。
        _error = '提取失败：${describeError(error).message}，已保留原始聊天文本';
      });
    }
  }

  Future<void> _create() async {
    final draft = _draft;
    if (draft == null) return;
    setState(() {
      _creating = true;
      _error = null;
    });
    try {
      await _api.createTask({
        'title': draft.title,
        if (draft.description != null) 'description': draft.description,
        'priority': draft.priority,
        'status': draft.status,
        'due_date': draft.dueDateIso,
        'project_id': _scope.projectId,
        'origin': _scope.origin,
        if (draft.sourceChannel != null) 'source_channel': draft.sourceChannel,
        if (draft.sourceTitle != null) 'source_title': draft.sourceTitle,
      });
      if (!mounted) return;
      showAppToast(context, '已从聊天记录创建任务', type: ToastType.success);
      context.pop(true);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _creating = false;
        _error = '创建失败：${describeError(error).message}';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return AppScaffold(
      title: '从聊天提取任务',
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg,
          AppSpacing.md,
          AppSpacing.lg,
          AppSpacing.xxxl,
        ),
        children: [
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
                style: const TextStyle(
                  fontSize: 12,
                  height: 1.5,
                  color: AppColors.danger,
                ),
              ),
            ),
          Text(
            '粘贴聊天消息或会议结论，AI 将解析任务标题、优先级与截止日期草稿。',
            style: TextStyle(
              fontSize: 12,
              height: 1.5,
              color: isDark
                  ? AppColors.darkTextSecondary
                  : AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          AppTextField(
            controller: _controller,
            placeholder: '例如：「请张工在周五前将项目测试报告整理并同步到人轴上」',
            minLines: 5,
            maxLines: 10,
          ),
          const SizedBox(height: AppSpacing.md),
          AppButton(
            label: _extracting ? '智能解析中…' : '开始智能提取任务',
            isFullWidth: true,
            isLoading: _extracting,
            icon: const AppIcon('ai', size: 18, color: Colors.white),
            onPressed: _extracting || _controller.text.trim().isEmpty
                ? null
                : _extract,
          ),
          if (_draft != null) ...[
            const SizedBox(height: AppSpacing.lg),
            WorkSection(
              title: '已生成任务草稿（需确认后入库）',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _draft!.title,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      height: 1.35,
                    ),
                  ),
                  if (_draft!.description != null &&
                      _draft!.description!.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      _draft!.description!,
                      style: TextStyle(
                        fontSize: 12,
                        height: 1.5,
                        color: isDark
                            ? AppColors.darkTextSecondary
                            : AppColors.textSecondary,
                      ),
                    ),
                  ],
                  if (_draft!.dueLocalDate.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      '截止日期：${_draft!.dueLocalDate}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.warning,
                      ),
                    ),
                  ],
                  const SizedBox(height: AppSpacing.md),
                  Wrap(
                    spacing: AppSpacing.sm,
                    runSpacing: AppSpacing.sm,
                    children: [
                      AppButton(
                        label: _creating ? '入库中…' : '确认创建任务',
                        isLoading: _creating,
                        onPressed: _creating ? null : _create,
                      ),
                      AppButton(
                        label: '放弃草稿',
                        variant: AppButtonVariant.secondary,
                        onPressed: _creating
                            ? null
                            : () => setState(() => _draft = null),
                      ),
                    ],
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
