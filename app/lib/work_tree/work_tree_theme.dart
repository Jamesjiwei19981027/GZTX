import 'package:flutter/material.dart';

const kPaletteWidth = 88.0;

/// 轻快、低压迫感的工作树视觉 tokens。
class WorkTreeTheme {
  static const bg = Color(0xFFF6FAF8);
  static const grid = Color(0xFFE2EEE8);
  static const axis = Color(0xFFB7D4C8);
  static const card = Color(0xFFFFFFFF);
  static const ink = Color(0xFF2A3A36);
  static const muted = Color(0xFF6B7F78);
  static const dropHighlight = Color(0xFF7EC8B8);

  static const person = Color(0xFF5BA8E8);
  static const spine = Color(0xFF4DB6A0);
  static const spineGlow = Color(0x554DB6A0);
  static const timeRuler = Color(0xFF8FA89E);
  static const scope = Color(0xFFB39DDB);
  static const workItem = Color(0xFF7EB6FF);
  static const milestone = Color(0xFFFFC56E);

  static Color accentFor(String? typeKey) {
    switch (typeKey) {
      case 'person':
        return person;
      case 'milestone':
        return milestone;
      case 'scope':
        return scope;
      case 'work_item':
      default:
        return workItem;
    }
  }

  static bool isPersonType(String? key) => key == 'person';

  static bool isMatterType(String? key) =>
      key == 'work_item' || key == 'milestone' || key == 'scope';

  static List<BoxShadow> get softShadow => [
        BoxShadow(
          color: const Color(0xFF4DB6A0).withValues(alpha: 0.08),
          blurRadius: 18,
          offset: const Offset(0, 8),
        ),
        BoxShadow(
          color: Colors.black.withValues(alpha: 0.03),
          blurRadius: 4,
          offset: const Offset(0, 1),
        ),
      ];
}

class PaletteItem {
  const PaletteItem({
    required this.nodeTypeKey,
    required this.label,
    required this.defaultTitle,
    required this.icon,
  });

  final String nodeTypeKey;
  final String label;
  final String defaultTitle;
  final IconData icon;
}

const kPaletteItems = <PaletteItem>[
  PaletteItem(
    nodeTypeKey: 'person',
    label: '人',
    defaultTitle: '未命名',
    icon: Icons.person_outline,
  ),
  PaletteItem(
    nodeTypeKey: 'work_item',
    label: '工作项',
    defaultTitle: '新工作项',
    icon: Icons.check_box_outlined,
  ),
  PaletteItem(
    nodeTypeKey: 'milestone',
    label: '里程碑',
    defaultTitle: '新里程碑',
    icon: Icons.flag_outlined,
  ),
  PaletteItem(
    nodeTypeKey: 'scope',
    label: '范围',
    defaultTitle: '新范围',
    icon: Icons.account_tree_outlined,
  ),
];

/// 人节点边缘快捷连接可选类型。
const kQuickConnectItems = kPaletteItems;

class PaletteDragData {
  const PaletteDragData(this.item);
  final PaletteItem item;
}

class NodeMoveDragData {
  const NodeMoveDragData(this.nodeId);
  final int nodeId;
}
