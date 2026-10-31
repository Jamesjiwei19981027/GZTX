import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'config/api_config.dart';
import 'config/brand.dart';
import 'core/auth/auth_state.dart' as core_auth;
import 'design/tokens/colors.dart';
import 'router/app_router.dart';
import 'screens/web_shell_screen.dart';

// 保留 legacy 界面引用以支持旧模式开关运行
import 'legacy/agent_chat_screen.dart';
import 'legacy/company_settings_screen.dart';
import 'legacy/login_screen.dart';
import 'legacy/project_detail_screen.dart';
import 'legacy/report_screen.dart';
import 'legacy/register_screen.dart';
import 'legacy/shell_screen.dart';
import 'legacy/task_detail_screen.dart';
import 'legacy/verify_screen.dart';
import 'state/app_state.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const WorkTodoApp());
}

/// 编译期开关：--dart-define=USE_NATIVE=true 时启用全新 Flutter 原生架构
const bool kUseNativeApp = bool.fromEnvironment('USE_NATIVE', defaultValue: false);

class WorkTodoApp extends StatefulWidget {
  const WorkTodoApp({
    super.key,
    this.useWebShellOverride,
    this.useNativeOverride,
  });

  /// 测试或调试覆盖：是否使用 Web 外壳
  final bool? useWebShellOverride;

  /// 测试或调试覆盖：是否启用原生版本
  final bool? useNativeOverride;

  @override
  State<WorkTodoApp> createState() => _WorkTodoAppState();
}

class _WorkTodoAppState extends State<WorkTodoApp> {
  core_auth.AuthState? _authState;
  AppRouter? _appRouter;

  bool get _isNative => widget.useNativeOverride ?? kUseNativeApp;

  @override
  void initState() {
    super.initState();
    if (_isNative) {
      _initNativeAuth();
    }
  }

  void _initNativeAuth() {
    if (_authState == null) {
      final auth = core_auth.AuthState();
      _authState = auth;
      _appRouter = AppRouter(authState: auth);
      auth.bootstrap();
    }
  }

  @override
  void didUpdateWidget(covariant WorkTodoApp oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_isNative && _authState == null) {
      _initNativeAuth();
    }
  }

  @override
  void dispose() {
    _authState?.dispose();
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
    final useNative = widget.useNativeOverride ?? kUseNativeApp;

    // 模式 1：启用全新原生版架构
    if (useNative) {
      if (_authState == null) {
        _initNativeAuth();
      }
      return ChangeNotifierProvider<core_auth.AuthState>.value(
        value: _authState!,
        child: MaterialApp.router(
          title: Brand.fullName,
          theme: _buildAppTheme(context),
          routerConfig: _appRouter!.router,
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
      );
    }

    // 模式 2：默认加载 Web 外壳或旧版 Native 门控
    return ChangeNotifierProvider(
      create: (_) => AppState()..bootstrap(),
      child: MaterialApp(
        title: Brand.fullName,
        theme: _buildAppTheme(context),
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: const [
          Locale('zh', 'CN'),
          Locale('en', 'US'),
        ],
        home: _RootGate(useWebShellOverride: widget.useWebShellOverride),
        onGenerateRoute: (settings) {
          final name = settings.name ?? '';
          if (name == '/register') {
            return MaterialPageRoute(builder: (_) => const RegisterScreen());
          }
          if (name == '/verify') {
            return MaterialPageRoute(builder: (_) => const VerifyScreen());
          }
          if (name == '/company') {
            return MaterialPageRoute(
              builder: (_) => const CompanySettingsScreen(),
            );
          }
          if (name == '/tasks/new') {
            return MaterialPageRoute(
              builder: (_) => const TaskDetailScreen(createMode: true),
            );
          }
          final taskMatch = RegExp(r'^/tasks/(\d+)$').firstMatch(name);
          if (taskMatch != null) {
            final id = int.parse(taskMatch.group(1)!);
            return MaterialPageRoute(
              builder: (_) => TaskDetailScreen(taskId: id),
            );
          }
          final projectMatch = RegExp(r'^/projects/(\d+)$').firstMatch(name);
          if (projectMatch != null) {
            final id = int.parse(projectMatch.group(1)!);
            final title = settings.arguments is String
                ? settings.arguments as String
                : null;
            return MaterialPageRoute(
              builder: (_) => ProjectDetailScreen(
                projectId: id,
                projectName: title,
              ),
            );
          }
          if (name == '/agents/chat') {
            final args = settings.arguments is Map
                ? Map<String, dynamic>.from(settings.arguments as Map)
                : <String, dynamic>{};
            return MaterialPageRoute(
              builder: (_) => AgentChatScreen(
                projectId: args['projectId'] as int?,
                agentId: args['agentId'] as int?,
                agentName: args['agentName'] as String?,
              ),
            );
          }
          if (name == '/reports') {
            final projectId =
                settings.arguments is int ? settings.arguments as int : null;
            return MaterialPageRoute(
                builder: (_) => ReportScreen(projectId: projectId));
          }
          final reportMatch = RegExp(r'^/reports/(\d+)$').firstMatch(name);
          if (reportMatch != null) {
            return MaterialPageRoute(
                builder: (_) =>
                    ReportScreen(reportId: int.parse(reportMatch.group(1)!)));
          }
          return null;
        },
      ),
    );
  }
}

class _RootGate extends StatelessWidget {
  const _RootGate({this.useWebShellOverride});

  final bool? useWebShellOverride;

  @override
  Widget build(BuildContext context) {
    if (useWebShellOverride ?? ApiConfig.useWebShell) {
      return const WebShellScreen();
    }

    final status = context.watch<AppState>().status;
    switch (status) {
      case AuthStatus.unknown:
        return const Scaffold(
          body: Center(child: CircularProgressIndicator()),
        );
      case AuthStatus.signedOut:
        return const LoginScreen();
      case AuthStatus.signedIn:
        return const ShellScreen();
      case AuthStatus.offline:
        return const _OfflineGate();
    }
  }
}

class _OfflineGate extends StatelessWidget {
  const _OfflineGate();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off_outlined, size: 48),
              const SizedBox(height: 16),
              Text(
                state.error ?? '网络不可用',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              const SizedBox(height: 8),
              Text(
                '登录状态已保留，恢复网络后可直接重试。',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: () => context.read<AppState>().retryBootstrap(),
                icon: const Icon(Icons.refresh),
                label: const Text('重试'),
              ),
              TextButton(
                onPressed: () => context.read<AppState>().logout(),
                child: const Text('退出登录'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
