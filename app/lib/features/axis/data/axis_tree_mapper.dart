import 'dart:convert';
import 'dart:ui' show Offset;

import 'axis_models.dart';

/// 人员附加信息在 `description` 中的存储格式，与网页
/// `frontend/src/api/axisPerson.ts` 完全一致：首行 `@axis-person {json}`，其余为备注。
const String axisPersonMetadataPrefix = '@axis-person ';

/// 读取 `@axis-person` 元信息；找不到或格式损坏返回空 Map（不抛异常）。
Map<String, String> readAxisPersonMetadata(String? description) {
  if (description == null || description.isEmpty) return const {};
  final line = description
      .split('\n')
      .firstWhere((item) => item.startsWith(axisPersonMetadataPrefix),
          orElse: () => '');
  if (line.isEmpty) return const {};
  try {
    final decoded = jsonDecode(line.substring(axisPersonMetadataPrefix.length));
    if (decoded is! Map) return const {};
    final out = <String, String>{};
    for (final key in const ['name', 'roleTitle', 'department']) {
      final value = decoded[key];
      if (value is String) out[key] = value;
    }
    return out;
  } catch (_) {
    return const {};
  }
}

/// 写入 `@axis-person` 元信息，保留原有自由备注。
String withAxisPersonMetadata(String? description, Map<String, String> metadata) {
  final notes = (description ?? '')
      .split('\n')
      .where((line) => !line.startsWith(axisPersonMetadataPrefix))
      .join('\n');
  final payload = jsonEncode(metadata);
  return notes.isEmpty
      ? '$axisPersonMetadataPrefix$payload'
      : '$axisPersonMetadataPrefix$payload\n$notes';
}

class AxisTreeMapper {
  const AxisTreeMapper._();

  /// 把后端嵌套人树映射成扁平人员列表。
  ///
  /// 与网页 `frontend/src/api/mappers.ts::mapTreeToPeopleAxis` 同口径：
  /// - 只保留 `person` 节点进主干，非人员节点不作为人员卡片；
  /// - 人员下挂的非人员子节点成为其责任事项；
  /// - 终责人（项目 PM）排在轴末；
  /// - `ui_offset` 作为布局偏移带回。
  static List<AxisPersonNode> mapTree(
    List<Map<String, dynamic>> roots, {
    int? finalOwnerUserId,
  }) {
    final out = <AxisPersonNode>[];

    void walkPerson(Map<String, dynamic> node, int? parentPersonId) {
      final typeKey = (node['node_type_key'] ?? '').toString();
      final children = (node['children'] as List?)
              ?.whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList() ??
          const <Map<String, dynamic>>[];

      if (typeKey != 'person') {
        for (final child in children) {
          walkPerson(child, parentPersonId);
        }
        return;
      }

      final assignees = (node['assignees'] as List?)
              ?.whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList() ??
          const <Map<String, dynamic>>[];

      Map<String, dynamic>? primary;
      for (final assignee in assignees) {
        if (assignee['role_key'] == 'primary') {
          primary = assignee;
          break;
        }
      }
      primary ??= assignees.isEmpty ? null : assignees.first;

      final description = node['description'] as String?;
      final metadata = readAxisPersonMetadata(description);
      final legacyParts = _legacyDescriptionParts(description);

      final nameFromAssignee = (primary?['display_name'] ?? '').toString().trim();
      final name = nameFromAssignee.isNotEmpty
          ? nameFromAssignee
          : (metadata['name']?.trim().isNotEmpty == true
              ? metadata['name']!.trim()
              : (node['title'] ?? '').toString());

      final ownerUserIds = assignees
          .where((a) =>
              a['role_key'] == 'primary' || a['role_key'] == 'collaborator')
          .map((a) => (a['user_id'] as num?)?.toInt() ?? 0)
          .where((id) => id > 0)
          .toList();

      final isTerminal = finalOwnerUserId != null &&
          assignees.any(
              (a) => (a['user_id'] as num?)?.toInt() == finalOwnerUserId);

      final matters = <AxisWorkItem>[];
      for (final child in children) {
        if ((child['node_type_key'] ?? '').toString() == 'person') continue;
        matters.add(AxisWorkItem.fromJson(child));
      }

      final nodeId = (node['id'] as num?)?.toInt() ?? 0;
      out.add(AxisPersonNode(
        id: nodeId,
        parentId: parentPersonId,
        title: (node['title'] ?? '').toString(),
        description: description,
        name: name,
        roleTitle: (metadata['roleTitle']?.trim().isNotEmpty == true
            ? metadata['roleTitle']!.trim()
            : (legacyParts.isNotEmpty ? legacyParts[0].trim() : name)),
        department: metadata['department'] ??
            (legacyParts.length >= 2 ? legacyParts[1].trim() : ''),
        nodeOrigin: (node['node_origin'] ?? 'project').toString(),
        isTerminalPm: isTerminal,
        ownerUserIds: ownerUserIds,
        workItems: matters,
        responsibilityPermissions: (node['responsibility_permissions'] is Map)
            ? Map<String, dynamic>.from(
                node['responsibility_permissions'] as Map)
            : const {},
        layoutOffset: _readOffset(node['ui_offset']),
        startAt: _parseLocal(node['start_at']),
        dueAt: _parseLocal(node['due_at'] ?? node['milestone_at']),
        sortOrder: (node['sort_order'] as num?)?.toInt() ?? 0,
      ));

      for (final child in children) {
        if ((child['node_type_key'] ?? '').toString() != 'person') continue;
        walkPerson(child, nodeId);
      }
    }

    for (final root in roots) {
      walkPerson(root, null);
    }

    // 终责排到轴末（与产品口径、网页 mapper 一致）。
    final ordered = <AxisPersonNode>[
      ...out.where((n) => !n.isTerminalPm),
      ...out.where((n) => n.isTerminalPm),
    ];
    return ordered;
  }

  /// 兼容旧格式 `岗位 / 部门 / risk=…`。只有末段是风险标记时才按旧格式拆分。
  static List<String> _legacyDescriptionParts(String? description) {
    final text = description ?? '';
    if (!RegExp(r'(?:^|/)\s*risk=(?:low|medium|high)\s*$').hasMatch(text)) {
      return const [];
    }
    return text.split(' / ');
  }

  static Offset? _readOffset(Object? raw) {
    if (raw is! Map) return null;
    final x = (raw['x'] as num?)?.toDouble();
    final y = (raw['y'] as num?)?.toDouble();
    if (x == null || y == null) return null;
    return Offset(x, y);
  }

  static DateTime? _parseLocal(Object? raw) {
    if (raw is! String || raw.isEmpty) return null;
    return DateTime.tryParse(raw)?.toLocal();
  }
}
