import 'dart:ui' as ui;

import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/work/data/work_models.dart';
import 'package:worktodo_app/features/work/widgets/work_widgets.dart';

void main() {
  for (final brightness in Brightness.values) {
    final dark = brightness == Brightness.dark;
    final theme = appThemeFor(brightness);

    test('主题的链接与辅助面不会回退到默认紫色 $brightness', () {
      expect(theme.textButtonTheme.style!.foregroundColor!.resolve({}),
          theme.colorScheme.primary);
      expect(theme.colorScheme.tertiary, AppColors.textSecondaryOf(dark));
      expect(theme.colorScheme.tertiaryContainer,
          dark ? AppColors.darkSurfaceVariant : AppColors.surfaceVariant);
      expect(theme.colorScheme.surfaceContainer, theme.cardTheme.color);
    });

    testWidgets('钢笔笔尖有通气孔与中缝 $brightness', (tester) async {
      final boundaryKey = GlobalKey();
      final background = dark ? AppColors.darkSurface : AppColors.surface;
      await tester.pumpWidget(MaterialApp(
        theme: theme,
        home: Center(
          child: RepaintBoundary(
            key: boundaryKey,
            child: ColoredBox(
              color: background,
              child: const AppBrandMark(size: 96),
            ),
          ),
        ),
      ));
      final boundary = boundaryKey.currentContext!.findRenderObject()!
          as RenderRepaintBoundary;
      await tester.runAsync(() async {
        final image = await boundary.toImage();
        final bytes =
            (await image.toByteData(format: ui.ImageByteFormat.rawRgba))!;
        Color pixel(int x, int y) {
          final i = (y * image.width + x) * 4;
          return Color.fromARGB(bytes.getUint8(i + 3), bytes.getUint8(i),
              bytes.getUint8(i + 1), bytes.getUint8(i + 2));
        }

        expect(pixel(48, 44), background, reason: '通气孔透出卡面');
        expect(pixel(48, 68), background, reason: '中缝贯通笔尖');
        expect(pixel(32, 32), theme.colorScheme.primary, reason: '笔尖为单色实心');
        image.dispose();
      });
    });

    testWidgets('日期只有真正逾期时标红，人轴标签为中性色 $brightness', (tester) async {
      await withClock(Clock.fixed(DateTime(2026, 11, 10, 12)), () async {
        final tasks = [
          const WorkTask(
              id: 1,
              title: '明日事项',
              dueDate: '2026-11-11',
              priority: 0,
              origin: 'project_link',
              linkedReadonly: true),
          const WorkTask(
              id: 2, title: '今天事项', dueDate: '2026-11-10', priority: 0),
          const WorkTask(
              id: 3, title: '已逾期事项', dueDate: '2026-11-09', priority: 0),
          const WorkTask(
              id: 4,
              title: '完成事项',
              dueDate: '2026-11-08',
              status: 2,
              priority: 0),
          const WorkTask(id: 5, title: '未设日期', priority: 0),
        ];
        await tester.pumpWidget(MaterialApp(
          theme: theme,
          home: Scaffold(
              body: Column(children: [
            for (final task in tasks) WorkTaskTile(task: task),
          ])),
        ));
        Color? textColor(String text) =>
            tester.widget<Text>(find.text(text)).style?.color;
        final muted = AppColors.textTertiaryOf(dark);
        expect(textColor('2026-11-11'), muted);
        expect(textColor('今日到期'), muted);
        expect(textColor('2026-11-09'), AppColors.danger);
        expect(textColor('2026-11-08'), muted);
        expect(textColor('人轴'), AppColors.textSecondaryOf(dark));
        final done = tester.widget<Text>(find.text('完成事项')).style!;
        expect(done.decoration, TextDecoration.lineThrough);
        expect(done.decorationColor, theme.colorScheme.primary);
        expect(tester.widget<Text>(find.text('明日事项')).style!.decoration,
            isNot(TextDecoration.lineThrough));
        expect(tester.takeException(), isNull);
      });
    });
  }
}
