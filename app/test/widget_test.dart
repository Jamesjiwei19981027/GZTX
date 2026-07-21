import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/main.dart';

void main() {
  testWidgets('app boots to loading or login gate', (tester) async {
    await tester.pumpWidget(const WorkTodoApp());
    expect(find.byType(CircularProgressIndicator), findsWidgets);
  });
}
