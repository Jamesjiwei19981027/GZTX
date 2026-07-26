import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'screens/agent_chat_screen.dart';
import 'screens/company_settings_screen.dart';
import 'screens/login_screen.dart';
import 'screens/project_detail_screen.dart';
import 'screens/register_screen.dart';
import 'screens/shell_screen.dart';
import 'screens/task_detail_screen.dart';
import 'screens/verify_screen.dart';
import 'state/app_state.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const WorkTodoApp());
}

class WorkTodoApp extends StatelessWidget {
  const WorkTodoApp({super.key});

  static const _primary = Color(0xFF0058BE);

  @override
  Widget build(BuildContext context) {
    final baseText = GoogleFonts.interTextTheme();
    return ChangeNotifierProvider(
      create: (_) => AppState()..bootstrap(),
      child: MaterialApp(
        title: '工作题系',
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(
            seedColor: _primary,
            brightness: Brightness.light,
            primary: _primary,
            surface: const Color(0xFFF8F9FA),
          ),
          scaffoldBackgroundColor: const Color(0xFFF8F9FA),
          useMaterial3: true,
          textTheme: baseText.apply(
            bodyColor: const Color(0xFF191C1D),
            displayColor: const Color(0xFF191C1D),
          ),
          cardTheme: CardThemeData(
            elevation: 0,
            color: Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: const BorderSide(color: Color(0xFFE1E3E4)),
            ),
          ),
          appBarTheme: AppBarTheme(
            centerTitle: false,
            backgroundColor: const Color(0xFFF8F9FA),
            foregroundColor: const Color(0xFF191C1D),
            elevation: 0,
            scrolledUnderElevation: 0.5,
            titleTextStyle: GoogleFonts.inter(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: const Color(0xFF191C1D),
            ),
          ),
          navigationBarTheme: NavigationBarThemeData(
            backgroundColor: Colors.white,
            indicatorColor: _primary.withValues(alpha: 0.12),
            labelTextStyle: WidgetStateProperty.resolveWith((states) {
              final selected = states.contains(WidgetState.selected);
              return GoogleFonts.inter(
                fontSize: 12,
                fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                color: selected ? _primary : const Color(0xFF424754),
              );
            }),
            iconTheme: WidgetStateProperty.resolveWith((states) {
              final selected = states.contains(WidgetState.selected);
              return IconThemeData(
                color: selected ? _primary : const Color(0xFF424754),
              );
            }),
          ),
          filledButtonTheme: FilledButtonThemeData(
            style: FilledButton.styleFrom(
              backgroundColor: _primary,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
        ),
        home: const _RootGate(),
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
          return null;
        },
      ),
    );
  }
}

class _RootGate extends StatelessWidget {
  const _RootGate();

  @override
  Widget build(BuildContext context) {
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
        // 本地凭证还在，只是这次没连上：给重试入口，不要把人踢回登录页
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
