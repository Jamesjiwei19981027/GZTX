/// 一段录好的语音
class VoiceRecording {
  const VoiceRecording({
    required this.bytes,
    required this.filename,
    required this.mimeType,
    this.duration,
  });

  final List<int> bytes;
  final String filename;
  final String mimeType;
  final Duration? duration;

  bool get isEmpty => bytes.isEmpty;
}

/// 录音失败分类
enum VoiceRecorderIssue {
  /// 麦克风权限被拒绝（需要引导用户去系统设置授权）
  permissionDenied,

  /// 当前安装包未集成录音组件（缺少共享依赖）
  unavailable,

  /// 没有录到声音
  empty,

  /// 其它运行时错误
  failed,
}

class VoiceRecorderException implements Exception {
  VoiceRecorderException(this.issue, this.message);

  final VoiceRecorderIssue issue;
  final String message;

  @override
  String toString() => message;
}

/// 录音端口。
///
/// 真实录音依赖 `record` 插件与系统麦克风权限声明，属于共享改动，
/// 已写入回传报告的共享改动申请；本任务只定义端口与不可用实现。
/// 单次最长 2 分钟，与网页版一致（由具体实现负责截断）。
abstract class VoiceRecorder {
  /// 开始录音；权限被拒时抛 [VoiceRecorderException]
  Future<void> start();

  /// 结束录音并返回音频数据；未录到声音时抛 [VoiceRecorderException]
  Future<VoiceRecording> stop();

  /// 取消录音并释放麦克风
  Future<void> cancel();

  /// 释放资源
  Future<void> dispose();

  bool get isAvailable;
}

/// 未接入录音插件时的实现
class UnavailableVoiceRecorder implements VoiceRecorder {
  const UnavailableVoiceRecorder();

  @override
  bool get isAvailable => false;

  @override
  Future<void> start() async => throw VoiceRecorderException(
        VoiceRecorderIssue.unavailable,
        '当前安装包尚未集成录音组件，暂时无法语音输入（已提交共享改动申请）。'
        '可直接输入文字。',
      );

  @override
  Future<VoiceRecording> stop() async => throw VoiceRecorderException(
        VoiceRecorderIssue.unavailable,
        '当前安装包尚未集成录音组件，暂时无法语音输入。',
      );

  @override
  Future<void> cancel() async {}

  @override
  Future<void> dispose() async {}
}
