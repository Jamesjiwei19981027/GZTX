import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/features/evidence/data/evidence_api.dart';
import 'package:worktodo_app/features/evidence/data/multipart_transport.dart';
import 'package:worktodo_app/features/evidence/models/evidence_models.dart';
import 'package:worktodo_app/features/evidence/services/attachment_picker.dart';
import 'package:worktodo_app/features/evidence/services/voice_recorder.dart';

import '../../../helpers/mock_api_client.dart';

/// 附件选择桩：可返回固定文件、用户取消、或抛出不可用
class FakeAttachmentPicker implements AttachmentPicker {
  FakeAttachmentPicker({
    this.file,
    this.image,
    this.throwIssue,
    this.isAvailable = true,
  });

  PickedAttachment? file;
  PickedAttachment? image;
  AttachmentPickerIssue? throwIssue;
  @override
  bool isAvailable;

  int pickFileCalls = 0;

  @override
  Future<PickedAttachment?> pickFile() async {
    pickFileCalls++;
    final issue = throwIssue;
    if (issue != null) {
      throw AttachmentPickerException(issue, '系统文件选择组件不可用（测试桩）');
    }
    return file;
  }

  @override
  Future<PickedAttachment?> pickImage() async {
    final issue = throwIssue;
    if (issue != null) {
      throw AttachmentPickerException(issue, '系统拍照组件不可用（测试桩）');
    }
    return image;
  }
}

/// 录音桩：可模拟权限拒绝、空录音、正常录音
class FakeVoiceRecorder implements VoiceRecorder {
  FakeVoiceRecorder({
    this.recorded,
    this.startIssue,
    this.stopIssue,
    this.isAvailable = true,
  });

  VoiceRecording? recorded;
  VoiceRecorderIssue? startIssue;
  VoiceRecorderIssue? stopIssue;
  @override
  bool isAvailable;

  int startCalls = 0;
  int stopCalls = 0;
  int cancelCalls = 0;

  @override
  Future<void> start() async {
    startCalls++;
    final issue = startIssue;
    if (issue != null) {
      throw VoiceRecorderException(issue, '麦克风权限未开启（测试桩）');
    }
  }

  @override
  Future<VoiceRecording> stop() async {
    stopCalls++;
    final issue = stopIssue;
    if (issue != null) {
      throw VoiceRecorderException(issue, '录音失败（测试桩）');
    }
    return recorded ??
        VoiceRecording(
          bytes: const [1, 2, 3, 4],
          filename: 'material-voice.m4a',
          mimeType: 'audio/mp4',
        );
  }

  @override
  Future<void> cancel() async {
    cancelCalls++;
  }

  @override
  Future<void> dispose() async {}
}

/// multipart 上传桩：记录调用并可控地返回成功/失败/进度
class FakeMultipartTransport implements MultipartTransport {
  FakeMultipartTransport({
    this.onSend,
  });

  /// 返回 null 表示挂起，测试可在需要时手动完成
  Future<MultipartResult> Function(MultipartPayload payload, int call)?
      onSend;

  final List<MultipartPayload> payloads = [];
  final List<Duration> timeouts = [];

  @override
  Future<MultipartResult> send(
    MultipartPayload payload, {
    required String baseUrl,
    required Map<String, String> headers,
    void Function(double progress)? onProgress,
    Duration timeout = const Duration(seconds: 60),
  }) async {
    payloads.add(payload);
    timeouts.add(timeout);
    onProgress?.call(0);
    onProgress?.call(0.4);
    final handler = onSend;
    if (handler == null) {
      return MultipartResult(
        statusCode: 200,
        bodyBytes: _envelope({'file_id': 700 + payloads.length}),
      );
    }
    return handler(payload, payloads.length);
  }
}

List<int> _envelope(Object? data) => utf8.encode(jsonEncode({
      'code': 200,
      'message': 'success',
      'data': data,
    }));

/// 公开的信封编码工具，供用例构造 multipart 桩响应
List<int> envelopeOk(Object? data) => _envelope(data);

/// 构造失败信封
List<int> envelopeError(String message, int status) =>
    _envelopeError(message, status);

/// 构造带桩上传通道的接口对象
EvidenceApi buildEvidenceApi(
  MockApiClientHelper helper, {
  MultipartTransport? transport,
}) {
  return EvidenceApi(
    helper.buildClient(),
    transport: transport ?? FakeMultipartTransport(),
  );
}

/// 统一页面挂载（中文 locale，双端主题由控件自行判断）
Future<void> pumpEvidenceScreen(
  WidgetTester tester,
  Widget screen, {
  Size size = const Size(412, 915),
  TextScaler textScaler = TextScaler.noScaling,
  Brightness brightness = Brightness.light,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  await tester.pumpWidget(
    MaterialApp(
      theme: ThemeData(
        useMaterial3: true,
        brightness: brightness,
        fontFamily: 'NotoSansSC',
        fontFamilyFallback: const ['NotoSansSC'],
      ),
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('zh', 'CN')],
      home: MediaQuery(
        data: MediaQueryData(
          size: size,
          textScaler: textScaler,
          platformBrightness: brightness,
        ),
        child: screen,
      ),
    ),
  );
  await tester.pump();
}

/// 带路由的挂载：用于需要 `context.push` / `context.pop` 的页面测试
Future<void> pumpEvidenceRouter(
  WidgetTester tester, {
  required Widget entry,
  Size size = const Size(412, 915),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  final router = GoRouter(
    initialLocation: '/list',
    routes: [
      GoRoute(
        path: '/list',
        builder: (context, state) => Scaffold(
          body: Center(
            child: TextButton(
              onPressed: () => context.push('/draft'),
              child: const Text('打开草稿'),
            ),
          ),
        ),
      ),
      GoRoute(path: '/draft', builder: (context, state) => entry),
      GoRoute(
        path: '/evidence/package/:id',
        builder: (context, state) =>
            Text('材料详情 ${state.pathParameters['id']}'),
      ),
    ],
  );

  await tester.pumpWidget(
    MaterialApp.router(
      routerConfig: router,
      theme: ThemeData(
        useMaterial3: true,
        fontFamily: 'NotoSansSC',
        fontFamilyFallback: const ['NotoSansSC'],
      ),
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('zh', 'CN')],
    ),
  );
  await tester.pump();
}

/// 清空 SharedPreferences 模拟存储，避免用例间串草稿
void resetDraftStorage({Map<String, Object> initial = const {}}) {
  SharedPreferences.setMockInitialValues(Map<String, Object>.from(initial));
}

/// 常用响应数据
Map<String, dynamic> packageJson({
  int id = 91,
  int nodeId = 7,
  String status = 'submitted',
  String summary = '完成交互原型评审，附评审纪要与验收清单。',
  List<Map<String, dynamic>> files = const [],
}) {
  return {
    'id': id,
    'company_id': 1,
    'project_id': 3,
    'node_id': nodeId,
    'submitter_user_id': 11,
    'status': status,
    'summary_text': summary,
    'structured': {'evidence_kind': 'document'},
    'evidence_kind': 'document',
    'files': files,
    'precheck_errors': null,
    'judge_result': null,
    'submitted_at': null,
    'judged_at': null,
    'created_at': null,
  };
}

Map<String, dynamic> fileJson({
  int fileId = 501,
  String name = '交互评审纪要.pdf',
  int size = 2516582,
  String mime = 'application/pdf',
}) {
  return {
    'file_id': fileId,
    'original_name': name,
    'mime_type': mime,
    'size_bytes': size,
    'kind': 'file',
  };
}

Map<String, dynamic> wikiCatalogJson({
  bool canPublish = true,
  List<Map<String, dynamic>> pages = const [],
  List<Map<String, dynamic>> drafts = const [],
  List<Map<String, dynamic>> materials = const [],
}) {
  return {
    'engine': 'llmwiki',
    'can_publish': canPublish,
    'pages': pages,
    'drafts': drafts,
    'materials': materials,
    'lint': null,
  };
}

Map<String, dynamic> wikiPageJson({
  int id = 1,
  String title = '移动端体验升级',
  String body = '本阶段完成任务与汇报链路联调。',
  String source = 'llm_wiki_published',
  int? revision,
  List<Map<String, dynamic>> facts = const [],
}) {
  return {
    'id': id,
    'title': title,
    'body_text': body,
    'node_id': 7,
    'source': source,
    'meta': {
      'revision': revision,
      'facts': facts,
    },
    'updated_at': null,
  };
}

Map<String, dynamic> wikiFactJson() {
  return {
    'text': '移动端页面已完成评审',
    'quote': '本周完成移动端页面评审并通过验收',
    'source_name': '交互评审纪要.pdf',
    'source_id': 'file:501',
    'package_id': 91,
    'line_start': 12,
    'line_end': 14,
  };
}

Map<String, dynamic> wikiMaterialJson({
  int id = 91,
  String title = '完成交互原型评审',
  bool canGenerate = true,
}) {
  return {
    'id': id,
    'node_id': 7,
    'status': 'adopted',
    'title': title,
    'can_generate': canGenerate,
  };
}

/// 等待挂起的异步任务落地（不依赖真实网络）
Future<void> settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 30));
  await tester.pump(const Duration(milliseconds: 30));
}

/// 让微任务与定时器推进（轮询间隔）
Future<void> advance(WidgetTester tester, Duration duration) async {
  await tester.pump(duration);
  await tester.pump();
}

/// 简单的 Completer 辅助，用于制造“上传中”中间态
class PendingUpload {
  final Completer<MultipartResult> completer = Completer<MultipartResult>();

  void complete({int fileId = 702}) {
    completer.complete(
      MultipartResult(
        statusCode: 200,
        bodyBytes: _envelope({'file_id': fileId}),
      ),
    );
  }

  void fail({int status = 500, String message = '服务器内部错误'}) {
    completer.complete(
      MultipartResult(
        statusCode: status,
        bodyBytes: _envelopeError(message, status),
      ),
    );
  }
}

List<int> _envelopeError(String message, int status) => utf8.encode(jsonEncode({
      'code': status,
      'message': message,
      'data': null,
    }));
