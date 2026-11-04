import 'dart:convert';
import 'dart:ui' show Offset;
import 'axis_models.dart';
import 'axis_view_models.dart' show AxisOrientation;

Offset pickUiOffset(Map node, AxisOrientation o) =>
    AxisTreeMapper.pickUiOffset(node, o);

const String axisPersonMetadataPrefix = '@axis-person ';
Map<String, String> readAxisPersonMetadata(String? description) {
  if (description == null || description.isEmpty) return const {};
  final line = description
      .split('\n')
      .firstWhere(
        (x) => x.startsWith(axisPersonMetadataPrefix),
        orElse: () => '',
      );
  if (line.isEmpty) return const {};
  try {
    final decoded = jsonDecode(line.substring(axisPersonMetadataPrefix.length));
    if (decoded is! Map) return const {};
    final out = <String, String>{};
    for (final k in const ['name', 'roleTitle', 'department']) {
      final v = decoded[k];
      if (v is String) out[k] = v;
    }
    return out;
  } catch (_) {
    return const {};
  }
}

String withAxisPersonMetadata(
  String? description,
  Map<String, String> metadata,
) {
  final notes = (description ?? '')
      .split('\n')
      .where((x) => !x.startsWith(axisPersonMetadataPrefix))
      .join('\n');
  final payload = jsonEncode(metadata);
  return notes.isEmpty
      ? '$axisPersonMetadataPrefix$payload'
      : '$axisPersonMetadataPrefix$payload\n$notes';
}

class AxisTreeMapper {
  const AxisTreeMapper._();

  static Offset pickUiOffset(Map node, AxisOrientation o) {
    Map? uiOffsets;
    if (node['ui_offsets'] is Map) {
      uiOffsets = node['ui_offsets'] as Map;
    } else if (node['progress_json'] is Map &&
        (node['progress_json'] as Map)['ui_offsets'] is Map) {
      uiOffsets = (node['progress_json'] as Map)['ui_offsets'] as Map;
    }

    final orientationKey =
        o == AxisOrientation.horizontal ? 'horizontal' : 'vertical';

    if (uiOffsets != null && uiOffsets.containsKey(orientationKey)) {
      final offset = _readOffset(uiOffsets[orientationKey]);
      if (offset != null) return offset;
    }

    if (o == AxisOrientation.horizontal) {
      final direct = _readOffset(node['ui_offset']);
      if (direct != null) return direct;
      if (node['progress_json'] is Map) {
        final nested =
            _readOffset((node['progress_json'] as Map)['ui_offset']);
        if (nested != null) return nested;
      }
    }

    return Offset.zero;
  }

  static List<AxisPersonNode> mapTree(
    List<Map<String, dynamic>> roots, {
    // 已停用：终责人 = 唯一的根（第一个根），不再按指派人匹配；保留参数仅为兼容旧调用。
    int? finalOwnerUserId,
  }) {
    final out = <AxisPersonNode>[];
    final rootMeta = <int, int>{};
    for (final root in roots) {
      if ((root['node_type_key'] ?? '').toString() == 'person') {
        final id = (root['id'] as num?)?.toInt();
        if (id != null) {
          rootMeta[id] = (root['sort_order'] as num?)?.toInt() ?? 0;
        }
      }
    }
    final sortedRoots = rootMeta.keys.toList()
      ..sort((a, b) {
        final o = rootMeta[a]!.compareTo(rootMeta[b]!);
        return o != 0 ? o : a.compareTo(b);
      });
    final terminal = sortedRoots.isEmpty ? null : sortedRoots.first;
    void walk(Map<String, dynamic> node, int? parentId) {
      final type = (node['node_type_key'] ?? '').toString();
      final children =
          (node['children'] as List?)
              ?.whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList() ??
          const <Map<String, dynamic>>[];
      if (type != 'person') {
        for (final c in children) {
          walk(c, parentId);
        }
        return;
      }
      final assignees =
          (node['assignees'] as List?)
              ?.whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList() ??
          const <Map<String, dynamic>>[];
      Map<String, dynamic>? primary;
      for (final a in assignees) {
        if (a['role_key'] == 'primary') {
          primary = a;
          break;
        }
      }
      primary ??= assignees.isEmpty ? null : assignees.first;
      final description = node['description'] as String?;
      final metadata = readAxisPersonMetadata(description);
      final legacy = _legacyDescriptionParts(description);
      final n1 = (primary?['display_name'] ?? '').toString().trim();
      final name = n1.isNotEmpty
          ? n1
          : (metadata['name']?.trim().isNotEmpty == true
                ? metadata['name']!.trim()
                : (node['title'] ?? '').toString());
      final owners = assignees
          .where(
            (a) =>
                a['role_key'] == 'primary' || a['role_key'] == 'collaborator',
          )
          .map((a) => (a['user_id'] as num?)?.toInt() ?? 0)
          .where((id) => id > 0)
          .toList();
      final id = (node['id'] as num?)?.toInt() ?? 0;
      final matters = children
          .where((c) => (c['node_type_key'] ?? '').toString() != 'person')
          .map(AxisWorkItem.fromJson)
          .toList();
      final hOffset = pickUiOffset(node, AxisOrientation.horizontal);
      final vOffset = pickUiOffset(node, AxisOrientation.vertical);
      out.add(
        AxisPersonNode(
          id: id,
          parentId: parentId,
          title: (node['title'] ?? '').toString(),
          description: description,
          name: name,
          roleTitle: metadata['roleTitle']?.trim().isNotEmpty == true
              ? metadata['roleTitle']!.trim()
              : (legacy.isNotEmpty ? legacy[0].trim() : name),
          department:
              metadata['department'] ??
              (legacy.length >= 2 ? legacy[1].trim() : ''),
          nodeOrigin: (node['node_origin'] ?? 'project').toString(),
          isTerminalPm: parentId == null && id == terminal,
          ownerUserIds: owners,
          assignees: assignees.map(AxisAssignee.fromJson).toList(),
          workItems: matters,
          responsibilityPermissions: node['responsibility_permissions'] is Map
              ? Map<String, dynamic>.from(
                  node['responsibility_permissions'] as Map,
                )
              : const {},
          layoutOffset: hOffset == Offset.zero ? null : hOffset,
          horizontalOffset: hOffset == Offset.zero ? null : hOffset,
          verticalOffset: vOffset == Offset.zero ? null : vOffset,
          startAt: _parseLocal(node['start_at']),
          dueAt: _parseLocal(node['due_at'] ?? node['milestone_at']),
          sortOrder: (node['sort_order'] as num?)?.toInt() ?? 0,
        ),
      );
      for (final c in children) {
        if ((c['node_type_key'] ?? '').toString() == 'person') {
          walk(c, id);
        }
      }
    }

    for (final root in roots) {
      walk(root, null);
    }
    return out;
  }

  static List<int> extraRootIds(List<AxisPersonNode> nodes) {
    final roots = nodes.where((n) => n.parentId == null).toList()
      ..sort((a, b) {
        final o = a.sortOrder.compareTo(b.sortOrder);
        return o != 0 ? o : a.id.compareTo(b.id);
      });
    return roots.skip(1).map((n) => n.id).toList(growable: false);
  }

  static List<String> _legacyDescriptionParts(String? description) {
    final text = description ?? '';
    if (!RegExp(r'(?:^|/)\s*risk=(?:low|medium|high)\s*$').hasMatch(text)) {
      return const [];
    }
    return text.split(' / ');
  }

  static Offset? _readOffset(Object? raw) {
    if (raw is! Map) return null;
    final rawX = raw['x'];
    final rawY = raw['y'];
    final x = rawX is num
        ? rawX.toDouble()
        : (rawX is String ? double.tryParse(rawX) : null);
    final y = rawY is num
        ? rawY.toDouble()
        : (rawY is String ? double.tryParse(rawY) : null);
    if (x == null || y == null) return null;
    return Offset(x, y);
  }

  static DateTime? _parseLocal(Object? raw) {
    if (raw is! String || raw.isEmpty) return null;
    return DateTime.tryParse(raw)?.toLocal();
  }
}
