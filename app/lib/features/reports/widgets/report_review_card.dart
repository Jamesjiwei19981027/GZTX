import 'package:flutter/material.dart';
import '../../../design/design.dart';
import '../data/reports_api.dart';
import '../models/report_models.dart';
import '../models/report_capabilities.dart';
import 'report_ui.dart';

/// 服务端决定核验能力；提交成功后展示持久化结果，作者始终可以阅读意见。
class ReportReviewCard extends StatefulWidget {
  const ReportReviewCard(
      {super.key, required this.report, required this.api, this.onSaved});
  final AgentReport report;
  final ReportsApi api;
  final ValueChanged<AgentReport>? onSaved;
  @override
  State<ReportReviewCard> createState() => _ReportReviewCardState();
}

class _ReportReviewCardState extends State<ReportReviewCard> {
  final _comment = TextEditingController();
  AgentReport? _saved;
  bool _busy = false;
  String? _message;
  bool _failed = false;
  AgentReport get _report => _saved ?? widget.report;
  @override
  void didUpdateWidget(covariant ReportReviewCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.report.id != widget.report.id ||
        oldWidget.report.projectId != widget.report.projectId) {
      _saved = null;
      _message = null;
      _busy = false;
      _comment.clear();
    }
  }

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _save(String decision) async {
    if (_busy || !_report.canReview) return;
    final comment = _comment.text.trim();
    if (comment.isEmpty || comment.length > 2000) {
      setState(() {
        _message = '请填写不超过 2000 字的核验意见';
        _failed = true;
      });
      return;
    }
    final reportId = _report.id;
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      final saved = await widget.api
          .reviewReport(reportId, decision: decision, comment: comment);
      if (!mounted || widget.report.id != reportId) return;
      setState(() {
        _saved = saved;
        _message = '核验意见已保存并通知成员';
        _failed = false;
      });
      widget.onSaved?.call(saved);
    } catch (error) {
      if (!mounted || widget.report.id != reportId) return;
      setState(() {
        _message = reportErrorMessage(error, fallback: '核验意见保存失败，请重试');
        _failed = true;
      });
    } finally {
      if (mounted && widget.report.id == reportId) {
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final report = _report;
    if (!report.canReview && report.review == null) {
      return const SizedBox.shrink();
    }
    return ReportCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const ReportSectionTitle('汇报核验意见'),
      if (report.review case final review?) ...[
        const SizedBox(height: AppSpacing.sm),
        Text(review.label, style: const TextStyle(fontWeight: FontWeight.w500)),
        Text(review.comment),
        if (review.reviewedAt != null)
          Text(formatReportFullDateTime(review.reviewedAt),
              style: const TextStyle(fontSize: 12)),
      ],
      if (_message != null) ...[
        const SizedBox(height: AppSpacing.sm),
        ReportInfoBanner(_message!,
            tone: _failed ? ReportBannerTone.error : ReportBannerTone.success),
      ],
      if (report.canReview) ...[
        const SizedBox(height: AppSpacing.md),
        AppTextField(
            key: ValueKey('report-review-comment-${report.id}'),
            controller: _comment,
            label: '核验意见',
            minLines: 2,
            maxLines: 5,
            enabled: !_busy,
            clearButtonEnabled: false),
        const SizedBox(height: AppSpacing.md),
        Wrap(spacing: AppSpacing.sm, runSpacing: AppSpacing.sm, children: [
          AppButton(
              label: _busy ? '正在保存…' : '核验通过',
              onPressed: _busy ? null : () => _save('approved')),
          AppButton(
              label: '退回修改',
              variant: AppButtonVariant.secondary,
              onPressed: _busy ? null : () => _save('returned')),
        ]),
      ],
    ]));
  }
}
