import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/messages/controllers/inbox_controller.dart';
import 'package:worktodo_app/features/messages/data/messages_repository.dart';
import 'package:worktodo_app/features/messages/models/messages_models.dart';
import 'package:worktodo_app/features/messages/widgets/notification_detail_sheet.dart';
import 'package:worktodo_app/features/work/data/work_api.dart';
import 'package:worktodo_app/features/work/screens/work_task_edit_screen.dart';
import 'package:worktodo_app/features/messages/screens/chat_screen.dart';
import 'package:worktodo_app/features/messages/screens/external_mail_view.dart';
import 'package:worktodo_app/router/app_destination.dart';
import '../helpers/golden_test_helper.dart';
import '../helpers/mock_api_client.dart';
import '../features/messages/messages_test_support.dart';

void main() {
  testWidgets('消息操作菜单双平台截图', tags: ['golden'], (tester) async {
    final helper = MockApiClientHelper()
      ..whenGet('/channels/5/messages', {
        'items': [MessagesFixtures.channelMessage(body: '整理评审结果，补全会议纪要。')]
      });
    await testAdaptiveGolden(
        tester: tester,
        widget: ChatScreen(
          scopeType: 'channel',
          scopeId: 5,
          name: '项目讨论',
          companyId: 1,
          repository: MessagesRepository(helper.buildClient()),
        ),
        goldenFileNamePrefix: 't10_message_actions',
        beforeCapture: (tester) async {
          await tester.longPress(find.text('整理评审结果，补全会议纪要。'));
          await tester.pumpAndSettle();
          expect(find.text('转为任务草稿'), findsOneWidget);
        });
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('邮件详情转任务入口双平台截图', tags: ['golden'], (tester) async {
    final helper = MockApiClientHelper()
      ..whenGet('/external-mail/status', MessagesFixtures.mailStatusConfigured)
      ..whenGet('/external-mail', MessagesFixtures.mailList)
      ..whenGet('/external-mail/61', MessagesFixtures.mailDetail);
    final router = GoRouter(initialLocation: '/mail', routes: [
      GoRoute(
          path: '/mail',
          builder: (context, state) => ExternalMailScreen(
              repository: MessagesRepository(helper.buildClient()),
              companyId: 1)),
      GoRoute(
          path: '/work/task-edit',
          name: 'work-task-edit',
          builder: (context, state) => const SizedBox.shrink()),
    ]);
    await testAdaptiveGolden(
        tester: tester,
        widget: Router.withConfig(config: router),
        goldenFileNamePrefix: 't10_mail_actions',
        beforeCapture: (tester) async {
          await tester.tap(find.text('关于二期验收时间的确认'));
          await tester.pumpAndSettle();
          expect(find.text('转为任务草稿'), findsOneWidget);
        });
    await tester.pumpWidget(const SizedBox.shrink());
    router.dispose();
  });
  testWidgets('通知详情操作与未读徽标双平台截图', tags: ['golden'], (tester) async {
    final controller = InboxController(
        repository: MessagesRepository(MockApiClientHelper().buildClient()));
    const item = CollabNotification(
      id: 1,
      bodyText: '评审材料已采纳，请查看对应材料和后续安排。',
      read: false,
      templateKey: 'evidence.adopted',
      payload: {'package_id': 7},
      senderName: '项目协作',
    );
    await testAdaptiveGolden(
        tester: tester,
        widget: AppScaffold(
          title: '通知详情',
          body: NotificationDetailSheet(
              controller: controller,
              notification: item,
              onOpenTarget: () {},
              onTaskDraft: () {}),
          bottomNavigationBar:
              AppTabBar(currentIndex: 3, unreadMessagesCount: 3, onTap: (_) {}),
        ),
        goldenFileNamePrefix: 't10_notification');
    await tester.pumpWidget(const SizedBox.shrink());
    controller.dispose();
  });

  testWidgets('消息转任务草稿双平台截图', tags: ['golden'], (tester) async {
    await testAdaptiveGolden(
        tester: tester,
        widget: WorkTaskEditScreen(
          api: WorkApi(MockApiClientHelper().buildClient()),
          initialDraft:
              TaskDraft.fromText('整理评审结果\n补全会议纪要和负责人。', source: '消息 · 项目讨论'),
        ),
        goldenFileNamePrefix: 't10_task_draft');
  });
}
