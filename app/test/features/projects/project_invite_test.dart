import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/projects/invite_link.dart';
import 'package:worktodo_app/features/projects/screens/project_invite_screen.dart';

import 'support/projects_test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('成员邀请', () {
    testWidgets('邮箱格式不合法时提示且不发请求', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      await harness.pumpScreen(tester, const ProjectInviteScreen(projectId: 11));

      await tester.enterText(find.byType(TextFormField).first, 'not-an-email');
      await tester.pumpAndSettle();
      await tester.tap(find.text('生成邀请凭证'));
      await tester.pumpAndSettle();

      expect(find.text('请输入有效的受邀人员工作邮箱'), findsOneWidget);
      expect(
        harness.helper.history.where((item) => item.method == 'POST'),
        isEmpty,
      );
    });

    testWidgets('生成邀请成功后展示专属链接与复制入口', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenPost('/projects/11/invitations', {
        'id': 7,
        'token': 'inv-token-1',
        'status': 'pending',
        'expires_at': '2026-11-08T02:00:00Z',
      });

      await harness.pumpScreen(tester, const ProjectInviteScreen(projectId: 11));
      await tester.enterText(find.byType(TextFormField).first, 'lunyue@example.com');
      await tester.pumpAndSettle();
      await tester.tap(find.text('生成邀请凭证'));
      await tester.pumpAndSettle();

      final request =
          harness.helper.history.firstWhere((item) => item.method == 'POST');
      expect(request.url.path, '/api/v1/projects/11/invitations');
      expect(request.body, {'email': 'lunyue@example.com'});

      expect(find.text('邀请凭证已生成'), findsOneWidget);
      expect(find.textContaining('invite=inv-token-1'), findsOneWidget);
      expect(find.text('复制专属邀请链接'), findsOneWidget);
      expect(find.textContaining('系统不会自动往外部邮箱发送'), findsOneWidget);
    });

    testWidgets('点击复制按钮给出已复制提示', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      // 测试环境没有真实剪贴板插件，这里接管平台通道使复制成功
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        (call) async => null,
      );
      addTearDown(() {
        tester.binding.defaultBinaryMessenger
            .setMockMethodCallHandler(SystemChannels.platform, null);
      });
      harness.helper.whenPost('/projects/11/invitations', {
        'id': 7,
        'token': 'inv-token-1',
        'status': 'pending',
      });

      await harness.pumpScreen(tester, const ProjectInviteScreen(projectId: 11));
      await tester.enterText(find.byType(TextFormField).first, 'lunyue@example.com');
      await tester.pumpAndSettle();
      await tester.tap(find.text('生成邀请凭证'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('复制专属邀请链接'));
      await tester.pump();

      expect(find.text('已复制邀请链接'), findsOneWidget);
      expect(find.text('已复制邀请链接到剪贴板'), findsOneWidget);
      resetToastForTesting();
      await tester.pump();
    });

    testWidgets('无邀请权限时展示服务端中文提示', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenPost(
        '/projects/11/invitations',
        {'code': 40305, 'message': '需要 PM', 'data': null},
        statusCode: 403,
      );

      await harness.pumpScreen(tester, const ProjectInviteScreen(projectId: 11));
      await tester.enterText(find.byType(TextFormField).first, 'lunyue@example.com');
      await tester.pumpAndSettle();
      await tester.tap(find.text('生成邀请凭证'));
      await tester.pumpAndSettle();

      expect(find.text('需要 PM'), findsOneWidget);
      expect(find.text('邀请凭证已生成'), findsNothing);
    });

    testWidgets('断网时展示网络异常提示', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenPost('/projects/11/invitations', Exception('连接被拒绝'));

      await harness.pumpScreen(tester, const ProjectInviteScreen(projectId: 11));
      await tester.enterText(find.byType(TextFormField).first, 'lunyue@example.com');
      await tester.pumpAndSettle();
      await tester.tap(find.text('生成邀请凭证'));
      await tester.pumpAndSettle();

      expect(find.textContaining('网络请求失败'), findsOneWidget);
    });
  });

  group('邀请链接构造', () {
    test('分享链接与原生接受地址保持可解析', () {
      final link = buildInviteLink('inv-token-1');
      expect(link, 'http://localhost:8010/?invite=inv-token-1');

      final location = inviteAcceptLocation('inv-token-1');
      expect(location, '/projects/invite/accept?token=inv-token-1');

      expect(
        readInviteTokenFromQuery(const {'token': 'inv-token-1'}),
        'inv-token-1',
      );
      expect(
        readInviteTokenFromQuery(const {'invite': 'from-deep-link'}),
        'from-deep-link',
      );
      expect(readInviteTokenFromQuery(const {}), isNull);
    });
  });
}
