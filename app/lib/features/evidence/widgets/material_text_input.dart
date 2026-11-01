import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/errors/app_error.dart';
import '../../../design/design.dart';
import '../data/evidence_api.dart';

import '../services/attachment_picker.dart';
import '../services/voice_recorder.dart';
import 'evidence_widgets.dart';

enum _VoicePhase { idle, asking, recording, transcribing }

/// 材料文字与语音输入区（对齐 `frontend/src/components/MaterialTextInput.tsx`）
///
/// 文字可单独提交；语音识别结果**追加**到已有文字，不覆盖。
class MaterialTextInput extends StatefulWidget {
  const MaterialTextInput({
    super.key,
    required this.controller,
    required this.api,
    required this.companyId,
    required this.projectId,
    this.recorder = const UnavailableVoiceRecorder(),
    this.audioPicker = const UnavailableAttachmentPicker(),
    this.disabled = false,
    this.onBusyChange,
  });

  final TextEditingController controller;
  final EvidenceApi api;
  final int companyId;
  final int projectId;
  final VoiceRecorder recorder;
  final AttachmentPicker audioPicker;
  final bool disabled;
  final ValueChanged<bool>? onBusyChange;

  @override
  State<MaterialTextInput> createState() => _MaterialTextInputState();
}

class _MaterialTextInputState extends State<MaterialTextInput> {
  _VoicePhase _phase = _VoicePhase.idle;
  String? _error;
  String? _errorHint;
  int _seconds = 0;
  Timer? _timer;
  List<int>? _lastAudio;
  String _lastAudioName = 'material-voice.m4a';
  String _lastAudioMime = 'audio/mp4';
  int _generation = 0;

  bool get _busy => _phase != _VoicePhase.idle;

  @override
  void initState() {
    super.initState();
    widget.onBusyChange?.call(false);
  }

  @override
  void dispose() {
    _timer?.cancel();
    _generation++;
    // 页面销毁时释放麦克风，取消进行中的转写结果
    widget.recorder.cancel();
    widget.recorder.dispose();
    super.dispose();
  }

  void _setPhase(_VoicePhase phase) {
    if (!mounted) return;
    setState(() => _phase = phase);
    widget.onBusyChange?.call(phase != _VoicePhase.idle);
  }

  void _setError(String? message, {String? hint}) {
    if (!mounted) return;
    setState(() {
      _error = message;
      _errorHint = hint;
    });
  }

  Future<void> _transcribe(List<int> bytes, String filename, String mimeType) async {
    final generation = ++_generation;
    _lastAudio = bytes;
    _lastAudioName = filename;
    _lastAudioMime = mimeType;
    _setError(null);
    _setPhase(_VoicePhase.transcribing);
    try {
      final text = await widget.api.transcribeAudio(
        bytes: bytes,
        filename: filename,
        mimeType: mimeType,
        companyId: widget.companyId,
        projectId: widget.projectId,
      );
      if (!mounted || generation != _generation) return;
      final existing = widget.controller.text.trimRight();
      final merged = existing.isEmpty ? text : '$existing\n$text';
      widget.controller.value = TextEditingValue(
        text: merged,
        selection: TextSelection.collapsed(offset: merged.length),
      );
      setState(() => _lastAudio = null);
    } on AuthException catch (error) {
      if (mounted && generation == _generation) _setError(error.message);
    } on NetworkException catch (error) {
      if (mounted && generation == _generation) {
        _setError('${error.message}，可点击“重试转写”', hint: '识别失败不会覆盖已输入的文字。');
      }
    } on AppException catch (error) {
      if (mounted && generation == _generation) {
        final statusCode = error is ApiException ? error.statusCode : null;
        final isUnavailable =
            error.message.contains('未配置') || statusCode == 503;
        _setError(
          error.message,
          hint: isUnavailable ? '语音服务尚未配置，请直接输入文字或联系管理员配置语音识别服务。' : null,
        );
      }
    } catch (error) {
      if (mounted && generation == _generation) {
        _setError('语音转写失败，请重试或直接输入文字。');
      }
    } finally {
      if (mounted && generation == _generation) _setPhase(_VoicePhase.idle);
    }
  }

  Future<void> _startRecording() async {
    if (_busy || widget.disabled) return;
    _timer?.cancel();
    setState(() {
      _seconds = 0;
      _error = null;
      _errorHint = null;
    });
    _setPhase(_VoicePhase.asking);
    try {
      await widget.recorder.start();
      if (!mounted) {
        await widget.recorder.cancel();
        return;
      }
      _setPhase(_VoicePhase.recording);
      _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
        if (!mounted) {
          timer.cancel();
          return;
        }
        setState(() => _seconds++);
        if (_seconds >= 120) {
          timer.cancel();
          _stopRecording();
        }
      });
    } on VoiceRecorderException catch (error) {
      _setPhase(_VoicePhase.idle);
      switch (error.issue) {
        case VoiceRecorderIssue.permissionDenied:
          _setError(
            '麦克风权限未开启，无法录音。',
            hint: '请到系统设置 → 应用 → 权限 → 麦克风，为本应用开启麦克风后返回重试；也可直接输入文字。',
          );
        case VoiceRecorderIssue.unavailable:
          _setError(error.message);
        case VoiceRecorderIssue.empty:
        case VoiceRecorderIssue.failed:
          _setError(error.message);
      }
    } catch (error) {
      _setPhase(_VoicePhase.idle);
      _setError('无法启动录音，请检查麦克风，或直接输入文字。');
    }
  }

  Future<void> _stopRecording() async {
    _timer?.cancel();
    _timer = null;
    final generation = ++_generation;
    try {
      final recording = await widget.recorder.stop();
      if (!mounted || generation != _generation) return;
      if (recording.isEmpty) {
        _setPhase(_VoicePhase.idle);
        _setError('没有录到声音，请重试。');
        return;
      }
      await _transcribe(recording.bytes, recording.filename, recording.mimeType);
    } on VoiceRecorderException catch (error) {
      _setPhase(_VoicePhase.idle);
      _setError(error.message);
    } catch (error) {
      _setPhase(_VoicePhase.idle);
      _setError('录音中断，请检查麦克风后重试。');
    }
  }

  Future<void> _cancelRecording() async {
    _timer?.cancel();
    _timer = null;
    _generation++;
    await widget.recorder.cancel();
    _setPhase(_VoicePhase.idle);
    _setError(null);
    if (mounted) setState(() => _lastAudio = null);
  }

  Future<void> _pickAudioFile() async {
    if (_busy || widget.disabled) return;
    try {
      final picked = await widget.audioPicker.pickFile();
      if (picked == null) return;
      if (!picked.mimeType.startsWith('audio/')) {
        _setError('请选择音频文件（mp3、m4a、wav、webm、ogg 等）。');
        return;
      }
      await _transcribe(picked.bytes, picked.name, picked.mimeType);
    } on AttachmentPickerException catch (error) {
      _setError(error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final disabled = widget.disabled;
    final primaryLabel = switch (_phase) {
      _VoicePhase.idle => '语音输入',
      _VoicePhase.asking => '正在申请麦克风…',
      _VoicePhase.recording => '结束录音并转文字（$_seconds 秒）',
      _VoicePhase.transcribing => '正在转为文字…',
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '文字材料',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        AppTextField(
          controller: widget.controller,
          placeholder: '直接输入工作进展、完成情况或问题；也可以用语音输入，无需先上传文件。',
          minLines: 5,
          maxLines: 8,
          enabled: !disabled,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: AppSpacing.sm),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            AppButton(
              label: primaryLabel,
              size: AppButtonSize.sm,
              variant: AppButtonVariant.secondary,
              icon: const AppIcon('mic', size: 16, color: AppColors.primary),
              isLoading: _phase == _VoicePhase.asking ||
                  _phase == _VoicePhase.transcribing,
              onPressed: disabled
                  ? null
                  : () {
                      if (_phase == _VoicePhase.recording) {
                        _stopRecording();
                      } else if (_phase == _VoicePhase.idle) {
                        _startRecording();
                      }
                    },
            ),
            if (_phase != _VoicePhase.idle)
              AppButton(
                label: '取消语音',
                size: AppButtonSize.sm,
                variant: AppButtonVariant.secondary,
                onPressed: _cancelRecording,
              ),
            if (_phase == _VoicePhase.idle)
              AppButton(
                label: '选择音频转文字',
                size: AppButtonSize.sm,
                variant: AppButtonVariant.secondary,
                onPressed: disabled ? null : _pickAudioFile,
              ),
            if (_phase == _VoicePhase.idle && _lastAudio != null)
              AppButton(
                label: '重试转写',
                size: AppButtonSize.sm,
                variant: AppButtonVariant.secondary,
                onPressed: () =>
                    _transcribe(_lastAudio!, _lastAudioName, _lastAudioMime),
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          '语音会追加为可编辑文字，检查后再提交。附件可选；单次录音最多 2 分钟。',
          style: TextStyle(
            fontSize: 12,
            height: 1.4,
            color: isDark ? AppColors.darkTextTertiary : AppColors.textTertiary,
          ),
        ),
        if (_phase == _VoicePhase.recording) ...[
          const SizedBox(height: AppSpacing.sm),
          const EvidenceBanner(
            message: '正在录音，结束后开始转写。',
            type: EvidenceBannerType.danger,
            icon: 'mic',
          ),
        ],
        if (_phase == _VoicePhase.transcribing) ...[
          const SizedBox(height: AppSpacing.sm),
          const EvidenceBanner(message: '正在识别录音，请稍候…', isBusy: true),
        ],
        if (_error != null) ...[
          const SizedBox(height: AppSpacing.sm),
          EvidenceBanner(
            message: _errorHint == null ? _error! : '$_error\n$_errorHint',
            type: EvidenceBannerType.danger,
            icon: 'alert',
            actionLabel: _phase == _VoicePhase.idle ? '重试' : null,
            onAction: _phase == _VoicePhase.idle
                ? () {
                    _setError(null);
                    if (_lastAudio != null) {
                      _transcribe(_lastAudio!, _lastAudioName, _lastAudioMime);
                    } else {
                      _startRecording();
                    }
                  }
                : null,
          ),
        ],
      ],
    );
  }
}
