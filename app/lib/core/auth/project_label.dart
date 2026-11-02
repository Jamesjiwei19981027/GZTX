import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/core/models/project.dart';

/// 只拿到项目 ID 时取可读名称：当前项目 → 已加载项目列表 → 退回“项目 #id”。
String projectLabelFor(AuthState? auth, int projectId) {
  if (auth?.currentProject?.id == projectId) {
    return auth!.currentProject!.name;
  }
  for (final p in auth?.projects ?? const <Project>[]) {
    if (p.id == projectId) {
      return p.name;
    }
  }
  return '项目 #$projectId';
}
