import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/main.dart';

void main() {
  testWidgets('shows WorkTodo APP title', (tester) async {
    await tester.pumpWidget(const WorkTodoApp());
    expect(find.text('WorkTodo APP'), findsOneWidget);
  });
}
