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
      high = (byPriority['high'] as num?)?.toInt() ??
          (byPriority['2'] as num?)?.toInt() ??
          0;
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

class ProjectItem {
  ProjectItem({
    required this.id,
    required this.name,
    required this.companyId,
    this.status,
    this.myRole,
  });

  final int id;
  final String name;
  final int companyId;
  final String? status;
  final String? myRole;

  factory ProjectItem.fromJson(Map<String, dynamic> json) => ProjectItem(
        id: json['id'] as int,
        name: (json['name'] ?? '') as String,
        companyId: (json['company_id'] as num?)?.toInt() ?? 0,
        status: json['status'] as String?,
        myRole: json['my_role'] as String?,
      );
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
    this.updatedAt,
    this.assigneeIds = const [],
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
  final String? updatedAt;
  final List<int> assigneeIds;
  final List<TreeNodeItem> children;

  bool get isDone =>
      progressStatus == 'done' || progressStatus == 'completed';

  bool isAssignedTo(int? userId) =>
      userId != null && assigneeIds.contains(userId);

  DateTime? get sortTime {
    for (final raw in [updatedAt, dueAt, startAt]) {
      if (raw == null || raw.isEmpty) continue;
      final t = DateTime.tryParse(raw);
      if (t != null) return t;
    }
    return null;
  }

  factory TreeNodeItem.fromJson(Map<String, dynamic> json) {
    final progress = json['progress_json'];
    final kids = json['children'];
    final assignees = json['assignees'];
    String? updated;
    if (progress is Map) {
      updated = progress['updated_at'] as String?;
    }
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
      updatedAt: updated,
      assigneeIds: assignees is List
          ? assignees
              .whereType<Map>()
              .map((e) => (e['user_id'] as num?)?.toInt())
              .whereType<int>()
              .toList()
          : const [],
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
