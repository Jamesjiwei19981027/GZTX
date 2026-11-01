import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/app_error.dart';
import '../../../core/time/time_utils.dart';
import '../../../design/design.dart';
import '../data/evidence_api.dart';
import '../models/evidence_models.dart';
import '../services/attachment_picker.dart';
import '../services/evidence_draft_store.dart';
import '../services/job_poller.dart';
import '../services/voice_recorder.dart';
import '../widgets/evidence_widgets.dart';
import '../widgets/material_text_input.dart';

/// 提交材料页（对齐 `MobileEvidenceSubmitScreen`）
///
/// 只提交文字也可以；文件是可选的补充。断网提交时把文字与已上传文件
/// 保存为本地草稿，联网后恢复可继续提交。
class EvidenceSubmitScreen extends StatefulWidget {
  const EvidenceSubmitScreen({
    super.key,
    required this.api,
    required this.userId,
    required this.userName,
    required this.companyId,
    required this.projectId,
    this.nodeId,
    this.initialNodeTitle,
    this.attachmentPicker = const UnavailableAttachmentPicker(),
    this.voiceRecorder = const UnavailableVoiceRecorder(),
    this.draftStore,
    this.jobPollInterval = const Duration(seconds: 2),
    this.maxPollAttempts = 15,
  });

  final EvidenceApi api;
  final int userId;
  final String userName;
  final int companyId;
  final int projectId;
  final int? nodeId;
  final String? initialNodeTitle;
  final AttachmentPicker attachmentPicker;
  final VoiceRecorder voiceRecorder;
  final EvidenceDraftStore? draftStore;
  final Duration jobPollInterval;
  final int maxPollAttempts;

  @override
  State<EvidenceSubmitScreen> createState() => _EvidenceSubmitScreenState();
}

class _EvidenceSubmitScreenState extends State<EvidenceSubmitScreen> {
  late final TextEditingController _summary = TextEditingController();
  late final EvidenceDraftStore _drafts =
      widget.draftStore ?? EvidenceDraftStore();

  String? _nodeTitle;
  final List<UploadedEvidenceFile> _files = [];
  bool _uploading = false;
  double _uploadProgress = 0;
  PickedAttachment? _pendingUpload;
  String? _uploadError;

  bool _submitting = false;
  bool _voiceBusy = false;
  String? _error;
  bool _offlineDraftSaved = false;
  String? _restoredDraftHint;

  SubmitOutcome? _outcome;
  BackgroundJob? _job;
  JobPoller? _poller;
  bool _pollTimedOut = false;

  @override
  void initState() {
    super.initState();
    _nodeTitle = widget.initialNodeTitle;
    _loadNodeTitle();
    _restoreDraft();
    _summary.addListener(_onSummaryChanged);
  }

  @override
  void dispose() {
    _poller?.cancel();
    _summary.removeListener(_onSummaryChanged);
    _summary.dispose();
    super.dispose();
  }

  void _onSummaryChanged() {
    if (mounted) setState(() {});
  }

  bool get _isDirty => _summary.text.trim().isNotEmpty || _files.isNotEmpty;

  Future<void> _loadNodeTitle() async {
    final nodeId = widget.nodeId;
    if (nodeId == null) return;
    final title = await widget.api.loadNodeTitle(nodeId);
    if (!mounted || title == null) return;
    setState(() => _nodeTitle = title);
  }

  Future<void> _restoreDraft() async {
    final draft = await _drafts.load(
      userId: widget.userId,
      projectId: widget.projectId,
      nodeId: widget.nodeId,
    );
    if (!mounted || draft == null) return;
    setState(() {
      _summary.text = draft.summary;
      _files
        ..clear()
        ..addAll(draft.files);
      _restoredDraftHint = '已恢复上次未提交的草稿（保存于 '
          '${formatDisplayDateTime(draft.savedAt)}）';
    });
  }

  Future<void> _saveDraft() async {
    if (!_isDirty) return;
    try {
      await _drafts.save(
        userId: widget.userId,
        projectId: widget.projectId,
        nodeId: widget.nodeId,
        draft: EvidenceDraft(
          summary: _summary.text.trim(),
          files: List.of(_files),
          savedAt: DateTime.now(),
        ),
      );
      if (!mounted) return;
      setState(() => _offlineDraftSaved = true);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = '草稿保存失败，请检查本机存储空间后重试。');
    }
  }

  Future<void> _clearDraft() async {
    await _drafts.clear(
      userId: widget.userId,
      projectId: widget.projectId,
      nodeId: widget.nodeId,
    );
    if (!mounted) return;
    setState(() {
      _offlineDraftSaved = false;
      _restoredDraftHint = null;
    });
  }

  Future<void> _pickFile() async {
    if (_uploading || _submitting) return;
    try {
      final picked = await widget.attachmentPicker.pickFile();
      if (picked == null) return;
      await _upload(picked);
    } on AttachmentPickerException catch (error) {
      if (!mounted) return;
      setState(() => _uploadError = error.message);
    }
  }

  Future<void> _upload(PickedAttachment attachment) async {
    setState(() {
      _uploading = true;
      _uploadProgress = 0;
      _pendingUpload = attachment;
      _uploadError = null;
    });
    try {
      final uploaded = await widget.api.uploadFile(
        file: attachment,
        companyId: widget.companyId,
        projectId: widget.projectId,
        onProgress: (progress) {
          if (!mounted) return;
          setState(() => _uploadProgress = progress);
        },
      );
      if (!mounted) return;
      setState(() {
        _files.add(uploaded);
        _uploading = false;
        _pendingUpload = null;
        _uploadProgress = 1;
      });
      showAppToast(context, '文件上传成功', type: ToastType.success);
    } on AuthException catch (error) {
      if (!mounted) return;
      setState(() {
        _uploading = false;
        _uploadError = error.message;
      });
    } on NetworkException catch (error) {
      if (!mounted) return;
      setState(() {
        _uploading = false;
        _uploadError = '${error.message}，可点击重试继续上传';
      });
    } on AppException catch (error) {
      if (!mounted) return;
      setState(() {
        _uploading = false;
        _uploadError = error.message;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _uploading = false;
        _uploadError = '文件上传失败，请检查格式或文件大小';
      });
    }
  }

  void _removeFile(UploadedEvidenceFile file) {
    setState(() => _files.removeWhere((item) => item.fileId == file.fileId));
  }

  Future<void> _submit() async {
    if (_submitting || _uploading || _voiceBusy) return;
    final summary = _summary.text.trim();
    if (summary.isEmpty) {
      setState(() => _error = '请填写材料说明');
      return;
    }
    final nodeId = widget.nodeId;
    if (nodeId == null) {
      setState(() => _error = '缺少关联的责任节点');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
      _outcome = null;
      _job = null;
      _pollTimedOut = false;
    });

    try {
      final outcome = await widget.api.submitEvidence(
        nodeId: nodeId,
        summary: summary,
        evidenceKind: inferEvidenceKind(
          _files.map((file) => file.toRef()).toList(growable: false),
        ),
        fileIds: _files.map((file) => file.fileId).toList(growable: false),
      );
      if (!mounted) return;
      setState(() {
        _outcome = outcome;
        _submitting = false;
        _offlineDraftSaved = false;
      });
      await _clearDraft();
      if (!mounted) return;
      showAppToast(context, '材料已提交', type: ToastType.success);
      _startPolling(outcome.jobId);
    } on AuthException catch (error) {
      _failWith(error.message);
    } on NetworkException catch (error) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = '${error.message}。材料已保存为草稿，网络恢复后可继续提交。';
      });
      await _saveDraft();
    } on ValidationException catch (error) {
      _failWith(error.message);
    } on ApiException catch (error) {
      _failWith(error.statusCode == 403
          ? '此责任事项未开放材料提交权限：${error.message}'
          : error.message);
    } catch (error) {
      _failWith('提交材料失败，请稍后重试。');
    }
  }

  void _failWith(String message) {
    if (!mounted) return;
    setState(() {
      _submitting = false;
      _error = message;
    });
  }

  void _startPolling(String? jobId) {
    if (jobId == null || jobId.isEmpty) return;
    _poller?.cancel();
    final poller = JobPoller(
      fetch: widget.api.getJob,
      interval: widget.jobPollInterval,
      maxAttempts: widget.maxPollAttempts,
    );
    _poller = poller;
    poller.poll(jobId, onUpdate: (job) {
      if (!mounted) return;
      setState(() => _job = job);
    }).then((job) {
      if (!mounted) return;
      setState(() {
        if (job != null) _job = job;
        _pollTimedOut = job == null || !job.isTerminal;
      });
    }).catchError((Object error) {
      if (!mounted) return;
      setState(() {
        _pollTimedOut = true;
        _error = error is AppException ? error.message : '后台处理状态查询失败，请稍后在材料详情查看。';
      });
    });
  }

  void _openDetail() {
    final id = _outcome?.packageId;
    if (id == null || id <= 0) return;
    context.push('/evidence/package/$id');
  }

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final canSubmit =
        _summary.text.trim().isNotEmpty && !_submitting && !_uploading && !_voiceBusy;

    return AppScaffold(
      title: '提交证据材料',
      isDirty: _isDirty && _outcome == null,
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            EvidenceCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _nodeTitle ?? '当前责任事项',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: isDark
                          ? AppColors.darkTextPrimary
                          : AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    '${widget.userName} · 当前责任事项材料提报',
                    style: TextStyle(
                      fontSize: 12,
                      color: isDark
                          ? AppColors.darkTextSecondary
                          : AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: AppSpacing.md),
              EvidenceBanner(
                message: _error!,
                type: EvidenceBannerType.danger,
                icon: 'alert',
                actionLabel: _canRetrySubmit ? '重试提交' : null,
                onAction: _canRetrySubmit ? _submit : null,
              ),
            ],
            if (_restoredDraftHint != null) ...[
              const SizedBox(height: AppSpacing.md),
              EvidenceBanner(
                message: _restoredDraftHint!,
                type: EvidenceBannerType.warning,
                icon: 'info',
                actionLabel: '清除草稿',
                onAction: () {
                  _summary.clear();
                  setState(_files.clear);
                  _clearDraft();
                },
              ),
            ],
            if (_offlineDraftSaved) ...[
              const SizedBox(height: AppSpacing.md),
              const EvidenceBanner(
                message: '已保存本地草稿，网络恢复后可继续提交。',
                type: EvidenceBannerType.warning,
                icon: 'info',
              ),
            ],
            const SizedBox(height: AppSpacing.lg),
            MaterialTextInput(
              controller: _summary,
              api: widget.api,
              companyId: widget.companyId,
              projectId: widget.projectId,
              recorder: widget.voiceRecorder,
              audioPicker: widget.attachmentPicker,
              disabled: _submitting,
              onBusyChange: (busy) {
                if (!mounted) return;
                setState(() => _voiceBusy = busy);
              },
            ),
            const SizedBox(height: AppSpacing.lg),
            _buildPicker(isDark),
            if (_files.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.md),
              EvidenceCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    for (var index = 0; index < _files.length; index++) ...[
                      if (index > 0) const EvidenceDivider(),
                      EvidenceFileTile(
                        name: _files[index].name,
                        subtitle: '已上传 · ${_files[index].sizeLabel}',
                        removeEnabled: !_uploading && !_submitting,
                        onRemove: () => _removeFile(_files[index]),
                      ),
                    ],
                  ],
                ),
              ),
            ],
            const SizedBox(height: AppSpacing.lg),
            const EvidenceBanner(
              message: '文字可单独提交，也可附加文件。语音识别后可修改再提交，'
                  '材料归属当前项目，供个人 AI 与汇报引用。',
            ),
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              label: _submitting ? '正在提交材料…' : '提交材料',
              size: AppButtonSize.lg,
              isFullWidth: true,
              isLoading: _submitting,
              onPressed: canSubmit ? _submit : null,
            ),
            if (_outcome != null) ...[
              const SizedBox(height: AppSpacing.lg),
              _buildOutcome(isDark),
            ],
            const SizedBox(height: AppSpacing.xxl),
          ],
        ),
      ),
    );
  }

  bool get _canRetrySubmit =>
      !_submitting && _nodeIdForRetry && _summary.text.trim().isNotEmpty;

  bool get _nodeIdForRetry => widget.nodeId != null;

  Widget _buildPicker(bool isDark) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: (_uploading || _submitting) ? null : _pickFile,
          behavior: HitTestBehavior.opaque,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.lg,
              vertical: AppSpacing.xl,
            ),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF10263F) : const Color(0xFFF2F7FF),
              borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
              border: Border.all(
                color: isDark ? const Color(0xFF1C3F63) : const Color(0xFFB9D3F7),
                width: 1.5,
              ),
            ),
            child: Column(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF1B3F63) : const Color(0xFFD7E3F7),
                    shape: BoxShape.circle,
                  ),
                  child: const Center(
                    child: AppIcon('file', size: 20, color: AppColors.primary),
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  _uploading ? '正在上传文件…' : '选择文件',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.primary,
                  ),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  '支持 PDF、Excel、Word、图片等格式，大小以服务端限制为准',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 11,
                    height: 1.4,
                    color: isDark
                        ? AppColors.darkTextTertiary
                        : AppColors.textTertiary,
                  ),
                ),
              ],
            ),
          ),
        ),
        if (_uploading) ...[
          const SizedBox(height: AppSpacing.sm),
          _UploadProgress(progress: _uploadProgress),
        ],
        if (_uploadError != null) ...[
          const SizedBox(height: AppSpacing.sm),
          EvidenceBanner(
            message: _uploadError!,
            type: EvidenceBannerType.danger,
            icon: 'alert',
            actionLabel: _pendingUpload == null ? null : '重试上传',
            onAction: _pendingUpload == null
                ? null
                : () => _upload(_pendingUpload!),
          ),
        ],
      ],
    );
  }

  Widget _buildOutcome(bool isDark) {
    final job = _job;
    final isBusy = job == null || !job.isTerminal;
    final String message;
    final EvidenceBannerType type;
    if (job == null) {
      message = '材料已提交，正在等待后台处理…';
      type = EvidenceBannerType.info;
    } else if (job.isFailed) {
      message = job.statusLabel;
      type = EvidenceBannerType.danger;
    } else if (job.isSucceeded) {
      message = '材料处理完成，可查看材料详情。';
      type = EvidenceBannerType.info;
    } else if (_pollTimedOut) {
      message = '后台仍在处理（${job.statusLabel}），可稍后在材料详情查看结果。';
      type = EvidenceBannerType.warning;
    } else {
      message = '材料已提交，${job.statusLabel}…';
      type = EvidenceBannerType.info;
    }

    return EvidenceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const AppIcon('send', size: 16, color: AppColors.success),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  '材料编号 #${_outcome?.packageId ?? 0}',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: isDark
                        ? AppColors.darkTextPrimary
                        : AppColors.textPrimary,
                  ),
                ),
              ),
              EvidenceStatusChip(
                label: _outcome?.status == null
                    ? '已提交'
                    : evidenceStatusLabel(_outcome!.status),
                tone: EvidenceChipTone.success,
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          EvidenceBanner(message: message, type: type, isBusy: isBusy && !_pollTimedOut),
          const SizedBox(height: AppSpacing.md),
          AppButton(
            label: '查看材料详情',
            variant: AppButtonVariant.secondary,
            isFullWidth: true,
            onPressed: (_outcome?.packageId ?? 0) > 0 ? _openDetail : null,
          ),
        ],
      ),
    );
  }
}

class _UploadProgress extends StatelessWidget {
  const _UploadProgress({required this.progress});

  final double progress;

  @override
  Widget build(BuildContext context) {
    final percent = (progress.clamp(0.0, 1.0) * 100).round();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
          child: SizedBox(
            height: 6,
            child: LinearProgressIndicator(
              value: progress <= 0 ? null : progress.clamp(0.0, 1.0),
              backgroundColor: AppColors.border,
              valueColor: const AlwaysStoppedAnimation<Color>(AppColors.primary),
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          '上传进度 $percent%',
          style: const TextStyle(fontSize: 11, color: AppColors.textTertiary),
        ),
      ],
    );
  }
}
