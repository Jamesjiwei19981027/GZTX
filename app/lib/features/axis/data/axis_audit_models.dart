import 'axis_models.dart';

List<Map<String, dynamic>> _rows(Object? value) => value is List
    ? value
        .whereType<Map>()
        .map((row) => Map<String, dynamic>.from(row))
        .toList()
    : [];

class AxisAuditScope {
  AxisAuditScope(Map<String, dynamic> json)
      : scope = json['scope'] as String? ?? 'self',
        nodeId = (json['node_id'] as num?)?.toInt(),
        label = json['label'] as String? ?? '本人信息';
  final String scope;
  final int? nodeId;
  final String label;
  String get key => scope == 'node' ? 'node:$nodeId' : scope;
}

class AxisAuditPermission {
  AxisAuditPermission(Map<String, dynamic> json)
      : nodeId = (json['node_id'] as num?)?.toInt() ?? 0,
        title = json['title'] as String? ?? '人员',
        depth = (json['person_depth'] as num?)?.toInt() ?? 1,
        value = json['allow_audit_subordinates'] as bool?,
        effective = json['effective'] == true;
  final int nodeId;
  final String title;
  final int depth;
  final bool? value;
  final bool effective;
}

class AxisAuditOptions {
  AxisAuditOptions(Map<String, dynamic> json)
      : canManage = json['can_manage'] == true,
        scopes = _rows(json['scopes']).map(AxisAuditScope.new).toList(),
        people = _rows(json['people']).map(AxisAuditPermission.new).toList();
  final bool canManage;
  final List<AxisAuditScope> scopes;
  final List<AxisAuditPermission> people;
}

class AxisAuditFinding {
  AxisAuditFinding(Map<String, dynamic> json)
      : type = json['type'] as String? ?? '待核验',
        description = json['description'] as String? ?? '',
        matterIds = (json['matter_ids'] as List? ?? [])
            .whereType<num>()
            .map((v) => v.toInt())
            .toList();
  final String type;
  final String description;
  final List<int> matterIds;
}

class AxisAuditRecord {
  AxisAuditRecord(Map<String, dynamic> json)
      : id = (json['id'] as num?)?.toInt() ?? 0,
        mode = json['mode'] as String? ?? 'rule',
        modeMessage = json['mode_message'] as String? ??
            (json['mode'] == 'ai' ? 'AI 审计' : '未配置 AI，以下为规则检查'),
        restricted = json['restricted'] == true,
        instruction = json['custom_instruction'] as String?,
        summary = AxisAuditResult.fromJson(json),
        findings = {
          for (final row in _rows(json['nodes']))
            (row['node_id'] as num?)?.toInt() ?? 0:
                _rows(row['findings']).map(AxisAuditFinding.new).toList(),
        };
  final int id;
  final String mode;
  final String modeMessage;
  final bool restricted;
  final String? instruction;
  final AxisAuditResult summary;
  final Map<int, List<AxisAuditFinding>> findings;
}

class AxisAuditHistory {
  AxisAuditHistory(Map<String, dynamic> json)
      : items = _rows(json['items']).map(AxisAuditRecord.new).toList(),
        hasMore = json['has_more'] == true;
  final List<AxisAuditRecord> items;
  final bool hasMore;
}
