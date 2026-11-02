import 'package:go_router/go_router.dart';

import '../reports/screens/agent_chat_screen.dart';
import 'screens/knowledge_screen.dart';

final List<RouteBase> knowledgeRoutes = [
  GoRoute(
    path: '/knowledge',
    name: 'knowledge-root',
    builder: (context, state) => const KnowledgeScreen(),
    routes: [
      GoRoute(
        path: 'chat',
        name: 'knowledge-chat',
        builder: (context, state) => const AgentChatScreen(knowledgeMode: true),
      ),
    ],
  ),
];
