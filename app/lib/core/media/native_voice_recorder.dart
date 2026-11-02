import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/widgets.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

import '../../features/evidence/services/voice_recorder.dart' as evidence;
import '../../features/knowledge/data/voice_input.dart' as knowledge;

abstract class RecordingDriver {
  Future<bool> hasPermission();
  Future<void> start();
  Future<Uint8List> stop();
  Future<void> cancel();
  Future<void> dispose();
}

class DeviceRecordingDriver implements RecordingDriver {
  final AudioRecorder _recorder = AudioRecorder();
  String? _path;

  @override
  Future<bool> hasPermission() => _recorder.hasPermission();

  @override
  Future<void> start() async {
    final directory = await getTemporaryDirectory();
    _path =
        '${directory.path}/voice-${DateTime.now().microsecondsSinceEpoch}.m4a';
    await _recorder.start(
      const RecordConfig(encoder: AudioEncoder.aacLc),
      path: _path!,
    );
  }

  Future<void> _deleteTemporary() async {
    final path = _path;
    _path = null;
    if (path != null && await File(path).exists()) await File(path).delete();
  }

  @override
  Future<Uint8List> stop() async {
    final path = await _recorder.stop();
    try {
      return path == null ? Uint8List(0) : await File(path).readAsBytes();
    } finally {
      await _deleteTemporary();
    }
  }

  @override
  Future<void> cancel() async {
    await _recorder.cancel();
    await _deleteTemporary();
  }

  @override
  Future<void> dispose() async {
    await cancel();
    await _recorder.dispose();
  }
}

/// 两个功能端口共用录音生命周期；最多两分钟，退后台取消采集。
class NativeVoiceRecorder
    with WidgetsBindingObserver
    implements evidence.VoiceRecorder {
  NativeVoiceRecorder(
      {RecordingDriver? driver, this.maxDuration = const Duration(minutes: 2)})
      : _driver = driver {
    WidgetsBinding.instance.addObserver(this);
  }

  RecordingDriver? _driver;
  RecordingDriver get _activeDriver => _driver ??= DeviceRecordingDriver();
  final Duration maxDuration;
  Timer? _limit;
  Future<evidence.VoiceRecording>? _stopping;
  bool isRecording = false;
  bool _starting = false;
  bool _foreground = true;
  int _generation = 0;
  bool _disposed = false;
  Object? _backgroundError;

  @override
  bool get isAvailable => true;

  @override
  Future<void> start() async {
    if (_disposed) throw StateError('录音组件已关闭');
    if (_starting) throw StateError('录音正在启动，请稍候');
    await cancel();
    final generation = _generation;
    _starting = true;
    try {
      if (!await _activeDriver.hasPermission()) {
        throw evidence.VoiceRecorderException(
          evidence.VoiceRecorderIssue.permissionDenied,
          '麦克风权限被拒绝，请在系统设置 → 应用 → 权限中开启麦克风后重试。',
        );
      }
      if (_disposed || !_foreground || generation != _generation) {
        throw StateError('录音启动已取消，请回到前台重试');
      }
      await _activeDriver.start();
      if (_disposed || !_foreground || generation != _generation) {
        await _activeDriver.cancel();
        throw StateError('录音启动已取消，请回到前台重试');
      }
      isRecording = true;
      _limit = Timer(maxDuration, () {
        // 保留结束结果供界面稍后取出；错误也由 stop 返回，不丢弃。
        unawaited(stop().then<void>((_) {}, onError: (Object error) {
          _backgroundError = error;
        }));
      });
    } finally {
      _starting = false;
    }
  }

  @override
  Future<evidence.VoiceRecording> stop() {
    final error = _backgroundError;
    if (error != null) return Future.error(error);
    return _stopping ??= _finish();
  }

  Future<evidence.VoiceRecording> _finish() async {
    _limit?.cancel();
    if (!isRecording) {
      throw evidence.VoiceRecorderException(
          evidence.VoiceRecorderIssue.empty, '录音已取消，请重新录音');
    }
    isRecording = false;
    final bytes = await _activeDriver.stop();
    if (bytes.isEmpty) {
      throw evidence.VoiceRecorderException(
          evidence.VoiceRecorderIssue.empty, '没有录到声音，请重新录音');
    }
    return evidence.VoiceRecording(
        bytes: bytes, filename: 'voice.m4a', mimeType: 'audio/mp4');
  }

  @override
  Future<void> cancel() async {
    _generation++;
    _limit?.cancel();
    if (isRecording) {
      isRecording = false;
      await _activeDriver.cancel();
    }
    _stopping = null;
    _backgroundError = null;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _foreground = true;
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden ||
        state == AppLifecycleState.detached) {
      _foreground = false;
      unawaited(cancel().catchError((Object error) {
        _backgroundError = error;
        debugPrint('后台取消录音失败：$error');
      }));
    }
  }

  @override
  Future<void> dispose() async {
    if (_disposed) return;
    _disposed = true;
    WidgetsBinding.instance.removeObserver(this);
    await cancel();
    await _driver?.dispose();
  }
}

class NativeKnowledgeRecorder implements knowledge.VoiceRecorder {
  NativeKnowledgeRecorder({NativeVoiceRecorder? recorder})
      : recorder = recorder ?? NativeVoiceRecorder();
  final NativeVoiceRecorder recorder;
  @override
  bool get isRecording => recorder.isRecording;
  /// 知识笔记只认 [knowledge.VoiceInputException] 的可展示文案，其余异常会退化成
  /// 笼统的“请检查麦克风”；这里把权限拒绝等具体提示（含去系统设置的指引）原样转过去。
  @override
  Future<void> start() async {
    try {
      await recorder.start();
    } on evidence.VoiceRecorderException catch (error) {
      throw knowledge.VoiceInputException(error.message);
    } on StateError catch (error) {
      throw knowledge.VoiceInputException(error.message);
    }
  }

  @override
  Future<void> cancel() => recorder.cancel();
  @override
  Future<knowledge.VoiceRecording?> stop() async {
    final result = await recorder.stop();
    return knowledge.VoiceRecording(
      bytes: Uint8List.fromList(result.bytes),
      filename: result.filename,
      mimeType: result.mimeType,
    );
  }

  Future<void> dispose() => recorder.dispose();
}
