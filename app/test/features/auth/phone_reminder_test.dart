import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:worktodo_app/features/auth/utils/phone_reminder.dart';
import 'package:worktodo_app/features/auth/widgets/phone_reminder.dart';

import 'helpers/auth_test_app.dart';

final DateTime fixedNow = DateTime.utc(2026, 3, 1, 9, 0, 0);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(resetAuthModuleState);

  group('手机号验证提醒：一周窗口规则（固定时间）', () {
    test('首次触发立即提醒，并把起始时间写入本地存储', () async {
      final storage = InMemoryPhoneReminderStorage();
      final due = await PhoneReminderPolicy.isDue(
        storage: storage,
        userId: '11',
        phoneVerified: false,
        now: fixedNow,
      );
      expect(due, isTrue);
      expect(
        storage.snapshot[PhoneReminderPolicy.storageKey('11')],
        '${fixedNow.millisecondsSinceEpoch}',
      );
    });

    test('六天二十三小时后仍在窗口内', () async {
      final storage = InMemoryPhoneReminderStorage();
      await PhoneReminderPolicy.isDue(
        storage: storage,
        userId: '11',
        phoneVerified: false,
        now: fixedNow,
      );
      final due = await PhoneReminderPolicy.isDue(
        storage: storage,
        userId: '11',
        phoneVerified: false,
        now: fixedNow.add(const Duration(days: 6, hours: 23)),
      );
      expect(due, isTrue);
    });

    test('满七天后不再提醒', () async {
      final storage = InMemoryPhoneReminderStorage();
      await PhoneReminderPolicy.isDue(
        storage: storage,
        userId: '11',
        phoneVerified: false,
        now: fixedNow,
      );
      final due = await PhoneReminderPolicy.isDue(
        storage: storage,
        userId: '11',
        phoneVerified: false,
        now: fixedNow.add(const Duration(days: 7)),
      );
      expect(due, isFalse);
    });

    test('关闭提醒（稍后提醒）不会延长一周窗口', () async {
      final storage = InMemoryPhoneReminderStorage();
      // 第一次启动
      await PhoneReminderPolicy.isDue(
        storage: storage,
        userId: '11',
        phoneVerified: false,
        now: fixedNow,
      );
      // 第二天启动（相当于上次关闭了弹窗）
      await PhoneReminderPolicy.isDue(
        storage: storage,
        userId: '11',
        phoneVerified: false,
        now: fixedNow.add(const Duration(days: 1)),
      );
      // 仍然以第一次的时间为起点：第七天到点后不再提醒
      final due = await PhoneReminderPolicy.isDue(
        storage: storage,
        userId: '11',
        phoneVerified: false,
        now: fixedNow.add(const Duration(days: 7, seconds: 1)),
      );
      expect(due, isFalse);
    });

    test('手机号已验证时永远不提醒，也不写存储', () async {
      final storage = InMemoryPhoneReminderStorage();
      final due = await PhoneReminderPolicy.isDue(
        storage: storage,
        userId: '11',
        phoneVerified: true,
        now: fixedNow,
      );
      expect(due, isFalse);
      expect(storage.snapshot, isEmpty);
    });

    test('没有用户 id 时不提醒', () async {
      final storage = InMemoryPhoneReminderStorage();
      final due = await PhoneReminderPolicy.isDue(
        storage: storage,
        userId: '',
        phoneVerified: false,
        now: fixedNow,
      );
      expect(due, isFalse);
      expect(storage.snapshot, isEmpty);
    });

    test('存储的起始时间晚于当前时间（设备时间回拨）时重新起算', () async {
      final storage = InMemoryPhoneReminderStorage({
        PhoneReminderPolicy.storageKey('11'):
            '${fixedNow.add(const Duration(days: 2)).millisecondsSinceEpoch}',
      });
      final due = await PhoneReminderPolicy.isDue(
        storage: storage,
        userId: '11',
        phoneVerified: false,
        now: fixedNow,
      );
      expect(due, isTrue);
      expect(
        storage.snapshot[PhoneReminderPolicy.storageKey('11')],
        '${fixedNow.millisecondsSinceEpoch}',
      );
    });

    test('存储值损坏时按首次启动重新起算', () async {
      final storage = InMemoryPhoneReminderStorage({
        PhoneReminderPolicy.storageKey('11'): 'not-a-number',
      });
      final due = await PhoneReminderPolicy.isDue(
        storage: storage,
        userId: '11',
        phoneVerified: false,
        now: fixedNow,
      );
      expect(due, isTrue);
    });
  });

  group('手机号验证提醒弹窗', () {
    testWidgets('弹窗文案与网页版一致，点“去绑定手机”进入手机补验页', (tester) async {
      final router = GoRouter(
        initialLocation: '/',
        routes: [
          GoRoute(
            path: '/',
            builder: (context, state) => Scaffold(
              body: Center(
                child: Builder(
                  builder: (ctx) => ElevatedButton(
                    onPressed: () => maybeShowPhoneReminder(
                      context: ctx,
                      userId: '11',
                      phoneVerified: false,
                      storage: InMemoryPhoneReminderStorage(),
                      now: fixedNow,
                    ),
                    child: const Text('触发提醒'),
                  ),
                ),
              ),
            ),
          ),
          GoRoute(
            path: '/verify',
            builder: (context, state) => Scaffold(
              body: Text(
                '手机补验页:${state.uri.queryParameters['required']}',
              ),
            ),
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp.router(
          routerConfig: router,
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
        ),
      );

      await tester.tap(find.text('触发提醒'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('手机号码尚未验证'), findsOneWidget);
      expect(
        find.text('绑定手机可保障账号与项目协作安全。首次提醒后的一周内，每次开启 APP 会提醒，验证成功后立即停止。'),
        findsOneWidget,
      );

      await tester.tap(find.text('去绑定手机'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));

      expect(find.text('手机补验页:phone'), findsOneWidget);
    });

    testWidgets('同一次启动内只提示一次（第二次调用不再弹窗）', (tester) async {
      final storage = InMemoryPhoneReminderStorage();
      final router = GoRouter(
        initialLocation: '/',
        routes: [
          GoRoute(
            path: '/',
            builder: (context, state) => Scaffold(
              body: Center(
                child: Builder(
                  builder: (ctx) => Column(
                    children: [
                      ElevatedButton(
                        onPressed: () => maybeShowPhoneReminder(
                          context: ctx,
                          userId: '11',
                          phoneVerified: false,
                          storage: storage,
                          now: fixedNow,
                        ),
                        child: const Text('第一次触发'),
                      ),
                      ElevatedButton(
                        onPressed: () => maybeShowPhoneReminder(
                          context: ctx,
                          userId: '11',
                          phoneVerified: false,
                          storage: storage,
                          now: fixedNow,
                        ),
                        child: const Text('第二次触发'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp.router(
          routerConfig: router,
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
        ),
      );

      await tester.tap(find.text('第一次触发'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(find.text('手机号码尚未验证'), findsOneWidget);

      await tester.tap(find.text('稍后提醒'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      await tester.tap(find.text('第二次触发'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(find.text('手机号码尚未验证'), findsNothing);
    });

    testWidgets('手机号已验证时不弹窗', (tester) async {
      PhoneReminderSession.resetForTesting();
      var completed = false;
      final router = GoRouter(
        initialLocation: '/',
        routes: [
          GoRoute(
            path: '/',
            builder: (context, state) => Scaffold(
              body: Center(
                child: Builder(
                  builder: (ctx) => ElevatedButton(
                    onPressed: () async {
                      await maybeShowPhoneReminder(
                        context: ctx,
                        userId: '11',
                        phoneVerified: true,
                        storage: InMemoryPhoneReminderStorage(),
                        now: fixedNow,
                      );
                      completed = true;
                    },
                    child: const Text('触发提醒'),
                  ),
                ),
              ),
            ),
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp.router(
          routerConfig: router,
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
        ),
      );

      await tester.tap(find.text('触发提醒'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(completed, isTrue);
      expect(find.text('手机号码尚未验证'), findsNothing);
    });
  });
}
