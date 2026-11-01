import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/features/auth/auth_paths.dart';
import 'package:worktodo_app/features/auth/models/auth_models.dart';
import 'package:worktodo_app/features/auth/routes.dart';

import '../../helpers/mock_api_client.dart';
import 'helpers/auth_test_app.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    resetAuthModuleState();
  });

  group('认证路由白名单', () {
    test('登录与注册是公开路径，验证门必须登录后才能进入', () {
      expect(isAuthRouteLocation(AuthPaths.login), isTrue);
      expect(isAuthRouteLocation('/login/register'), isTrue);
      expect(isAuthRouteLocation(AuthPaths.legacyRegister), isTrue);
      expect(isAuthRouteLocation(AuthPaths.verify), isFalse);
      expect(isAuthRouteLocation('/work'), isFalse);
      expect(isAuthRouteLocation('/offline'), isFalse);
    });

    test('白名单列表不包含 /verify', () {
      expect(authRoutePaths, contains(AuthPaths.login));
      expect(authRoutePaths, contains(AuthPaths.legacyRegister));
      expect(authRoutePaths, isNot(contains(AuthPaths.verify)));
    });

    test('verifyLocation 生成带 required 参数的地址', () {
      expect(
        AuthPaths.verifyLocation(required: VerifyRequirement.email),
        '/verify?required=email',
      );
      expect(
        AuthPaths.verifyLocation(required: VerifyRequirement.phone),
        '/verify?required=phone',
      );
    });

    test('required 参数非法时回退为邮箱验证', () {
      expect(AuthPaths.parseRequirement('phone'), VerifyRequirement.phone);
      expect(AuthPaths.parseRequirement('email'), VerifyRequirement.email);
      expect(AuthPaths.parseRequirement(null), VerifyRequirement.email);
      expect(AuthPaths.parseRequirement('telepathy'), VerifyRequirement.email);
    });
  });

  group('路由守卫', () {
    testWidgets('未登录访问验证门会被重定向到登录页', (tester) async {
      final helper = MockApiClientHelper();
      final app = AuthTestApp(helper: helper);
      await app.pump(tester);

      app.appRouter.router.go(AuthPaths.verifyLocation());
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('欢迎回来'), findsOneWidget);
    });

    testWidgets('旧注册链接 /register 重定向到登录页内的注册页', (tester) async {
      final helper = MockApiClientHelper();
      final app = AuthTestApp(helper: helper);
      await app.pump(tester);

      app.appRouter.router.go(AuthPaths.legacyRegister);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));

      expect(find.text('注册新账号'), findsOneWidget);
    });

    testWidgets('已登录访问登录页会被送回工作 Tab', (tester) async {
      final helper = MockApiClientHelper();
      helper.whenGet('/users/me', {'id': 11, 'username': 'e2e_user'});
      helper.whenGet('/companies/mine', {'items': []});
      final app = AuthTestApp(helper: helper, authenticated: true);
      await app.pump(tester);

      expect(find.text('工作 (T02)'), findsOneWidget);

      app.appRouter.router.go(AuthPaths.login);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('工作 (T02)'), findsOneWidget);
    });
  });
}
