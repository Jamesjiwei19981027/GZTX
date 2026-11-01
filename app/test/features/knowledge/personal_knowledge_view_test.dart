import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/knowledge/controllers/personal_knowledge_controller.dart';
import 'package:worktodo_app/features/knowledge/data/knowledge_repository.dart';
import 'package:worktodo_app/features/knowledge/data/voice_input.dart';
import 'package:worktodo_app/features/knowledge/screens/personal_knowledge_view.dart';
import 'package:worktodo_app/features/knowledge/widgets/entry_editor_sheet.dart';

import '../../helpers/mock_api_client.dart';
import 'knowledge_test_support.dart';

class _FakeRecorder implements VoiceRecorder {
  bool _recording = false;
  bool startCalled = false;
  bool cancelCalled = false;

  @override
  bool get isRecording => _recording;

  @override
  Future<void> start() async {
    startCalled = true;
    _recording = true;
  }

  @override
  Future<VoiceRecording?> stop() async {
    _recording = false;
    return VoiceRecording(
      bytes: Uint8List.fromList([1, 2, 3, 4]),
      filename: 'knowledge-voice.webm',
      mimeType: 'audio/webm',
    );
  }

  @override
  Future<void> cancel() async {
    cancelCalled = true;
    _recording = false;
  }
}

class _FakeTranscriber implements VoiceTranscriber {
  _FakeTranscriber(this.text);

  final String text;
  int calls = 0;

  @override
  Future<String> transcribe({
    required VoiceRecording recording,
    required int companyId,
    required int projectId,
  }) async {
    calls++;
    return text;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<PersonalKnowledgeController> buildController(
    MockApiClientHelper helper,
  ) async {
    final controller = PersonalKnowledgeController(
      repository: KnowledgeRepository(helper.buildClient()),
      projectId: 7,
      userId: 11,
    );
    await controller.load();
    return controller;
  }

  testWidgets('空空间显示引导，点“记一条”打开浮层而不是新页面', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/7/personal-knowledge', emptySpace);
    final controller = await buildController(helper);

    await pumpKnowledgeView(
      tester,
      PersonalKnowledgeView(controller: controller, companyId: 3),
    );

    expect(find.text('记下第一条工作积累'), findsOneWidget);
    expect(find.text('点“记一条”写下想法，或让 AI 整理你已有的材料和汇报。'), findsOneWidget);
    expect(find.text('仅自己可见 · AI 帮你找关联，原始资料保留'), findsOneWidget);

    await tester.tap(find.text('记一条').first);
    await tester.pumpAndSettle();

    expect(find.byType(EntryEditorSheet), findsOneWidget);
    expect(find.text('标题（可不填）'), findsOneWidget);
    expect(find.text('语音输入'), findsOneWidget);
  });

  testWidgets('新建条目：填写内容后提交并出现在列表里', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/7/personal-knowledge', emptySpace);
    helper.whenPost('/projects/7/personal-knowledge/entries', {
      'id': 41,
      'title': '接口验收结论',
      'body_text': '八项接口全部通过',
      'tags': ['验收'],
      'position': null,
      'source_type': 'manual',
      'source_id': null,
      'source_ref': <String, dynamic>{},
      'updated_at': null,
    });
    final controller = await buildController(helper);

    await pumpKnowledgeView(
      tester,
      PersonalKnowledgeView(controller: controller, companyId: 3),
    );
    await tester.tap(find.text('记一条').first);
    await tester.pumpAndSettle();

    final fields = find.descendant(
      of: find.byType(EntryEditorSheet),
      matching: find.byType(EditableText),
    );
    await tester.enterText(fields.at(0), '接口验收结论');
    await tester.enterText(fields.at(1), '八项接口全部通过');
    await tester.enterText(fields.at(2), '验收，接口');
    await tester.pump();

    await tester.tap(find.text('保存笔记'));
    await tester.pumpAndSettle();

    final request = helper.history.last;
    expect(request.method, 'POST');
    expect(request.body['title'], '接口验收结论');
    expect(request.body['body_text'], '八项接口全部通过');
    expect(request.body['tags'], ['验收', '接口']);
    expect(find.byType(EntryEditorSheet), findsNothing);
    expect(find.text('接口验收结论'), findsOneWidget);
    expect(find.text('我的笔记'), findsOneWidget);
    await drainToasts(tester);
  });

  testWidgets('有未保存内容时按返回键先确认再关闭', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/7/personal-knowledge', emptySpace);
    final controller = await buildController(helper);

    await pumpKnowledgeView(
      tester,
      PersonalKnowledgeView(controller: controller, companyId: 3),
    );
    await tester.tap(find.text('记一条').first);
    await tester.pumpAndSettle();

    final fields = find.descendant(
      of: find.byType(EntryEditorSheet),
      matching: find.byType(EditableText),
    );
    await tester.enterText(fields.at(1), '写了一半的内容');
    await tester.pump();

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();

    expect(find.text('放弃未保存的内容？'), findsOneWidget);

    await tester.tap(find.text('继续编辑'));
    await tester.pumpAndSettle();
    expect(find.byType(EntryEditorSheet), findsOneWidget);
    expect(find.text('写了一半的内容'), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    await tester.tap(find.text('放弃修改'));
    await tester.pumpAndSettle();
    expect(find.byType(EntryEditorSheet), findsNothing);
  });

  testWidgets('语音识别结果追加到正文，可以继续修改后保存', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/7/personal-knowledge', emptySpace);
    final controller = await buildController(helper);
    final recorder = _FakeRecorder();
    final transcriber = _FakeTranscriber('客户确认先做验收清单');

    await pumpKnowledgeView(
      tester,
      PersonalKnowledgeView(
        controller: controller,
        companyId: 3,
        recorder: recorder,
        transcriber: transcriber,
      ),
    );
    await tester.tap(find.text('记一条').first);
    await tester.pumpAndSettle();

    await tester.enterText(
      find
          .descendant(
            of: find.byType(EntryEditorSheet),
            matching: find.byType(EditableText),
          )
          .at(1),
      '开会记录',
    );
    await tester.pump();

    await tester.tap(find.text('语音输入'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 1100));

    expect(recorder.startCalled, isTrue);
    expect(find.textContaining('结束录音并转文字'), findsOneWidget);

    await tester.tap(find.textContaining('结束录音并转文字'));
    await tester.pumpAndSettle();

    expect(transcriber.calls, 1);
    expect(find.text('开会记录\n客户确认先做验收清单'), findsOneWidget);
    expect(find.text('语音已转成文字，可以修改后再保存'), findsOneWidget);
  });

  testWidgets('语音识别失败时保留已写内容并给出可见提示', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/7/personal-knowledge', emptySpace);
    final controller = await buildController(helper);
    final recorder = _FakeRecorder();

    await pumpKnowledgeView(
      tester,
      PersonalKnowledgeView(
        controller: controller,
        companyId: 3,
        recorder: recorder,
        transcriber: _FailingTranscriber(),
      ),
    );
    await tester.tap(find.text('记一条').first);
    await tester.pumpAndSettle();

    final body = find
        .descendant(
          of: find.byType(EntryEditorSheet),
          matching: find.byType(EditableText),
        )
        .at(1);
    await tester.enterText(body, '已经写好的内容');
    await tester.pump();

    await tester.tap(find.text('语音输入'));
    await tester.pump();
    await tester.tap(find.textContaining('结束录音并转文字'));
    await tester.pumpAndSettle();

    expect(find.text('语音服务未配置，请直接输入文字'), findsOneWidget);
    expect(find.text('已经写好的内容'), findsOneWidget);
  });

  testWidgets('AI 整理：展示建议，勾选确认后加入关联图', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/7/personal-knowledge', spaceWithTwoEntries);
    helper.whenPost('/projects/7/personal-knowledge/sync', {
      'created': 0,
      'skipped': 2,
    });
    helper.whenPost('/projects/7/personal-knowledge/assist', {
      'analyzed': 2,
      'suggestions': [
        {
          'source_entry_id': 21,
          'target_entry_id': 22,
          'label': '提供验收依据',
          'reason': '两条笔记都指向同一批验收项',
          'source_quote': '客户确认先做验收清单',
          'target_quote': '接口全部通过',
          'source_fingerprint': 'aaa',
          'target_fingerprint': 'bbb',
        },
      ],
    });
    helper.whenPost('/projects/7/personal-knowledge/assist/apply', {
      'created': 1,
      'links': [
        {
          'id': 9,
          'source_entry_id': 21,
          'target_entry_id': 22,
          'label': '提供验收依据',
        },
      ],
    });
    final controller = await buildController(helper);

    await pumpKnowledgeView(
      tester,
      PersonalKnowledgeView(controller: controller, companyId: 3),
    );
    expect(find.text('接口联调记录'), findsOneWidget);

    await tester.tap(find.text('AI 整理'));
    await tester.pumpAndSettle();

    expect(find.text('已根据你的笔记找到这些关联，确认后加入关联图。'), findsOneWidget);
    expect(find.text('提供验收依据'), findsOneWidget);
    expect(find.text('依据一：客户确认先做验收清单'), findsOneWidget);

    await tester.tap(find.text('确认关联（1）'));
    await tester.pumpAndSettle();

    expect(find.text('已加入 1 条关联'), findsOneWidget);
    expect(controller.links.single.id, 9);
    expect(controller.viewMode, KnowledgeViewMode.graph);
  });

  testWidgets('没有笔记时 AI 整理不要求先有记录，只给出提示', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/7/personal-knowledge', emptySpace);
    helper.whenPost('/projects/7/personal-knowledge/sync', {
      'created': 0,
      'skipped': 0,
    });
    helper.whenPost('/projects/7/personal-knowledge/assist', {
      'analyzed': 0,
      'suggestions': <dynamic>[],
    });
    final controller = await buildController(helper);

    await pumpKnowledgeView(
      tester,
      PersonalKnowledgeView(controller: controller, companyId: 3),
    );

    await tester.tap(find.text('AI 整理'));
    await tester.pumpAndSettle();

    expect(find.text('已根据你的笔记找到这些关联，确认后加入关联图。'), findsNothing);
    expect(controller.notice, '资料已收集，再积累几条笔记就能发现更多关联。');
    expect(controller.suggestions, isEmpty);
    expect(
      helper.history.any((record) =>
          record.url.path == '/api/v1/projects/7/personal-knowledge/sync'),
      isTrue,
    );
    await drainToasts(tester);
  });

  testWidgets('AI 建议采纳失败时给出可见错误，不静默丢弃', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/7/personal-knowledge', spaceWithTwoEntries);
    helper.whenPost('/projects/7/personal-knowledge/sync', {
      'created': 0,
      'skipped': 2,
    });
    helper.whenPost('/projects/7/personal-knowledge/assist', {
      'analyzed': 2,
      'suggestions': [
        {
          'source_entry_id': 21,
          'target_entry_id': 22,
          'label': '提供验收依据',
          'reason': '两条笔记都指向同一批验收项',
          'source_quote': '客户确认先做验收清单',
          'target_quote': '接口全部通过',
          'source_fingerprint': 'aaa',
          'target_fingerprint': 'bbb',
        },
      ],
    });
    helper.whenPost(
      '/projects/7/personal-knowledge/assist/apply',
      '{"code":409,"message":"笔记已更新，请重新整理"}',
      statusCode: 409,
    );
    final controller = await buildController(helper);

    await pumpKnowledgeView(
      tester,
      PersonalKnowledgeView(controller: controller, companyId: 3),
    );
    await tester.tap(find.text('AI 整理'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('确认关联（1）'));
    await tester.pumpAndSettle();

    expect(find.text('加入关联失败，建议仍保留，可以重试'), findsOneWidget);
    expect(controller.error, '笔记已更新，请重新整理');
  });

  testWidgets('搜索：按标题过滤，无命中时给出空结果提示', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/7/personal-knowledge', spaceWithTwoEntries);
    final controller = await buildController(helper);

    await pumpKnowledgeView(
      tester,
      PersonalKnowledgeView(controller: controller, companyId: 3),
    );

    await tester.enterText(find.byType(EditableText).first, '验收');
    await tester.pump();
    expect(find.text('客户确认先做验收清单'), findsOneWidget);
    expect(find.text('接口联调记录'), findsNothing);

    await tester.enterText(find.byType(EditableText).first, '不存在的关键词');
    await tester.pump();
    expect(find.text('没有找到相关内容'), findsOneWidget);
  });

  testWidgets('点开已有笔记可以改正文并保存', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/7/personal-knowledge', spaceWithTwoEntries);
    helper.register('PATCH', '/projects/7/personal-knowledge/entries/21', {
      'id': 21,
      'title': '客户需求确认',
      'body_text': '客户确认先做验收清单，再补接口文档',
      'tags': <String>[],
      'position': null,
      'source_type': 'manual',
      'source_id': null,
      'source_ref': <String, dynamic>{},
      'updated_at': null,
    });
    final controller = await buildController(helper);

    await pumpKnowledgeView(
      tester,
      PersonalKnowledgeView(controller: controller, companyId: 3),
    );

    await tester.tap(find.text('客户需求确认'));
    await tester.pumpAndSettle();
    expect(find.text('查看笔记'), findsOneWidget);

    final fields = find.descendant(
      of: find.byType(EntryEditorSheet),
      matching: find.byType(EditableText),
    );
    await tester.enterText(fields.at(1), '客户确认先做验收清单，再补接口文档');
    await tester.pump();
    await tester.tap(find.text('保存笔记'));
    await tester.pumpAndSettle();

    final request = helper.history.last;
    expect(request.method, 'PATCH');
    expect(
        request.url.path, '/api/v1/projects/7/personal-knowledge/entries/21');
    expect(request.body['body_text'], '客户确认先做验收清单，再补接口文档');
    expect(find.text('客户确认先做验收清单，再补接口文档'), findsOneWidget);
    await drainToasts(tester);
  });

  testWidgets('删除笔记需要二次确认，确认后从列表移除', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/7/personal-knowledge', spaceWithTwoEntries);
    helper.whenDelete('/projects/7/personal-knowledge/entries/21', {
      'id': 21,
      'is_deleted': true,
    });
    final controller = await buildController(helper);

    await pumpKnowledgeView(
      tester,
      PersonalKnowledgeView(controller: controller, companyId: 3),
    );
    await tester.tap(find.text('客户需求确认'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('删除笔记'));
    await tester.pumpAndSettle();

    expect(find.text('删除这条笔记？'), findsOneWidget);
    expect(find.text('原始材料、汇报和对话会保留。'), findsOneWidget);

    await tester.tap(find.text('确认删除'));
    await tester.pumpAndSettle();

    expect(find.text('客户需求确认'), findsNothing);
    expect(find.text('接口联调记录'), findsOneWidget);
    expect(helper.history.last.method, 'DELETE');
  });

  testWidgets('读取失败展示重试入口，重试成功后显示列表', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet(
      '/projects/7/personal-knowledge',
      '{"code":500,"message":"服务暂时不可用"}',
      statusCode: 500,
    );
    final controller = PersonalKnowledgeController(
      repository: KnowledgeRepository(helper.buildClient()),
      projectId: 7,
      userId: 11,
    );
    await controller.load();

    await pumpKnowledgeView(
      tester,
      PersonalKnowledgeView(controller: controller, companyId: 3),
    );

    expect(find.text('知识空间读取失败'), findsOneWidget);
    expect(find.text('服务暂时不可用'), findsOneWidget);

    helper.whenGet('/projects/7/personal-knowledge', spaceWithTwoEntries);
    await tester.tap(find.text('重试'));
    await tester.pumpAndSettle();

    expect(find.text('客户需求确认'), findsOneWidget);
  });

  testWidgets('无访问权限时展示无权限状态', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet(
      '/projects/7/personal-knowledge',
      '{"code":403,"message":"需要在职公司成员与当前项目成员资格"}',
      statusCode: 403,
    );
    final controller = PersonalKnowledgeController(
      repository: KnowledgeRepository(helper.buildClient()),
      projectId: 7,
      userId: 11,
    );
    await controller.load();

    await pumpKnowledgeView(
      tester,
      PersonalKnowledgeView(controller: controller, companyId: 3),
    );

    expect(controller.forbidden, isTrue);
    expect(find.text('暂无访问权限'), findsOneWidget);
  });

  testWidgets('键盘弹出时记一条浮层不被遮挡，仍可点击保存', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/7/personal-knowledge', emptySpace);
    final controller = await buildController(helper);

    await pumpKnowledgeView(
      tester,
      PersonalKnowledgeView(controller: controller, companyId: 3),
    );
    await tester.tap(find.text('记一条').first);
    await tester.pumpAndSettle();

    tester.view.viewInsets = const FakeViewPadding(bottom: 320);
    addTearDown(() => tester.view.resetViewInsets());
    await tester.pump();

    expect(tester.takeException(), isNull);
    await tester.tap(find.text('保存笔记'));
    await tester.pump();
    expect(find.text('请先写点内容，再保存这条笔记'), findsOneWidget);
  });

  testWidgets('断网时明确提示网络异常并可重试', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/7/personal-knowledge', Exception('网络断开'));
    final controller = PersonalKnowledgeController(
      repository: KnowledgeRepository(helper.buildClient()),
      projectId: 7,
      userId: 11,
    );
    await controller.load();

    await pumpKnowledgeView(
      tester,
      PersonalKnowledgeView(controller: controller, companyId: 3),
    );

    expect(find.text('网络连接异常'), findsOneWidget);
    expect(find.text('网络连接异常，请检查网络后重试'), findsOneWidget);
    expect(find.text('重试'), findsOneWidget);
  });

  testWidgets('知识空间归属不匹配时提示重新选择项目', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/7/personal-knowledge', {
      'scope': {'company_id': 3, 'project_id': 99, 'owner_user_id': 11},
      'entries': <dynamic>[],
      'links': <dynamic>[],
    });
    final controller = await buildController(helper);

    await pumpKnowledgeView(
      tester,
      PersonalKnowledgeView(controller: controller, companyId: 3),
    );

    expect(find.text('知识空间归属不匹配，请重新选择项目。'), findsOneWidget);
  });

  testWidgets('关联图里拖动节点会保存新位置', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/7/personal-knowledge', spaceWithTwoEntries);
    helper.register('PATCH', '/projects/7/personal-knowledge/entries/21', {
      'id': 21,
      'title': '客户需求确认',
      'body_text': '客户确认先做验收清单',
      'tags': <String>[],
      'position': {'x': 61, 'y': 42},
      'source_type': 'manual',
      'source_id': null,
      'source_ref': <String, dynamic>{},
      'updated_at': null,
    });
    final controller = await buildController(helper);

    await pumpKnowledgeView(
      tester,
      PersonalKnowledgeView(controller: controller, companyId: 3),
    );
    await tester.tap(find.text('关联图'));
    await tester.pumpAndSettle();

    expect(find.text('拖动空白处移动画面，点开节点看内容'), findsOneWidget);

    final gesture = await tester.startGesture(
      tester.getCenter(find.text('客户需求确认')),
    );
    await tester.pump();
    await gesture.moveBy(const Offset(45, 26));
    await tester.pump();
    await gesture.up();
    await tester.pumpAndSettle();

    final request = helper.history.last;
    expect(request.method, 'PATCH');
    expect(
        request.url.path, '/api/v1/projects/7/personal-knowledge/entries/21');
    final position = (request.body as Map<String, dynamic>)['position'] as Map;
    expect(position['x'], isNot(0));
  });

  testWidgets('仅收集资料走 sync 并提示新增数量', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/7/personal-knowledge', spaceWithTwoEntries);
    helper.whenPost('/projects/7/personal-knowledge/sync', {
      'created': 2,
      'skipped': 0,
    });
    final controller = await buildController(helper);

    await pumpKnowledgeView(
      tester,
      PersonalKnowledgeView(controller: controller, companyId: 3),
    );

    await tester.tap(find.text('更多'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('仅收集资料'));
    await tester.pumpAndSettle();

    expect(controller.notice, '已收集 2 条新资料');
    expect(
      helper.history.any((record) =>
          record.method == 'POST' &&
          record.url.path == '/api/v1/projects/7/personal-knowledge/sync'),
      isTrue,
    );
    await drainToasts(tester);
  });
}

class _FailingTranscriber implements VoiceTranscriber {
  @override
  Future<String> transcribe({
    required VoiceRecording recording,
    required int companyId,
    required int projectId,
  }) async {
    throw const VoiceInputException('语音服务未配置，请直接输入文字');
  }
}
