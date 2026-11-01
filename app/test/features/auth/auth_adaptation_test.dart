import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:worktodo_app/core/api/api_client.dart';
import 'package:worktodo_app/core/api/token_storage.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/auth/data/auth_api.dart';
import 'package:worktodo_app/features/auth/models/auth_models.dart';
import 'package:worktodo_app/features/auth/screens/login_screen.dart';
import 'package:worktodo_app/features/auth/screens/register_screen.dart';
import 'package:worktodo_app/features/auth/screens/verify_screen.dart';
import 'package:worktodo_app/features/auth/utils/phone_reminder.dart';

Widget _wrap(Widget child) {
  return MaterialApp(
    localizationsDelegates: const [
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    supportedLocales: const [Locale('zh', 'CN')],
    home: child,
  );
}

Widget _verifyScreen() {
  return VerifyScreen(
    initialStatus: const VerificationStatus(
      email: 'e2e_user@example.com',
      phone: '13900000001',
    ),
    autoLoad: false,
    userId: '11',
    reminderStorage: InMemoryPhoneReminderStorage(),
  );
}

/// 断言页面为键盘预留了足够的下边距（内容可滚动到键盘上方）
void _expectKeyboardInsetHandled(WidgetTester tester, double expectedInset) {
  final scrollViews = tester
      .widgetList<SingleChildScrollView>(find.byType(SingleChildScrollView))
      .toList();
  expect(scrollViews, isNotEmpty, reason: '页面应使用可滚动容器承接键盘');
  final handled = scrollViews.any((view) {
    final padding = view.padding;
    if (padding is! EdgeInsets) return false;
    return padding.bottom >= expectedInset;
  });
  expect(handled, isTrue, reason: '滚动容器底部内边距应包含键盘高度，避免输入框被遮挡');
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('键盘弹出适配', () {
    testWidgets('登录页键盘弹出时不溢出，且为键盘预留滚动空间', (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1.0;
      tester.view.viewInsets = const FakeViewPadding(bottom: 300);
      addTearDown(tester.view.reset);

      await tester.pumpWidget(_wrap(const LoginScreen()));
      await tester.pump();

      expect(tester.takeException(), isNull);
      _expectKeyboardInsetHandled(tester, 300);

      // 输入框仍可用
      await tester.enterText(
        find.byKey(const ValueKey('login-username')),
        'e2e_user',
      );
      await tester.pump();
      final field = tester.widget<TextFormField>(
        find.descendant(
          of: find.byKey(const ValueKey('login-username')),
          matching: find.byType(TextFormField),
        ),
      );
      expect(field.controller?.text, 'e2e_user');
    });

    testWidgets('注册页键盘弹出时不溢出，且为键盘预留滚动空间', (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1.0;
      tester.view.viewInsets = const FakeViewPadding(bottom: 320);
      addTearDown(tester.view.reset);

      await tester.pumpWidget(_wrap(const RegisterScreen()));
      await tester.pump();

      expect(tester.takeException(), isNull);
      _expectKeyboardInsetHandled(tester, 320);
    });

    testWidgets('验证门键盘弹出时不溢出，且为键盘预留滚动空间', (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1.0;
      tester.view.viewInsets = const FakeViewPadding(bottom: 300);
      addTearDown(tester.view.reset);

      await tester.pumpWidget(_wrap(_verifyScreen()));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(tester.takeException(), isNull);
      _expectKeyboardInsetHandled(tester, 300);
    });
  });

  group('验证门状态展示', () {
    testWidgets('请求未返回时显示加载中，返回后展示表单', (tester) async {
      final completer = Completer<http.Response>();
      final client = ApiClient(
        tokenStorage: InMemoryTokenStorage(access: 'mock-access-token'),
        httpClient: MockClient((request) => completer.future),
        baseUrl: 'http://localhost:8010/api/v1',
      );

      await tester.pumpWidget(
        _wrap(
          VerifyScreen(
            api: AuthApi(client),
            userId: '11',
            reminderStorage: InMemoryPhoneReminderStorage(),
          ),
        ),
      );
      await tester.pump();

      expect(find.byType(AppLoading), findsOneWidget);

      completer.complete(
        http.Response(
          jsonEncode({
            'code': 200,
            'message': 'success',
            'data': {
              'email': 'e2e_user@example.com',
              'phone': '',
              'email_verified': false,
              'phone_verified': false,
              'is_verified': false,
            },
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.byType(AppLoading), findsNothing);
      expect(find.text('完成邮箱验证'), findsOneWidget);
    });
  });
}
