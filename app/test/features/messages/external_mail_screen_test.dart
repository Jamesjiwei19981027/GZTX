import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/messages/data/messages_repository.dart';
import 'package:worktodo_app/features/messages/screens/external_mail_view.dart';

import '../../helpers/mock_api_client.dart';
import 'messages_test_support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('外部邮件独立页展示连接账户与邮件列表', (tester) async {
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

    await pumpMessagesScreen(
      tester,
      ExternalMailScreen(
        repository: MessagesRepository(helper.buildClient()),
        companyId: 1,
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('外部邮件'), findsOneWidget);
    expect(find.text('连接账户：team@example.com'), findsOneWidget);
    expect(find.text('关于二期验收时间的确认'), findsOneWidget);
  });

  testWidgets('外部邮件状态查询失败时显示错误并可重试', (tester) async {
    final helper = MockApiClientHelper()
      ..whenGet(
        '/external-mail/status',
        {'code': 403, 'message': '您不是该企业的在岗成员，无法访问'},
        statusCode: 403,
        query: {'company_id': '1'},
      );

    await pumpMessagesScreen(
      tester,
      ExternalMailScreen(
        repository: MessagesRepository(helper.buildClient()),
        companyId: 1,
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('外部邮件状态查询失败'), findsOneWidget);
    expect(find.text('您不是该企业的在岗成员，无法访问'), findsOneWidget);

    helper.whenGet(
      '/external-mail/status',
      MessagesFixtures.mailStatusUnconfigured,
      query: {'company_id': '1'},
    );
    await tester.tap(find.text('重试'));
    await tester.pumpAndSettle();
    expect(find.text('外部邮箱未配置'), findsOneWidget);
  });
}
