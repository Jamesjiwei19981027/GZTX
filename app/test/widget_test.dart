import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/main.dart';

void main() {
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
    // 原生版启动后，由于未登录，根据路由拦截跳转至登录或占位页
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
