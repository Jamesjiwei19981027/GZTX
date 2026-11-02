import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'config/api_config.dart';
import 'config/brand.dart';
import 'core/auth/auth_state.dart' as core_auth;
import 'design/tokens/colors.dart';
import 'features/auth/gate/auth_gate_host.dart';
import 'features/me/appearance/me_appearance.dart';
import 'router/app_router.dart';
import 'screens/web_shell_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const WorkTodoApp());
}

enum AppShellMode { native, webShell }

AppShellMode resolveShellMode({
  required bool useNative,
  required bool useWebShell,
}) {
  if (useNative && useWebShell) {
    debugPrint('USE_NATIVE 与 USE_WEB_SHELL 同时为 true，按网页外壳运行');
  }
  return useNative && !useWebShell
      ? AppShellMode.native
      : AppShellMode.webShell;
}

const bool kUseNativeApp =
    bool.fromEnvironment('USE_NATIVE', defaultValue: true);

bool resolveNativeApp({
  bool native = kUseNativeApp,
  bool webShell = ApiConfig.useWebShell,
}) =>
    resolveShellMode(useNative: native, useWebShell: webShell) ==
    AppShellMode.native;

class WorkTodoApp extends StatefulWidget {
  const WorkTodoApp({
    super.key,
    this.useWebShellOverride,
    this.useNativeOverride,
    this.authStateFactory,
    this.webShellFactory,
  });

  /// 测试或调试覆盖：是否使用 Web 外壳
  final bool? useWebShellOverride;

  /// 测试或调试覆盖：是否启用原生版本
  final bool? useNativeOverride;

  final core_auth.AuthState Function()? authStateFactory;
  final Widget Function()? webShellFactory;

  @override
  State<WorkTodoApp> createState() => _WorkTodoAppState();
}

class _WorkTodoAppState extends State<WorkTodoApp> {
  core_auth.AuthState? _authState;
  AppRouter? _appRouter;
  final _appearance = MeAppearanceController.instance;

  AppShellMode _shellModeFor(WorkTodoApp target) => resolveShellMode(
        useNative: target.useNativeOverride ?? kUseNativeApp,
        useWebShell: target.useWebShellOverride ?? ApiConfig.useWebShell,
      );

  AppShellMode get _shellMode => _shellModeFor(widget);
  bool get _isNative => _shellMode == AppShellMode.native;

  @override
  void initState() {
    super.initState();
    debugPrint(
      '应用模式：${_isNative ? '原生' : '网页外壳'}',
    );
    if (_isNative) {
      _appearance.ensureLoaded();
      _initNativeAuth();
    }
  }

  void _initNativeAuth() {
    if (_authState == null) {
      final auth = widget.authStateFactory?.call() ?? core_auth.AuthState();
      _authState = auth;
      _appRouter = AppRouter(authState: auth);
      auth.bootstrap();
    }
  }

  void _disposeNativeState() {
    _appRouter?.router.dispose();
    _authState?.dispose();
    _appRouter = null;
    _authState = null;
  }

  @override
  void didUpdateWidget(covariant WorkTodoApp oldWidget) {
    super.didUpdateWidget(oldWidget);
    final oldMode = _shellModeFor(oldWidget);
    final newMode = _shellMode;
    if (oldMode == newMode) return;

    if (newMode == AppShellMode.native) {
      _appearance.ensureLoaded();
      _initNativeAuth();
    } else {
      _disposeNativeState();
    }
  }

  @override
  void dispose() {
    _disposeNativeState();
    super.dispose();
  }

  ThemeData _buildAppTheme(BuildContext context) {
    const primary = AppColors.primary;
    final baseText = GoogleFonts.interTextTheme();

    return ThemeData(
      colorScheme: ColorScheme.fromSeed(
        seedColor: primary,
        brightness: Brightness.light,
        primary: primary,
        surface: AppColors.background,
        secondary: AppColors.success,
        secondaryContainer: AppColors.primaryLight,
        onSecondaryContainer: const Color(0xFF0A1F33),
      ),
      scaffoldBackgroundColor: AppColors.background,
      useMaterial3: true,
      textTheme: baseText.apply(
        bodyColor: AppColors.textPrimary,
        displayColor: AppColors.textPrimary,
      ),
      appBarTheme: AppBarTheme(
        centerTitle: false,
        backgroundColor: Colors.white,
        foregroundColor: AppColors.textPrimary,
        elevation: 0,
        scrolledUnderElevation: 1,
        titleTextStyle: GoogleFonts.inter(
          fontSize: 18,
          fontWeight: FontWeight.w600,
          color: AppColors.textPrimary,
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: Colors.white,
        indicatorColor: primary.withValues(alpha: 0.12),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return GoogleFonts.inter(
            fontSize: 12,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
            color: selected ? primary : AppColors.textSecondary,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return IconThemeData(
            color: selected ? primary : AppColors.textSecondary,
          );
        }),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final useNative = _isNative;

    if (useNative) {
      return ChangeNotifierProvider<core_auth.AuthState>.value(
        value: _authState!,
        child: MeAppearanceHost(
          controller: _appearance,
          builder: (context, appearance) => MaterialApp.router(
            title: Brand.fullName,
            theme: _buildAppTheme(context),
            darkTheme: meThemeDataFor(Brightness.dark),
            themeMode: appearance.materialThemeMode,
            routerConfig: _appRouter!.router,
            // 已登录用户启动时检查邮箱/手机验证状态（未验证邮箱进验证门，未验证手机按七天规则提醒）
            builder: (context, child) {
              final media = MediaQuery.of(context);
              return MediaQuery(
                data: media.copyWith(
                  textScaler: appearance.textScale == null
                      ? media.textScaler
                      : TextScaler.linear(appearance.textScale!),
                ),
                child: AuthGateHost(
                  router: _appRouter!.router,
                  navigatorKey: AppRouter.rootNavigatorKey,
                  child: child ?? const SizedBox.shrink(),
                ),
              );
            },
            localizationsDelegates: const [
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            supportedLocales: const [
              Locale('zh', 'CN'),
              Locale('en', 'US'),
            ],
          ),
        ),
      );
    }

    return MaterialApp(
      title: Brand.fullName,
      theme: _buildAppTheme(context),
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('zh', 'CN'), Locale('en', 'US')],
      home: widget.webShellFactory?.call() ?? const WebShellScreen(),
    );
  }
}
