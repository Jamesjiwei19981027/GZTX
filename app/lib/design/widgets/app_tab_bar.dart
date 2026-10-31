import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../tokens/colors.dart';
import 'adaptive_base.dart';
import 'app_icons.dart';

/// 底部 5 Tab 数据项
class AppTabItem {
  const AppTabItem({
    required this.id,
    required this.label,
    required this.iconName,
  });

  final String id;
  final String label;
  final String iconName;
}

/// 底部 5 个固定主导航 Tab 配置（固定顺序：工作、人轴、知识、消息、我的）
const List<AppTabItem> kAppTabs = [
  AppTabItem(id: 'work', label: '工作', iconName: 'work'),
  AppTabItem(id: 'axis', label: '人轴', iconName: 'axis'),
  AppTabItem(id: 'knowledge', label: '知识', iconName: 'knowledge'),
  AppTabItem(id: 'messages', label: '消息', iconName: 'messages'),
  AppTabItem(id: 'me', label: '我的', iconName: 'me'),
];

/// 自适应底部 5 Tab 导航栏
class AppTabBar extends StatelessWidget {
  const AppTabBar({
    super.key,
    required this.currentIndex,
    required this.onTap,
    this.tabs = kAppTabs,
    this.badges,
    this.unreadMessagesCount,
  });

  final int currentIndex;
  final ValueChanged<int> onTap;
  final List<AppTabItem> tabs;

  /// 按 Tab 索引设置的徽标数（如 {3: 5} 表示第 3 个 Tab 显示 5 条未读）
  final Map<int, int>? badges;

  /// 快捷设置消息 Tab 未读数的参数（T08 直接使用）
  final int? unreadMessagesCount;

  int _getBadgeCount(int index, AppTabItem item) {
    if (badges != null && badges!.containsKey(index)) {
      return badges![index] ?? 0;
    }
    if ((index == 3 || item.id == 'messages') && unreadMessagesCount != null) {
      return unreadMessagesCount!;
    }
    return 0;
  }

  Widget _wrapBadge(Widget iconWidget, int count) {
    if (count <= 0) return iconWidget;
    return Badge.count(
      count: count,
      backgroundColor: AppColors.danger,
      child: iconWidget,
    );
  }

  @override
  Widget build(BuildContext context) {
    final isIos = isCupertinoPlatform(context);
    final isDark = isDarkMode(context);

    if (isIos) {
      return CupertinoTabBar(
        currentIndex: currentIndex,
        onTap: onTap,
        backgroundColor: (isDark ? AppColors.darkSurface : Colors.white)
            .withValues(alpha: 0.92),
        activeColor: AppColors.primary,
        inactiveColor: isDark
            ? AppColors.darkTextTertiary
            : AppColors.textTertiary,
        items: tabs.asMap().entries.map((entry) {
          final index = entry.key;
          final t = entry.value;
          final count = _getBadgeCount(index, t);

          return BottomNavigationBarItem(
            icon: _wrapBadge(AppIcon(t.iconName, size: 22), count),
            activeIcon: _wrapBadge(
              AppIcon(t.iconName, size: 22, color: AppColors.primary),
              count,
            ),
            label: t.label,
          );
        }).toList(),
      );
    }

    // Android Material 3 NavigationBar
    return NavigationBar(
      selectedIndex: currentIndex,
      onDestinationSelected: onTap,
      backgroundColor: isDark ? AppColors.darkSurface : Colors.white,
      indicatorColor: AppColors.primaryLight,
      elevation: 3,
      destinations: tabs.asMap().entries.map((entry) {
        final index = entry.key;
        final t = entry.value;
        final count = _getBadgeCount(index, t);

        return NavigationDestination(
          icon: _wrapBadge(AppIcon(t.iconName, size: 22), count),
          selectedIcon: _wrapBadge(
            AppIcon(t.iconName, size: 22, color: AppColors.primary),
            count,
          ),
          label: t.label,
        );
      }).toList(),
    );
  }
}
