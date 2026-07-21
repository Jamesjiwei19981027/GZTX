import 'package:flutter/material.dart';
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

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AppState()..bootstrap(),
      child: MaterialApp(
        title: 'WorkTodo',
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF2563EB)),
          useMaterial3: true,
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
    }
  }
}
