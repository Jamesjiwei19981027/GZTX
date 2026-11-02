import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/knowledge/data/voice_input.dart';
import 'package:worktodo_app/features/knowledge/widgets/entry_editor_sheet.dart';
import '../../helpers/golden_test_helper.dart';

class DelayedRecorder implements VoiceRecorder {
  final ready = Completer<void>();
  int starts = 0;
  int cancels = 0;
  @override
  bool isRecording = false;
  @override
  Future<void> start() async {
    starts++;
    await ready.future;
    isRecording = true;
  }

  @override
  Future<void> cancel() async {
    cancels++;
    isRecording = false;
  }

  @override
  Future<VoiceRecording?> stop() async => null;
}

void main() {
  testWidgets('笔记录音启动中按钮禁用双平台截图', tags: ['golden'], (tester) async {
    final recorder = DelayedRecorder();
    await testAdaptiveGolden(
      tester: tester,
      widget: Scaffold(
        body: EntryEditorSheet(
          companyId: 1,
          projectId: 1,
          recorder: recorder,
          onSubmit: (title, body, tags) async => true,
        ),
      ),
      goldenFileNamePrefix: 't10_voice_starting',
      beforeCapture: (tester) async {
        await tester.tap(find.text('语音输入'));
        await tester.pump();
        final starts = recorder.starts;
        await tester.tap(find.text('语音输入'));
        await tester.pump();
        expect(recorder.starts, starts);
      },
    );
    expect(recorder.starts, 2);
    await tester.pumpWidget(const SizedBox.shrink());
    recorder.ready.complete();
    await tester.pump();
    expect(recorder.isRecording, isFalse);
  });

  testWidgets('关闭启动中的笔记录音会取消，启动迟到也不继续采集', (tester) async {
    final recorder = DelayedRecorder();
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: EntryEditorSheet(
          companyId: 1,
          projectId: 1,
          recorder: recorder,
          onSubmit: (title, body, tags) async => true,
        ),
      ),
    ));
    await tester.tap(find.text('语音输入'));
    await tester.pump();
    await tester.pumpWidget(const SizedBox.shrink());
    expect(recorder.cancels, greaterThan(0));
    recorder.ready.complete();
    await tester.pump();
    expect(recorder.isRecording, isFalse);
    expect(tester.takeException(), isNull);
  });
}
