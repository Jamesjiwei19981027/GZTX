import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/core/api/api_client.dart';
import 'package:worktodo_app/features/messages/data/message_file_transfer.dart';
import 'package:worktodo_app/features/messages/data/messages_repository.dart';
import 'package:worktodo_app/features/messages/models/messages_models.dart';
import 'package:worktodo_app/features/messages/screens/chat_screen.dart';
import 'package:worktodo_app/features/messages/widgets/chat_input_bar.dart';

import '../../helpers/mock_api_client.dart';
import 'messages_test_support.dart';

/// 可控完成时机的总结接口，用来验证“生成中 → 完成”两个状态
class _DelayedSummaryRepository extends MessagesRepository {
  _DelayedSummaryRepository(super.api, this.completer);

  final Completer<ChatSummary> completer;

  @override
  Future<ChatSummary> createChannelSummary(int channelId) => completer.future;
}

class _FakePicker implements MessageFilePicker {
  _FakePicker(this.file);

  final PickedMessageFile? file;
  bool picked = false;

  @override
  bool get isAvailable => true;

  @override
  Future<PickedMessageFile?> pickFile() async {
    picked = true;
    return file;
  }
}

class _FakeUploader implements MessageFileUploader {
  int? uploadedScopeId;
  String? uploadedScopeType;
  String? uploadedName;

  @override
  Future<int> upload({
    required String scopeType,
    required int scopeId,
    required PickedMessageFile file,
  }) async {
    uploadedScopeType = scopeType;
    uploadedScopeId = scopeId;
    uploadedName = file.name;
    return 301;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  MockApiClientHelper channelHelper({List<Map<String, dynamic>>? messages}) {
    final helper = MockApiClientHelper();
    helper.whenGet(
      '/channels/5/messages',
      {
        'items': messages ??
            [
              MessagesFixtures.channelMessage(),
              MessagesFixtures.channelMessage(
                id: 9002,
                userId: 11,
                senderName: '张三',
                body: '收到，今天下班前给你反馈',
                likes: 2,
              ),
            ],
      },
      query: {'page': '1', 'page_size': '100'},
    );
    return helper;
  }

  Widget chatScreen(
    MockApiClientHelper helper, {
    MessageFilePicker? picker,
    MessageFileUploader? uploader,
    MessagesRepository? repository,
  }) =>
      ChatScreen(
        repository: repository ?? MessagesRepository(helper.buildClient()),
        scopeType: 'channel',
        scopeId: 5,
        name: '全员交流大厅',
        currentUserId: 11,
        companyId: 1,
        pollInterval: const Duration(seconds: 6),
        picker: picker,
        uploader: uploader,
      );

  testWidgets('消息流按后端返回渲染，区分自己与他人的消息', (tester) async {
    final helper = channelHelper();
    await pumpMessagesScreen(tester, chatScreen(helper));
    await tester.pumpAndSettle();

    expect(find.text('第一版原型已上传'), findsOneWidget);
    expect(find.text('收到，今天下班前给你反馈'), findsOneWidget);
    expect(find.text('李四'), findsOneWidget, reason: '他人消息显示发送人');
    expect(find.text('2'), findsOneWidget, reason: '点赞数展示');

    await disposeMessagesTree(tester);
  });

  testWidgets('发送成功：请求体正确、输入框清空、消息出现在列表', (tester) async {
    final helper = channelHelper(messages: []);
    helper.whenPost(
      '/channels/5/messages',
      MessagesFixtures.channelMessage(
        id: 9100,
        userId: 11,
        senderName: '张三',
        body: '我马上处理',
      ),
    );

    await pumpMessagesScreen(tester, chatScreen(helper));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(EditableText), '我马上处理');
    await tester.pump();
    await tester.tap(find.text('发送'));
    await tester.pumpAndSettle();

    final body = requests(helper, 'POST', '/channels/5/messages').single.body
        as Map<String, dynamic>;
    expect(body['body'], '我马上处理');
    expect(find.text('我马上处理'), findsOneWidget);
    expect(
      tester.widget<EditableText>(find.byType(EditableText)).controller.text,
      isEmpty,
    );

    await disposeMessagesTree(tester);
  });

  testWidgets('发送失败保留原文并可重试，重试成功后消息进入列表', (tester) async {
    final helper = channelHelper(messages: []);
    helper.whenPost(
      '/channels/5/messages',
      {'code': 500, 'message': '消息服务暂时不可用'},
      statusCode: 500,
    );

    await pumpMessagesScreen(tester, chatScreen(helper));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(EditableText), '这条会失败');
    await tester.pump();
    await tester.tap(find.text('发送'));
    await tester.pumpAndSettle();

    expect(find.textContaining('发送失败：消息服务暂时不可用'), findsOneWidget);
    expect(find.text('重试发送'), findsOneWidget);
    expect(
      tester.widget<EditableText>(find.byType(EditableText)).controller.text,
      '这条会失败',
      reason: '发送失败不能吞掉用户输入',
    );

    helper.whenPost(
      '/channels/5/messages',
      MessagesFixtures.channelMessage(
        id: 9101,
        userId: 11,
        senderName: '张三',
        body: '这条会失败',
      ),
    );
    await tester.tap(find.text('重试发送'));
    await tester.pumpAndSettle();

    expect(requests(helper, 'POST', '/channels/5/messages').length, 2);
    expect(find.text('这条会失败'), findsOneWidget);
    expect(find.textContaining('发送失败'), findsNothing);
    expect(
      tester.widget<EditableText>(find.byType(EditableText)).controller.text,
      isEmpty,
    );

    await tester.pump(const Duration(seconds: 3));
    await disposeMessagesTree(tester);
  });

  testWidgets('前台每 6 秒轮询，退到后台停止，回到前台立即刷新', (tester) async {
    final helper = channelHelper(messages: [MessagesFixtures.channelMessage()]);
    await pumpMessagesScreen(tester, chatScreen(helper));
    await tester.pumpAndSettle();

    int polls() => requests(helper, 'GET', '/channels/5/messages').length;
    final initial = polls();
    expect(initial, 1);

    await tester.pump(const Duration(seconds: 6));
    await tester.pumpAndSettle();
    expect(polls(), initial + 1, reason: '6 秒后应自动拉新消息');

    // 系统生命周期状态必须按 resumed → inactive → hidden → paused 逐级迁移
    for (final state in [
      AppLifecycleState.inactive,
      AppLifecycleState.hidden,
      AppLifecycleState.paused,
    ]) {
      tester.binding.handleAppLifecycleStateChanged(state);
    }
    await tester.pump();
    final pausedCount = polls();
    await tester.pump(const Duration(seconds: 18));
    await tester.pumpAndSettle();
    expect(polls(), pausedCount, reason: '退到后台后必须停止轮询');

    for (final state in [
      AppLifecycleState.hidden,
      AppLifecycleState.inactive,
      AppLifecycleState.resumed,
    ]) {
      tester.binding.handleAppLifecycleStateChanged(state);
    }
    await tester.pumpAndSettle();
    expect(polls(), pausedCount + 1, reason: '回到前台立即补拉一次');

    await disposeMessagesTree(tester);
  });

  testWidgets('轮询失败不清空消息，只给出可重试的可见提示', (tester) async {
    final helper = channelHelper(messages: [MessagesFixtures.channelMessage()]);
    await pumpMessagesScreen(tester, chatScreen(helper));
    await tester.pumpAndSettle();
    expect(find.text('第一版原型已上传'), findsOneWidget);

    helper.whenGet(
      '/channels/5/messages',
      {'code': 500, 'message': '服务暂时不可用'},
      statusCode: 500,
      query: {'page': '1', 'page_size': '100'},
    );
    await tester.pump(const Duration(seconds: 6));
    await tester.pumpAndSettle();

    expect(find.textContaining('刷新失败：服务暂时不可用'), findsOneWidget);
    expect(find.text('第一版原型已上传'), findsOneWidget, reason: '旧消息必须保留');

    helper.whenGet(
      '/channels/5/messages',
      {
        'items': [
          MessagesFixtures.channelMessage(),
          MessagesFixtures.channelMessage(id: 9003, body: '新到达的消息'),
        ],
      },
      query: {'page': '1', 'page_size': '100'},
    );
    await tester.tap(find.text('重试'));
    await tester.pumpAndSettle();
    expect(find.text('新到达的消息'), findsOneWidget);

    await disposeMessagesTree(tester);
  });

  testWidgets('无频道权限时展示后端说明，输入栏不可用', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet(
      '/channels/5/messages',
      {
        'code': 40301,
        'message': '下辖人员尚未获得项目频道访问授权，请联系项目管理人员',
      },
      statusCode: 403,
      query: {'page': '1', 'page_size': '100'},
    );

    await pumpMessagesScreen(tester, chatScreen(helper));
    await tester.pumpAndSettle();

    expect(find.text('暂无频道访问权限'), findsOneWidget);
    expect(
      find.text('下辖人员尚未获得项目频道访问授权，请联系项目管理人员'),
      findsOneWidget,
    );
    final input = tester.widget<ChatInputBar>(find.byType(ChatInputBar));
    expect(input.enabled, isFalse);

    await disposeMessagesTree(tester);
  });

  testWidgets('AI 总结先显示生成中，再显示完成结果与来源条数', (tester) async {
    final helper = channelHelper();
    final completer = Completer<ChatSummary>();
    final repository =
        _DelayedSummaryRepository(helper.buildClient(), completer);

    await pumpMessagesScreen(
      tester,
      chatScreen(helper, repository: repository),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('AI 总结聊天记录'));
    await tester.pump();
    expect(find.text('AI 正在总结聊天记录…'), findsOneWidget);

    completer.complete(ChatSummary.fromJson(MessagesFixtures.summary));
    await tester.pumpAndSettle();

    expect(find.text('AI 聊天总结 · 2 条来源'), findsOneWidget);
    expect(find.textContaining('确认原型评审时间'), findsOneWidget);
    expect(find.text('生成方式：事实规则摘要'), findsOneWidget);

    await disposeMessagesTree(tester);
  });

  testWidgets('AI 总结失败给出原因和重新生成入口', (tester) async {
    final helper = channelHelper();
    helper.whenPost(
      '/channels/5/summaries',
      {'code': 503, 'message': '总结服务暂不可用'},
      statusCode: 503,
    );

    await pumpMessagesScreen(tester, chatScreen(helper));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('AI 总结聊天记录'));
    await tester.pumpAndSettle();

    expect(find.textContaining('AI 总结未完成：总结服务暂不可用'), findsOneWidget);
    expect(find.text('重新生成'), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
    await disposeMessagesTree(tester);
  });

  testWidgets('频道消息可点赞并更新计数', (tester) async {
    final helper = channelHelper(messages: [MessagesFixtures.channelMessage()]);
    helper.whenPost('/channels/messages/9001/like', {'id': 9001, 'likes': 3});

    await pumpMessagesScreen(tester, chatScreen(helper));
    await tester.pumpAndSettle();

    await tester.tap(find.text('第一版原型已上传'));
    await tester.pumpAndSettle();
    expect(find.text('消息操作'), findsOneWidget);

    await tester.tap(find.text('为此消息点赞 (+1)'));
    await tester.pumpAndSettle();

    expect(requests(helper, 'POST', '/channels/messages/9001/like'), isNotEmpty);
    expect(find.text('3'), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
    await disposeMessagesTree(tester);
  });

  testWidgets('发送文件：上传后随消息提交文件编号并展示附件', (tester) async {
    final helper = channelHelper(messages: []);
    helper.whenPost(
      '/channels/5/messages',
      MessagesFixtures.channelMessage(
        id: 9200,
        userId: 11,
        senderName: '张三',
        body: '',
        attachments: [MessagesFixtures.fileAttachment],
      ),
    );
    final picker = _FakePicker(
      PickedMessageFile(
        name: '需求说明.pdf',
        mimeType: 'application/pdf',
        bytes: Uint8List.fromList([1, 2, 3, 4]),
      ),
    );
    final uploader = _FakeUploader();

    await pumpMessagesScreen(
      tester,
      chatScreen(helper, picker: picker, uploader: uploader),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('发送文件'));
    await tester.pumpAndSettle();

    expect(picker.picked, isTrue);
    expect(uploader.uploadedScopeType, 'channel');
    expect(uploader.uploadedScopeId, 5);
    expect(uploader.uploadedName, '需求说明.pdf');

    final body = requests(helper, 'POST', '/channels/5/messages').single.body
        as Map<String, dynamic>;
    expect(body['file_ids'], [301]);
    expect(find.text('需求说明.pdf'), findsOneWidget);
    expect(find.text('2.0 KB'), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
    await disposeMessagesTree(tester);
  });

  testWidgets('未集成系统选择器时给出可见说明而不是静默失败', (tester) async {
    final helper = channelHelper(messages: []);
    await pumpMessagesScreen(tester, chatScreen(helper));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('发送文件'));
    await tester.pumpAndSettle();

    expect(
      find.textContaining('当前安装包尚未集成系统文件选择组件'),
      findsOneWidget,
    );

    await tester.pump(const Duration(seconds: 3));
    await disposeMessagesTree(tester);
  });

  testWidgets('切换会话编号时重新拉取对应会话的消息', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet(
      '/channels/5/messages',
      {
        'items': [MessagesFixtures.channelMessage(body: '频道五的消息')],
      },
      query: {'page': '1', 'page_size': '100'},
    );
    helper.whenGet(
      '/channels/6/messages',
      {
        'items': [MessagesFixtures.channelMessage(id: 9300, body: '频道六的消息')],
      },
      query: {'page': '1', 'page_size': '100'},
    );
    final repository = MessagesRepository(helper.buildClient());

    await pumpMessagesScreen(tester, chatScreen(helper, repository: repository));
    await tester.pumpAndSettle();
    expect(find.text('频道五的消息'), findsOneWidget);

    await pumpMessagesScreen(
      tester,
      ChatScreen(
        repository: repository,
        scopeType: 'channel',
        scopeId: 6,
        name: '项目冲刺组',
        currentUserId: 11,
        companyId: 1,
      ),
      size: const Size(390, 844),
    );
    await tester.pumpAndSettle();

    expect(find.text('频道六的消息'), findsOneWidget);
    expect(find.text('频道五的消息'), findsNothing);
    expect(requests(helper, 'GET', '/channels/6/messages'), isNotEmpty);

    await disposeMessagesTree(tester);
  });
}
