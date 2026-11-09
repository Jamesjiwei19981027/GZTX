import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/auth/auth_state.dart';
import '../../../design/app_theme.dart';
import '../data/me_api.dart';

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

/// 外观设置状态：主题以云端为准，本地仅缓存；字号保留设备偏好。
///
/// main.dart 通过 [MeAppearanceSessionSync] 回读云端、通过 [MeAppearanceHost]
/// 在全应用生效；隔离渲染的页面由 [MeScreenAppearance] 提供幂等兜底。
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

  /// 仅用于测试：丢弃全局单例，模拟一次冷启动
  @visibleForTesting
  static void resetInstanceForTest() {
    _instance = null;
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
  int _themeRevision = 0;

  Future<void> syncFromCloud(MeApi api, {bool Function()? isCurrent}) async {
    await ensureLoaded();
    final revision = ++_themeRevision;
    final prefs = await api.fetchUiPrefs();
    if (revision != _themeRevision || (isCurrent != null && !isCurrent())) {
      return;
    }
    await setThemeMode(MeThemeMode.fromStorage(prefs.themeMode));
  }

  /// 首次读取本地持久化值；重复调用复用同一个 Future。
  Future<void> ensureLoaded() => _loading ??= _load();

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _themeMode = MeThemeMode.fromStorage(prefs.getString(themeModeKey));
      final stored = prefs.getDouble(textScaleKey);
      _textScale =
          (stored != null && textScalePresets.contains(stored)) ? stored : null;
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
    _themeRevision++;
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

/// 冷启动恢复会话、登录或换账号后回读云端；迟到的旧会话响应不覆盖当前账号。
class MeAppearanceSessionSync {
  MeAppearanceSessionSync(this.auth, this.appearance) {
    auth.addListener(_sync);
    _sync();
  }

  final AuthState auth;
  final MeAppearanceController appearance;
  String? _session;
  bool _disposed = false;

  void _sync() {
    final key = auth.isAuthenticated
        ? '${auth.currentUser?.id}:${auth.api.tokens.sessionGeneration}'
        : null;
    if (_session == key) return;
    _session = key;
    if (key == null) return;
    unawaited(appearance
        .syncFromCloud(
      MeApi(auth.api),
      isCurrent: () => !_disposed && _session == key,
    )
        .catchError((Object e) {
      debugPrint('云端主题暂不可用，沿用本机缓存：$e');
    }));
  }

  void dispose() {
    _disposed = true;
    auth.removeListener(_sync);
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
///
/// [base] 传入当前环境的主题（`Theme.of(context)`）时会保留其字体与排版，
/// 只切换亮度与配色，避免切换深色后字体回退到系统默认。
ThemeData meThemeDataFor(Brightness brightness, {ThemeData? base}) {
  final cupertinoTheme = CupertinoThemeData(brightness: brightness);
  return appThemeFor(brightness, base: base).copyWith(
    cupertinoOverrideTheme: cupertinoTheme,
  );
}

/// T09 页面外观兜底：立即响应深色开关与字号档位。
///
/// 同时负责冷启动加载：宿主（`main.dart`）未接入时，只要进入「我的」任一页面，
/// 这里就会调用 [MeAppearanceController.ensureLoaded] 把本地保存的外观设置读回来，
/// 避免「保存后重启不生效、必须再打开外观页」。
///
/// 幂等设计：若宿主（`main.dart`）已经把同样的主题亮度或字号的 MediaQuery 应用下来，
/// 这里就不再重复包裹，避免「深色叠深色 / 字号翻倍」。
class MeScreenAppearance extends StatefulWidget {
  const MeScreenAppearance({super.key, required this.child, this.controller});

  final Widget child;
  final MeAppearanceController? controller;

  @override
  State<MeScreenAppearance> createState() => _MeScreenAppearanceState();
}

class _MeScreenAppearanceState extends State<MeScreenAppearance> {
  MeAppearanceController? _appearance;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final resolved = widget.controller ??
        MeAppearanceScope.maybeOf(context) ??
        MeAppearanceController.instance;
    if (!identical(resolved, _appearance)) {
      _appearance = resolved;
    }
    if (!resolved.isLoaded) {
      // 冷启动直接落到本模块页面时，先把持久化的外观设置读回来
      unawaited(resolved.ensureLoaded());
    }
  }

  @override
  Widget build(BuildContext context) {
    final appearance = _appearance ??
        widget.controller ??
        MeAppearanceScope.maybeOf(context) ??
        MeAppearanceController.instance;

    return ListenableBuilder(
      listenable: appearance,
      builder: (context, _) {
        Widget result = widget.child;

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
        final ambientCupertino = CupertinoTheme.of(context);
        return Theme(
          data: meThemeDataFor(targetBrightness, base: Theme.of(context)),
          child: CupertinoTheme(
            // 保留宿主（或测试）已配置的 Cupertino 字体，只切换亮度
            data: ambientCupertino.copyWith(brightness: targetBrightness),
            child: result,
          ),
        );
      },
    );
  }
}
