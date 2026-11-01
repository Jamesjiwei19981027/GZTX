import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/evidence/data/evidence_api.dart';
import 'package:worktodo_app/features/evidence/data/multipart_transport.dart';
import 'package:worktodo_app/features/evidence/models/evidence_models.dart';
import 'package:worktodo_app/features/evidence/screens/evidence_submit_screen.dart';
import 'package:worktodo_app/features/evidence/services/attachment_picker.dart';
import 'package:worktodo_app/features/evidence/services/evidence_draft_store.dart';
import 'package:worktodo_app/features/evidence/services/voice_recorder.dart';

import '../../helpers/mock_api_client.dart';
import 'helpers/evidence_harness.dart';
import 'helpers/scripted_evidence_api.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    resetDraftStorage();
    resetToastForTesting();
  });

  tearDown(() {
    resetToastForTesting();
  });

  Widget buildScreen({
    MockApiClientHelper? helper,
    EvidenceApi? api,
    MultipartTransport? transport,
    FakeAttachmentPicker? picker,
    FakeVoiceRecorder? recorder,
    Duration pollInterval = const Duration(milliseconds: 5),
    int maxPollAttempts = 5,
  }) {
    return EvidenceSubmitScreen(
      api: api ?? buildEvidenceApi(helper ?? MockApiClientHelper(), transport: transport),
      userId: 11,
      userName: '林悦',
      companyId: 1,
      projectId: 3,
      nodeId: 7,
      attachmentPicker: picker ?? FakeAttachmentPicker(),
      voiceRecorder: recorder ?? FakeVoiceRecorder(),
      draftStore: EvidenceDraftStore(),
      jobPollInterval: pollInterval,
      maxPollAttempts: maxPollAttempts,
    );
  }

  MockApiClientHelper baseHelper() {
    final helper = MockApiClientHelper();
    helper.whenGet('/nodes/7', {'id': 7, 'title': '完成交互原型评审'});
    return helper;
  }

  testWidgets('无文件仅文字也能提交，提交后显示材料编号并轮询到处理完成', (tester) async {
    final helper = baseHelper();
    helper.whenPost('/nodes/7/evidence', {
      'package_id': 91,
      'status': 'submitted',
      'job_id': '55',
    });
    helper.whenGet('/jobs/55', {
      'job_id': '55',
      'job_type': 'evidence_judge',
      'status': 'succeeded',
      'error_message': null,
    });

    await pumpEvidenceScreen(tester, buildScreen(helper: helper));
    await settle(tester);

    // 责任事项标题已加载
    expect(find.text('完成交互原型评审'), findsOneWidget);
    expect(find.textContaining('林悦 · 当前责任事项材料提报'), findsOneWidget);

    await tester.enterText(
      find.byType(TextFormField),
      '完成交互原型评审，附评审纪要与验收清单。',
    );
    await settle(tester);

    await tester.tap(find.text('提交材料'));
    await settle(tester);
    await advance(tester, const Duration(milliseconds: 10));

    final post = helper.history.lastWhere(
      (record) => record.method == 'POST' && record.url.path.endsWith('/nodes/7/evidence'),
    );
    expect(post.body['summary_text'], '完成交互原型评审，附评审纪要与验收清单。');
    expect(post.body['file_ids'], isEmpty);
    expect(post.body['evidence_kind'], 'document');

    expect(find.textContaining('材料编号 #91'), findsOneWidget);
    expect(find.textContaining('材料处理完成'), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('提交成功后不能重复提交，需清空表单才开始新材料', (tester) async {
    final helper = baseHelper();
    helper.whenPost('/nodes/7/evidence', {
      'package_id': 91,
      'status': 'submitted',
      'job_id': '55',
    });
    helper.whenGet('/jobs/55', {
      'job_id': '55',
      'job_type': 'evidence_judge',
      'status': 'succeeded',
      'error_message': null,
    });

    int submitPosts() => helper.history
        .where((record) =>
            record.method == 'POST' && record.url.path.endsWith('/nodes/7/evidence'))
        .length;

    await pumpEvidenceScreen(tester, buildScreen(helper: helper));
    await settle(tester);

    await tester.enterText(find.byType(TextFormField), '同一份材料只提交一次');
    await settle(tester);
    await tester.tap(find.text('提交材料'));
    await settle(tester);
    await advance(tester, const Duration(milliseconds: 10));

    expect(find.textContaining('材料编号 #91'), findsOneWidget);
    expect(submitPosts(), 1);

    // 成功后提交按钮消失，再改文字也不会重新出现
    expect(find.text('提交材料'), findsNothing);
    await tester.enterText(find.byType(TextFormField), '同一份材料只提交一次，补一句说明');
    await settle(tester);
    expect(find.text('提交材料'), findsNothing);
    expect(submitPosts(), 1);

    // 只有走“继续提交新材料”清空表单后才允许再次提交
    await tester.tap(find.text('继续提交新材料'));
    await settle(tester);
    expect(find.textContaining('材料编号 #91'), findsNothing);
    final button = tester.widget<AppButton>(
      find.widgetWithText(AppButton, '提交材料'),
    );
    expect(button.onPressed, isNull);
    expect(submitPosts(), 1);

    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('键盘弹出时文字输入框仍可滚动到可见区域且不溢出', (tester) async {
    final helper = baseHelper();

    Object? overflowError;
    final originalOnError = FlutterError.onError;
    FlutterError.onError = (details) {
      if (details.exceptionAsString().contains('overflowed')) {
        overflowError = details.exception;
      }
      originalOnError?.call(details);
    };
    addTearDown(() => FlutterError.onError = originalOnError);

    // 模拟系统键盘占据底部 320 逻辑像素
    await pumpEvidenceScreen(
      tester,
      buildScreen(helper: helper),
      size: const Size(412, 915),
      viewInsets: const EdgeInsets.only(bottom: 320),
    );
    await settle(tester);

    // 输入框仍在树中，可滚动到可见区域后输入
    await tester.ensureVisible(find.byType(TextFormField));
    await tester.pump();
    await tester.enterText(find.byType(TextFormField), '键盘弹出后继续输入');
    await settle(tester);

    final rect = tester.getRect(find.byType(TextFormField));
    expect(rect.top, greaterThanOrEqualTo(0));
    expect(rect.bottom, lessThanOrEqualTo(915 - 320));
    expect(overflowError, isNull);
  });

  testWidgets('未填写文字时提交按钮不可点击', (tester) async {
    final helper = baseHelper();
    await pumpEvidenceScreen(tester, buildScreen(helper: helper));
    await settle(tester);

    final button = tester.widget<AppButton>(
      find.widgetWithText(AppButton, '提交材料'),
    );
    expect(button.onPressed, isNull);
    expect(
      helper.history.where((record) => record.method == 'POST'),
      isEmpty,
    );
  });

  testWidgets('语音转写结果追加到已有文字，不覆盖原有内容', (tester) async {
    final helper = baseHelper();
    final transport = FakeMultipartTransport(
      onSend: (payload, call) async {
        expect(payload.path, '/asr/transcribe');
        expect(payload.fields['company_id'], '1');
        expect(payload.fields['project_id'], '3');
        return MultipartResult(
          statusCode: 200,
          bodyBytes: envelopeOk({'text': '评审已通过，下周进入开发'}),
        );
      },
    );
    final recorder = FakeVoiceRecorder();

    await pumpEvidenceScreen(
      tester,
      buildScreen(helper: helper, transport: transport, recorder: recorder),
    );
    await settle(tester);

    await tester.enterText(find.byType(TextFormField), '本周完成原型评审。');
    await settle(tester);

    await tester.tap(find.text('语音输入'));
    await settle(tester);
    expect(recorder.startCalls, 1);
    expect(find.textContaining('结束录音并转文字'), findsOneWidget);

    await tester.tap(find.textContaining('结束录音并转文字'));
    await settle(tester);

    expect(recorder.stopCalls, 1);
    final field = tester.widget<TextFormField>(find.byType(TextFormField));
    expect(
      field.controller?.text,
      '本周完成原型评审。\n评审已通过，下周进入开发',
    );
  });

  testWidgets('麦克风权限被拒时给出系统设置授权引导', (tester) async {
    final helper = baseHelper();
    final recorder = FakeVoiceRecorder(
      startIssue: VoiceRecorderIssue.permissionDenied,
    );

    await pumpEvidenceScreen(
      tester,
      buildScreen(helper: helper, recorder: recorder),
    );
    await settle(tester);

    await tester.tap(find.text('语音输入'));
    await settle(tester);

    expect(find.textContaining('麦克风权限未开启'), findsOneWidget);
    expect(find.textContaining('系统设置'), findsOneWidget);
    expect(find.text('重试'), findsOneWidget);
  });

  testWidgets('断网提交保留草稿，重新进入页面可恢复文字与文件', (tester) async {
    final helper = baseHelper();
    helper.whenPost(
      '/nodes/7/evidence',
      Exception('网络中断'),
    );

    await pumpEvidenceScreen(tester, buildScreen(helper: helper));
    await settle(tester);

    await tester.enterText(find.byType(TextFormField), '断网时写的材料说明');
    await settle(tester);
    await tester.tap(find.text('提交材料'));
    await settle(tester);

    expect(find.textContaining('材料已保存为草稿'), findsOneWidget);
    expect(find.textContaining('已保存本地草稿'), findsOneWidget);

    final prefs = await SharedPreferences.getInstance();
    final key = EvidenceDraftStore.buildKey(userId: 11, projectId: 3, nodeId: 7);
    expect(prefs.getString(key), isNotNull);

    // 先卸载页面，再重新挂载，模拟用户恢复网络后再次进入
    await tester.pumpWidget(const SizedBox.shrink());
    await pumpEvidenceScreen(tester, buildScreen(helper: helper));
    await settle(tester);

    expect(find.textContaining('已恢复上次未提交的草稿'), findsOneWidget);
    final field = tester.widget<TextFormField>(find.byType(TextFormField));
    expect(field.controller?.text, '断网时写的材料说明');

    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('文件上传显示进度，失败后可重试成功', (tester) async {
    final helper = baseHelper();
    final pending = PendingUpload();
    final transport = FakeMultipartTransport(
      onSend: (payload, call) => pending.completer.future,
    );
    final picker = FakeAttachmentPicker(
      file: const PickedAttachment(
        name: '交互评审纪要.pdf',
        bytes: [37, 80, 68, 70],
        mimeType: 'application/pdf',
      ),
    );

    await pumpEvidenceScreen(
      tester,
      buildScreen(helper: helper, transport: transport, picker: picker),
    );
    await settle(tester);

    await tester.tap(find.text('选择文件'));
    await settle(tester);

    expect(find.text('正在上传文件…'), findsOneWidget);
    expect(find.textContaining('上传进度 40%'), findsOneWidget);

    pending.fail(status: 500, message: '服务器内部错误');
    await settle(tester);

    expect(find.textContaining('服务器内部错误'), findsOneWidget);
    expect(find.text('重试上传'), findsOneWidget);

    // 重试：换成成功的桩
    transport.onSend = (payload, call) async =>
        MultipartResult(statusCode: 200, bodyBytes: envelopeOk({'file_id': 702}));
    await tester.tap(find.text('重试上传'));
    await settle(tester);

    expect(find.text('交互评审纪要.pdf'), findsOneWidget);
    expect(find.textContaining('已上传 · 1 KB'), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('附件选择组件未接入时给出可见提示而不是静默失败', (tester) async {
    final helper = baseHelper();
    final picker = FakeAttachmentPicker(
      throwIssue: AttachmentPickerIssue.unavailable,
    );

    await pumpEvidenceScreen(
      tester,
      buildScreen(helper: helper, picker: picker),
    );
    await settle(tester);

    await tester.tap(find.text('选择文件'));
    await settle(tester);

    expect(find.textContaining('系统文件选择组件不可用'), findsOneWidget);
  });

  testWidgets('后台任务状态轮询到终态后停止，并展示处理结果', (tester) async {
    final helper = baseHelper();
    helper.whenPost('/nodes/7/evidence', {
      'package_id': 91,
      'status': 'submitted',
      'job_id': '55',
    });
    helper.whenGet('/jobs/55', {
      'job_id': '55',
      'status': 'pending',
      'error_message': null,
    });

    await pumpEvidenceScreen(
      tester,
      buildScreen(helper: helper, pollInterval: const Duration(milliseconds: 100)),
    );
    await settle(tester);

    await tester.enterText(find.byType(TextFormField), '等待后台处理');
    await settle(tester);
    await tester.tap(find.text('提交材料'));
    await settle(tester);

    expect(find.textContaining('排队处理中'), findsOneWidget);

    // 第二次轮询改为成功终态（后注册规则优先命中）
    helper.whenGet('/jobs/55', {
      'job_id': '55',
      'status': 'succeeded',
      'error_message': null,
    });
    await advance(tester, const Duration(milliseconds: 120));

    expect(find.textContaining('材料处理完成'), findsOneWidget);
    final jobCalls = helper.history
        .where((record) => record.method == 'GET' && record.url.path.endsWith('/jobs/55'))
        .length;
    expect(jobCalls, greaterThanOrEqualTo(2));

    // 终态后不再继续轮询
    final before = helper.history.length;
    await advance(tester, const Duration(milliseconds: 50));
    expect(helper.history.length, before);

    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('轮询达到上限时提示后台仍在处理，界面不卡在加载态', (tester) async {
    final helper = baseHelper();
    helper.whenPost('/nodes/7/evidence', {
      'package_id': 91,
      'status': 'submitted',
      'job_id': '55',
    });
    helper.whenGet('/jobs/55', {
      'job_id': '55',
      'status': 'running',
      'error_message': null,
    });

    await pumpEvidenceScreen(
      tester,
      buildScreen(
        helper: helper,
        pollInterval: const Duration(milliseconds: 100),
        maxPollAttempts: 2,
      ),
    );
    await settle(tester);

    await tester.enterText(find.byType(TextFormField), '后台一直处理');
    await settle(tester);
    await tester.tap(find.text('提交材料'));
    await settle(tester);
    await advance(tester, const Duration(milliseconds: 300));

    expect(find.textContaining('后台仍在处理'), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('提交失败（无权限）显示后端中文原因且可重试', (tester) async {
    final helper = baseHelper();
    helper.whenPost(
      '/nodes/7/evidence',
      {'code': 40300, 'message': '此节点未开放材料提交权限', 'data': null},
      statusCode: 403,
    );

    await pumpEvidenceScreen(tester, buildScreen(helper: helper));
    await settle(tester);

    await tester.enterText(find.byType(TextFormField), '提交会被拒绝');
    await settle(tester);
    await tester.tap(find.text('提交材料'));
    await settle(tester);

    expect(find.textContaining('此责任事项未开放材料提交权限'), findsOneWidget);
    expect(find.text('重试提交'), findsOneWidget);
  });

  testWidgets('重置表单后上一轮轮询的结果不得写进新表单', (tester) async {
    final firstJob = Completer<http.Response>();
    var submits = 0;
    final api = buildScriptedEvidenceApi((request) async {
      final path = request.url.path.replaceFirst('/api/v1', '');
      if (request.method == 'GET' && path == '/nodes/7') {
        return envelopeResponse({'id': 7, 'title': '完成交互原型评审'});
      }
      if (request.method == 'POST' && path == '/nodes/7/evidence') {
        submits++;
        return envelopeResponse({
          'package_id': submits == 1 ? 91 : 92,
          'status': 'submitted',
          'job_id': submits == 1 ? '55' : '56',
        });
      }
      if (request.method == 'GET' && path == '/jobs/55') {
        // 上一轮的轮询请求挂起，等重置之后再返回
        return firstJob.future;
      }
      if (request.method == 'GET' && path == '/jobs/56') {
        return envelopeResponse({
          'job_id': '56',
          'status': 'succeeded',
          'error_message': null,
        });
      }
      return http.Response('{"code":404,"message":"未配置"}', 404,
          headers: {'content-type': 'application/json; charset=utf-8'});
    });

    await pumpEvidenceScreen(tester, buildScreen(api: api));
    await settle(tester);

    await tester.enterText(find.byType(TextFormField), '第一份材料');
    await settle(tester);
    await tester.tap(find.text('提交材料'));
    await settle(tester);
    expect(find.textContaining('材料编号 #91'), findsOneWidget);

    // 第一轮轮询尚未返回，此时开始新材料
    await tester.tap(find.text('继续提交新材料'));
    await settle(tester);
    expect(find.textContaining('材料编号 #91'), findsNothing);

    await tester.enterText(find.byType(TextFormField), '第二份材料');
    await settle(tester);
    await tester.tap(find.text('提交材料'));
    await settle(tester);
    expect(find.textContaining('材料编号 #92'), findsOneWidget);
    expect(find.textContaining('材料处理完成'), findsOneWidget);

    // 上一轮轮询这才返回失败结果，不得覆盖新材料包的已成功状态
    firstJob.complete(
      envelopeResponse({
        'job_id': '55',
        'status': 'failed',
        'error_message': '上一轮抽取失败',
      }),
    );
    await settle(tester);

    expect(find.textContaining('材料编号 #92'), findsOneWidget);
    expect(find.textContaining('材料处理完成'), findsOneWidget);
    expect(find.textContaining('上一轮抽取失败'), findsNothing);

    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('重置表单后上一轮轮询的报错不得写进新表单', (tester) async {
    final firstJob = Completer<http.Response>();
    var submits = 0;
    final api = buildScriptedEvidenceApi((request) async {
      final path = request.url.path.replaceFirst('/api/v1', '');
      if (request.method == 'GET' && path == '/nodes/7') {
        return envelopeResponse({'id': 7, 'title': '完成交互原型评审'});
      }
      if (request.method == 'POST' && path == '/nodes/7/evidence') {
        submits++;
        return envelopeResponse({
          'package_id': submits == 1 ? 91 : 92,
          'status': 'submitted',
          'job_id': submits == 1 ? '55' : '56',
        });
      }
      if (request.method == 'GET' && path == '/jobs/55') {
        return firstJob.future;
      }
      if (request.method == 'GET' && path == '/jobs/56') {
        return envelopeResponse({
          'job_id': '56',
          'status': 'succeeded',
          'error_message': null,
        });
      }
      return http.Response('{"code":404,"message":"未配置"}', 404,
          headers: {'content-type': 'application/json; charset=utf-8'});
    });

    await pumpEvidenceScreen(tester, buildScreen(api: api));
    await settle(tester);

    await tester.enterText(find.byType(TextFormField), '第一份材料');
    await settle(tester);
    await tester.tap(find.text('提交材料'));
    await settle(tester);
    await tester.tap(find.text('继续提交新材料'));
    await settle(tester);

    await tester.enterText(find.byType(TextFormField), '第二份材料');
    await settle(tester);
    await tester.tap(find.text('提交材料'));
    await settle(tester);
    expect(find.textContaining('材料处理完成'), findsOneWidget);

    // 上一轮轮询这次是网络/接口报错，同样不得写进新表单
    firstJob.complete(http.Response(
      jsonEncode({'code': 500, 'message': '上一轮任务查询失败', 'data': null}),
      500,
      headers: {'content-type': 'application/json; charset=utf-8'},
    ));
    await settle(tester);

    expect(find.textContaining('上一轮任务查询失败'), findsNothing);
    expect(find.textContaining('后台处理状态查询失败'), findsNothing);
    expect(find.textContaining('材料编号 #92'), findsOneWidget);
    expect(find.textContaining('材料处理完成'), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('上传进行中重置表单，迟到的上传结果不得进入新表单', (tester) async {
    final helper = baseHelper();
    helper.whenPost('/nodes/7/evidence', {
      'package_id': 91,
      'status': 'submitted',
      'job_id': '55',
    });
    helper.whenGet('/jobs/55', {
      'job_id': '55',
      'status': 'succeeded',
      'error_message': null,
    });

    final pending = PendingUpload();
    final transport = FakeMultipartTransport(
      onSend: (payload, call) => pending.completer.future,
    );
    final picker = FakeAttachmentPicker(
      file: const PickedAttachment(
        name: '交互评审纪要.pdf',
        bytes: [37, 80, 68, 70],
        mimeType: 'application/pdf',
      ),
    );

    await pumpEvidenceScreen(
      tester,
      buildScreen(helper: helper, transport: transport, picker: picker),
    );
    await settle(tester);

    await tester.enterText(find.byType(TextFormField), '第一份材料');
    await settle(tester);
    await tester.tap(find.text('提交材料'));
    await settle(tester);
    expect(find.textContaining('材料编号 #91'), findsOneWidget);

    // 提交成功后开始上传附件，上传响应尚未返回
    await tester.tap(find.text('选择文件'));
    await settle(tester);
    expect(find.text('正在上传文件…'), findsOneWidget);

    // 上传没结束就点“继续提交新材料”
    await tester.ensureVisible(find.text('继续提交新材料'));
    await tester.pump();
    await tester.tap(find.text('继续提交新材料'));
    await settle(tester);
    expect(find.textContaining('材料编号 #91'), findsNothing);
    expect(find.text('正在上传文件…'), findsNothing);

    // 迟到的上传成功响应不得把旧文件加回新表单
    pending.complete(fileId: 702);
    await settle(tester);
    expect(find.text('交互评审纪要.pdf'), findsNothing);

    // 新材料提交时不携带上一次的附件
    await tester.enterText(find.byType(TextFormField), '第二份材料');
    await settle(tester);
    await tester.tap(find.text('提交材料'));
    await settle(tester);
    final post = helper.history.lastWhere(
      (record) =>
          record.method == 'POST' && record.url.path.endsWith('/nodes/7/evidence'),
    );
    expect(post.body['summary_text'], '第二份材料');
    expect(post.body['file_ids'], isEmpty);

    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('语音识别进行中禁用“继续提交新材料”', (tester) async {
    final helper = baseHelper();
    helper.whenPost('/nodes/7/evidence', {
      'package_id': 91,
      'status': 'submitted',
      'job_id': '55',
    });
    helper.whenGet('/jobs/55', {
      'job_id': '55',
      'status': 'succeeded',
      'error_message': null,
    });

    await pumpEvidenceScreen(tester, buildScreen(helper: helper));
    await settle(tester);

    await tester.enterText(find.byType(TextFormField), '第一份材料');
    await settle(tester);
    await tester.tap(find.text('提交材料'));
    await settle(tester);
    expect(find.textContaining('材料编号 #91'), findsOneWidget);

    AppButton resetButton() => tester.widget<AppButton>(
          find.widgetWithText(AppButton, '继续提交新材料'),
        );
    expect(resetButton().onPressed, isNotNull);

    // 开始录音，语音操作未结束前不允许重置，避免旧语音结果落进新表单
    await tester.tap(find.text('语音输入'));
    await settle(tester);
    expect(find.textContaining('结束录音并转文字'), findsOneWidget);
    expect(resetButton().onPressed, isNull);

    await tester.tap(find.text('取消语音'));
    await settle(tester);
    expect(resetButton().onPressed, isNotNull);

    await tester.pump(const Duration(seconds: 3));
  });
}
