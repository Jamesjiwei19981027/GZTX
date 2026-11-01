import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/core/errors/app_error.dart';
import 'package:worktodo_app/features/messages/data/messages_repository.dart';
import 'package:worktodo_app/features/messages/models/messages_models.dart';

import '../../helpers/mock_api_client.dart';
import 'messages_test_support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('接口路径与参数对齐网页版', () {
    test('频道列表按项目过滤，私聊列表不带多余参数', () async {
      final helper = MockApiClientHelper()
        ..whenGet(
          '/companies/1/channels',
          {
            'items': [MessagesFixtures.generalChannel],
          },
          query: {'project_id': '7'},
        )
        ..whenGet('/companies/1/conversations', {
          'items': [MessagesFixtures.directConversation],
        });

      final repository = MessagesRepository(helper.buildClient());
      final channels =
          await repository.listChannels(1, projectId: 7);
      final conversations = await repository.listConversations(1);

      expect(channels.single.name, '全员交流大厅');
      expect(channels.single.key, 'general');
      expect(conversations.single.displayTitle, '张三、李四');
      expect(conversations.single.lastMessageBody, '明天的评审安排在下午三点');
    });

    test('消息分页参数为 page=1&page_size=100，与网页版一致', () async {
      final helper = MockApiClientHelper()
        ..whenGet(
          '/channels/5/messages',
          {
            'items': [MessagesFixtures.channelMessage()],
          },
          query: {'page': '1', 'page_size': '100'},
        )
        ..whenGet(
          '/conversations/55/messages',
          {
            'items': [MessagesFixtures.directMessage()],
          },
          query: {'page': '1', 'page_size': '100'},
        );

      final repository = MessagesRepository(helper.buildClient());
      expect((await repository.listChannelMessages(5)).single.body, '第一版原型已上传');
      expect((await repository.listDirectMessages(55)).single.body, '收到，我下午过去');
      expect(
        requests(helper, 'GET', '/channels/5/messages').single.url.query,
        contains('page_size=100'),
      );
    });

    test('发送消息只携带非空 file_ids', () async {
      final helper = MockApiClientHelper()
        ..whenPost('/channels/5/messages', MessagesFixtures.channelMessage())
        ..whenPost(
          '/conversations/55/messages',
          MessagesFixtures.directMessage(),
        );

      final repository = MessagesRepository(helper.buildClient());
      await repository.postChannelMessage(5, '第一版原型已上传');
      await repository.postDirectMessage(55, '收到', fileIds: [301]);

      final channelBody = requests(helper, 'POST', '/channels/5/messages')
          .single
          .body as Map<String, dynamic>;
      expect(channelBody['body'], '第一版原型已上传');
      expect(channelBody.containsKey('file_ids'), isFalse);

      final directBody = requests(helper, 'POST', '/conversations/55/messages')
          .single
          .body as Map<String, dynamic>;
      expect(directBody['file_ids'], [301]);
    });

    test('创建私聊使用真实联系人编号与项目范围', () async {
      final helper = MockApiClientHelper()
        ..whenPost(
          '/companies/1/conversations',
          {'id': 88, 'member_user_ids': [11, 21], 'kind': 'direct'},
        );

      final repository = MessagesRepository(helper.buildClient());
      final id = await repository.createDirectConversation(
        1,
        contactUserId: 21,
        projectId: 7,
      );

      expect(id, 88);
      final body = requests(helper, 'POST', '/companies/1/conversations')
          .single
          .body as Map<String, dynamic>;
      expect(body['member_user_ids'], [21]);
      expect(body['kind'], 'direct');
      expect(body['project_id'], 7);
    });

    test('通知列表与全部已读的路径、筛选参数', () async {
      final helper = MockApiClientHelper()
        ..whenGet(
          '/notifications/collab',
          MessagesFixtures.notifications,
          query: {'page': '1', 'page_size': '20', 'state': 'archived'},
        )
        ..whenPut('/notifications/collab/read-all', {'updated': 3});

      final repository = MessagesRepository(helper.buildClient());
      final items = await repository.listNotifications(state: 'archived');
      expect(items.length, 2);
      expect(items.first.requiresReply, isTrue);
      expect(items.first.senderName, '李四');
      expect(await repository.markAllNotificationsRead(), 3);
    });

    test('外部邮件状态与列表参数', () async {
      final helper = MockApiClientHelper()
        ..whenGet(
          '/external-mail/status',
          MessagesFixtures.mailStatusConfigured,
          query: {'company_id': '1'},
        )
        ..whenGet(
          '/external-mail',
          MessagesFixtures.mailList,
          query: {'company_id': '1', 'state': 'active'},
        );

      final repository = MessagesRepository(helper.buildClient());
      final status = await repository.externalMailStatus(1);
      final mails = await repository.listExternalMail(1);
      expect(status.configured, isTrue);
      expect(status.username, 'team@example.com');
      expect(mails.single.subjectLabel, '关于二期验收时间的确认');
    });

    test('通话配置与会话创建、结束', () async {
      final helper = MockApiClientHelper()
        ..whenGet(
          '/calls/config',
          MessagesFixtures.callConfigConfigured,
          query: {'company_id': '1'},
        )
        ..whenPost('/calls/sessions', MessagesFixtures.callSession)
        ..whenPost('/calls/sessions/901/end', {
          ...MessagesFixtures.callSession,
          'status': 'ended',
          'ended_at': '2026-10-30T06:40:00Z',
        });

      final repository = MessagesRepository(helper.buildClient());
      final config = await repository.getCallConfig(1);
      expect(config.iceServerCount, 2);
      final session = await repository.createCallSession(
        conversationId: 55,
        callType: 'audio',
      );
      expect(session.id, 901);
      final ended = await repository.endCallSession(901);
      expect(ended.ended, isTrue);
      expect(
        requests(helper, 'POST', '/calls/sessions').single.body,
        {'conversation_id': 55, 'call_type': 'audio'},
      );
    });

    test('点赞只回传最新计数', () async {
      final helper = MockApiClientHelper()
        ..whenPost('/channels/messages/9001/like', {'id': 9001, 'likes': 2});
      final repository = MessagesRepository(helper.buildClient());
      expect(await repository.likeChannelMessage(9001), 2);
    });
  });

  group('模型解析容错与错误中文化', () {
    test('附件与点赞、消息时间解析', () {
      final message = ChatMessage.fromJson(
        MessagesFixtures.channelMessage(
          likes: 3,
          attachments: [MessagesFixtures.fileAttachment],
        ),
      );
      expect(message.likes, 3);
      expect(message.attachments.single.name, '需求说明.pdf');
      expect(message.attachments.single.sizeLabel, '2.0 KB');
      expect(message.createdAt?.isUtc, isFalse, reason: '界面用本地时间展示');
    });

    test('下载链接与文件大小展示', () {
      final file = CollabFile.fromJson(
        (MessagesFixtures.channelFiles['items'] as List).first
            as Map<String, dynamic>,
      );
      expect(file.originalName, '需求说明.pdf');
      expect(file.sizeLabel, '2.0 KB');
      expect(file.downloadUrl, '/api/v1/collab/files/301/download');
    });

    test('网页版英文原因转成中文提示', () {
      expect(
        friendlyMessage(ApiException(
          'IMAP credentials are not configured',
          statusCode: 503,
        )),
        '企业尚未配置 IMAP 外部邮箱，请联系管理员',
      );
      expect(
        friendlyMessage(ApiException('not a conversation member', statusCode: 403)),
        '您不是该会话成员，无法查看',
      );
      expect(
        friendlyMessage(ApiException('unsupported collaboration file type', statusCode: 415)),
        contains('不支持该文件类型'),
      );
      expect(
        friendlyMessage(NetworkException('网络断开')),
        '网络连接异常或请求超时，请检查网络后重试',
      );
    });

    test('无说明的服务端错误不显示英文', () {
      final message = friendlyMessage(
        ApiException('Internal Server Error', statusCode: 500),
      );
      expect(message, '服务端返回了异常结果，请稍后重试');
      expect(RegExp(r'[A-Za-z]{3,}').hasMatch(message), isFalse);
    });

    test('未知状态按离线处理，聊天总结 provider 显示为中文', () {
      expect(parsePresenceStatus('unknown'), PresenceStatus.offline);
      final summary = ChatSummary.fromJson(MessagesFixtures.summary);
      expect(summary.providerLabel, '事实规则摘要');
      expect(summary.sourceCount, 2);
    });
  });
}
