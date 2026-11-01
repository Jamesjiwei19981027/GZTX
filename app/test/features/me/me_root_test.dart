import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/features/me/screens/me_root_screen.dart';

import 'me_test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('普通成员看不到企业管理员入口，资料卡显示「成员」徽标', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create(isAdmin: false);
    await tester.pumpWidget(
      harness.wrap(MeRootScreen(api: harness.api, authState: harness.authState)),
    );
    await tester.pumpAndSettle();

    expect(find.text('张三'), findsWidgets);
    expect(find.text('成员'), findsOneWidget);
    // 管理员入口（非管理员不可见）
    expect(find.text('通知渠道配置'), findsNothing);
    expect(find.text('AI 模型配置'), findsNothing);
    expect(find.text('企业集成与管理'), findsNothing);
    // 个人入口始终可见
    expect(find.text('个人资料'), findsOneWidget);
    expect(find.text('账号与安全'), findsOneWidget);
    expect(find.text('通知与免打扰'), findsOneWidget);
  });

  testWidgets('企业超级管理员可以看到全部管理入口', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create(isAdmin: true);
    await tester.pumpWidget(
      harness.wrap(MeRootScreen(api: harness.api, authState: harness.authState)),
    );
    await tester.pumpAndSettle();

    expect(find.text('管理员'), findsOneWidget);
    expect(find.text('企业集成与管理'), findsOneWidget);
    expect(find.text('通知渠道配置'), findsOneWidget);
    expect(find.text('AI 模型配置'), findsOneWidget);
    expect(find.text('模型密钥配置'), findsOneWidget);
    expect(find.text('组织与登录集成'), findsOneWidget);
    expect(find.text('推送证书状态'), findsOneWidget);
    expect(find.text('语音识别配置'), findsOneWidget);
    expect(find.text('单点登录配置'), findsOneWidget);
  });

  testWidgets('管理权限校验失败时不静默隐藏入口，而是给出可重试提示', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create(isAdmin: true);
    // 覆盖为 500：权限校验失败
    harness.helper.whenGet('/companies/1', '服务异常', statusCode: 500);

    await tester.pumpWidget(
      harness.wrap(MeRootScreen(api: harness.api, authState: harness.authState)),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('管理权限校验失败'), findsOneWidget);
    expect(find.text('重试'), findsOneWidget);

    // 修复后重试可恢复管理员入口
    harness.helper.whenGet('/companies/1', {
      'id': 1,
      'name': '示例科技',
      'my_membership': {'status': 'active', 'is_super_admin': true},
    });
    await tester.tap(find.text('重试'));
    await tester.pumpAndSettle();
    expect(find.text('通知渠道配置'), findsOneWidget);
  });

  testWidgets('资料加载失败显示可重试错误态，重试后正常渲染', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create();
    harness.helper.whenGet('/users/me', '服务异常', statusCode: 500);

    await tester.pumpWidget(
      harness.wrap(MeRootScreen(api: harness.api, authState: harness.authState)),
    );
    await tester.pumpAndSettle();

    expect(find.text('加载失败'), findsOneWidget);
    expect(find.text('重新加载'), findsOneWidget);

    harness.helper.whenGet('/users/me', MeTestHarness.userJson);
    await tester.tap(find.text('重新加载'));
    await tester.pumpAndSettle();
    expect(find.text('张三'), findsWidgets);
  });

  testWidgets('退出登录需二次确认，确认后调用登出并清空会话', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create();
    harness.helper.whenPost('/auth/logout', {'ok': true});

    await tester.pumpWidget(
      harness.wrap(MeRootScreen(api: harness.api, authState: harness.authState)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('退出当前账号'));
    await tester.pumpAndSettle();
    expect(find.text('确认退出登录？'), findsOneWidget);

    // 取消不应发起登出
    await tester.tap(find.text('取消'));
    await tester.pumpAndSettle();
    expect(harness.authState.status, AuthStatus.authenticated);
    expect(harness.hasRequest('POST', '/auth/logout'), isFalse);

    await tester.tap(find.text('退出当前账号'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('确认退出'));
    await tester.pumpAndSettle();

    expect(harness.authState.status, AuthStatus.unauthenticated);
    expect(harness.hasRequest('POST', '/auth/logout'), isTrue);
  });

  testWidgets('无企业时显示个人视图并隐藏管理入口', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create(withCompany: false);
    await tester.pumpWidget(
      harness.wrap(MeRootScreen(api: harness.api, authState: harness.authState)),
    );
    await tester.pumpAndSettle();

    expect(find.text('成员'), findsOneWidget);
    expect(find.text('通知渠道配置'), findsNothing);
    // 无企业时不请求 /companies 权限
    expect(harness.helper.history.any((r) => r.url.path == '/companies/1'), isFalse);
  });

  testWidgets('界面偏好读取失败时首页仍可用，并提示原因', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create();
    harness.helper.whenGet('/users/me/ui-prefs', '服务异常', statusCode: 500);

    await tester.pumpWidget(
      harness.wrap(MeRootScreen(api: harness.api, authState: harness.authState)),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('界面偏好读取失败'), findsOneWidget);
    expect(find.text('个人资料'), findsOneWidget);
  });
}
