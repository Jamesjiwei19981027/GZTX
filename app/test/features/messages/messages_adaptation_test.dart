import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/messages/data/messages_repository.dart';
import 'package:worktodo_app/features/messages/screens/call_screen.dart';
import 'package:worktodo_app/features/messages/screens/chat_screen.dart';
import 'package:worktodo_app/features/messages/screens/conversation_profile_screen.dart';
import 'package:worktodo_app/features/messages/screens/external_mail_view.dart';
import 'package:worktodo_app/features/messages/screens/inbox_screen.dart';
import 'package:worktodo_app/features/messages/screens/messages_root_screen.dart';
import 'package:worktodo_app/features/messages/screens/work_contacts_screen.dart';
import 'package:worktodo_app/features/messages/widgets/chat_input_bar.dart';

import '../../helpers/mock_api_client.dart';
import '../../helpers/responsive_checker.dart';
import 'messages_test_support.dart';

/// 320 窄屏 / 430 宽屏 / 字号 200% / 深色模式，双平台无溢出
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  MockApiClientHelper fullHelper() {
    final helper = MockApiClientHelper()
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
        'items': [MessagesFixtures.directConversation],
      })
      ..whenGet(
        '/companies/1/contacts',
        MessagesFixtures.workContacts,
        query: {'project_id': '7'},
      )
      ..whenGet(
        '/channels/5/messages',
        {
          'items': [
            MessagesFixtures.channelMessage(),
            MessagesFixtures.channelMessage(
              id: 9002,
              userId: 11,
              senderName: '张三',
              body: '收到，今天下班前给你反馈，另外附件里的第二页需要注意一下排版',
              likes: 2,
            ),
          ],
        },
        query: {'page': '1', 'page_size': '100'},
      )
      ..whenGet('/channels/5/pinned-links', MessagesFixtures.pinnedLinks)
      ..whenGet('/channels/5/files', MessagesFixtures.channelFiles)
      ..whenGet(
        '/notifications/collab',
        MessagesFixtures.notifications,
        query: {'page': '1', 'page_size': '20', 'state': 'active'},
      )
      ..whenGet(
        '/external-mail/status',
        MessagesFixtures.mailStatusConfigured,
        query: {'company_id': '1'},
      )
      ..whenGet(
        '/external-mail',
        MessagesFixtures.mailList,
        query: {'company_id': '1', 'state': 'active'},
      )
      ..whenGet(
        '/calls/config',
        MessagesFixtures.callConfigUnconfigured,
        query: {'company_id': '1'},
      );
    return helper;
  }

  testWidgets('消息首页在极端尺寸、字号与深色模式下不溢出', (tester) async {
    final helper = fullHelper();
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: MessagesRootScreen(
        repository: MessagesRepository(helper.buildClient()),
        companyId: 1,
        projectId: 7,
      ),
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('工作联系人在极端尺寸下不溢出', (tester) async {
    final helper = fullHelper();
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: WorkContactsScreen(
        repository: MessagesRepository(helper.buildClient()),
        companyId: 1,
        projectId: 7,
      ),
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('会话页在极端尺寸下不溢出', (tester) async {
    final helper = fullHelper();
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: ChatScreen(
        repository: MessagesRepository(helper.buildClient()),
        scopeType: 'channel',
        scopeId: 5,
        name: '全员交流大厅',
        currentUserId: 11,
        companyId: 1,
      ),
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('会话资料在极端尺寸下不溢出', (tester) async {
    final helper = fullHelper();
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: ConversationProfileScreen(
        repository: MessagesRepository(helper.buildClient()),
        scopeType: 'channel',
        scopeId: 5,
        name: '全员交流大厅',
        companyId: 1,
      ),
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('通知收件箱在极端尺寸下不溢出', (tester) async {
    final helper = fullHelper();
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: InboxScreen(
        repository: MessagesRepository(helper.buildClient()),
        companyId: 1,
      ),
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('外部邮件在极端尺寸下不溢出', (tester) async {
    final helper = fullHelper();
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: ExternalMailScreen(
        repository: MessagesRepository(helper.buildClient()),
        companyId: 1,
      ),
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('通话页在极端尺寸下不溢出', (tester) async {
    final helper = fullHelper();
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: CallScreen(
        repository: MessagesRepository(helper.buildClient()),
        companyId: 1,
        conversationId: 55,
        targetName: '李四',
      ),
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });

  for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
    testWidgets(
      '键盘弹出时输入栏贴在键盘上方（${platform.name}）',
      (tester) async {
        final helper = fullHelper();
        tester.view.physicalSize = const Size(390, 844);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

        const keyboardHeight = 300.0;
        await tester.pumpWidget(
          MaterialApp(
            theme: ThemeData(
              platform: platform,
              useMaterial3: true,
              cupertinoOverrideTheme: const CupertinoThemeData(),
            ),
            home: MediaQuery(
              data: const MediaQueryData(
                size: Size(390, 844),
                viewInsets: EdgeInsets.only(bottom: keyboardHeight),
              ),
              child: ChatScreen(
                repository: MessagesRepository(helper.buildClient()),
                scopeType: 'channel',
                scopeId: 5,
                name: '全员交流大厅',
                currentUserId: 11,
                companyId: 1,
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();

        final rect = tester.getRect(find.byType(ChatInputBar));
        expect(
          rect.bottom,
          lessThanOrEqualTo(844 - keyboardHeight + 1),
          reason: '输入栏不能被键盘挡住',
        );
        expect(find.text('发送'), findsOneWidget);

        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }

  testWidgets('长消息输入框自动增高，最多 5 行', (tester) async {
    final helper = fullHelper();
    await pumpMessagesScreen(
      tester,
      ChatScreen(
        repository: MessagesRepository(helper.buildClient()),
        scopeType: 'channel',
        scopeId: 5,
        name: '全员交流大厅',
        currentUserId: 11,
        companyId: 1,
      ),
    );
    await tester.pumpAndSettle();

    final initialHeight = tester.getSize(find.byType(EditableText)).height;
    await tester.enterText(
      find.byType(EditableText),
      '第一行\n第二行\n第三行\n第四行',
    );
    await tester.pumpAndSettle();
    final grownHeight = tester.getSize(find.byType(EditableText)).height;
    expect(grownHeight, greaterThan(initialHeight));

    final field = tester.widget<EditableText>(find.byType(EditableText));
    expect(field.maxLines, 5);

    await tester.pumpWidget(const SizedBox.shrink());
  });
}
