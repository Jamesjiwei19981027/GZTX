/// T04 人轴数据模型。
///
/// 字段全部对齐后端真实返回（`backend/app/api/v1/projects.py` 的 `_node_dtos_batched`、
/// `projects.py::list_project_members`、`projects.py::get_my_permissions`、
/// `delegations.py::_dto`、`person_deletion.py::deletion_preview`、
/// `shell.py::axis_audit`），不按网页前端类型猜测字段。
library;

import 'dart:ui' show Offset;

import 'axis_view_models.dart' show AxisOrientation;

Map<String, dynamic> _asMap(Object? value) =>
    value is Map<String, dynamic> ? value : <String, dynamic>{};

List<Map<String, dynamic>> _asMapList(Object? value) {
  if (value is! List) return const [];
  return value.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
}

int _asInt(Object? value, [int fallback = 0]) {
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value) ?? fallback;
  return fallback;
}

int? _asNullableInt(Object? value) {
  if (value == null) return null;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value);
  return null;
}

double _asDouble(Object? value, [double fallback = 0]) {
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value) ?? fallback;
  return fallback;
}

String _asString(Object? value, [String fallback = '']) {
  if (value is String) return value;
  if (value == null) return fallback;
  return value.toString();
}

/// 后端视为“已完成”的进度状态（与 `shell.py::axis_audit` 同口径）。
///
/// 普通事项写 `done` / `completed`；里程碑完成只写 `reached`，
/// 且 `progress_json` 里通常没有 `percent` 字段。
const Set<String> axisCompletedStatuses = {'done', 'completed', 'reached'};

bool axisStatusIsCompleted(String status) =>
    axisCompletedStatuses.contains(status);

/// 把 `progress_json` 归一成展示用百分比。
///
/// 已完成但没写 `percent` 的节点（典型是里程碑 `reached`）按 100% 展示，
/// 避免出现“已完成 · 进度 0%”这种自相矛盾的显示。
int axisProgressPercent(Map<String, dynamic> progress) {
  if (axisStatusIsCompleted(_asString(progress['status']))) return 100;
  return _asDouble(progress['percent']).round();
}

/// 人员节点下挂载的责任事项（工作项 / 里程碑 / 范围）。
class AxisWorkItem {
  const AxisWorkItem({
    required this.id,
    required this.title,
    required this.nodeTypeKey,
    required this.status,
    required this.percent,
    this.dueAt,
    this.lastProgressAt,
  });

  final int id;
  final String title;
  final String nodeTypeKey;

  /// 后端 `progress_json.status` 原值；界面统一用 [statusLabel]。
  final String status;
  final int percent;
  final DateTime? dueAt;
  final DateTime? lastProgressAt;

  bool get isMilestone => nodeTypeKey == 'milestone';

  bool get isDone => axisStatusIsCompleted(status) || percent >= 100;

  String get statusLabel {
    if (isDone) return '已完成';
    if (status == 'blocked') return '受阻';
    if (status == 'at_risk') return '有风险';
    if (isMilestone && status == 'not_reached') return '未达成';
    if (percent > 0 || status == 'in_progress') return '进行中';
    return '未开始';
  }

  String get typeLabel {
    switch (nodeTypeKey) {
      case 'milestone':
        return '里程碑';
      case 'scope':
        return '范围';
      default:
        return '工作项';
    }
  }

  factory AxisWorkItem.fromJson(Map<String, dynamic> json) {
    final progress = _asMap(json['progress_json']);
    final due = json['due_at'] ?? json['milestone_at'];
    return AxisWorkItem(
      id: _asInt(json['id']),
      title: _asString(json['title'], '未命名事项'),
      nodeTypeKey: _asString(json['node_type_key'], 'work_item'),
      status: _asString(progress['status']),
      percent: axisProgressPercent(progress),
      dueAt: due is String ? DateTime.tryParse(due)?.toLocal() : null,
      lastProgressAt: progress['last_record_id'] != null && progress['updated_at'] is String ? DateTime.tryParse(progress['updated_at'] as String) : null,
    );
  }
}

/// 一条节点指派（后端 `node_assignments`）。
///
/// `role_key` 原样保留：`primary` / `collaborator` / `observer` 等。
/// 编辑人员时必须整份回传，否则后端 `TreeService.set_assignees` 会整体替换，
/// 把协作者和观察者悄悄删掉。
class AxisAssignee {
  const AxisAssignee({required this.userId, required this.roleKey});

  final int userId;
  final String roleKey;

  Map<String, dynamic> toJson() => {
        'user_id': userId,
        'role_key': roleKey.isEmpty ? 'collaborator' : roleKey,
      };

  factory AxisAssignee.fromJson(Map<String, dynamic> json) => AxisAssignee(
        userId: _asInt(json['user_id']),
        roleKey: _asString(json['role_key']),
      );
}

/// 人轴上的人员卡片。
///
/// 后端一个 `person` 节点即一张卡片；`assignees` 中 primary/collaborator 才是
/// 该子树的编辑权所有者（与 `acl._owns_path` 同口径）。
class AxisPersonNode {
  const AxisPersonNode({
    required this.id,
    required this.parentId,
    required this.title,
    required this.description,
    required this.name,
    required this.roleTitle,
    required this.department,
    required this.nodeOrigin,
    required this.isTerminalPm,
    required this.ownerUserIds,
    required this.workItems,
    required this.responsibilityPermissions,
    this.assignees = const [],
    this.layoutOffset,
    this.horizontalOffset,
    this.verticalOffset,
    this.startAt,
    this.dueAt,
    this.sortOrder = 0,
    this.cardStyle,
    this.cardConfig,
    this.canEditCardStyle = false,
    this.profileAvatarUrl = '',
  });

  final int id;
  final int? parentId;
  final Map<String, dynamic>? cardStyle;
  final Map<String, dynamic>? cardConfig;
  final bool canEditCardStyle;
  final String profileAvatarUrl;

  /// 后端节点标题（新增人员时等于姓名）。
  final String title;

  /// 原始描述，编辑时保留自由备注（`@axis-person` 行之外的内容）。
  final String? description;
  final String name;
  final String roleTitle;
  final String department;

  /// `project` = 主轴人员（项目经理维护）；`subordinate` = 次级人员（主轴人员添加）。
  final String nodeOrigin;
  final bool isTerminalPm;
  final List<int> ownerUserIds;

  /// 后端返回的全部指派（含协作者、观察者），编辑保存时按角色整份回传。
  final List<AxisAssignee> assignees;
  final List<AxisWorkItem> workItems;
  final Map<String, dynamic> responsibilityPermissions;
  final Offset? layoutOffset;
  final Offset? horizontalOffset;
  final Offset? verticalOffset;
  final DateTime? startAt;
  final DateTime? dueAt;
  final int sortOrder;

  Offset offsetFor(AxisOrientation orientation) =>
      (orientation == AxisOrientation.horizontal
          ? (horizontalOffset ?? layoutOffset)
          : verticalOffset) ??
      Offset.zero;

  bool get isPrimary => nodeOrigin == 'project';

  /// 主负责人指派：优先 `role_key == 'primary'`，没有时退回第一条（与网页一致）。
  AxisAssignee? get primaryAssignee {
    for (final assignee in assignees) {
      if (assignee.roleKey == 'primary') return assignee;
    }
    return assignees.isEmpty ? null : assignees.first;
  }

  bool get allowChannelAccess =>
      responsibilityPermissions['channel_access'] == true;

  AxisPersonNode copyWith({
    Map<String, dynamic>? cardConfig,
    String? profileAvatarUrl,
    Offset? layoutOffset,
    Offset? horizontalOffset,
    Offset? verticalOffset,
  }) =>
      AxisPersonNode(
        id: id,
        cardStyle: cardStyle,
        cardConfig: cardConfig ?? this.cardConfig,
        canEditCardStyle: canEditCardStyle,
        profileAvatarUrl: profileAvatarUrl ?? this.profileAvatarUrl,
        parentId: parentId,
        title: title,
        description: description,
        name: name,
        roleTitle: roleTitle,
        department: department,
        nodeOrigin: nodeOrigin,
        isTerminalPm: isTerminalPm,
        ownerUserIds: ownerUserIds,
        assignees: assignees,
        workItems: workItems,
        responsibilityPermissions: responsibilityPermissions,
        layoutOffset: layoutOffset ?? horizontalOffset ?? this.layoutOffset,
        horizontalOffset:
            horizontalOffset ?? layoutOffset ?? this.horizontalOffset,
        verticalOffset: verticalOffset ?? this.verticalOffset,
        startAt: startAt,
        dueAt: dueAt,
        sortOrder: sortOrder,
      );
}

/// 当前用户在该项目的能力快照（`/projects/{id}/my-permissions`）。
class AxisPermissions {
  const AxisPermissions({
    this.role = 'outsider',
    this.isPm = false,
    this.isSuperAdmin = false,
    this.canEditAll = false,
    this.viaDelegation = false,
    this.canMove = false,
    this.canDelete = false,
    this.canSubmitEvidence = false,
    this.canReadEvidence = false,
    this.ownedNodeIds = const [],
    this.nodePermissions = const {},
  });

  final String role;
  final bool isPm;
  final bool isSuperAdmin;
  final bool canEditAll;
  final bool viaDelegation;
  final bool canMove;
  final bool canDelete;
  final bool canSubmitEvidence;
  final bool canReadEvidence;
  final List<int> ownedNodeIds;

  /// 节点 id（字符串键）→ 能力键 → 是否允许。
  final Map<String, Map<String, bool>> nodePermissions;

  bool get canManageStructure => isPm || isSuperAdmin;

  /// `nodeCan` 与网页 `MobileAxisScreens.tsx:196` 同口径：
  /// 显式下发优先，缺失时才回退到 PM / 超管 / 全树可编辑。
  bool nodeCan(AxisPersonNode? node, String capability) {
    if (node == null) return false;
    final explicit = nodePermissions[node.id.toString()]?[capability];
    if (explicit != null) return explicit;
    return isPm || isSuperAdmin || canEditAll;
  }

  factory AxisPermissions.fromJson(Map<String, dynamic> json) {
    final rawNodes = _asMap(json['node_permissions']);
    final nodePermissions = <String, Map<String, bool>>{};
    rawNodes.forEach((key, value) {
      if (value is Map) {
        nodePermissions[key] = value.map(
          (k, v) => MapEntry(k.toString(), v == true),
        );
      }
    });
    return AxisPermissions(
      role: _asString(json['role'], 'outsider'),
      isPm: json['is_pm'] == true,
      isSuperAdmin: json['is_superadmin'] == true,
      canEditAll: json['can_edit_all'] == true,
      viaDelegation: json['via_delegation'] == true,
      canMove: json['can_move'] == true,
      canDelete: json['can_delete'] == true,
      canSubmitEvidence: json['can_submit_evidence'] == true,
      canReadEvidence: json['can_read_evidence'] == true,
      ownedNodeIds:
          (json['owned_node_ids'] as List?)?.map((e) => _asInt(e)).toList() ??
              const [],
      nodePermissions: nodePermissions,
    );
  }

  static const empty = AxisPermissions();
}

class AxisMember {
  const AxisMember({
    required this.userId,
    required this.name,
    required this.username,
    this.role,
  });

  final int userId;
  final String name;
  final String username;
  final String? role;

  String get displayName => name.trim().isNotEmpty ? name : username;

  factory AxisMember.fromJson(Map<String, dynamic> json) {
    final display = _asString(json['display_name']).trim();
    final nickname = _asString(json['nickname']).trim();
    final username = _asString(json['username']).trim();
    return AxisMember(
      userId: _asInt(json['user_id']),
      name: display.isNotEmpty
          ? display
          : (nickname.isNotEmpty ? nickname : username),
      username: username,
      role: json['role'] as String?,
    );
  }
}

/// 项目级信息（终责位置与 PM/创建者判断都依赖它，不在 core Project 模型里）。
class AxisProjectInfo {
  const AxisProjectInfo({
    required this.id,
    required this.name,
    this.pmUserId,
    this.createdBy,
    this.finalOwnerAlongDelta = 0,
    this.status,
    this.cardTemplate,
    this.canEditCardTemplate = false,
  });

  final int id;
  final String name;
  final int? pmUserId;
  final int? createdBy;
  /// 已停用：终责轴向位置不再使用，仅为兼容服务端字段保留解析。
  final double finalOwnerAlongDelta;
  final String? status;
  final Map<String, dynamic>? cardTemplate;
  final bool canEditCardTemplate;

  factory AxisProjectInfo.fromJson(Map<String, dynamic> json) {
    return AxisProjectInfo(
      id: _asInt(json['id']),
      name: _asString(json['name'], '未命名项目'),
      pmUserId: _asNullableInt(json['pm_user_id']),
      createdBy: _asNullableInt(json['created_by']),
      finalOwnerAlongDelta: _asDouble(json['final_owner_along_delta']),
      status: json['status'] as String?,
      cardTemplate: json['card_template_json'] is Map ? Map<String, dynamic>.from(json['card_template_json'] as Map) : null,
      canEditCardTemplate: json['can_edit_card_template'] == true,
    );
  }
}

/// 删除预览（`GET /nodes/{id}/deletion-preview`）。
class AxisDeletionPreview {
  const AxisDeletionPreview({
    required this.nodeId,
    required this.descendants,
    required this.descendantCount,
    required this.affectedUserIds,
    required this.affectedTaskCount,
    required this.affectedEvidenceCount,
    required this.handoverCandidates,
    required this.requiresConfirmation,
    required this.warning,
    required this.previewToken,
  });

  final int nodeId;
  final List<AxisDeletionDescendant> descendants;
  final int descendantCount;
  final List<int> affectedUserIds;
  final int affectedTaskCount;
  final int affectedEvidenceCount;
  final List<AxisHandoverCandidate> handoverCandidates;
  final bool requiresConfirmation;
  final String warning;
  final String previewToken;

  factory AxisDeletionPreview.fromJson(Map<String, dynamic> json) {
    return AxisDeletionPreview(
      nodeId: _asInt(json['node_id']),
      descendants: _asMapList(json['descendants'])
          .map(AxisDeletionDescendant.fromJson)
          .toList(),
      descendantCount: _asInt(json['descendant_count']),
      affectedUserIds:
          (json['affected_user_ids'] as List?)?.map(_asInt).toList() ?? const [],
      affectedTaskCount: _asInt(json['affected_task_count']),
      affectedEvidenceCount: _asInt(json['affected_evidence_count']),
      handoverCandidates: _asMapList(json['handover_candidates'])
          .map(AxisHandoverCandidate.fromJson)
          .toList(),
      requiresConfirmation: json['requires_confirmation'] == true,
      warning: _asString(json['warning']),
      previewToken: _asString(json['preview_token']),
    );
  }
}

class AxisDeletionDescendant {
  const AxisDeletionDescendant({
    required this.id,
    required this.title,
    required this.nodeTypeKey,
    required this.nodeOrigin,
  });

  final int id;
  final String title;
  final String nodeTypeKey;
  final String nodeOrigin;

  bool get isPerson => nodeTypeKey == 'person';

  factory AxisDeletionDescendant.fromJson(Map<String, dynamic> json) {
    return AxisDeletionDescendant(
      id: _asInt(json['id']),
      title: _asString(json['title'], '未命名节点'),
      nodeTypeKey: _asString(json['node_type_key']),
      nodeOrigin: _asString(json['node_origin']),
    );
  }
}

class AxisHandoverCandidate {
  const AxisHandoverCandidate({required this.id, required this.title});

  final int id;
  final String title;

  factory AxisHandoverCandidate.fromJson(Map<String, dynamic> json) {
    return AxisHandoverCandidate(
      id: _asInt(json['id']),
      title: _asString(json['title'], '未命名人员'),
    );
  }
}

class AxisDelegationAction {
  const AxisDelegationAction(this.key, this.label);

  final String key;
  final String label;
}

/// 与后端 `ALLOWED_DELEGATION_ACTIONS`、网页 `api/delegations.ts` 严格一致。
const List<AxisDelegationAction> axisDelegationActions = [
  AxisDelegationAction('progress.read', '查看项目进度（进入项目视图的前提）'),
  AxisDelegationAction('progress.write_formal', '录入正式进度'),
  AxisDelegationAction('progress.nudge', '催办进度'),
  AxisDelegationAction('evidence.read', '查看材料'),
  AxisDelegationAction('evidence.submit', '提交材料'),
  AxisDelegationAction('tree.edit_subtree', '编辑项目人轴人员与事项（全项目范围）'),
  AxisDelegationAction('wiki.manual_write', '编辑项目知识'),
  AxisDelegationAction('review.read', '查看评审'),
  AxisDelegationAction('review.confirm', '确认评审'),
  AxisDelegationAction('project.read', '查看项目信息'),
  AxisDelegationAction('member.pull', '拉人入项目'),
];

const String axisDelegationScopeDescription =
    '将当前项目内勾选的操作权限委托给指定人员，可设置有效期或随时撤销。'
    '不授予手机或电脑本地文件的访问权限；查看材料仅限系统内已上传且授权范围内的项目材料。';

class AxisDelegation {
  const AxisDelegation({
    required this.id,
    required this.grantorUserId,
    required this.granteeUserId,
    required this.actions,
    required this.status,
    this.validTo,
    this.reason,
    this.createdAt,
  });

  final int id;
  final int grantorUserId;
  final int granteeUserId;
  final List<String> actions;
  final String status;
  final DateTime? validTo;
  final String? reason;
  final DateTime? createdAt;

  bool get isActive => status == 'active';

  factory AxisDelegation.fromJson(Map<String, dynamic> json) {
    return AxisDelegation(
      id: _asInt(json['id']),
      grantorUserId: _asInt(json['grantor_user_id']),
      granteeUserId: _asInt(json['grantee_user_id']),
      actions:
          (json['actions'] as List?)?.map((e) => e.toString()).toList() ?? const [],
      status: _asString(json['status'], 'active'),
      validTo: json['valid_to'] is String
          ? DateTime.tryParse(json['valid_to'] as String)?.toLocal()
          : null,
      reason: json['reason'] as String?,
      createdAt: json['created_at'] is String
          ? DateTime.tryParse(json['created_at'] as String)?.toLocal()
          : null,
    );
  }
}

class AxisAuditNode {
  const AxisAuditNode({
    required this.nodeId,
    required this.title,
    required this.riskLevel,
    required this.summary,
    required this.suggestedActions,
  });

  final int nodeId;
  final String title;
  final String riskLevel;
  final String summary;
  final List<String> suggestedActions;

  String get riskLabel {
    switch (riskLevel) {
      case 'high':
        return '高';
      case 'medium':
        return '中';
      default:
        return '低';
    }
  }

  factory AxisAuditNode.fromJson(Map<String, dynamic> json) {
    return AxisAuditNode(
      nodeId: _asInt(json['node_id']),
      title: _asString(json['title'], '未命名人员'),
      riskLevel: _asString(json['risk_level'], 'low'),
      summary: _asString(json['summary']),
      suggestedActions:
          (json['suggested_actions'] as List?)?.map((e) => e.toString()).toList() ??
              const [],
    );
  }
}

class AxisAuditResult {
  const AxisAuditResult({
    required this.overallRisk,
    required this.generatedAt,
    required this.nodes,
  });

  final String overallRisk;
  final DateTime? generatedAt;
  final List<AxisAuditNode> nodes;

  int get pendingCount => nodes.length;

  String get overallRiskLabel {
    switch (overallRisk) {
      case 'high':
        return '整体风险偏高';
      case 'medium':
        return '整体风险中等';
      default:
        return '整体风险较低';
    }
  }

  factory AxisAuditResult.fromJson(Map<String, dynamic> json) {
    return AxisAuditResult(
      overallRisk: _asString(json['overall_risk'], 'low'),
      generatedAt: json['generated_at'] is String
          ? DateTime.tryParse(json['generated_at'] as String)?.toLocal()
          : null,
      nodes: _asMapList(json['nodes']).map(AxisAuditNode.fromJson).toList(),
    );
  }
}

class AxisProgressRecord {
  const AxisProgressRecord({
    required this.id,
    required this.eventType,
    required this.source,
    this.reason,
    this.createdAt,
    this.percent,
    this.status,
  });

  final int id;
  final String eventType;
  final String source;
  final String? reason;
  final DateTime? createdAt;
  final int? percent;
  final String? status;

  String get eventLabel {
    switch (eventType) {
      case 'set_status':
        return '状态变更';
      case 'progress.update':
      case 'update':
        return '进度更新';
      case 'evidence':
        return '材料归档';
      default:
        return '进度记录';
    }
  }

  factory AxisProgressRecord.fromJson(Map<String, dynamic> json) {
    final after = _asMap(json['after_json']);
    return AxisProgressRecord(
      id: _asInt(json['id']),
      eventType: _asString(json['event_type']),
      source: _asString(json['source']),
      reason: json['reason'] as String?,
      createdAt: json['created_at'] is String
          ? DateTime.tryParse(json['created_at'] as String)?.toLocal()
          : null,
      percent: after['percent'] == null
          ? null
          : _asDouble(after['percent']).round(),
      status: after['status'] as String?,
    );
  }
}

class AxisProgressSnapshot {
  const AxisProgressSnapshot({
    required this.nodeId,
    required this.percent,
    required this.status,
    required this.records,
  });

  final int nodeId;
  final int percent;
  final String status;
  final List<AxisProgressRecord> records;

  String get statusLabel {
    if (isDone) return '已完成';
    if (status == 'blocked') return '受阻';
    if (status == 'at_risk') return '有风险';
    if (status == 'not_reached') return '未达成';
    if (percent > 0 || status == 'in_progress') return '进行中';
    return '未开始';
  }

  /// 里程碑完成只写 `reached`、不写 `percent`，这里与 [AxisWorkItem] 同口径。
  bool get isDone => axisStatusIsCompleted(status) || percent >= 100;

  factory AxisProgressSnapshot.fromJson(Map<String, dynamic> json) {
    final progress = _asMap(json['progress_json']);
    return AxisProgressSnapshot(
      nodeId: _asInt(json['node_id']),
      percent: axisProgressPercent(progress),
      status: _asString(progress['status']),
      records: _asMapList(json['recent_records'])
          .map(AxisProgressRecord.fromJson)
          .toList(),
    );
  }
}
