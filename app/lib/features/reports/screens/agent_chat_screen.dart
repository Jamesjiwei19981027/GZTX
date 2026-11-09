import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_provider.dart';
import '../../../design/design.dart';
import '../data/reports_api.dart';
import '../models/report_capabilities.dart';
import '../services/report_draft_store.dart';
import '../widgets/report_ui.dart';
import 'report_scope.dart';

class _ChatMessage {
  _ChatMessage({
    required this.id,
    required this.isUser,
    required this.content,
    required this.timeLabel,
    this.sourceLabel,
  });

  final String id;
  final bool isUser;
  final String content;
  final String timeLabel;
  final String? sourceLabel;
}

/// 与我的项目 AI 对话（路由 `ai-chat` / `/reports/chat`）。
///
/// “知识”Tab 的知识助手对话复用本页（`knowledgeMode`），与网页版一致：
/// `knowledge-chat` 也渲染 `MyAgentScreen` 的对话视图。
class AgentChatScreen extends StatefulWidget {
  const AgentChatScreen({
    super.key,
    this.api,
    this.userId,
    this.userName,
    this.companyId,
    this.projectId,
    this.projectName,
    this.projects,
    this.onSelectProject,
    this.draftStore,
    this.knowledgeMode = false,
  });

  final ReportsApi? api;
  final int? userId;
  final String? userName;
  final int? companyId;
  final int? projectId;
  final String? projectName;
  final List<ProjectOption>? projects;
  final ValueChanged<ProjectOption>? onSelectProject;
  final ReportDraftStore? draftStore;
  final bool knowledgeMode;

  @override
  State<AgentChatScreen> createState() => _AgentChatScreenState();
}

class _AgentChatScreenState extends State<AgentChatScreen> {
  final TextEditingController _input = TextEditingController();
  final ScrollController _scroll = ScrollController();
  final List<_ChatMessage> _messages = [];

  ReportsApi? _api;
  int _projectId = 0;
  int _userId = 0;
  bool _sending = false;
  bool _showMicHint = false;
  String? _error;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncProject();
  }

  @override
  void didUpdateWidget(covariant AgentChatScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.projectId != widget.projectId ||
        oldWidget.api != widget.api ||
        oldWidget.knowledgeMode != widget.knowledgeMode) {
      _syncProject();
    }
  }

  void _syncProject() {
    final nextProjectId = ReportScope.projectId(context, widget.projectId);
    _api = widget.api ?? ReportsApi(context.apiClient);
    _userId = ReportScope.userId(context, widget.userId);
    if (nextProjectId != _projectId) {
      // 与网页版按项目重建页面一致：切项目后清空对话，绝不串上下文
      _messages.clear();
      _showMicHint = false;
      _error = null;
      _sending = false;
      _projectId = nextProjectId;
    }
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    final projectId = _projectId;
    if (text.isEmpty || _sending || projectId <= 0) return;

    final now = DateTime.now();
    final timeLabel = _clock(now);
    setState(() {
      _sending = true;
      _error = null;
      _messages.add(_ChatMessage(
        id: 'user-${now.microsecondsSinceEpoch}',
        isUser: true,
        content: text,
        timeLabel: timeLabel,
      ));
      _input.clear();
    });
    _scrollToBottom();

    try {
      final reply = await _api!.chat(
        companyId: ReportScope.companyId(context, widget.companyId),
        projectId: projectId,
        message: text,
      );
      // 页面已切换项目或已销毁时丢弃旧结果
      if (!mounted || _projectId != projectId) return;
      final repliedAt = DateTime.now();
      setState(() {
        _messages.add(_ChatMessage(
          id: 'ai-${repliedAt.microsecondsSinceEpoch}',
          isUser: false,
          content: reply.reply,
          timeLabel: _clock(repliedAt),
          sourceLabel: '来源：本次对话 · 今天 ${_clock(repliedAt)}',
        ));
      });
    } catch (cause) {
      if (!mounted || _projectId != projectId) return;
      setState(() {
        _error = reportErrorMessage(cause, fallback: '发送失败，请稍后重试');
      });
    } finally {
      if (mounted && _projectId == projectId) {
        setState(() => _sending = false);
        _scrollToBottom();
      }
    }
  }

  String _clock(DateTime time) {
    final hour = time.hour.toString().padLeft(2, '0');
    final minute = time.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
      );
    });
  }

  Future<void> _addToDraft(String content) async {
    final projectId = _projectId;
    if (projectId <= 0) return;
    final store = widget.draftStore ?? ReportDraftStore();
    final existing = await store.load(userId: _userId, projectId: projectId);
    final summary = existing?.summary.trim().isNotEmpty == true
        ? '${existing!.summary}\n\n【对话补充】$content'
        : '【对话进展】$content';
    final saved = await store.save(
      userId: _userId,
      projectId: projectId,
      summary: summary,
      draftReportId: existing?.draftReportId,
    );
    if (!mounted) return;
    if (!saved) {
      showAppToast(context, '草稿保存失败，请检查设备存储空间', type: ToastType.error);
      return;
    }
    context.push('/reports/create?projectId=$projectId');
  }

  @override
  Widget build(BuildContext context) {
    final projectId = ReportScope.projectId(context, widget.projectId);
    final projectName = ReportScope.projectName(context, widget.projectName);
    final projects = ReportScope.projectOptions(context, widget.projects);
    final title = widget.knowledgeMode ? '知识助手' : '与我的 AI 对话';

    if (projectId <= 0) {
      return AppScaffold(
        title: title,
        body: Column(
          children: [
            ReportProjectBar(
              projectName: '未选择项目',
              projects: projects,
              onSelect: widget.onSelectProject,
            ),
            const Expanded(
              child: AppEmptyState(
                title: '请选择具体项目',
                description: '智能体会话与上下文按项目隔离，请先切换到具体项目',
                icon: AppIcon(
                  'folder',
                  size: 18,
                ),
              ),
            ),
          ],
        ),
      );
    }

    final userName = ReportScope.userName(context, widget.userName);

    return AppScaffold(
      title: title,
      body: ReportKeyboardPadding(
        child: Column(
          children: [
            ReportProjectBar(
              projectName: projectName,
              projects: projects,
              onSelect: widget.onSelectProject,
            ),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.lg,
                vertical: AppSpacing.sm,
              ),
              color: isDarkMode(context)
                  ? const Color(0xFF16233A)
                  : const Color(0xFFEAF1FD),
              child: Row(
                children: [
                  const AppIcon(
                    'info',
                    size: 18,
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      '$userName的项目 AI · 上下文仅限当前项目（$projectName）',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.primary),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                controller: _scroll,
                padding: const EdgeInsets.all(AppSpacing.lg),
                children: [
                  if (_messages.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: AppSpacing.xxl),
                      child: Text(
                        '您可以告诉我今天完成了哪些事项、遇到什么阻碍，我会帮您归纳到汇报草稿中',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                            fontSize: 12, color: AppColors.textTertiary),
                      ),
                    ),
                  for (final message in _messages)
                    _messageBubble(context, message),
                  if (_sending)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: AppSpacing.sm),
                      child: Row(
                        children: [
                          AppLoading(size: 16),
                          SizedBox(width: AppSpacing.sm),
                          Text(
                            '正在整理进展…',
                            style: TextStyle(
                                fontSize: 12, color: AppColors.textTertiary),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.lg,
                  0,
                  AppSpacing.lg,
                  AppSpacing.sm,
                ),
                child: ReportInfoBanner(_error!, tone: ReportBannerTone.error),
              ),
            _inputBar(context),
          ],
        ),
      ),
    );
  }

  Widget _messageBubble(BuildContext context, _ChatMessage message) {
    final dark = isDarkMode(context);
    final bubbleColor = message.isUser
        ? (dark ? const Color(0xFF1E3355) : const Color(0xFFEDF4FF))
        : (dark ? AppColors.darkSurface : Colors.white);
    final textColor = dark ? AppColors.darkTextPrimary : AppColors.textPrimary;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.lg),
      child: Column(
        crossAxisAlignment:
            message.isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          Container(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.sizeOf(context).width * 0.82,
            ),
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: bubbleColor,
              borderRadius: BorderRadius.only(
                topLeft: const Radius.circular(AppSpacing.radiusLg),
                topRight: const Radius.circular(AppSpacing.radiusLg),
                bottomLeft:
                    Radius.circular(message.isUser ? AppSpacing.radiusLg : 4),
                bottomRight:
                    Radius.circular(message.isUser ? 4 : AppSpacing.radiusLg),
              ),
              border: Border.all(
                color: dark ? AppColors.darkBorder : AppColors.border,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (!message.isUser) ...[
                  const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      AppIcon(
                        'ai',
                        size: 18,
                      ),
                      SizedBox(width: 4),
                      Text(
                        '已记下本次进展',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: AppColors.primary,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.xs),
                ],
                Text(
                  message.content,
                  style:
                      TextStyle(fontSize: 14, height: 1.45, color: textColor),
                ),
                if (message.sourceLabel != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  Divider(
                    height: 1,
                    color: dark ? AppColors.darkBorder : AppColors.borderLight,
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    message.sourceLabel!,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textTertiary,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (!message.isUser) ...[
            const SizedBox(height: AppSpacing.sm),
            TextButton.icon(
              onPressed: () => _addToDraft(message.content),
              icon: const AppIcon(
                'edit',
                size: 18,
              ),
              label: const Text(
                '加入汇报草稿',
                style: TextStyle(fontSize: 12, color: AppColors.primary),
              ),
              style: TextButton.styleFrom(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                minimumSize: const Size(0, 36),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _inputBar(BuildContext context) {
    final dark = isDarkMode(context);
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: dark ? AppColors.darkSurface : Colors.white,
        border: Border(
          top:
              BorderSide(color: dark ? AppColors.darkBorder : AppColors.border),
        ),
      ),
      child: Column(
        children: [
          if (_showMicHint)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: ReportInfoBanner(
                '语音输入依赖语音识别引擎与系统授权。当前未配置，已切换为文字输入。',
                tone: ReportBannerTone.warning,
                icon: GestureDetector(
                  onTap: () => setState(() => _showMicHint = false),
                  child: const AppIcon('close',
                      size: 18, color: AppColors.warning),
                ),
              ),
            ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              IconButton(
                tooltip: '语音输入',
                onPressed: () => setState(() => _showMicHint = true),
                icon: const AppIcon('mic',
                    size: 18, color: AppColors.textTertiary),
              ),
              Expanded(
                child: AppTextField(
                  controller: _input,
                  placeholder: '输入项目进展与工作事实…',
                  minLines: 1,
                  maxLines: 6,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _send(),
                  clearButtonEnabled: false,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              SizedBox(
                width: 44,
                height: 44,
                child: Material(
                  color: AppColors.primary,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                    onTap: _sending ? null : _send,
                    child: Center(
                      child: _sending
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor:
                                    AlwaysStoppedAnimation<Color>(Colors.white),
                              ),
                            )
                          : const AppIcon('send',
                              size: 18, color: Colors.white),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          const Text(
            '只有已提交的对话与项目材料才能进入最终汇报来源依据',
            style: TextStyle(fontSize: 12, color: AppColors.textTertiary),
          ),
        ],
      ),
    );
  }
}
