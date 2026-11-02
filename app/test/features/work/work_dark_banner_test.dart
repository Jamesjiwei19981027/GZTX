import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/work/screens/work_trash_screen.dart';
import 'package:worktodo_app/features/work/widgets/work_widgets.dart';

import 'work_test_fixtures.dart';

/// 深色模式下提示条不能沿用浅色底：取色走 AppColors.*Of(isDark)。
Color? _boxColorAround(WidgetTester tester, Finder text) {
  final box = tester.widget<Container>(
      find.ancestor(of: text, matching: find.byType(Container)).first);
  return (box.decoration as BoxDecoration?)?.color;
}

void main() {
  testWidgets('深色模式下高优徽标用深色底和浅色字', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: ThemeData.dark(useMaterial3: true),
      home: const Scaffold(body: WorkPriorityBadge(priority: 2)),
    ));
    expect(_boxColorAround(tester, find.text('高优')), AppColors.darkDangerContainer);
    expect(tester.widget<Text>(find.text('高优')).style?.color, AppColors.dangerLight);
  });

  testWidgets('浅色模式下高优徽标保持原配色', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: ThemeData.light(useMaterial3: true),
      home: const Scaffold(body: WorkPriorityBadge(priority: 2)),
    ));
    expect(_boxColorAround(tester, find.text('高优')), AppColors.dangerLight);
    expect(tester.widget<Text>(find.text('高优')).style?.color, AppColors.danger);
  });

  testWidgets('深色模式下回收站保留说明条不是浅蓝底', (tester) async {
    final harness = await WorkTestHarness.create();
    await tester.pumpWidget(harness.wrap(
      WorkTrashScreen(api: harness.api, authState: harness.authState),
      theme: ThemeData.dark(useMaterial3: true),
    ));
    await tester.pumpAndSettle();
    final notice = find.textContaining('回收站中的任务将保留 30 天');
    expect(_boxColorAround(tester, notice), AppColors.darkInfoContainer);
  });
}
