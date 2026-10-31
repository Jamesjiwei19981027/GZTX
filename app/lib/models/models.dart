class ApiException implements Exception {
  ApiException(this.message, {this.statusCode, this.code});
  final String message;
  final int? statusCode;
  final int? code;
  @override
  String toString() => message;
}

class AppUser {
  AppUser({
    required this.id,
    required this.username,
    this.nickname,
    this.email,
    this.phone,
    this.emailVerified = false,
    this.phoneVerified = false,
  });

  final int id;
  final String username;
  final String? nickname;
  final String? email;
  final String? phone;
  final bool emailVerified;
  final bool phoneVerified;

  String get displayName =>
      (nickname != null && nickname!.trim().isNotEmpty) ? nickname!.trim() : username;

  bool get isFullyVerified => emailVerified && phoneVerified;

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
        id: json['id'] as int,
        username: (json['username'] ?? '') as String,
        nickname: json['nickname'] as String?,
        email: json['email'] as String?,
        phone: json['phone'] as String?,
        emailVerified: json['email_verified'] == true,
        phoneVerified: json['phone_verified'] == true,
      );
}

class TaskItem {
  TaskItem({
    required this.id,
    required this.title,
    this.description,
    required this.status,
    required this.priority,
    this.statusLabel,
    this.priorityLabel,
    this.dueDate,
    this.isOverdue = false,
    this.needsFollowUp = false,
    this.followUpReason,
    this.categoryName,
    this.tags = const [],
    this.createdAt,
    this.updatedAt,
    this.completedAt,
  });

  final int id;
  final String title;
  final String? description;
  final int status;
  final int priority;
  final String? statusLabel;
  final String? priorityLabel;
  final String? dueDate;
  final bool isOverdue;
  final bool needsFollowUp;
  final String? followUpReason;
  final String? categoryName;
  final List<String> tags;
  final String? createdAt;
  final String? updatedAt;
  final String? completedAt;

  bool get isDone => status == 2;

  factory TaskItem.fromJson(Map<String, dynamic> json) {
    final category = json['category'];
    final tagList = json['tags'];
    return TaskItem(
      id: json['id'] as int,
      title: (json['title'] ?? '') as String,
      description: json['description'] as String?,
      status: (json['status'] as num?)?.toInt() ?? 0,
      priority: (json['priority'] as num?)?.toInt() ?? 1,
      statusLabel: json['status_label'] as String?,
      priorityLabel: json['priority_label'] as String?,
      dueDate: json['due_date'] as String?,
      isOverdue: json['is_overdue'] == true,
      needsFollowUp: json['needs_follow_up'] == true,
      followUpReason: json['follow_up_reason'] as String?,
      categoryName: category is Map ? category['name'] as String? : null,
      tags: tagList is List
          ? tagList
              .whereType<Map>()
              .map((e) => (e['name'] ?? '').toString())
              .where((e) => e.isNotEmpty)
              .toList()
          : const [],
      createdAt: json['created_at'] as String?,
      updatedAt: json['updated_at'] as String?,
      completedAt: json['completed_at'] as String?,
    );
  }
}

class TaskStats {
  TaskStats({
    required this.total,
    required this.completed,
    required this.pending,
    required this.inProgress,
    required this.overdue,
    required this.completionRate,
    this.highPriority = 0,
  });

  final int total;
  final int completed;
  final int pending;
  final int inProgress;
  final int overdue;
  final double completionRate;
  final int highPriority;

  factory TaskStats.fromJson(Map<String, dynamic> json) {
    final byPriority = json['by_priority'];
    int high = 0;
    if (byPriority is Map) {
      // 后端实际形状是 {"high": {"total": n, "completed": m}, ...}，
      // 原来写成 `byPriority['high'] as num?` —— 拿 Map 强转 num 在 Dart 里
      // 直接抛 TypeError（as num? 只放行 null 与 num），异常冲出 Future.wait，
      // 导致 taskItems 从来赋不上值：APP 的任务列表和仪表盘一直是空的。
      final h = byPriority['high'] ?? byPriority['2'];
      if (h is Map) {
        final t = (h['total'] as num?)?.toInt() ?? 0;
        final d = (h['completed'] as num?)?.toInt() ?? 0;
        high = t - d < 0 ? 0 : t - d; // 未完成的高优数量，与 Web 口径一致
      } else if (h is num) {
        high = h.toInt();
      }
    } else if (byPriority is List) {
      for (final item in byPriority.whereType<Map>()) {
        if (item['priority'] == 2 || item['label'] == 'high') {
          high = (item['count'] as num?)?.toInt() ?? 0;
        }
      }
    }
    return TaskStats(
      total: (json['total'] as num?)?.toInt() ?? 0,
      completed: (json['completed'] as num?)?.toInt() ?? 0,
      pending: (json['pending'] as num?)?.toInt() ?? 0,
      inProgress: (json['in_progress'] as num?)?.toInt() ?? 0,
      overdue: (json['overdue'] as num?)?.toInt() ?? 0,
      completionRate: (json['completion_rate'] as num?)?.toDouble() ?? 0,
      highPriority: high,
    );
  }
}

class CompanyItem {
  CompanyItem({
    required this.id,
    required this.name,
    this.slug,
    this.status,
    this.isSuperAdmin = false,
    this.isOrgLeader = false,
  });

  final int id;
  final String name;
  final String? slug;
  final String? status;
  final bool isSuperAdmin;
  final bool isOrgLeader;

  factory CompanyItem.fromJson(Map<String, dynamic> json) {
    final membership = json['my_membership'];
    return CompanyItem(
      id: json['id'] as int,
      name: (json['name'] ?? '') as String,
      slug: json['slug'] as String?,
      status: json['status'] as String?,
      isSuperAdmin: membership is Map && membership['is_super_admin'] == true,
      isOrgLeader: membership is Map && membership['is_org_leader'] == true,
    );
  }
}

class ProjectOwner {
  ProjectOwner({
    required this.userId,
    this.username,
    this.nickname,
    this.avatarUrl,
    this.isMe = false,
  });

  final int userId;
  final String? username;
  final String? nickname;
  final String? avatarUrl;
  final bool isMe;

  String get displayName {
    if (nickname != null && nickname!.trim().isNotEmpty) return nickname!.trim();
    if (username != null && username!.trim().isNotEmpty) return username!.trim();
    return '用户$userId';
  }

  factory ProjectOwner.fromJson(Map<String, dynamic> json) => ProjectOwner(
        userId: (json['user_id'] as num).toInt(),
        username: json['username'] as String?,
        nickname: json['nickname'] as String?,
        avatarUrl: json['avatar_url'] as String?,
        isMe: json['is_me'] == true,
      );
}

class ProjectItem {
  ProjectItem({
    required this.id,
    required this.name,
    required this.companyId,
    this.status,
    this.myRole,
    this.pmUserId,
    this.createdBy,
    this.finalOwner,
    this.finalOwnerAlongDelta = 0,
  });

  final int id;
  final String name;
  final int companyId;
  final String? status;
  final String? myRole;
  final int? pmUserId;
  final int? createdBy;
  final ProjectOwner? finalOwner;

  /// 终责卡片沿主干的偏移，服务端持久化。
  /// 曾经只存 SharedPreferences，PM 拖完不跨端同步、换设备即丢。
  final double finalOwnerAlongDelta;

  factory ProjectItem.fromJson(Map<String, dynamic> json) {
    final owner = json['final_owner'];
    return ProjectItem(
      id: json['id'] as int,
      name: (json['name'] ?? '') as String,
      companyId: (json['company_id'] as num?)?.toInt() ?? 0,
      status: json['status'] as String?,
      myRole: json['my_role'] as String?,
      pmUserId: (json['final_owner_user_id'] as num?)?.toInt() ??
          (json['pm_user_id'] as num?)?.toInt(),
      createdBy: (json['created_by'] as num?)?.toInt(),
      finalOwner: owner is Map
          ? ProjectOwner.fromJson(Map<String, dynamic>.from(owner))
          : null,
      finalOwnerAlongDelta:
          (json['final_owner_along_delta'] as num?)?.toDouble() ?? 0,
    );
  }

  ProjectItem copyWith({double? finalOwnerAlongDelta}) => ProjectItem(
        id: id,
        name: name,
        companyId: companyId,
        status: status,
        myRole: myRole,
        pmUserId: pmUserId,
        createdBy: createdBy,
        finalOwner: finalOwner,
        finalOwnerAlongDelta:
            finalOwnerAlongDelta ?? this.finalOwnerAlongDelta,
      );
}

class NodeAssignee {
  NodeAssignee({
    required this.userId,
    required this.roleKey,
    required this.displayName,
    this.avatarUrl,
  });

  final int userId;
  final String roleKey;
  final String displayName;
  final String? avatarUrl;

  factory NodeAssignee.fromJson(Map<String, dynamic> json) {
    final name = (json['display_name'] as String?)?.trim();
    final nick = (json['nickname'] as String?)?.trim();
    final user = (json['username'] as String?)?.trim();
    return NodeAssignee(
      userId: (json['user_id'] as num).toInt(),
      roleKey: (json['role_key'] as String?) ?? 'primary',
      displayName: (name != null && name.isNotEmpty)
          ? name
          : (nick != null && nick.isNotEmpty)
              ? nick
              : (user != null && user.isNotEmpty)
                  ? user
                  : '用户${json['user_id']}',
      avatarUrl: json['avatar_url'] as String?,
    );
  }
}

class ProjectMemberItem {
  ProjectMemberItem({
    required this.userId,
    required this.displayName,
    this.avatarUrl,
    this.role,
  });

  final int userId;
  final String displayName;
  final String? avatarUrl;
  final String? role;

  factory ProjectMemberItem.fromJson(Map<String, dynamic> json) {
    final name = (json['display_name'] as String?)?.trim();
    final nick = (json['nickname'] as String?)?.trim();
    final user = (json['username'] as String?)?.trim();
    return ProjectMemberItem(
      userId: (json['user_id'] as num).toInt(),
      displayName: (name != null && name.isNotEmpty)
          ? name
          : (nick != null && nick.isNotEmpty)
              ? nick
              : (user != null && user.isNotEmpty)
                  ? user
                  : '用户${json['user_id']}',
      avatarUrl: json['avatar_url'] as String?,
      role: json['role'] as String?,
    );
  }
}

class TreeNodeItem {
  TreeNodeItem({
    required this.id,
    required this.title,
    this.parentId,
    this.nodeTypeKey,
    this.progressStatus,
    this.progressPercent,
    this.description,
    this.depth = 0,
    this.sortOrder = 0,
    this.startAt,
    this.dueAt,
    this.milestoneAt,
    this.updatedAt,
    this.assignees = const [],
    this.children = const [],
  });

  final int id;
  final String title;
  final int? parentId;
  final String? nodeTypeKey;
  final String? progressStatus;
  final num? progressPercent;
  final String? description;
  final int depth;
  final int sortOrder;
  final String? startAt;
  final String? dueAt;
  final String? milestoneAt;
  final String? updatedAt;
  final List<NodeAssignee> assignees;
  final List<TreeNodeItem> children;

  List<int> get assigneeIds => assignees.map((e) => e.userId).toList();

  bool get isPerson => nodeTypeKey == 'person';

  NodeAssignee? get primaryAssignee {
    if (assignees.isEmpty) return null;
    final primary = assignees.where((a) => a.roleKey == 'primary');
    return primary.isNotEmpty ? primary.first : assignees.first;
  }

  bool get isDone =>
      progressStatus == 'done' || progressStatus == 'completed';

  bool isAssignedTo(int? userId) =>
      userId != null && assigneeIds.contains(userId);

  DateTime? get eventTime {
    for (final raw in [milestoneAt, dueAt, startAt, updatedAt]) {
      if (raw == null || raw.isEmpty) continue;
      final t = DateTime.tryParse(raw);
      if (t != null) return t;
    }
    return null;
  }

  DateTime? get sortTime => eventTime;

  factory TreeNodeItem.fromJson(Map<String, dynamic> json) {
    final progress = json['progress_json'];
    final kids = json['children'];
    final assigneesRaw = json['assignees'];
    String? updated;
    if (progress is Map) {
      updated = progress['updated_at'] as String?;
    }
    final assignees = assigneesRaw is List
        ? assigneesRaw
            .whereType<Map>()
            .map((e) => NodeAssignee.fromJson(Map<String, dynamic>.from(e)))
            .toList()
        : const <NodeAssignee>[];
    return TreeNodeItem(
      id: json['id'] as int,
      title: (json['title'] ?? '') as String,
      parentId: (json['parent_id'] as num?)?.toInt(),
      nodeTypeKey: json['node_type_key'] as String?,
      progressStatus: progress is Map ? progress['status'] as String? : null,
      progressPercent: progress is Map ? progress['percent'] as num? : null,
      description: json['description'] as String?,
      depth: (json['depth'] as num?)?.toInt() ?? 0,
      sortOrder: (json['sort_order'] as num?)?.toInt() ?? 0,
      startAt: json['start_at'] as String?,
      dueAt: json['due_at'] as String?,
      milestoneAt: json['milestone_at'] as String?,
      updatedAt: updated,
      assignees: assignees,
      children: kids is List
          ? kids
              .whereType<Map>()
              .map((e) => TreeNodeItem.fromJson(Map<String, dynamic>.from(e)))
              .toList()
          : const [],
    );
  }
}

class AgentItem {
  AgentItem({
    required this.id,
    required this.name,
    required this.kind,
    required this.scene,
    this.systemPrompt,
  });

  final int id;
  final String name;
  final String kind;
  final String scene;
  final String? systemPrompt;

  factory AgentItem.fromJson(Map<String, dynamic> json) => AgentItem(
        id: json['id'] as int,
        name: (json['name'] ?? '') as String,
        kind: (json['kind'] ?? '') as String,
        scene: (json['scene'] ?? 'general') as String,
        systemPrompt: json['system_prompt'] as String?,
      );
}

class SmtpConfig {
  SmtpConfig({
    this.host = '',
    this.port = 465,
    this.user = '',
    this.from = '',
    this.hasPassword = false,
    this.configured = false,
    this.source = 'none',
  });

  final String host;
  final int port;
  final String user;
  final String from;
  final bool hasPassword;
  final bool configured;
  final String source;

  factory SmtpConfig.fromJson(Map<String, dynamic>? json) {
    if (json == null) return SmtpConfig();
    return SmtpConfig(
      host: (json['smtp_host'] ?? '') as String,
      port: (json['smtp_port'] as num?)?.toInt() ?? 465,
      user: (json['smtp_user'] ?? '') as String,
      from: (json['smtp_from'] ?? '') as String,
      hasPassword: json['has_password'] == true,
      configured: json['configured'] == true ||
          (json['has_password'] == true && (json['smtp_host'] ?? '').toString().isNotEmpty),
      source: (json['smtp_source'] ?? 'none') as String,
    );
  }
}

class LlmConfig {
  LlmConfig({
    this.provider = 'fake',
    this.baseUrl = '',
    this.model = 'fake',
    this.temperature = 0.2,
    this.maxTokens = 1024,
    this.enabled = false,
    this.useForAgent = true,
    this.useForJudge = false,
    this.hasApiKey = false,
    this.configured = false,
    this.presets = const {},
  });

  final String provider;
  final String baseUrl;
  final String model;
  final double temperature;
  final int maxTokens;
  final bool enabled;
  final bool useForAgent;
  final bool useForJudge;
  final bool hasApiKey;
  final bool configured;
  final Map<String, dynamic> presets;

  factory LlmConfig.fromJson(Map<String, dynamic>? json) {
    if (json == null) return LlmConfig();
    return LlmConfig(
      provider: (json['provider'] ?? 'fake') as String,
      baseUrl: (json['base_url'] ?? '') as String,
      model: (json['model'] ?? 'fake') as String,
      temperature: (json['temperature'] as num?)?.toDouble() ?? 0.2,
      maxTokens: (json['max_tokens'] as num?)?.toInt() ?? 1024,
      enabled: json['enabled'] == true,
      useForAgent: json['use_for_agent'] != false,
      useForJudge: json['use_for_judge'] == true,
      hasApiKey: json['has_api_key'] == true,
      configured: json['configured'] == true,
      presets: json['presets'] is Map
          ? Map<String, dynamic>.from(json['presets'] as Map)
          : const {},
    );
  }
}

class EvidenceItem {
  EvidenceItem({
    required this.id,
    this.status,
    this.summary,
    this.createdAt,
  });

  final int id;
  final String? status;
  final String? summary;
  final String? createdAt;

  factory EvidenceItem.fromJson(Map<String, dynamic> json) => EvidenceItem(
        id: (json['id'] ?? json['package_id'] ?? 0) as int,
        status: json['status'] as String?,
        summary: (json['summary_text'] ?? json['summary']) as String?,
        createdAt: json['created_at'] as String?,
      );
}

/// AI 汇报的跨端最小数据模型，字段保持宽松以兼容服务端扩展。
class ReportItem {
  ReportItem({
    required this.id,
    this.projectId,
    this.projectName,
    this.status,
    this.title,
    this.summary,
    this.content,
    this.createdAt,
    this.updatedAt,
    this.sources = const [],
    this.conflicts = const [],
    this.stale = false,
    this.expiresAt,
    this.sourceCount = 0,
    this.payload = const {},
  });

  final int id;
  final int? projectId;
  final String? projectName;
  final String? status;
  final String? title;
  final String? summary;
  final String? content;
  final String? createdAt;
  final String? updatedAt;
  final List<dynamic> sources;
  final List<dynamic> conflicts;
  final bool stale;
  final String? expiresAt;
  final int sourceCount;
  final Map<String, dynamic> payload;

  factory ReportItem.fromJson(Map<String, dynamic> json) => ReportItem(
        id: (json['id'] ?? json['report_id'] ?? 0) is num
            ? ((json['id'] ?? json['report_id'] ?? 0) as num).toInt()
            : int.tryParse('${json['id'] ?? json['report_id'] ?? 0}') ?? 0,
        projectId: (json['project_id'] as num?)?.toInt(),
        projectName: json['project_name'] as String?,
        status: json['status'] as String?,
        title: json['title'] as String?,
        summary: (json['summary_text'] ?? json['summary']) as String?,
        content: (json['content'] ?? json['body']) as String?,
        createdAt: json['created_at'] as String?,
        updatedAt: json['updated_at'] as String?,
        sources: json['sources'] is List ? json['sources'] as List : const [],
        conflicts: json['conflicts'] is List ? json['conflicts'] as List : const [],
        stale: json['stale'] == true || json['is_stale'] == true,
        expiresAt: json['expires_at'] as String?,
        sourceCount: (json['source_count'] as num?)?.toInt() ?? 0,
        payload: json['payload_json'] is Map
            ? Map<String, dynamic>.from(json['payload_json'] as Map)
            : const {},
      );
}

class ReportInboxItem {
  ReportInboxItem({
    required this.id,
    this.title,
    this.message,
    this.eventType,
    this.read = false,
    this.createdAt,
    this.reportId,
  });

  final int id;
  final String? title;
  final String? message;
  final String? eventType;
  final bool read;
  final String? createdAt;
  final int? reportId;

  factory ReportInboxItem.fromJson(Map<String, dynamic> json) => ReportInboxItem(
        id: (json['id'] as num?)?.toInt() ?? 0,
        title: json['title'] as String?,
        message: (json['content'] ?? json['message'] ?? json['body']) as String?,
        eventType: json['event_type'] as String?,
        read: json['read'] == true || json['is_read'] == true,
        createdAt: json['created_at'] as String?,
        reportId: (json['report_id'] as num?)?.toInt(),
      );
}
