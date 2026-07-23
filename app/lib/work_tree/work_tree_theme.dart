import 'package:flutter/material.dart';

const kPaletteWidth = 88.0;

/// 对齐 WEB main.css 默认蓝主色 + 灰白表面层级。
class WorkTreeTheme {
  static const bg = Color(0xFFF8F9FA); // surface
  static const grid = Color(0xFFE1E3E4); // surface-variant-ish
  static const axis = Color(0xFFC2C6D6); // outline-variant
  static const card = Color(0xFFFFFFFF);
  static const ink = Color(0xFF191C1D); // on-surface
  static const muted = Color(0xFF424754); // on-surface-variant
  static const dropHighlight = Color(0xFFADC6FF); // primary-fixed-dim

  static const person = Color(0xFF0058BE); // primary
  static const spine = Color(0xFF0058BE);
  static const spineGlow = Color(0x440058BE);
  static const timeRuler = Color(0xFF727785); // outline
  static const scope = Color(0xFF006C49); // secondary
  static const workItem = Color(0xFF2170E4); // primary-container
  static const milestone = Color(0xFF924700); // tertiary

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
          color: const Color(0xFF0058BE).withValues(alpha: 0.08),
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

const kQuickConnectItems = kPaletteItems;

class PaletteDragData {
  const PaletteDragData(this.item);
  final PaletteItem item;
}

class NodeMoveDragData {
  const NodeMoveDragData(this.nodeId);
  final int nodeId;
}
