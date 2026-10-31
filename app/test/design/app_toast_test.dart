import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/widgets/app_toast.dart';

void main() {
  tearDown(() {
    resetToastForTesting();
  });

  testWidgets('连续弹两次提示时安全取消旧定时器，旧提示不会被 dispose 两次触发断言', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) {
              return Column(
                children: [
                  ElevatedButton(
                    onPressed: () {
                      showAppToast(
                        context,
                        '提示一',
                        duration: const Duration(milliseconds: 1000),
                      );
                    },
                    child: const Text('Toast 1'),
                  ),
                  ElevatedButton(
                    onPressed: () {
                      showAppToast(
                        context,
                        '提示二',
                        duration: const Duration(milliseconds: 1000),
                      );
                    },
                    child: const Text('Toast 2'),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );

    // 1. 点击触发第一个 Toast
    await tester.tap(find.text('Toast 1'));
    await tester.pump();
    expect(find.text('提示一'), findsOneWidget);

    // 2. 经过 400ms（尚未达到 1000ms），点击触发第二个 Toast 替换旧 Toast
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.text('Toast 2'));
    await tester.pump();

    // 旧 Toast 提示一被移除，新 Toast 提示二展示
    expect(find.text('提示一'), findsNothing);
    expect(find.text('提示二'), findsOneWidget);

    // 3. 推进 700ms（此时自 Toast 1 触发已过去 1100ms，原 Toast 1 的 1000ms 定时已越过）
    // 验证旧 entry 不会被重复调用 dispose 抛出断言
    await tester.pump(const Duration(milliseconds: 700));
    expect(find.text('提示二'), findsOneWidget);

    // 4. 再推进 500ms（Toast 2 自身的 1000ms 定时到期）
    await tester.pump(const Duration(milliseconds: 500));
    // Toast 2 正常自动隐藏
    expect(find.text('提示二'), findsNothing);

    // 最终结算所有异步事件，验证无任何未捕获的断言异常
    await tester.pumpAndSettle();
  });

  testWidgets('同一帧连续触发多次 showAppToast 不产生断言冲突', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) {
              return ElevatedButton(
                onPressed: () {
                  showAppToast(context, 'A', duration: const Duration(milliseconds: 500));
                  showAppToast(context, 'B', duration: const Duration(milliseconds: 500));
                  showAppToast(context, 'C', duration: const Duration(milliseconds: 500));
                },
                child: const Text('Multi Toast'),
              );
            },
          ),
        ),
      ),
    );

    await tester.tap(find.text('Multi Toast'));
    await tester.pump();

    // 最终只展示最后一个 'C'
    expect(find.text('A'), findsNothing);
    expect(find.text('B'), findsNothing);
    expect(find.text('C'), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 600));
    expect(find.text('C'), findsNothing);

    await tester.pumpAndSettle();
  });
}
