import 'package:flutter/widgets.dart';

import '../../../core/auth/auth_provider.dart';
import '../../../core/models/project.dart';
import '../widgets/report_ui.dart';

/// 页面参数兜底：路由显式传值优先，其次读取全局登录态。
///
/// 显式传值让组件测试与截图测试可以直接构造页面，不必搭建整棵应用树。
class ReportScope {
  ReportScope._();

  static int userId(BuildContext context, int? override) =>
      override ?? context.authStateRead.currentUser?.id ?? 0;

  static String userName(BuildContext context, String? override) =>
      override ?? context.authStateRead.currentUser?.displayName ?? '当前用户';

  static int companyId(BuildContext context, int? override) =>
      override ?? context.authStateRead.currentCompany?.id ?? 0;

  static int projectId(BuildContext context, int? override) =>
      override ?? context.authStateRead.currentProject?.id ?? 0;

  static String projectName(BuildContext context, String? override) {
    if (override != null && override.trim().isNotEmpty) return override.trim();
    return context.authStateRead.currentProject?.name ?? '未选择项目';
  }

  static List<ProjectOption> projectOptions(
    BuildContext context,
    List<ProjectOption>? override,
  ) {
    if (override != null) return override;
    final projects = context.authStateRead.projects;
    return [
      for (final Project project in projects)
        if (project.id > 0) ProjectOption(id: project.id, name: project.name),
    ];
  }
}
