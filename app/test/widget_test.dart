import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/main.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  SharedPreferences.setMockInitialValues({});

  testWidgets('app boots to loading or login gate (legacy gate)', (tester) async {
    await tester.pumpWidget(
      const WorkTodoApp(useWebShellOverride: false),
    );
    expect(find.byType(CircularProgressIndicator), findsWidgets);
  });

  testWidgets('app boots with useNativeOverride: true', (tester) async {
    await tester.pumpWidget(
      const WorkTodoApp(useNativeOverride: true),
    );
    await tester.pumpAndSettle();
    // 原生版启动后，验证成功加载 5 Tab 导航体系与工作模块根页
    expect(find.text('工作 (T02)'), findsOneWidget);
    expect(find.text('工作'), findsWidgets);
    expect(find.text('人轴'), findsOneWidget);
    expect(find.text('知识'), findsOneWidget);
    expect(find.text('消息'), findsOneWidget);
    expect(find.text('我的'), findsOneWidget);
  });
}
