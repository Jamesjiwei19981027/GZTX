import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/auth/models/auth_models.dart';
import 'package:worktodo_app/features/auth/screens/login_screen.dart';
import 'package:worktodo_app/features/auth/screens/register_screen.dart';
import 'package:worktodo_app/features/auth/screens/verify_screen.dart';
import 'package:worktodo_app/features/auth/utils/phone_reminder.dart';
import 'package:worktodo_app/features/auth/widgets/phone_reminder.dart';

import '../../helpers/golden_test_helper.dart';
import '../../helpers/responsive_checker.dart';

const VerificationStatus _unverifiedStatus = VerificationStatus(
  email: 'e2e_user@example.com',
  phone: '13900000001',
);

Widget _verifyScreen({VerifyRequirement required = VerifyRequirement.email}) {
  return VerifyScreen(
    required: required,
    initialStatus: _unverifiedStatus,
    autoLoad: false,
    userId: '11',
    reminderStorage: InMemoryPhoneReminderStorage(),
  );
}

/// 首帧自动弹出手机号提醒，用于截图弹窗样式
class _ReminderDialogPreview extends StatefulWidget {
  const _ReminderDialogPreview();

  @override
  State<_ReminderDialogPreview> createState() => _ReminderDialogPreviewState();
}

class _ReminderDialogPreviewState extends State<_ReminderDialogPreview> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      showPhoneVerificationReminderDialog(context);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('手机号提醒')),
      body: const Center(child: Text('工作台占位内容')),
    );
  }
}

/// CupertinoAlertDialog 的标题 / 内容 / 按钮文案使用 Flutter 硬编码的
/// `CupertinoSystemText` / `CupertinoSystemDisplay` 字体族（见
/// `packages/flutter/lib/src/cupertino/dialog.dart`），底座 golden helper 只注册了
/// `NotoSansSC` 与 `.SF Pro Text`，因此弹窗在 Windows 上会渲染成方块。
/// 这里把同一份开源中文字体再注册到这两个家族别名，仅影响测试渲染。
Future<void> _loadCupertinoSystemFonts() async {
  final candidates = [
    'test/helpers/fonts/NotoSansSC-Subset.ttf',
    'app/test/helpers/fonts/NotoSansSC-Subset.ttf',
  ];
  File? fontFile;
  for (final path in candidates) {
    final file = File(path);
    if (file.existsSync()) {
      fontFile = file;
      break;
    }
  }
  if (fontFile == null) {
    throw StateError('未找到中文字体测试资源，无法为 Cupertino 弹窗注册字体');
  }
  final bytes = fontFile.readAsBytesSync();
  for (final family in ['CupertinoSystemText', 'CupertinoSystemDisplay']) {
    final loader = FontLoader(family)
      ..addFont(Future<ByteData>.value(ByteData.view(bytes.buffer)));
    await loader.load();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(_loadCupertinoSystemFonts);

  group('登录注册页面双平台外观对比', () {
    testWidgets(
      '登录页 iOS / Android 截图',
      tags: ['golden'],
      (tester) async {
        await testAdaptiveGolden(
          tester: tester,
          widget: const LoginScreen(),
          goldenFileNamePrefix: 'auth_login',
        );
      },
    );

    testWidgets(
      '注册页 iOS / Android 截图',
      tags: ['golden'],
      (tester) async {
        await testAdaptiveGolden(
          tester: tester,
          widget: const RegisterScreen(),
          goldenFileNamePrefix: 'auth_register',
        );
      },
    );

    testWidgets(
      '邮箱验证门 iOS / Android 截图',
      tags: ['golden'],
      (tester) async {
        await testAdaptiveGolden(
          tester: tester,
          widget: _verifyScreen(),
          goldenFileNamePrefix: 'auth_verify_email',
        );
      },
    );

    testWidgets(
      '手机补验门 iOS / Android 截图',
      tags: ['golden'],
      (tester) async {
        await testAdaptiveGolden(
          tester: tester,
          widget: _verifyScreen(required: VerifyRequirement.phone),
          goldenFileNamePrefix: 'auth_verify_phone',
        );
      },
    );

    testWidgets(
      '手机号提醒弹窗 iOS / Android 截图',
      tags: ['golden'],
      (tester) async {
        await testAdaptiveGolden(
          tester: tester,
          widget: const _ReminderDialogPreview(),
          goldenFileNamePrefix: 'auth_phone_reminder_dialog',
        );
      },
    );
  });

  group('登录注册页面适配检查（320/430 宽度、字号 200%、深色模式）', () {
    testWidgets('登录页适配无溢出', (tester) async {
      await ResponsiveChecker.checkAdaptiveLayout(
        tester: tester,
        widget: const LoginScreen(),
      );
    });

    testWidgets('注册页适配无溢出', (tester) async {
      await ResponsiveChecker.checkAdaptiveLayout(
        tester: tester,
        widget: const RegisterScreen(),
      );
    });

    testWidgets('验证门适配无溢出', (tester) async {
      await ResponsiveChecker.checkAdaptiveLayout(
        tester: tester,
        widget: _verifyScreen(required: VerifyRequirement.phone),
      );
    });
  });
}
