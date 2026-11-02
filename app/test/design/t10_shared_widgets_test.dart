import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';

import '../helpers/golden_test_helper.dart';

void main() {
  testWidgets('长按钮在窄屏 200% 字号下完整换行', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: MediaQuery(
        data: const MediaQueryData(textScaler: TextScaler.linear(2)),
        child: Scaffold(
          body: Center(
            child: SizedBox(
              width: 220,
              child: AppButton(
                label: '保存配置并更新当前工作区',
                isFullWidth: true,
                onPressed: () {},
              ),
            ),
          ),
        ),
      ),
    ));
    expect(tester.takeException(), isNull);
  });

  testWidgets('空态与错误态在键盘高度下可以滚动', (tester) async {
    for (final widget in [
      const AppEmptyState(title: '暂无资料', description: '请先添加一份材料'),
      AppErrorState(message: '请求失败，请重试', onRetry: () {}),
    ]) {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: SizedBox(height: 100, child: widget)),
      ));
      expect(tester.takeException(), isNull);
      expect(find.byType(SingleChildScrollView), findsOneWidget);
    }
  });

  testWidgets('共享状态深色双平台截图', tags: ['golden'], (tester) async {
    await testAdaptiveGolden(
      tester: tester,
      widget: Builder(
          builder: (context) => Theme(
                data: Theme.of(context).copyWith(
                  brightness: Brightness.dark,
                  colorScheme: const ColorScheme.dark(),
                ),
                child: AppScaffold(
                  title: '状态与权限',
                  body: Column(children: [
                    const Expanded(
                      child: AppEmptyState(
                          title: '暂无资料', description: '添加材料后将在这里显示'),
                    ),
                    Expanded(
                      child:
                          AppErrorState(message: '网络异常，请检查连接', onRetry: () {}),
                    ),
                  ]),
                ),
              )),
      goldenFileNamePrefix: 't10_shared_states',
    );
  });
}
