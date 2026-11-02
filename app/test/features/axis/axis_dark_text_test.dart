import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/design/tokens/colors.dart';
import 'package:worktodo_app/features/axis/screens/axis_audit_screen.dart';
import 'package:worktodo_app/features/axis/screens/axis_progress_screen.dart';

import 'axis_test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Widget wrapInDarkTheme(Widget child, AxisTestHarness harness) {
    return ChangeNotifierProvider<AuthState>.value(
      value: harness.authState,
      child: MaterialApp(
        theme: ThemeData(
          brightness: Brightness.dark,
          useMaterial3: true,
        ),
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: const [Locale('zh', 'CN')],
        home: MediaQuery(
          data: const MediaQueryData(
            platformBrightness: Brightness.dark,
          ),
          child: child,
        ),
      ),
    );
  }

  testWidgets('深色模式下审计页次要文字采用深色次级色而非浅色值', (tester) async {
    tester.view.physicalSize = const Size(430, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final harness = await AxisTestHarness.create();
    harness.helper.whenPost(
      '/projects/${AxisTestHarness.projectId}/axis-audit',
      AxisTestHarness.auditPayload(),
    );

    await tester.pumpWidget(wrapInDarkTheme(
      AxisAuditScreen(api: harness.api, authState: harness.authState),
      harness,
    ));
    await tester.pumpAndSettle();

    // 找到审计结果卡片中的整体风险与生成时间说明文字
    final summaryRiskFinder = find.textContaining('整体风险中等');
    expect(summaryRiskFinder, findsOneWidget);
    final summaryText = tester.widget<Text>(summaryRiskFinder);
    expect(summaryText.style?.color, AppColors.darkTextSecondary);
    expect(summaryText.style?.color, isNot(AppColors.textSecondary));

    // 找到节点审计明细里的动作建议文字
    final actionFinder = find.text('推动无进展事项提交首份证据');
    expect(actionFinder, findsOneWidget);
    final actionText = tester.widget<Text>(actionFinder);
    expect(actionText.style?.color, AppColors.darkTextSecondary);
    expect(actionText.style?.color, isNot(AppColors.textSecondary));
  });

  testWidgets('深色模式下进度页次要文字采用深色次级色而非浅色值', (tester) async {
    tester.view.physicalSize = const Size(430, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final harness = await AxisTestHarness.create();

    await tester.pumpWidget(wrapInDarkTheme(
      AxisProgressScreen(nodeId: 102, api: harness.api),
      harness,
    ));
    await tester.pumpAndSettle();

    // 状态标签下方的状态文字
    final statusFinder = find.text('进行中');
    expect(statusFinder, findsOneWidget);
    final statusText = tester.widget<Text>(statusFinder);
    expect(statusText.style?.color, AppColors.darkTextSecondary);
    expect(statusText.style?.color, isNot(AppColors.textSecondary));

    // 进度记录原因说明文字
    final recordReasonFinder = find.textContaining('补齐员工端原型');
    expect(recordReasonFinder, findsOneWidget);
    final recordReasonText = tester.widget<Text>(recordReasonFinder);
    expect(recordReasonText.style?.color, AppColors.darkTextSecondary);
    expect(recordReasonText.style?.color, isNot(AppColors.textSecondary));
  });
}
