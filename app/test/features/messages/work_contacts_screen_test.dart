import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/core/models/project.dart';
import 'package:worktodo_app/features/messages/data/messages_repository.dart';
import 'package:worktodo_app/features/messages/screens/work_contacts_screen.dart';

import '../../helpers/mock_api_client.dart';
import 'messages_test_support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Widget screen(MockApiClientHelper helper) => WorkContactsScreen(
        repository: MessagesRepository(helper.buildClient()),
        companyId: 1,
        projectId: 7,
      );

  testWidgets('联系人按后端返回渲染，搜索按姓名本地过滤', (tester) async {
    final helper = MockApiClientHelper()
      ..whenGet(
        '/companies/1/contacts',
        MessagesFixtures.workContacts,
        query: {'project_id': '7'},
      );
    await pumpMessagesScreen(tester, screen(helper));
    await tester.pumpAndSettle();

    expect(find.text('联系人 (2)'), findsOneWidget);
    expect(find.text('李四'), findsOneWidget);
    expect(find.text('王五'), findsOneWidget);
    expect(find.textContaining('工作联系人包含直属上下级'), findsOneWidget);

    await tester.enterText(find.byType(EditableText), '王');
    await tester.pumpAndSettle();
    expect(find.text('李四'), findsNothing);
    expect(find.text('王五'), findsOneWidget);

    await tester.enterText(find.byType(EditableText), '赵六');
    await tester.pumpAndSettle();
    expect(find.text('没有匹配的联系人'), findsOneWidget);
  });

  testWidgets('页面常驻时切换项目：联系人改为新项目的数据', (tester) async {
    final helper = MockApiClientHelper()
      ..whenGet(
        '/companies/1/contacts',
        {
          'items': [
            {'id': 21, 'name': '七号项目同事', 'avatar': ''},
          ],
        },
        query: {'project_id': '7'},
      )
      ..whenGet(
        '/companies/1/contacts',
        {
          'items': [
            {'id': 31, 'name': '八号项目同事', 'avatar': ''},
          ],
        },
        query: {'project_id': '8'},
      );
    final auth = await bootstrapTestAuth(helper);

    await pumpMessagesRouter(
      tester,
      auth,
      (context, state) => const WorkContactsScreen(),
    );
    await tester.pumpAndSettle();
    expect(find.text('七号项目同事'), findsOneWidget);

    auth.selectProject(const Project(id: 8, name: '第二个项目', companyId: 1));
    await tester.pumpAndSettle();

    expect(find.text('八号项目同事'), findsOneWidget);
    expect(find.text('七号项目同事'), findsNothing);
  });

  testWidgets('加载失败显示原因并可重试，不显示英文', (tester) async {
    final helper = MockApiClientHelper()
      ..whenGet(
        '/companies/1/contacts',
        {'code': 500, 'message': '服务暂时不可用'},
        statusCode: 500,
        query: {'project_id': '7'},
      );
    await pumpMessagesScreen(tester, screen(helper));
    await tester.pumpAndSettle();

    expect(find.text('服务暂时不可用'), findsOneWidget);
    expect(find.text('重试'), findsOneWidget);

    helper.whenGet(
      '/companies/1/contacts',
      {
        'items': [
          {'id': 21, 'name': '李四', 'avatar': ''},
        ],
      },
      query: {'project_id': '7'},
    );
    await tester.tap(find.text('重试'));
    await tester.pumpAndSettle();
    expect(find.text('李四'), findsOneWidget);
  });

  testWidgets('没有联系人时引导使用项目频道', (tester) async {
    final helper = MockApiClientHelper()
      ..whenGet(
        '/companies/1/contacts',
        {'items': <Map<String, dynamic>>[]},
        query: {'project_id': '7'},
      );
    await pumpMessagesScreen(tester, screen(helper));
    await tester.pumpAndSettle();
    expect(find.text('暂无可联系人员'), findsOneWidget);
  });

  testWidgets('创建会话失败时给出后端原因（非英文）', (tester) async {
    final helper = MockApiClientHelper()
      ..whenGet(
        '/companies/1/contacts',
        MessagesFixtures.workContacts,
        query: {'project_id': '7'},
      )
      ..whenPost(
        '/companies/1/conversations',
        {'code': 40300, 'message': '仅可向工作联系人发起会话，请通过项目频道沟通或由项目经理发起'},
        statusCode: 403,
      );
    await pumpMessagesScreen(tester, screen(helper));
    await tester.pumpAndSettle();

    await tester.tap(find.text('王五'));
    await tester.pumpAndSettle();

    expect(
      find.text('仅可向工作联系人发起会话，请通过项目频道沟通或由项目经理发起'),
      findsOneWidget,
      reason: '提示以 Toast 形式展示，但要能查到文案',
    );
    expect(find.text('李四'), findsOneWidget, reason: '失败后仍停留在联系人页');

    // 等 Toast 自动消失，避免测试结束时仍有待处理定时器
    await tester.pump(const Duration(seconds: 3));
    await disposeMessagesTree(tester);
  });
}
