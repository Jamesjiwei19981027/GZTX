import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../features/messages/models/messages_models.dart';

/// Cross-feature navigation uses the route names registered by each module.
class AppDestination {
  const AppDestination(
    this.name, {
    this.pathParameters = const {},
    this.queryParameters = const {},
  });

  final String name;
  final Map<String, String> pathParameters;
  final Map<String, String> queryParameters;

  String location(GoRouter router) => router.namedLocation(name,
      pathParameters: pathParameters, queryParameters: queryParameters);

  Future<T?> push<T extends Object?>(BuildContext context) =>
      context.pushNamed<T>(name,
          pathParameters: pathParameters, queryParameters: queryParameters);
}

AppDestination? notificationDestination(CollabNotification item) {
  final payload = item.payload;
  String? id(String key) {
    final value = int.tryParse('${payload[key]}');
    return value != null && value > 0 ? '$value' : null;
  }

  final project = id('project_id');
  final query = {if (project != null) 'projectId': project};
  switch (item.templateKey) {
    case 'evidence.adopted':
    case 'evidence.rejected':
      final package = id('package_id');
      return package == null
          ? null
          : AppDestination('axis-evidence-detail',
              pathParameters: {'packageId': package});
    case 'progress.auto_write_alert':
      final node = id('node_id');
      return node == null
          ? null
          : AppDestination('axis-progress',
              pathParameters: {'id': node}, queryParameters: query);
    case 'agent.report.submitted':
      final report = id('report_id');
      return report == null || project == null
          ? null
          : AppDestination('ai-report-detail', queryParameters: {
              ...query,
              'reportId': report,
              'fromManager': '1'
            });
    case 'project.report.aggregated':
      return project == null
          ? null
          : AppDestination('ai-project-aggregate', queryParameters: query);
    case 'auth.welcome':
      return const AppDestination('work-root');
    default:
      return null;
  }
}

class TaskDraft {
  const TaskDraft({required this.title, required this.description});
  final String title;
  final String description;

  factory TaskDraft.fromText(String text, {required String source}) {
    final trimmed = text.trim();
    final firstLine = trimmed.split('\n').first.trim();
    return TaskDraft(
      title: firstLine.isEmpty
          ? '待整理任务'
          : firstLine.length > 100
              ? firstLine.substring(0, 100)
              : firstLine,
      description: '来源：$source\n\n$trimmed',
    );
  }
}

Future<void> openTaskDraft(BuildContext context, String text,
        {required String source}) =>
    context.pushNamed<void>('work-task-edit',
        extra: TaskDraft.fromText(text, source: source));
