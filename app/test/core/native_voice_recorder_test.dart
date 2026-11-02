import 'dart:typed_data';
import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/core/media/native_voice_recorder.dart';
import 'package:worktodo_app/features/evidence/services/voice_recorder.dart';

class Driver implements RecordingDriver {
  bool allowed = true;
  int starts = 0;
  int stops = 0;
  int cancels = 0;
  Completer<bool>? permission;
  @override
  Future<bool> hasPermission() async => permission?.future ?? allowed;
  @override
  Future<void> start() async {
    starts++;
  }

  @override
  Future<Uint8List> stop() async {
    stops++;
    return Uint8List.fromList([1, 2]);
  }

  @override
  Future<void> cancel() async {
    cancels++;
  }

  @override
  Future<void> dispose() async {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('麦克风拒绝不启动采集，异常给出权限引导', () async {
    final driver = Driver()..allowed = false;
    final recorder = NativeVoiceRecorder(driver: driver);
    await expectLater(
        recorder.start(),
        throwsA(isA<VoiceRecorderException>().having(
            (e) => e.issue, 'issue', VoiceRecorderIssue.permissionDenied)));
    expect(driver.starts, 0);
    await recorder.dispose();
  });

  testWidgets('达到时限只结束一次，结果可以被两个功能端口读取', (tester) async {
    final driver = Driver();
    final recorder = NativeVoiceRecorder(
        driver: driver, maxDuration: const Duration(seconds: 2));
    await recorder.start();
    await tester.pump(const Duration(seconds: 2));
    final result = await recorder.stop();
    expect(driver.stops, 1);
    expect(result.bytes, [1, 2]);
    expect(result.filename, endsWith('.m4a'));
    expect(result.mimeType, 'audio/mp4');
    await recorder.dispose();
  });

  test('进入后台取消录音，返回前台不自动重新打开麦克风', () async {
    final driver = Driver();
    final recorder = NativeVoiceRecorder(driver: driver);
    await recorder.start();
    recorder.didChangeAppLifecycleState(AppLifecycleState.paused);
    await Future<void>.delayed(Duration.zero);
    expect(driver.cancels, 1);
    expect(recorder.isRecording, isFalse);
    recorder.didChangeAppLifecycleState(AppLifecycleState.resumed);
    expect(driver.starts, 1);
    await recorder.dispose();
  });

  test('权限弹窗尚未返回时退后台，授权后也不能启动麦克风', () async {
    final driver = Driver()..permission = Completer<bool>();
    final recorder = NativeVoiceRecorder(driver: driver);
    final starting = recorder.start();
    final expectation = expectLater(starting, throwsStateError);
    await Future<void>.delayed(Duration.zero);
    recorder.didChangeAppLifecycleState(AppLifecycleState.paused);
    driver.permission!.complete(true);
    await expectation;
    expect(driver.starts, 0);
    expect(recorder.isRecording, isFalse);
    await recorder.dispose();
  });
}
