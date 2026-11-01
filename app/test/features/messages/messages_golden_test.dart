import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/messages/data/messages_repository.dart';
import 'package:worktodo_app/features/messages/screens/call_screen.dart';
import 'package:worktodo_app/features/messages/screens/chat_screen.dart';
import 'package:worktodo_app/features/messages/screens/conversation_profile_screen.dart';
import 'package:worktodo_app/features/messages/screens/external_mail_view.dart';
import 'package:worktodo_app/features/messages/screens/inbox_screen.dart';
import 'package:worktodo_app/features/messages/screens/messages_root_screen.dart';
import 'package:worktodo_app/features/messages/screens/work_contacts_screen.dart';

import '../../helpers/golden_test_helper.dart';
import '../../helpers/mock_api_client.dart';
import 'messages_test_support.dart';

/// T08 各页面 iOS / 安卓双平台截图对比。
///
/// 本地执行 `flutter test test/features/messages/messages_golden_test.dart --update-goldens`
/// 生成基准图；CI 默认 `--exclude-tags golden` 跳过像素比对。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  MockApiClientHelper rootHelper() => MockApiClientHelper()
    ..whenGet(
      '/companies/1/channels',
      {
        'items': [
          MessagesFixtures.generalChannel,
          MessagesFixtures.projectChannel,
        ],
      },
      query: {'project_id': '7'},
    )
    ..whenGet('/companies/1/conversations', {
      'items': [MessagesFixtures.directConversation, MessagesFixtures.groupConversation],
    });

  testWidgets(
    '消息首页（频道列表）双平台截图',
    tags: ['golden'],
    (tester) async {
      final helper = rootHelper();
      await testAdaptiveGolden(
        tester: tester,
        widget: MessagesRootScreen(
          repository: MessagesRepository(helper.buildClient()),
          companyId: 1,
          projectId: 7,
        ),
        goldenFileNamePrefix: 'messages_root',
      );
    },
  );

  testWidgets(
    '工作联系人双平台截图',
    tags: ['golden'],
    (tester) async {
      final helper = MockApiClientHelper()
        ..whenGet(
          '/companies/1/contacts',
          MessagesFixtures.workContacts,
          query: {'project_id': '7'},
        );
      await testAdaptiveGolden(
        tester: tester,
        widget: WorkContactsScreen(
          repository: MessagesRepository(helper.buildClient()),
          companyId: 1,
          projectId: 7,
        ),
        goldenFileNamePrefix: 'messages_contacts',
      );
    },
  );

  testWidgets(
    '频道会话双平台截图',
    tags: ['golden'],
    (tester) async {
      final helper = MockApiClientHelper()
        ..whenGet(
          '/channels/5/messages',
          {
            'items': [
              MessagesFixtures.channelMessage(),
              MessagesFixtures.channelMessage(
                id: 9002,
                userId: 11,
                senderName: '张三',
                body: '收到，今天下班前给你反馈',
                likes: 2,
              ),
              MessagesFixtures.channelMessage(
                id: 9003,
                body: '',
                attachments: [MessagesFixtures.fileAttachment],
              ),
            ],
          },
          query: {'page': '1', 'page_size': '100'},
        );
      await testAdaptiveGolden(
        tester: tester,
        widget: ChatScreen(
          repository: MessagesRepository(helper.buildClient()),
          scopeType: 'channel',
          scopeId: 5,
          name: '全员交流大厅',
          currentUserId: 11,
          companyId: 1,
        ),
        goldenFileNamePrefix: 'messages_chat',
      );
      await disposeMessagesTree(tester);
    },
  );

  testWidgets(
    '会话资料双平台截图',
    tags: ['golden'],
    (tester) async {
      final helper = MockApiClientHelper()
        ..whenGet('/channels/5/pinned-links', MessagesFixtures.pinnedLinks)
        ..whenGet('/channels/5/files', MessagesFixtures.channelFiles);
      await testAdaptiveGolden(
        tester: tester,
        widget: ConversationProfileScreen(
          repository: MessagesRepository(helper.buildClient()),
          scopeType: 'channel',
          scopeId: 5,
          name: '全员交流大厅',
          companyId: 1,
        ),
        goldenFileNamePrefix: 'messages_profile',
      );
    },
  );

  testWidgets(
    '通知收件箱双平台截图',
    tags: ['golden'],
    (tester) async {
      final helper = MockApiClientHelper()
        ..whenGet(
          '/notifications/collab',
          MessagesFixtures.notifications,
          query: {'page': '1', 'page_size': '20', 'state': 'active'},
        );
      await testAdaptiveGolden(
        tester: tester,
        widget: InboxScreen(
          repository: MessagesRepository(helper.buildClient()),
          companyId: 1,
        ),
        goldenFileNamePrefix: 'messages_inbox',
      );
    },
  );

  testWidgets(
    '外部邮件双平台截图',
    tags: ['golden'],
    (tester) async {
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
      await testAdaptiveGolden(
        tester: tester,
        widget: ExternalMailScreen(
          repository: MessagesRepository(helper.buildClient()),
          companyId: 1,
        ),
        goldenFileNamePrefix: 'messages_external_mail',
      );
    },
  );

  testWidgets(
    '通话页（未配置）双平台截图',
    tags: ['golden'],
    (tester) async {
      final helper = MockApiClientHelper()
        ..whenGet(
          '/calls/config',
          MessagesFixtures.callConfigUnconfigured,
          query: {'company_id': '1'},
        );
      await testAdaptiveGolden(
        tester: tester,
        widget: CallScreen(
          repository: MessagesRepository(helper.buildClient()),
          companyId: 1,
          conversationId: 55,
          targetName: '李四',
          callType: 'audio',
        ),
        goldenFileNamePrefix: 'messages_call',
      );
    },
  );

  testWidgets(
    '通话页（已配置）双平台截图',
    tags: ['golden'],
    (tester) async {
      final helper = MockApiClientHelper()
        ..whenGet(
          '/calls/config',
          MessagesFixtures.callConfigConfigured,
          query: {'company_id': '1'},
        )
        ..whenPost('/calls/sessions', MessagesFixtures.callSession);
      await testAdaptiveGolden(
        tester: tester,
        widget: CallScreen(
          repository: MessagesRepository(helper.buildClient()),
          companyId: 1,
          conversationId: 55,
          targetName: '李四',
          callType: 'video',
        ),
        goldenFileNamePrefix: 'messages_call_ready',
      );
      await disposeMessagesTree(tester);
    },
  );
}
