import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/work/screens/work_chat_extract_screen.dart';
import 'package:worktodo_app/features/work/screens/work_quick_add_screen.dart';
import 'package:worktodo_app/features/work/screens/work_search_screen.dart';
import 'package:worktodo_app/features/work/widgets/work_widgets.dart';

import 'work_test_fixtures.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('WorkQuickAddScreen', () {
    testWidgets('快速添加空标题拦截，输入后创建成功', (tester) async {
      final harness = await WorkTestHarness.create();
      await tester.pumpWidget(harness.wrap(
        WorkQuickAddScreen(api: harness.api, authState: harness.authState),
      ));
      await tester.pumpAndSettle();

      expect(find.text('快速添加任务'), findsOneWidget);
      expect(find.textContaining('归属：'), findsOneWidget);

      // 空标题点击立即添加
      await tester.tap(find.widgetWithText(AppButton, '立即添加'));
      await tester.pumpAndSettle();

      expect(find.text('请输入待办内容'), findsOneWidget);

      // 输入待办内容并提交
      await tester.enterText(
        find.widgetWithText(AppTextField, '输入待办事项…'),
        '下午 3 点联调支付接口',
      );
      await tester.pump();

      await tester.tap(find.widgetWithText(AppButton, '立即添加'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(seconds: 3));

      expect(harness.api.tasks.any((t) => t.title == '下午 3 点联调支付接口'), isTrue);
    });
  });

  group('WorkSearchScreen', () {
    testWidgets('全局搜索输入关键字正确过滤匹配项与切换分类', (tester) async {
      final harness = await WorkTestHarness.create();
      await tester.pumpWidget(harness.wrap(
        WorkSearchScreen(api: harness.api, authState: harness.authState),
      ));
      await tester.pumpAndSettle();

      expect(find.text('全局搜索'), findsOneWidget);
      expect(find.text('全部结果'), findsOneWidget);
      expect(find.textContaining('事项 ('), findsOneWidget);
      expect(find.textContaining('项目 ('), findsOneWidget);

      // 输入搜索关键字“财务”
      final searchInput = find.byType(TextField);
      await tester.enterText(searchInput, '财务');
      await tester.pumpAndSettle();

      expect(find.text('编制第三季度财务复核报告'), findsOneWidget);

      // 切换到“事项”标签
      await tester.tap(find.widgetWithText(WorkFilterChip, '事项 (1)'));
      await tester.pumpAndSettle();

      expect(find.text('编制第三季度财务复核报告'), findsOneWidget);
    });
  });

  group('WorkChatExtractScreen', () {
    testWidgets('聊天提取失败时保留原文本并提示错误', (tester) async {
      final harness = await WorkTestHarness.create();
      harness.api.shouldThrowNetworkError = true;

      await tester.pumpWidget(harness.wrap(
        WorkChatExtractScreen(
          api: harness.api,
          authState: harness.authState,
          initialText: '请明天上午提醒我发周报',
        ),
      ));
      await tester.pumpAndSettle();

      expect(find.text('请明天上午提醒我发周报'), findsOneWidget);

      // 点击开始智能提取
      await tester.tap(find.widgetWithText(AppButton, '开始智能提取任务'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pumpAndSettle();

      // 原文本依然保留
      expect(find.text('请明天上午提醒我发周报'), findsOneWidget);
      // 错误提示显式可见
      expect(find.textContaining('提取失败'), findsOneWidget);
      expect(find.textContaining('保留原始聊天文本'), findsOneWidget);
    });

    testWidgets('聊天提取成功展示草稿并确认入库创建任务', (tester) async {
      final harness = await WorkTestHarness.create();
      await tester.pumpWidget(harness.wrap(
        WorkChatExtractScreen(
          api: harness.api,
          authState: harness.authState,
          initialText: '明天上午十点开项目评审会',
        ),
      ));
      await tester.pumpAndSettle();

      // 点击智能提取
      await tester.tap(find.widgetWithText(AppButton, '开始智能提取任务'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pumpAndSettle();

      // 展示 AI 提取的草稿卡片
      expect(find.text('周三上午组织产品评审会议'), findsOneWidget);
      expect(find.text('确认创建任务'), findsOneWidget);

      // 点击确认入库
      await tester.tap(find.widgetWithText(AppButton, '确认创建任务'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(seconds: 3));

      expect(harness.api.tasks.any((t) => t.title == '周三上午组织产品评审会议'), isTrue);
    });
  });
}
