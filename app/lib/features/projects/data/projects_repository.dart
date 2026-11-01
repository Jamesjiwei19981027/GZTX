/// T03 项目与团队：接口仓库
///
/// 路径与参数严格对照网页版调用（`frontend/src/api/backend.ts`、
/// `frontend/src/api/shell.ts`），不做任何后端改动。
library;

import 'package:worktodo_app/core/api/api_client.dart';
import 'package:worktodo_app/core/models/company.dart';
import 'package:worktodo_app/core/models/project.dart';

import '../models/project_models.dart';

class ProjectsRepository {
  ProjectsRepository(this._api);

  final ApiClient _api;

  /// 任务分页每页条数（与网页版一致）
  static const int taskPageSize = 200;

  /// 任务分页的安全上限，只用于防御「后端忽略 `page` 参数」这类异常导致的死循环。
  /// 100 页 × 200 条 = 2 万条任务，远超单个项目的实际量；真被截断时
  /// [ProjectTasksResult.truncated] 为 true，界面必须明确提示「仅显示前 N 条」。
  static const int maxTaskPages = 100;

  ApiClient get api => _api;

  /// 项目详情（`GET /projects/{id}`）
  Future<ProjectDetail> fetchProject(int projectId) async {
    final dynamic data = await _api.get('/projects/$projectId');
    return ProjectDetail.fromJson(_mapOf(data));
  }

  /// 当前用户权限快照（`GET /projects/{id}/my-permissions`）
  Future<ProjectPermissions> fetchPermissions(int projectId) async {
    final dynamic data = await _api.get('/projects/$projectId/my-permissions');
    return ProjectPermissions.fromJson(_mapOf(data));
  }

  /// 成员列表（`GET /projects/{id}/members`）
  Future<List<ProjectMember>> fetchMembers(int projectId) async {
    final dynamic data = await _api.get('/projects/$projectId/members');
    final map = _mapOf(data);
    final items = map['items'];
    final result = <ProjectMember>[];
    if (items is List) {
      for (final item in items) {
        final member = _mapOrNull(item);
        if (member != null) result.add(ProjectMember.fromJson(member));
      }
    }
    return result;
  }

  /// 在线状态（`GET /companies/{id}/presence`），失败由调用方决定是否降级提示
  Future<Map<int, String>> fetchPresence(int companyId) async {
    final dynamic data = await _api.get('/companies/$companyId/presence');
    final map = _mapOf(data);
    final items = map['items'];
    final result = <int, String>{};
    if (items is List) {
      for (final item in items) {
        final entry = _mapOrNull(item);
        if (entry == null) continue;
        final userId = entry['user_id'];
        final status = entry['status'];
        if (userId is num && status is String) {
          result[userId.toInt()] = status;
        }
      }
    }
    return result;
  }

  /// 项目任务（`GET /projects/{id}/tasks`，按页拉全，与网页口径一致）
  ///
  /// 一直拉到接口返回的 `total` 或空页为止，不再固定页数，避免大项目静默丢任务；
  /// 仅当超过 [maxTaskPages] 的安全上限时才截断，并把 `truncated` 交给界面提示。
  Future<ProjectTasksResult> fetchProjectTasks(int projectId) async {
    final tasks = <ProjectTask>[];
    int? total;
    var truncated = false;
    for (var page = 1;; page++) {
      final dynamic data = await _api.get(
        '/projects/$projectId/tasks',
        query: {'page': page.toString(), 'page_size': '$taskPageSize'},
      );
      final map = _mapOf(data);
      final items = map['items'];
      final pageItems = <ProjectTask>[];
      if (items is List) {
        for (final item in items) {
          final task = _mapOrNull(item);
          if (task != null) pageItems.add(ProjectTask.fromJson(task));
        }
      }
      final rawTotal = map['total'];
      if (rawTotal is num) total = rawTotal.toInt();
      tasks.addAll(pageItems);

      // 空页＝接口没有更多数据（不按「短页」提前结束：后端可能下调 page_size）
      if (pageItems.isEmpty) break;
      final knownTotal = total;
      if (knownTotal != null && tasks.length >= knownTotal) break;
      if (page >= maxTaskPages) {
        truncated = true;
        break;
      }
    }
    return ProjectTasksResult(
      tasks: List.unmodifiable(tasks),
      total: total,
      truncated: truncated,
    );
  }

  /// 新建项目（`POST /projects`）
  Future<Project> createProject({
    required String name,
    required int companyId,
  }) async {
    final dynamic data = await _api.post(
      '/projects',
      body: {'name': name, 'company_id': companyId},
    );
    return Project.fromJson(_mapOf(data));
  }

  /// 新建公司/租户（`POST /companies`）
  Future<Company> createCompany({
    required String name,
    required String slug,
    String? policyPreset,
  }) async {
    final dynamic data = await _api.post(
      '/companies',
      body: {
        'name': name,
        'slug': slug,
        if (policyPreset != null) 'policy_preset': policyPreset,
      },
    );
    return Company.fromJson(_mapOf(data));
  }

  /// 生成邀请凭证（`POST /projects/{id}/invitations`）
  Future<ProjectInvitation> createInvitation(
    int projectId, {
    String? email,
    int? userId,
  }) async {
    final dynamic data = await _api.post(
      '/projects/$projectId/invitations',
      body: {
        if (email != null) 'email': email,
        if (userId != null) 'user_id': userId,
      },
    );
    return ProjectInvitation.fromJson(_mapOf(data));
  }

  /// 接受邀请（`POST /projects/invitations/{token}/accept`）
  Future<InviteAcceptResult> acceptInvitation(String token) async {
    final dynamic data = await _api.post(
      '/projects/invitations/${Uri.encodeComponent(token)}/accept',
      body: const <String, dynamic>{},
    );
    return InviteAcceptResult.fromJson(_mapOf(data));
  }

  /// 归档项目（`POST /projects/{id}/archive`）
  Future<void> archiveProject(int projectId) async {
    await _api.post('/projects/$projectId/archive');
  }

  /// 退出项目（`POST /projects/{id}/leave`）
  Future<void> leaveProject(int projectId) async {
    await _api.post('/projects/$projectId/leave');
  }
}

/// 项目任务分页拉取结果
///
/// [truncated] 为 true 表示撞到了 [ProjectsRepository.maxTaskPages] 安全上限，
/// 界面必须提示「仅显示前 N 条」，不能假装是全部任务。
class ProjectTasksResult {
  const ProjectTasksResult({
    required this.tasks,
    this.total,
    this.truncated = false,
  });

  final List<ProjectTask> tasks;

  /// 接口给出的任务总数；接口未返回时为 null
  final int? total;

  final bool truncated;

  int get length => tasks.length;

  bool get isEmpty => tasks.isEmpty;

  bool get isNotEmpty => tasks.isNotEmpty;
}

Map<String, dynamic> _mapOf(dynamic value) => _mapOrNull(value) ?? <String, dynamic>{};

Map<String, dynamic>? _mapOrNull(dynamic value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  return null;
}
