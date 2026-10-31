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
  });

  final int currentIndex;
  final ValueChanged<int> onTap;
  final List<AppTabItem> tabs;

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
        items: tabs.map((t) {
          return BottomNavigationBarItem(
            icon: AppIcon(t.iconName, size: 22),
            activeIcon: AppIcon(t.iconName, size: 22, color: AppColors.primary),
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
      destinations: tabs.map((t) {
        return NavigationDestination(
          icon: AppIcon(t.iconName, size: 22),
          selectedIcon: AppIcon(t.iconName, size: 22, color: AppColors.primary),
          label: t.label,
        );
      }).toList(),
    );
  }
}
