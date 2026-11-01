import '../models/evidence_models.dart';

typedef JobFetcher = Future<BackgroundJob> Function(String jobId);

/// 后台任务状态轮询器。
///
/// 材料提交后后端返回 `job_id`，抽取/判定可能是异步的（`EXTRACTION_MODE=worker`），
/// 客户端按固定间隔轮询 `/jobs/{job_id}` 直到任务进入终态。
/// 达到最大次数仍非终态时返回最后一次结果，界面提示“处理时间较长”，
/// 不无限轮询、不静默丢弃错误。
class JobPoller {
  JobPoller({
    required this.fetch,
    this.interval = const Duration(seconds: 2),
    this.maxAttempts = 15,
  });

  final JobFetcher fetch;
  final Duration interval;
  final int maxAttempts;

  bool _cancelled = false;

  bool get isCancelled => _cancelled;

  /// 停止后续轮询（页面销毁时必须调用，避免泄漏定时器）
  void cancel() {
    _cancelled = true;
  }

  Future<BackgroundJob?> poll(
    String jobId, {
    void Function(BackgroundJob job)? onUpdate,
  }) async {
    _cancelled = false;
    BackgroundJob? last;
    for (var attempt = 0; attempt < maxAttempts; attempt++) {
      if (_cancelled) return last;
      final job = await fetch(jobId);
      if (_cancelled) return job;
      last = job;
      onUpdate?.call(job);
      if (job.isTerminal) return job;
      if (attempt == maxAttempts - 1) return job;
      await Future<void>.delayed(interval);
      if (_cancelled) return last;
    }
    return last;
  }
}
