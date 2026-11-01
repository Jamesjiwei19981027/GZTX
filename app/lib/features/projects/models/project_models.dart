/// T03 项目与团队：接口出参模型
///
/// 全部字段口径对照 `frontend/src/api/backend.ts`、`frontend/src/api/shell.ts`
/// 与后端 `backend/app/api/v1/projects.py` 的实际出参，只解析界面需要的字段。
library;

dynamic _asMap(dynamic value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  return null;
}

List<Map<String, dynamic>> _asMapList(dynamic value) {
  final result = <Map<String, dynamic>>[];
  if (value is List) {
    for (final item in value) {
      final map = _asMap(item);
      if (map != null) result.add(map);
    }
  }
  return result;
}

String? _asString(dynamic value) {
  if (value is String) {
    final trimmed = value.trim();
    return trimmed.isEmpty ? null : trimmed;
  }
  return null;
}

int? _asInt(dynamic value) {
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value);
  return null;
}

bool _asBool(dynamic value) => value == true;

/// 项目成员（`GET /projects/{id}/members`）
class ProjectMember {
  const ProjectMember({
    required this.userId,
    this.nickname,
    this.username,
    this.displayName,
    this.avatarUrl,
    this.role,
    this.joinedAt,
  });

  final int userId;
  final String? nickname;
  final String? username;
  final String? displayName;
  final String? avatarUrl;
  final String? role;
  final String? joinedAt;

  factory ProjectMember.fromJson(Map<String, dynamic> json) {
    return ProjectMember(
      userId: _asInt(json['user_id']) ?? 0,
      nickname: _asString(json['nickname']),
      username: _asString(json['username']),
      displayName: _asString(json['display_name']),
      avatarUrl: _asString(json['avatar_url']),
      role: _asString(json['role']),
      joinedAt: _asString(json['joined_at']),
    );
  }

  /// 展示名：昵称 > 显示名 > 用户名 > 用户 ID 兜底
  String get name {
    if (nickname != null) return nickname!;
    if (displayName != null) return displayName!;
    if (username != null) return username!;
    return '用户$userId';
  }

  /// 头像首字
  String get initial =>
      name.isEmpty ? '?' : String.fromCharCode(name.runes.first);

  /// 是否项目负责人 / 管理员（对齐网页 `role === 'pm' || role === 'admin'`）
  bool get isManager {
    final value = (role ?? '').toLowerCase();
    return value == 'pm' || value == 'admin';
  }

  /// 角色中文标签
  String get roleLabel => isManager ? 'PM 负责人' : '成员';
}

/// 项目详情（`GET /projects/{id}`）
class ProjectDetail {
  const ProjectDetail({
    required this.id,
    required this.companyId,
    required this.name,
    this.status,
    this.memberCount,
    this.myRole,
    this.archivedAt,
    this.finalOwnerName,
    this.finalOwnerUserId,
  });

  final int id;
  final int? companyId;
  final String name;
  final String? status;
  final int? memberCount;
  final String? myRole;
  final String? archivedAt;
  final String? finalOwnerName;
  final int? finalOwnerUserId;

  factory ProjectDetail.fromJson(Map<String, dynamic> json) {
    final owner = _asMap(json['final_owner']);
    return ProjectDetail(
      id: _asInt(json['id']) ?? 0,
      companyId: _asInt(json['company_id']),
      name: _asString(json['name']) ?? '未命名项目',
      status: _asString(json['status']),
      memberCount: _asInt(json['member_count']),
      myRole: _asString(json['my_role']),
      archivedAt: _asString(json['archived_at']),
      finalOwnerName: owner == null
          ? null
          : (_asString(owner['nickname']) ?? _asString(owner['username'])),
      finalOwnerUserId: owner == null ? null : _asInt(owner['user_id']),
    );
  }

  bool get isArchived => status == 'archived';

  String get statusLabel => isArchived ? '已归档' : '进行中';

  String get initial =>
      name.isEmpty ? '?' : String.fromCharCode(name.runes.first);
}

/// 当前用户在该项目内的权限快照（`GET /projects/{id}/my-permissions`）
class ProjectPermissions {
  const ProjectPermissions({
    required this.role,
    required this.isPm,
    required this.isSuperadmin,
    required this.canEditAll,
    required this.viaDelegation,
    required this.canMove,
    required this.canDelete,
  });

  final String role;
  final bool isPm;
  final bool isSuperadmin;
  final bool canEditAll;
  final bool viaDelegation;
  final bool canMove;
  final bool canDelete;

  factory ProjectPermissions.fromJson(Map<String, dynamic> json) {
    return ProjectPermissions(
      role: _asString(json['role']) ?? 'outsider',
      isPm: _asBool(json['is_pm']),
      isSuperadmin: _asBool(json['is_superadmin']),
      canEditAll: _asBool(json['can_edit_all']),
      viaDelegation: _asBool(json['via_delegation']),
      canMove: _asBool(json['can_move']),
      canDelete: _asBool(json['can_delete']),
    );
  }

  /// 管理操作（归档、生成邀请、成员管理）可见性：对齐网页
  /// `permissions?.is_pm || permissions?.is_superadmin || permissions?.can_edit_all`
  bool get canManage => isPm || isSuperadmin || canEditAll;

  /// 当前角色中文标签
  String get roleLabel {
    if (isPm) return '项目负责人 (PM)';
    if (isSuperadmin) return '企业管理员';
    if (canEditAll && viaDelegation) return '受托管理人';
    return '项目成员';
  }

  /// 是否为项目成员（非外部观察者）
  bool get isMember => role != 'outsider';
}

/// 邀请凭证（`POST /projects/{id}/invitations`）
class ProjectInvitation {
  const ProjectInvitation({
    required this.id,
    required this.token,
    required this.status,
    this.expiresAt,
  });

  final int id;
  final String token;
  final String status;
  final String? expiresAt;

  factory ProjectInvitation.fromJson(Map<String, dynamic> json) {
    return ProjectInvitation(
      id: _asInt(json['id']) ?? 0,
      token: _asString(json['token']) ?? '',
      status: _asString(json['status']) ?? 'pending',
      expiresAt: _asString(json['expires_at']),
    );
  }
}

/// 接受邀请结果（`POST /projects/invitations/{token}/accept`）
class InviteAcceptResult {
  const InviteAcceptResult({required this.projectId, required this.role});

  final int projectId;
  final String role;

  factory InviteAcceptResult.fromJson(Map<String, dynamic> json) {
    return InviteAcceptResult(
      projectId: _asInt(json['project_id']) ?? 0,
      role: _asString(json['role']) ?? 'member',
    );
  }
}

/// 任务指派人（`assignees[]` / `assignee`）
class TaskAssigneeRef {
  const TaskAssigneeRef({
    required this.userId,
    required this.name,
    this.roleKey,
  });

  final int userId;
  final String name;
  final String? roleKey;

  factory TaskAssigneeRef.fromJson(Map<String, dynamic> json) {
    return TaskAssigneeRef(
      userId: _asInt(json['user_id']) ?? 0,
      name: _asString(json['display_name']) ??
          _asString(json['nickname']) ??
          _asString(json['username']) ??
          '用户${_asInt(json['user_id']) ?? 0}',
      roleKey: _asString(json['role_key']),
    );
  }
}

/// 项目任务（`GET /projects/{id}/tasks`）
///
/// 后端 `status` 为整型：0 待办 / 1 进行中 / 2 已完成（`backend/app/models/task.py`）。
class ProjectTask {
  const ProjectTask({
    required this.id,
    required this.title,
    required this.status,
    this.dueDate,
    this.assignees = const [],
  });

  final int id;
  final String title;
  final int status;
  final String? dueDate;
  final List<TaskAssigneeRef> assignees;

  factory ProjectTask.fromJson(Map<String, dynamic> json) {
    final assignees = <TaskAssigneeRef>[];
    for (final item in _asMapList(json['assignees'])) {
      assignees.add(TaskAssigneeRef.fromJson(item));
    }
    final single = _asMap(json['assignee']);
    if (assignees.isEmpty && single != null) {
      assignees.add(TaskAssigneeRef.fromJson(single));
    }
    return ProjectTask(
      id: _asInt(json['id']) ?? 0,
      title: _asString(json['title']) ?? '未命名任务',
      status: _asInt(json['status']) ?? 0,
      dueDate: _asString(json['due_date']),
      assignees: assignees,
    );
  }

  static const int statusTodo = 0;
  static const int statusInProgress = 1;
  static const int statusDone = 2;

  bool get isDone => status == statusDone;

  String get statusLabel {
    switch (status) {
      case statusDone:
        return '已完成';
      case statusInProgress:
        return '进行中';
      default:
        return '待办';
    }
  }

  String get assigneeSummary {
    if (assignees.isEmpty) return '未分配';
    return assignees.map((item) => item.name).join('、');
  }

  /// 是否指派给指定成员（对齐网页按 `assignees` / `assignee` 过滤）
  bool isAssignedTo(int userId) =>
      assignees.any((item) => item.userId == userId);
}
