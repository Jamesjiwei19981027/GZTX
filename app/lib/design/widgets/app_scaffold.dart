import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../tokens/colors.dart';
import 'adaptive_base.dart';
import 'app_icons.dart';
import 'app_offline_banner.dart';
import 'back_handler.dart';

/// 统一自适应页面骨架
class AppScaffold extends StatelessWidget {
  const AppScaffold({
    super.key,
    this.title,
    this.titleWidget,
    this.leading,
    this.actions,
    required this.body,
    this.bottomNavigationBar,
    this.floatingActionButton,
    this.backgroundColor,
    this.isOffline = false,
    this.onOfflineRetry,
    this.isDirty = false,
    this.showBackButton,
    this.useSafeArea = true,
  });

  final String? title;
  final Widget? titleWidget;
  final Widget? leading;
  final List<Widget>? actions;
  final Widget body;
  final Widget? bottomNavigationBar;
  final Widget? floatingActionButton;
  final Color? backgroundColor;
  final bool isOffline;
  final VoidCallback? onOfflineRetry;
  final bool isDirty;
  final bool? showBackButton;
  final bool useSafeArea;

  @override
  Widget build(BuildContext context) {
    final isIos = isCupertinoPlatform(context);
    final isDark = isDarkMode(context);
    final canPop = Navigator.of(context).canPop();
    final shouldShowBack = showBackButton ?? canPop;

    Widget? effectiveLeading = leading;
    if (effectiveLeading == null && shouldShowBack) {
      effectiveLeading = GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => Navigator.maybePop(context),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: AppIcon(
            isIos ? 'chevron-left' : 'back',
            size: 18,
            color: isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
          ),
        ),
      );
    }

    final effectiveBgColor = backgroundColor ??
        (isDark ? AppColors.darkBackground : AppColors.background);

    Widget content = body;
    if (isOffline) {
      content = Column(
        children: [
          AppOfflineBanner(onRetry: onOfflineRetry),
          Expanded(child: content),
        ],
      );
    }

    if (useSafeArea && !isIos) {
      content = SafeArea(child: content);
    }

    Widget scaffold;
    if (isIos) {
      scaffold = CupertinoPageScaffold(
        backgroundColor: effectiveBgColor,
        navigationBar: (title != null ||
                titleWidget != null ||
                actions != null ||
                leading != null)
            ? CupertinoNavigationBar(
                backgroundColor: (isDark ? AppColors.darkSurface : Colors.white)
                    .withValues(alpha: 0.92),
                border: Border(
                  bottom: BorderSide(
                    color: isDark ? AppColors.darkBorder : AppColors.border,
                    width: 0.5,
                  ),
                ),
                leading: effectiveLeading,
                middle: titleWidget ??
                    (title != null
                        ? Text(
                            title!,
                            style: TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w600,
                              color: isDark
                                  ? AppColors.darkTextPrimary
                                  : AppColors.textPrimary,
                            ),
                          )
                        : null),
                trailing: actions != null && actions!.isNotEmpty
                    ? Row(
                        mainAxisSize: MainAxisSize.min,
                        children: actions!,
                      )
                    : null,
              )
            : null,
        child: Material(
          type: MaterialType.transparency,
          child: Column(
            children: [
              Expanded(
                child: useSafeArea ? SafeArea(child: content) : content,
              ),
              if (bottomNavigationBar != null) bottomNavigationBar!,
            ],
          ),
        ),
      );
    } else {
      scaffold = Scaffold(
        backgroundColor: effectiveBgColor,
        appBar: (title != null ||
                titleWidget != null ||
                actions != null ||
                leading != null)
            ? AppBar(
                backgroundColor: isDark ? AppColors.darkSurface : Colors.white,
                elevation: 0,
                scrolledUnderElevation: 1,
                leading: effectiveLeading,
                title: titleWidget ??
                    (title != null
                        ? Text(
                            title!,
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w600,
                              color: isDark
                                  ? AppColors.darkTextPrimary
                                  : AppColors.textPrimary,
                            ),
                          )
                        : null),
                actions: actions,
              )
            : null,
        body: content,
        bottomNavigationBar: bottomNavigationBar,
        floatingActionButton: floatingActionButton,
      );
    }

    return AppBackScope(
      isDirty: isDirty,
      child: scaffold,
    );
  }
}
