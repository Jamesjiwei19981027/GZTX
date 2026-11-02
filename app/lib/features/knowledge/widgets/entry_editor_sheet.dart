import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/time/time_utils.dart';
import '../../../design/design.dart';
import '../data/voice_input.dart';
import '../models/knowledge_models.dart';

/// “记一条 / 查看笔记”浮层。
///
/// 用浮层而不是新页面，用户不用往下滚就能看到输入框；
/// 关闭前有未保存提示，语音识别结果追加到正文且允许继续修改。
class EntryEditorSheet extends StatefulWidget {
  const EntryEditorSheet({
    super.key,
    this.entry,
    required this.companyId,
    required this.projectId,
    required this.onSubmit,
    this.onDelete,
    this.recorder = const UnavailableVoiceRecorder(),
    this.transcriber,
  });

  /// 为 null 表示新建
  final PersonalKnowledgeEntry? entry;
  final int companyId;
  final int projectId;
  final Future<bool> Function(String title, String bodyText, List<String> tags)
      onSubmit;
  final Future<bool> Function()? onDelete;
  final VoiceRecorder recorder;
  final VoiceTranscriber? transcriber;

  bool get isCreating => entry == null;

  @override
  State<EntryEditorSheet> createState() => _EntryEditorSheetState();
}

enum _VoicePhase { idle, starting, recording, transcribing }

class _EntryEditorSheetState extends State<EntryEditorSheet> {
  late final TextEditingController _title;
  late final TextEditingController _body;
  late final TextEditingController _tags;

  bool _submitting = false;
  bool _deleting = false;
  String? _error;
  String? _voiceStatus;
  _VoicePhase _voicePhase = _VoicePhase.idle;
  Timer? _timer;
  int _seconds = 0;

  String _initialTitle = '';
  String _initialBody = '';
  String _initialTags = '';

  bool get _dirty =>
      _title.text != _initialTitle ||
      _body.text != _initialBody ||
      _tags.text != _initialTags;

  @override
  void initState() {
    super.initState();
    final entry = widget.entry;
    _initialTitle = entry?.title ?? '';
    _initialBody = entry?.bodyText ?? '';
    _initialTags = entry?.tags.join('，') ?? '';
    _title = TextEditingController(text: _initialTitle);
    _body = TextEditingController(text: _initialBody);
    _tags = TextEditingController(text: _initialTags);
    _title.addListener(_onChanged);
    _body.addListener(_onChanged);
    _tags.addListener(_onChanged);
  }

  void _onChanged() => setState(() {});

  @override
  void dispose() {
    _timer?.cancel();
    unawaited(widget.recorder.cancel().catchError((Object error) {
      debugPrint('关闭笔记录音失败：$error');
    }));
    _title.dispose();
    _body.dispose();
    _tags.dispose();
    super.dispose();
  }

  Future<void> _requestClose() async {
    if (_submitting || _deleting) return;
    if (_dirty) {
      final discard = await showAppConfirmDialog(
        context: context,
        title: '放弃未保存的内容？',
        message: '关闭后本次填写的内容会丢失。',
        confirmLabel: '放弃修改',
        cancelLabel: '继续编辑',
        isDestructive: true,
      );
      if (!discard || !mounted) return;
    }
    Navigator.of(context).pop(false);
  }

  Future<void> _save() async {
    if (_submitting) return;
    final title = _title.text;
    final body = _body.text;
    if (title.trim().isEmpty && body.trim().isEmpty) {
      setState(() => _error = '请先写点内容，再保存这条笔记');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    final ok =
        await widget.onSubmit(title, body, parseKnowledgeTags(_tags.text));
    if (!mounted) return;
    setState(() => _submitting = false);
    if (ok) {
      Navigator.of(context).pop(true);
    } else {
      setState(() => _error = '保存失败，内容仍保留，可以修改后重试');
    }
  }

  Future<void> _delete() async {
    final onDelete = widget.onDelete;
    if (onDelete == null || _deleting) return;
    final confirmed = await showAppConfirmDialog(
      context: context,
      title: '删除这条笔记？',
      message: '原始材料、汇报和对话会保留。',
      confirmLabel: '确认删除',
      isDestructive: true,
    );
    if (!confirmed || !mounted) return;
    setState(() {
      _deleting = true;
      _error = null;
    });
    final ok = await onDelete();
    if (!mounted) return;
    setState(() => _deleting = false);
    if (ok) {
      Navigator.of(context).pop(true);
    } else {
      setState(() => _error = '删除失败，请稍后重试');
    }
  }

  Future<void> _toggleVoice() async {
    if (_voicePhase == _VoicePhase.transcribing ||
        _voicePhase == _VoicePhase.starting) {
      return;
    }
    if (_voicePhase == _VoicePhase.recording) {
      await _stopVoice();
      return;
    }
    setState(() {
      _error = null;
      _voiceStatus = null;
      _voicePhase = _VoicePhase.starting;
    });
    try {
      await widget.recorder.start();
      if (!mounted) {
        await widget.recorder.cancel();
        return;
      }
      setState(() {
        _voicePhase = _VoicePhase.recording;
        _seconds = 0;
      });
      _timer?.cancel();
      _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
        if (!mounted) return;
        setState(() => _seconds++);
      });
    } on VoiceInputException catch (error) {
      if (!mounted) return;
      setState(() {
        _voicePhase = _VoicePhase.idle;
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _voicePhase = _VoicePhase.idle;
        _error = '无法启动录音，请检查麦克风，或直接输入文字';
      });
    }
  }

  Future<void> _stopVoice() async {
    _timer?.cancel();
    VoiceRecording? recording;
    try {
      recording = await widget.recorder.stop();
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _voicePhase = _VoicePhase.idle;
        _error = '录音未完成：$error';
      });
      return;
    }
    if (!mounted) return;
    if (recording == null) {
      setState(() {
        _voicePhase = _VoicePhase.idle;
        _error = '没有录到声音，请重试或直接输入文字';
      });
      return;
    }
    final transcriber = widget.transcriber;
    if (transcriber == null) {
      setState(() {
        _voicePhase = _VoicePhase.idle;
        _error = '语音转写未配置，请直接输入文字';
      });
      return;
    }
    setState(() {
      _voicePhase = _VoicePhase.transcribing;
      _voiceStatus = '正在识别录音，请稍候…';
    });
    try {
      final text = await transcriber.transcribe(
        recording: recording,
        companyId: widget.companyId,
        projectId: widget.projectId,
      );
      if (!mounted) return;
      final merged = [_body.text.trimRight(), text]
          .where((part) => part.trim().isNotEmpty)
          .join('\n');
      _body.text = merged;
      _body.selection = TextSelection.collapsed(offset: merged.length);
      setState(() {
        _voicePhase = _VoicePhase.idle;
        _voiceStatus = '语音已转成文字，可以修改后再保存';
      });
    } on VoiceInputException catch (error) {
      if (!mounted) return;
      setState(() {
        _voicePhase = _VoicePhase.idle;
        _voiceStatus = null;
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _voicePhase = _VoicePhase.idle;
        _voiceStatus = null;
        _error = '语音识别失败，请重试或直接输入文字';
      });
    }
  }

  Future<void> _cancelVoice() async {
    _timer?.cancel();
    await widget.recorder.cancel();
    if (!mounted) return;
    setState(() {
      _voicePhase = _VoicePhase.idle;
      _voiceStatus = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final entry = widget.entry;
    final maxHeight = MediaQuery.sizeOf(context).height * 0.86;
    final viewInsets = MediaQuery.viewInsetsOf(context).bottom;
    final busy = _submitting || _deleting;

    return PopScope(
      // 有未保存内容时拦截返回键/系统手势，先确认再关闭
      canPop: false,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;
        await _requestClose();
      },
      child: Padding(
        padding: EdgeInsets.only(bottom: viewInsets),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: maxHeight),
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              0,
              AppSpacing.lg,
              AppSpacing.lg,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        widget.isCreating ? '记一条' : '查看笔记',
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w600,
                          color: isDark
                              ? AppColors.darkTextPrimary
                              : AppColors.textPrimary,
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: '关闭',
                      onPressed: busy ? null : _requestClose,
                      icon: AppIcon(
                        'close',
                        size: 20,
                        color: isDark
                            ? AppColors.darkTextSecondary
                            : AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
                if (entry != null && !widget.isCreating)
                  Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                    child: Text(
                      '${entry.sourceLabel} · 仅自己可见',
                      style: TextStyle(
                        fontSize: 12,
                        color: isDark
                            ? AppColors.darkTextTertiary
                            : AppColors.textTertiary,
                      ),
                    ),
                  ),
                if (_error != null)
                  Container(
                    margin: const EdgeInsets.only(bottom: AppSpacing.md),
                    padding: const EdgeInsets.all(AppSpacing.md),
                    decoration: BoxDecoration(
                      color: AppColors.dangerLight,
                      borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const AppIcon('alert',
                            size: 16, color: AppColors.danger),
                        const SizedBox(width: AppSpacing.sm),
                        Expanded(
                          child: Text(
                            _error!,
                            style: const TextStyle(
                              fontSize: 13,
                              color: AppColors.danger,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                AppTextField(
                  controller: _title,
                  label: '标题（可不填）',
                  placeholder: '不填时会从正文生成',
                  enabled: !busy,
                ),
                const SizedBox(height: AppSpacing.md),
                AppTextField(
                  controller: _body,
                  label: '记下想法、经验或资料',
                  placeholder: '写下内容就能保存，稍后可让 AI 整理关联…',
                  minLines: 4,
                  maxLines: 10,
                  enabled: !busy,
                ),
                const SizedBox(height: AppSpacing.sm),
                _voiceRow(busy),
                if (_voiceStatus != null)
                  Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.xs),
                    child: Text(
                      _voiceStatus!,
                      style: TextStyle(
                        fontSize: 12,
                        color: isDark
                            ? AppColors.darkTextSecondary
                            : AppColors.textSecondary,
                      ),
                    ),
                  ),
                const SizedBox(height: AppSpacing.md),
                AppTextField(
                  controller: _tags,
                  label: '标签',
                  placeholder: '例如：验收，接口',
                  enabled: !busy,
                ),
                const SizedBox(height: AppSpacing.lg),
                AppButton(
                  label: '保存笔记',
                  isFullWidth: true,
                  isLoading: _submitting,
                  onPressed: busy ? null : _save,
                ),
                if (entry != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  AppButton(
                    label: '删除笔记',
                    variant: AppButtonVariant.danger,
                    isFullWidth: true,
                    isLoading: _deleting,
                    onPressed: busy ? null : _delete,
                  ),
                ],
                if (entry != null && entry.sourceType != 'manual') ...[
                  const SizedBox(height: AppSpacing.lg),
                  _sourceSection(entry, isDark),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _voiceRow(bool busy) {
    final recording = _voicePhase == _VoicePhase.recording;
    final transcribing = _voicePhase == _VoicePhase.transcribing;
    return Row(
      children: [
        Expanded(
          child: AppButton(
            label: recording
                ? '结束录音并转文字（${_seconds}s）'
                : transcribing
                    ? '正在转为文字…'
                    : '语音输入',
            variant: AppButtonVariant.secondary,
            size: AppButtonSize.sm,
            isLoading: transcribing,
            icon: const AppIcon('mic', size: 16),
            onPressed:
                busy || transcribing || _voicePhase == _VoicePhase.starting
                    ? null
                    : _toggleVoice,
          ),
        ),
        if (recording) ...[
          const SizedBox(width: AppSpacing.sm),
          AppButton(
            label: '取消语音',
            variant: AppButtonVariant.secondary,
            size: AppButtonSize.sm,
            onPressed: _cancelVoice,
          ),
        ],
      ],
    );
  }

  Widget _sourceSection(PersonalKnowledgeEntry entry, bool isDark) {
    final references = entry.sourceRef.entries
        .where((item) => item.value != null)
        .toList(growable: false);
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurfaceVariant : AppColors.surfaceVariant,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '来源：${entry.sourceLabel}',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            '从本人资料整理，原始材料保留。',
            style: TextStyle(
              fontSize: 12,
              color: isDark
                  ? AppColors.darkTextSecondary
                  : AppColors.textSecondary,
            ),
          ),
          if (references.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            for (final item in references)
              Text(
                '${_referenceLabel(item.key)}：${item.value}',
                style: TextStyle(
                  fontSize: 12,
                  color: isDark
                      ? AppColors.darkTextSecondary
                      : AppColors.textSecondary,
                ),
              ),
          ],
          if (_updatedLabel(entry).isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              '更新于 ${_updatedLabel(entry)}',
              style: TextStyle(
                fontSize: 11,
                color: isDark
                    ? AppColors.darkTextTertiary
                    : AppColors.textTertiary,
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _updatedLabel(PersonalKnowledgeEntry entry) =>
      formatDisplayDateTime(parseApiDateTime(entry.updatedAt));

  String _referenceLabel(String key) => switch (key) {
        'node_id' => '事项 ID',
        'package_id' => '材料包 ID',
        'file_id' => '文件 ID',
        'report_id' => '汇报 ID',
        'session_id' => '会话 ID',
        'message_id' => '消息 ID',
        'file_name' => '文件名',
        'quote' => '原文引用',
        _ => key,
      };
}
