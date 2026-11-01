import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 主题模式：跟随系统 / 浅色 / 深色
enum MeThemeMode {
  system('system', '跟随系统'),
  light('light', '浅色'),
  dark('dark', '深色');

  const MeThemeMode(this.storageValue, this.label);

  final String storageValue;
  final String label;

  ThemeMode get materialThemeMode => switch (this) {
        MeThemeMode.system => ThemeMode.system,
        MeThemeMode.light => ThemeMode.light,
        MeThemeMode.dark => ThemeMode.dark,
      };

  static MeThemeMode fromStorage(String? value) {
    for (final mode in MeThemeMode.values) {
      if (mode.storageValue == value) return mode;
    }
    return MeThemeMode.system;
  }
}

/// 外观设置状态（深色模式 + 字号），本地持久化，供全 APP 复用。
///
/// 底座（T00）尚未在 `main.dart` 里接入外观状态，因此本模块：
/// 1. 提供 [MeAppearanceController] 作为唯一状态源（跨重启持久化）；
/// 2. 提供 [MeAppearanceHost]，宿主接入后整包立即跟随（见回传报告「共享改动申请」）；
/// 3. T09 页面内用 [MeScreenAppearance] 立即生效，且对宿主已应用的值保持幂等，
///    不会出现「重复加深色 / 字号翻倍」。
class MeAppearanceController extends ChangeNotifier {
  MeAppearanceController();

  /// 本地持久化键（与后端 `/users/me/ui-prefs` 的 theme_mode 语义一致）
  static const String themeModeKey = 'me.appearance.theme_mode';
  static const String textScaleKey = 'me.appearance.text_scale';

  /// 可选字号档位（null 表示跟随系统）
  static const List<double> textScalePresets = [1.0, 1.15, 1.3];

  static MeAppearanceController? _instance;

  /// 全局单例：页面无需层层透传即可读到同一份外观状态。
  static MeAppearanceController get instance =>
      _instance ??= MeAppearanceController();

  /// 测试注入替换（生产代码只在 `main.dart` 接入时赋值一次）
  static set instance(MeAppearanceController controller) {
    _instance = controller;
  }

  MeThemeMode _themeMode = MeThemeMode.system;
  MeThemeMode get themeMode => _themeMode;

  ThemeMode get materialThemeMode => _themeMode.materialThemeMode;

  double? _textScale;

  /// null 表示跟随系统字号
  double? get textScale => _textScale;

  bool _loaded = false;
  bool get isLoaded => _loaded;

  Future<void>? _loading;

  /// 首次读取本地持久化值；重复调用复用同一个 Future。
  Future<void> ensureLoaded() => _loading ??= _load();

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _themeMode = MeThemeMode.fromStorage(prefs.getString(themeModeKey));
      final stored = prefs.getDouble(textScaleKey);
      _textScale = (stored != null && textScalePresets.contains(stored))
          ? stored
          : null;
    } catch (e) {
      // 读取本地设置失败不阻断界面，按默认（跟随系统）渲染
      debugPrint('MeAppearanceController 读取本地外观设置失败: $e');
    } finally {
      _loaded = true;
      notifyListeners();
    }
  }

  /// 设置主题模式并落本地；返回是否写入成功。
  Future<bool> setThemeMode(MeThemeMode mode) async {
    if (_themeMode != mode) {
      _themeMode = mode;
      notifyListeners();
    }
    return _persist(themeModeKey, mode.storageValue);
  }

  /// 设置字号（null = 跟随系统）；返回是否写入成功。
  Future<bool> setTextScale(double? scale) async {
    if (scale != null && !textScalePresets.contains(scale)) {
      throw ArgumentError('不支持的字号档位: $scale');
    }
    if (_textScale != scale) {
      _textScale = scale;
      notifyListeners();
    }
    try {
      final prefs = await SharedPreferences.getInstance();
      if (scale == null) {
        await prefs.remove(textScaleKey);
      } else {
        await prefs.setDouble(textScaleKey, scale);
      }
      return true;
    } catch (e) {
      debugPrint('MeAppearanceController 保存字号失败: $e');
      return false;
    }
  }

  Future<bool> _persist(String key, String value) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(key, value);
      return true;
    } catch (e) {
      debugPrint('MeAppearanceController 保存外观设置失败: $e');
      return false;
    }
  }

  /// 仅用于测试：恢复默认值
  @visibleForTesting
  void resetForTest() {
    _themeMode = MeThemeMode.system;
    _textScale = null;
    _loading = null;
    _loaded = true;
    notifyListeners();
  }
}

/// 把外观状态注入子树（InheritedNotifier，读到变化自动重建）
class MeAppearanceScope extends InheritedNotifier<MeAppearanceController> {
  const MeAppearanceScope({
    super.key,
    required MeAppearanceController controller,
    required super.child,
  }) : super(notifier: controller);

  static MeAppearanceController? maybeOf(BuildContext context) {
    return context
        .dependOnInheritedWidgetOfExactType<MeAppearanceScope>()
        ?.notifier;
  }

  static MeAppearanceController of(BuildContext context) {
    return maybeOf(context) ?? MeAppearanceController.instance;
  }
}

/// 宿主接入点：`main.dart` 用它包住 `MaterialApp`，整包即跟随外观设置。
///
/// ```dart
/// final appearance = MeAppearanceController.instance;
/// await appearance.ensureLoaded();
/// runApp(MeAppearanceHost(
///   controller: appearance,
///   builder: (context, appearance) => MaterialApp.router(
///     theme: lightTheme,
///     darkTheme: darkTheme,
///     themeMode: appearance.materialThemeMode,
///     builder: (context, child) => MediaQuery(
///       data: MediaQuery.of(context).copyWith(
///         textScaler: appearance.textScale == null
///             ? MediaQuery.of(context).textScaler
///             : TextScaler.linear(appearance.textScale!),
///       ),
///       child: child!,
///     ),
///     ...
///   ),
/// ));
/// ```
class MeAppearanceHost extends StatelessWidget {
  const MeAppearanceHost({
    super.key,
    required this.controller,
    required this.builder,
  });

  final MeAppearanceController controller;
  final Widget Function(BuildContext context, MeAppearanceController appearance)
      builder;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        return MeAppearanceScope(
          controller: controller,
          child: Builder(builder: (inner) => builder(inner, controller)),
        );
      },
    );
  }
}

/// 按外观设置构建浅色 / 深色主题（页面内兜底使用，宿主接入后自动幂等跳过）
ThemeData meThemeDataFor(Brightness brightness) {
  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: ColorScheme.fromSeed(
      seedColor: const Color(0xFF0058BE),
      brightness: brightness,
    ),
    cupertinoOverrideTheme: CupertinoThemeData(brightness: brightness),
  );
}

/// T09 页面外观兜底：立即响应深色开关与字号档位。
///
/// 幂等设计：若宿主（`main.dart`）已经把同样的主题亮度或字号的 MediaQuery 应用下来，
/// 这里就不再重复包裹，避免「深色叠深色 / 字号翻倍」。
class MeScreenAppearance extends StatelessWidget {
  const MeScreenAppearance({super.key, required this.child, this.controller});

  final Widget child;
  final MeAppearanceController? controller;

  @override
  Widget build(BuildContext context) {
    final appearance = controller ??
        MeAppearanceScope.maybeOf(context) ??
        MeAppearanceController.instance;

    return ListenableBuilder(
      listenable: appearance,
      builder: (context, _) {
        Widget result = child;

        // 1) 字号：仅在宿主未应用同一档位时补一层
        final scale = appearance.textScale;
        if (scale != null) {
          final media = MediaQuery.of(context);
          final target = TextScaler.linear(scale);
          if (media.textScaler != target) {
            result = MediaQuery(
              data: media.copyWith(textScaler: target),
              child: result,
            );
          }
        }

        // 2) 深色：按外观设置解析出目标亮度，与当前亮度不同才覆盖
        final platformBrightness = MediaQuery.platformBrightnessOf(context);
        final targetBrightness = switch (appearance.themeMode) {
          MeThemeMode.dark => Brightness.dark,
          MeThemeMode.light => Brightness.light,
          MeThemeMode.system => platformBrightness,
        };
        if (Theme.of(context).brightness == targetBrightness) {
          return result;
        }
        return Theme(
          data: meThemeDataFor(targetBrightness),
          child: CupertinoTheme(
            data: CupertinoThemeData(brightness: targetBrightness),
            child: result,
          ),
        );
      },
    );
  }
}
