library;

import 'package:intl/intl.dart';

import '../../../core/time/time_utils.dart';

/// T07 AI 汇报数据模型。
///
/// 字段严格对齐后端 `backend/app/api/v1/reports.py`：
/// - 项目维度列表：`GET /projects/{id}/agent-reports`
/// - 旧版“我的汇报 / 收件箱 / 详情”：`GET /reports/my`、`GET /reports/inbox`、`GET /reports/{id}`
/// - 汇总：`POST /projects/{id}/agent-reports/aggregate`、`POST /companies/{id}/leadership-reports/aggregate`
/// 汇报状态中文文案
const Map<String, String> reportStatusLabels = {
  'draft': '草稿',
  'submitted': '已正式提交',
  'aggregated': '已聚合到项目汇报',
};

String reportStatusLabel(String? status) =>
    reportStatusLabels[status] ?? '未知状态';

/// 来源类型中文文案（对齐网页版 `ReportSources.tsx`）
const Map<String, String> reportSourceLabels = {
  'task': '任务事实',
  'evidence': '材料证据',
  'evidence_package': '材料证据',
  'evidence_file': '材料证据',
  'tree_node': '人轴节点',
  'agent_message': '会话记录',
  'progress_record': '进度记录',
};

String reportSourceLabel(String? type) =>
    reportSourceLabels[(type ?? '').toLowerCase()] ?? '引用数据';

/// 来源类型对应的自适应图标名（必须是 `AppIcon` 已支持的名称）
String reportSourceIcon(String? type) {
  switch ((type ?? '').toLowerCase()) {
    case 'task':
      return 'check-circle';
    case 'evidence':
    case 'evidence_package':
    case 'evidence_file':
      return 'file';
    case 'tree_node':
      return 'axis';
    case 'agent_message':
      return 'messages';
    case 'progress_record':
      return 'clock';
    default:
      return 'file';
  }
}

/// 任务快照（后端 `payload_json.task_snapshot`）
class ReportTaskSnapshot {
  const ReportTaskSnapshot({
    required this.id,
    required this.title,
    this.status,
    this.needsFollowUp = false,
    this.comment,
  });

  final int id;
  final String title;
  final String? status;
  final bool needsFollowUp;
  final String? comment;

  String get statusLabel => switch (status) {
        '0' || 'todo' || 'pending' => '待办',
        '1' || 'in_progress' => '进行中',
        '2' || 'done' || 'completed' => '已完成',
        _ => '未知状态',
      };

  factory ReportTaskSnapshot.fromJson(Map<String, dynamic> json) {
    return ReportTaskSnapshot(
      id: (json['id'] as num?)?.toInt() ?? 0,
      title: (json['title'] as String?)?.trim().isNotEmpty == true
          ? json['title'] as String
          : '未命名事项',
      status: json['status']?.toString(),
      needsFollowUp: json['needs_follow_up'] == true,
      comment: json['comment'] as String?,
    );
  }
}

/// 材料快照（后端 `payload_json.evidence_snapshot`）
class ReportEvidenceSnapshot {
  const ReportEvidenceSnapshot({
    required this.id,
    this.summary,
    this.status,
    this.fileCount = 0,
  });

  final int id;
  final String? summary;
  final String? status;
  final int fileCount;

  String get statusLabel => switch (status) {
        'adopted' => '已采纳',
        'rejected' => '已退回',
        'superseded' => '已被替代',
        'verified' => '已核验',
        'pending' => '待验收',
        'submitted' || 'pending' || 'pending_review' => '待核验',
        'draft' => '草稿',
        _ => '未知状态',
      };

  factory ReportEvidenceSnapshot.fromJson(Map<String, dynamic> json) {
    final files = json['files'];
    return ReportEvidenceSnapshot(
      id: (json['id'] as num?)?.toInt() ?? 0,
      summary: json['summary'] as String?,
      status: json['status']?.toString(),
      fileCount: files is List ? files.length : 0,
    );
  }
}

/// 汇报来源
class ReportSource {
  const ReportSource({
    this.id,
    required this.sourceType,
    this.sourceId,
    this.excerpt,
    this.metadata = const {},
  });

  final int? id;
  final String sourceType;
  final int? sourceId;
  final String? excerpt;
  final Map<String, dynamic> metadata;

  String get typeLabel => reportSourceLabel(sourceType);

  String get title {
    final value = excerpt?.trim();
    if (value != null && value.isNotEmpty) return value;
    return '关联$typeLabel';
  }

  String get detail =>
      sourceId == null ? typeLabel : '$typeLabel · 编号 ${sourceId!}';

  factory ReportSource.fromJson(Map<String, dynamic> json) {
    return ReportSource(
      id: (json['id'] as num?)?.toInt(),
      sourceType: (json['source_type'] as String?)?.trim().isNotEmpty == true
          ? json['source_type'] as String
          : 'unknown',
      sourceId: (json['source_id'] as num?)?.toInt(),
      excerpt: json['excerpt'] as String?,
      metadata: json['metadata'] is Map
          ? (json['metadata'] as Map).cast<String, dynamic>()
          : const {},
    );
  }

  Map<String, dynamic> toJson() => {
        'source_type': sourceType,
        if (sourceId != null) 'source_id': sourceId,
        if (excerpt != null) 'excerpt': excerpt,
        if (metadata.isNotEmpty) 'metadata': metadata,
      };
}

/// 智能体汇报
class AgentReport {
  const AgentReport({
    required this.id,
    this.projectId,
    this.bindingId,
    this.authorUserId,
    this.parentUserId,
    required this.status,
    required this.summaryText,
    this.payloadJson = const {},
    this.sourceCount = 0,
    this.sources = const [],
    this.read = false,
    this.readAt,
    this.createdAt,
    this.submittedAt,
    this.canReview = false,
    this.review,
  });

  final int id;
  final int? projectId;
  final int? bindingId;
  final int? authorUserId;
  final int? parentUserId;
  final String status;
  final String summaryText;
  final Map<String, dynamic> payloadJson;
  final int sourceCount;
  final List<ReportSource> sources;
  final bool read;
  final String? readAt;
  final String? createdAt;
  final String? submittedAt;
  final bool canReview;
  final ReportReviewResult? review;

  bool get isSubmitted => status == 'submitted' || status == 'aggregated';
  bool get isUnread => !read && (readAt == null || readAt!.isEmpty);
  String get statusLabel => reportStatusLabel(status);
  String get summaryPreview {
    final text = summaryText.trim();
    if (text.isEmpty) return '工作进展汇报';
    return text.length <= 26 ? text : text.substring(0, 26);
  }

  List<ReportTaskSnapshot> get taskSnapshots {
    final raw = payloadJson['task_snapshot'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map(
            (item) => ReportTaskSnapshot.fromJson(item.cast<String, dynamic>()))
        .toList(growable: false);
  }

  List<ReportEvidenceSnapshot> get evidenceSnapshots {
    final raw = payloadJson['evidence_snapshot'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((item) =>
            ReportEvidenceSnapshot.fromJson(item.cast<String, dynamic>()))
        .toList(growable: false);
  }

  AgentReport copyWith({bool? read, String? readAt, String? status}) {
    return AgentReport(
      id: id,
      projectId: projectId,
      bindingId: bindingId,
      authorUserId: authorUserId,
      parentUserId: parentUserId,
      status: status ?? this.status,
      summaryText: summaryText,
      payloadJson: payloadJson,
      sourceCount: sourceCount,
      sources: sources,
      read: read ?? this.read,
      readAt: readAt ?? this.readAt,
      createdAt: createdAt,
      submittedAt: submittedAt,
      canReview: canReview,
      review: review,
    );
  }

  factory AgentReport.fromJson(Map<String, dynamic> json) {
    final rawSources = json['sources'];
    final sources = <ReportSource>[];
    if (rawSources is List) {
      for (final item in rawSources) {
        if (item is Map) {
          sources.add(ReportSource.fromJson(item.cast<String, dynamic>()));
        }
      }
    }
    final readAt = json['read_at'] as String?;
    return AgentReport(
      id: (json['id'] as num?)?.toInt() ?? 0,
      projectId: (json['project_id'] as num?)?.toInt(),
      bindingId: (json['binding_id'] as num?)?.toInt(),
      authorUserId: (json['author_user_id'] as num?)?.toInt(),
      parentUserId: (json['parent_user_id'] as num?)?.toInt(),
      status: (json['status'] as String?) ?? 'draft',
      summaryText:
          (json['summary_text'] ?? json['summary'] ?? json['content'] ?? '')
              .toString(),
      payloadJson: json['payload_json'] is Map
          ? (json['payload_json'] as Map).cast<String, dynamic>()
          : const {},
      sourceCount: (json['source_count'] as num?)?.toInt() ?? sources.length,
      sources: sources,
      read:
          json['read'] == true || (readAt != null && readAt.trim().isNotEmpty),
      readAt: readAt,
      createdAt: json['created_at'] as String?,
      submittedAt: json['submitted_at'] as String?,
      canReview: json['can_review'] == true,
      review: ReportReviewResult.parse(json['review'] ??
          (json['payload_json'] is Map
              ? json['payload_json']['review']
              : null)),
    );
  }
}

class ReportReviewResult {
  const ReportReviewResult(
      {required this.decision,
      required this.comment,
      this.reviewerUserId,
      this.reviewedAt});
  final String decision;
  final String comment;
  final int? reviewerUserId;
  final String? reviewedAt;
  String get label => decision == 'approved'
      ? '核验通过'
      : decision == 'returned'
          ? '退回修改'
          : '待核验';
  static ReportReviewResult? parse(dynamic value) {
    if (value is! Map) return null;
    return ReportReviewResult(
        decision: '${value['decision'] ?? ''}',
        comment: '${value['comment'] ?? ''}',
        reviewerUserId: (value['reviewer_user_id'] as num?)?.toInt(),
        reviewedAt: value['reviewed_at'] as String?);
  }
}

class PublishedReportSummary {
  const PublishedReportSummary(
      {required this.id,
      required this.projectId,
      required this.status,
      required this.summaryText,
      this.createdAt,
      this.publishedAt,
      this.publisherName});
  final int id;
  final int projectId;
  final String status;
  final String summaryText;
  final String? createdAt;
  final String? publishedAt;
  final String? publisherName;
  bool get isPublished => status == 'published';
  factory PublishedReportSummary.fromJson(Map<String, dynamic> json) =>
      PublishedReportSummary(
        id: (json['id'] as num?)?.toInt() ?? 0,
        projectId: (json['project_id'] as num?)?.toInt() ?? 0,
        status: '${json['status'] ?? ''}',
        summaryText: '${json['summary_text'] ?? ''}',
        createdAt: json['created_at'] as String?,
        publishedAt: json['published_at'] as String?,
        publisherName: json['published_by_name'] as String?,
      );
}

class ReportSummaryList {
  const ReportSummaryList({this.items = const [], this.canPublish = false});
  final List<PublishedReportSummary> items;
  final bool canPublish;
}

/// 项目汇报智能体绑定
class ReportAgentBinding {
  const ReportAgentBinding({
    required this.id,
    required this.companyId,
    required this.projectId,
    this.userId,
    required this.agentDefinitionId,
    required this.role,
    required this.isActive,
  });

  final int id;
  final int companyId;
  final int projectId;
  final int? userId;
  final int agentDefinitionId;
  final String role;
  final bool isActive;

  bool get isProjectAgent => role == 'project';
  String get roleLabel => isProjectAgent ? '项目汇报智能体' : '个人项目汇报智能体';

  factory ReportAgentBinding.fromJson(Map<String, dynamic> json) {
    return ReportAgentBinding(
      id: (json['id'] as num?)?.toInt() ?? 0,
      companyId: (json['company_id'] as num?)?.toInt() ?? 0,
      projectId: (json['project_id'] as num?)?.toInt() ?? 0,
      userId: (json['user_id'] as num?)?.toInt(),
      agentDefinitionId: (json['agent_definition_id'] as num?)?.toInt() ?? 0,
      role: (json['role'] as String?) ?? 'member',
      isActive: json['is_active'] != false,
    );
  }
}

/// 项目成员（`GET /projects/{id}/members`）
class ReportMember {
  const ReportMember({
    required this.userId,
    required this.displayName,
    this.role,
    this.leftAt,
  });

  final int userId;
  final String displayName;
  final String? role;
  final String? leftAt;

  bool get isActive => leftAt == null || leftAt!.isEmpty;

  String get roleLabel {
    switch ((role ?? '').toLowerCase()) {
      case 'pm':
      case 'owner':
        return '项目负责人';
      case 'admin':
        return '管理员';
      case 'member':
        return '项目成员';
      default:
        return role?.trim().isNotEmpty == true ? role! : '项目成员';
    }
  }

  factory ReportMember.fromJson(Map<String, dynamic> json) {
    final name =
        (json['display_name'] ?? json['nickname'] ?? json['username'] ?? '')
            .toString()
            .trim();
    return ReportMember(
      userId: (json['user_id'] as num?)?.toInt() ??
          (json['id'] as num?)?.toInt() ??
          0,
      displayName: name.isEmpty ? '项目成员' : name,
      role: json['role'] as String?,
      leftAt: json['left_at'] as String?,
    );
  }
}

/// 项目汇总封装
class ProjectReportAggregate {
  const ProjectReportAggregate({
    required this.id,
    required this.projectId,
    required this.status,
    required this.summaryText,
    this.payloadJson = const {},
    this.reportIds = const [],
    this.sourceCount = 0,
  });

  final int id;
  final int projectId;
  final String status;
  final String summaryText;
  final Map<String, dynamic> payloadJson;
  final List<int> reportIds;
  final int sourceCount;

  factory ProjectReportAggregate.fromJson(Map<String, dynamic> json) {
    final ids = json['report_ids'];
    return ProjectReportAggregate(
      id: (json['id'] as num?)?.toInt() ?? 0,
      projectId: (json['project_id'] as num?)?.toInt() ?? 0,
      status: (json['status'] as String?) ?? '',
      summaryText: (json['summary_text'] as String?) ?? '',
      payloadJson: json['payload_json'] is Map
          ? (json['payload_json'] as Map).cast<String, dynamic>()
          : const {},
      reportIds: ids is List
          ? ids.map((item) => (item as num).toInt()).toList(growable: false)
          : const [],
      sourceCount: (json['source_count'] as num?)?.toInt() ?? 0,
    );
  }
}

/// 领导层汇报
class LeadershipReport {
  const LeadershipReport({
    required this.id,
    required this.companyId,
    required this.leaderUserId,
    required this.status,
    required this.summaryText,
    this.payloadJson = const {},
    this.createdAt,
  });

  final int id;
  final int companyId;
  final int leaderUserId;
  final String status;
  final String summaryText;
  final Map<String, dynamic> payloadJson;
  final String? createdAt;

  factory LeadershipReport.fromJson(Map<String, dynamic> json) {
    return LeadershipReport(
      id: (json['id'] as num?)?.toInt() ?? 0,
      companyId: (json['company_id'] as num?)?.toInt() ?? 0,
      leaderUserId: (json['leader_user_id'] as num?)?.toInt() ?? 0,
      status: (json['status'] as String?) ?? '',
      summaryText: (json['summary_text'] as String?) ?? '',
      payloadJson: json['payload_json'] is Map
          ? (json['payload_json'] as Map).cast<String, dynamic>()
          : const {},
      createdAt: json['created_at'] as String?,
    );
  }
}

/// 智能体对话回复
class AgentChatReply {
  const AgentChatReply({
    required this.sessionId,
    required this.reply,
    required this.channel,
  });

  final int sessionId;
  final String reply;
  final String channel;

  factory AgentChatReply.fromJson(Map<String, dynamic> json) {
    return AgentChatReply(
      sessionId: (json['session_id'] as num?)?.toInt() ?? 0,
      reply: (json['reply'] as String?)?.trim().isNotEmpty == true
          ? json['reply'] as String
          : '已记录您提供的事实与进展。',
      channel: (json['channel'] as String?) ?? 'web',
    );
  }
}

/// 本地日期时间展示：`2月3日 14:30`
String formatReportMonthDayTime(String? iso) {
  final local = parseApiDateTime(iso);
  if (local == null) return '';
  return DateFormat('M月d日 HH:mm').format(local);
}

/// 本地完整时间展示：`2026-02-03 14:30`
String formatReportFullDateTime(String? iso) {
  final local = parseApiDateTime(iso);
  if (local == null) return '';
  return DateFormat('yyyy-MM-dd HH:mm').format(local);
}

/// 本地时间（时:分）
String formatReportTime(String? iso) {
  final local = parseApiDateTime(iso);
  if (local == null) return '';
  return DateFormat('HH:mm').format(local);
}

/// 汇报周期文案（本周一至周日），对齐网页版计算方式
String reportPeriodLabel(DateTime now) {
  final day = now.weekday;
  final monday =
      DateTime(now.year, now.month, now.day).subtract(Duration(days: day - 1));
  final sunday = monday.add(const Duration(days: 6));
  return '${monday.month} 月 ${monday.day} 日—${sunday.month} 月 ${sunday.day} 日';
}
