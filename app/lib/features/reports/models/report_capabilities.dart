library;

import '../../../core/errors/app_error.dart';
import 'report_models.dart';

/// 汇报链路能力校验与状态解释。
///
/// 逐条对齐网页版 `frontend/src/mobile/features/reports/reportCapabilities.ts`：
/// 直属领导不能是自己、没有独立 AI 回执不虚构节点、草稿按用户+项目隔离、
/// 资料差异从汇总载荷读取。
/// 直属领导判定结果
class SupervisorResolution {
  const SupervisorResolution({
    required this.isValid,
    required this.name,
    required this.id,
    required this.status,
    required this.isSelf,
    this.avatar,
    this.role,
  });

  final bool isValid;
  final String name;
  final String id;
  final String status; // confirmed | invalid_self | unassigned
  final bool isSelf;
  final String? avatar;
  final String? role;

  bool get isUnassigned => status == 'unassigned';
}

/// 严格判定直属领导（直属领导绝对不能是自己）
SupervisorResolution resolveDirectSupervisor({
  required List<ReportMember> members,
  required int? currentUserId,
  required int? parentUserId,
}) {
  if (parentUserId == null || parentUserId <= 0) {
    return const SupervisorResolution(
      isValid: false,
      name: '未指定直属领导',
      id: '',
      status: 'unassigned',
      isSelf: false,
      role: '人轴关系待确定',
    );
  }

  if (currentUserId != null && parentUserId == currentUserId) {
    return SupervisorResolution(
      isValid: false,
      name: '直属领导不能是自己',
      id: '$parentUserId',
      status: 'invalid_self',
      isSelf: true,
      role: '违反责任链原则',
    );
  }

  for (final member in members) {
    if (member.userId == parentUserId) {
      return SupervisorResolution(
        isValid: true,
        name: member.displayName,
        id: '$parentUserId',
        status: 'confirmed',
        isSelf: false,
        role: member.roleLabel,
      );
    }
  }

  return SupervisorResolution(
    isValid: true,
    name: '直属领导（编号 $parentUserId）',
    id: '$parentUserId',
    status: 'confirmed',
    isSelf: false,
    role: '人轴直属领导',
  );
}

/// 送达与处理状态解释（G01：没有独立 AI 回执字段，不虚构四个全绿节点）
class ReportDeliveryStatus {
  const ReportDeliveryStatus({
    required this.submitted,
    required this.submittedAt,
    required this.leaderStatus,
    required this.readAt,
    required this.rollupStatus,
  });

  final bool submitted;
  final String? submittedAt;
  final String leaderStatus;
  final String? readAt;
  final String rollupStatus;

  bool get leaderRead => leaderStatus == '已读';
  static const String aiReceiptStatusText = '状态暂不可确认';
  static const String aiReceiptDescription = '暂无独立 AI 处理回执，以直属领导与人轴状态为准';
}

ReportDeliveryStatus getReportDeliveryStatus(AgentReport? report) {
  final isSubmitted = report != null &&
      (report.status == 'submitted' || report.status == 'aggregated');
  final isRead = report != null && (report.read || (report.readAt ?? '').isNotEmpty);
  return ReportDeliveryStatus(
    submitted: isSubmitted,
    submittedAt: report?.submittedAt,
    leaderStatus: isSubmitted ? (isRead ? '已读' : '已送达') : '未提交',
    readAt: report?.readAt,
    rollupStatus:
        report?.status == 'aggregated' ? '已纳入项目汇总' : '等待汇总',
  );
}

/// 资料差异项（对齐后端 `aggregate_project_report` 的 conflicts 结构）
class ReportConflict {
  const ReportConflict({
    required this.type,
    this.taskId,
    this.reportIds = const [],
    this.statuses = const [],
    this.severity = 'warning',
    this.description,
  });

  final String type;
  final int? taskId;
  final List<int> reportIds;
  final List<String> statuses;
  final String severity;
  final String? description;

  String get typeLabel => type == 'task_status_mismatch' ? '任务状态不一致' : '资料差异';

  String get detail {
    if (description?.trim().isNotEmpty == true) return description!.trim();
    if (statuses.isNotEmpty) {
      return '汇报状态：${statuses.join(' / ')}';
    }
    return '汇报之间的事实描述不一致，请核对材料。';
  }

  factory ReportConflict.fromJson(Map<String, dynamic> json) {
    final ids = json['report_ids'];
    final statuses = json['statuses'];
    return ReportConflict(
      type: (json['type'] as String?) ?? 'status_conflict',
      taskId: (json['task_id'] as num?)?.toInt(),
      reportIds: ids is List
          ? ids.map((item) => (item as num).toInt()).toList(growable: false)
          : const [],
      statuses: statuses is List
          ? statuses.map((item) => item.toString()).toList(growable: false)
          : const [],
      severity: (json['severity'] as String?) ?? 'warning',
      description: json['description'] as String?,
    );
  }
}

/// 从聚合载荷中提取冲突
List<ReportConflict> extractReportConflicts(Map<String, dynamic>? payload) {
  if (payload == null) return const [];
  final raw = payload['conflicts'] ?? payload['conflict'];
  if (raw is! List) return const [];
  return raw
      .whereType<Map>()
      .map((item) => ReportConflict.fromJson(item.cast<String, dynamic>()))
      .toList(growable: false);
}

/// 只读推算同项目汇报之间的任务状态差异。
///
/// 与后端汇总算法一致，用于“项目资料对照”页在未生成汇总前展示真实差异，
/// 不写入任何服务端状态。
List<ReportConflict> detectReportConflicts(List<AgentReport> reports) {
  final seen = <int, ({int reportId, String status})>{};
  final conflicts = <ReportConflict>[];
  final sorted = [...reports]..sort((a, b) => a.id.compareTo(b.id));
  for (final report in sorted) {
    if (report.status != 'submitted') continue;
    for (final task in report.taskSnapshots) {
      final status = task.status ?? '';
      final previous = seen[task.id];
      if (previous != null && previous.status != status) {
        conflicts.add(ReportConflict(
          type: 'task_status_mismatch',
          taskId: task.id,
          reportIds: [previous.reportId, report.id],
          statuses: [previous.status, status],
        ));
      } else {
        seen[task.id] = (reportId: report.id, status: status);
      }
    }
  }
  return conflicts;
}

/// 接口缺口定义（与网页版一致的诚实提示，不伪造能力）
class ReportApiGap {
  const ReportApiGap(this.code, this.name, this.actionDesc);

  final String code;
  final String name;
  final String actionDesc;
}

const ReportApiGap reportGapAiReceipt = ReportApiGap(
  'G01',
  'AI 接收 / 处理回执缺失',
  'AI 收到 / 已处理状态显示“状态暂不可确认”',
);
const ReportApiGap reportGapDraftVersions = ReportApiGap(
  'G02',
  '草稿独立多版本对比缺失',
  '本地隔离存储草稿，历史列表展示真实已提交记录',
);
const ReportApiGap reportGapPublish = ReportApiGap(
  'G03',
  '汇总后正式发布审批流缺失',
  '当前仅支持生成与查看项目汇总，不假造入库归档流程',
);
const ReportApiGap reportGapFollowup = ReportApiGap(
  'G04',
  '差异追问工单流转缺失',
  '追问提示通过消息沟通，不伪造追问工单闭环',
);
const ReportApiGap reportGapVerification = ReportApiGap(
  'G05',
  '资料差异核验决定持久化缺失',
  '展示冲突项与核验建议，不将未保存的审核谎报为落库成功',
);

/// 把接口异常翻译成可以展示的中文提示。
///
/// 后端部分业务错误直接透传英文枚举（如 `member_agent_binding_not_found`），
/// 这里统一翻译，避免界面出现英文残留。
String reportErrorMessage(Object cause, {String fallback = '操作失败，请稍后重试'}) {
  if (cause is NetworkException) {
    return '网络连接异常或请求超时，请检查网络后重试';
  }
  if (cause is AuthException) {
    return cause.message;
  }
  if (cause is ValidationException) {
    return cause.message;
  }
  if (cause is ApiException) {
    switch (cause.statusCode) {
      case 403:
        return '没有操作权限或已不具备该项目权限';
      case 404:
        return cause.message.trim().isNotEmpty ? cause.message : '汇报不存在或已被删除';
      case 502:
        return 'AI 生成服务暂不可用，请稍后重试';
    }
    final message = cause.message.trim();
    const known = {
      'member_agent_binding_not_found': '尚未绑定项目汇报智能体，请先在项目汇报页同步智能体绑定',
      'binding_owner_mismatch': '该汇报智能体不属于当前账号',
      'summary_required': '请填写工作事实后再提交',
      'project_not_found': '项目不存在或已被删除',
      'report_not_editable': '该汇报已提交，不能再被静默覆盖',
      'report_sources_empty': '暂无任务、进度、资料或对话输入，无法生成汇报',
      'llm_not_configured': '未配置可用的 AI 模型，无法生成事实汇报',
      'project_agent_binding_not_found': '项目尚未生成汇报智能体，请先同步智能体绑定',
      'project_envelopes_empty': '暂无项目汇总，请先生成项目汇总',
      'report_not_found': '汇报不存在',
    };
    if (known.containsKey(message)) return known[message]!;
    if (RegExp(r'^[a-z0-9_:]+$').hasMatch(message)) {
      return '$fallback（服务端返回异常码：$message）';
    }
    return message.isNotEmpty ? message : fallback;
  }
  return fallback;
}
