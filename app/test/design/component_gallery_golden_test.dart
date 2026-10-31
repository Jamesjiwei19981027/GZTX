import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/gallery/component_gallery_screen.dart';

import '../helpers/golden_test_helper.dart';
import '../helpers/responsive_checker.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('ComponentGalleryScreen 自适应展示页 Golden 截图与适配测试', () {
    testWidgets('生成 iOS 与 Android 自适应控件展示 Golden 截图', (tester) async {
      await testAdaptiveGolden(
        tester: tester,
        widget: const ComponentGalleryScreen(),
        goldenFileNamePrefix: 'component_gallery',
      );
    });

    testWidgets('320/430 宽、字号 200%、深色模式布局无溢出校验', (tester) async {
      await ResponsiveChecker.checkAdaptiveLayout(
        tester: tester,
        widget: const ComponentGalleryScreen(),
      );
    });
  });
}
