import 'package:flutter/material.dart';

/// 让空状态/错误状态在矮屏或横屏时可以滚动，不被裁掉。
///
/// 底座的 `AppEmptyState`、`AppErrorState` 是固定高度的居中内容，
/// 在横屏或键盘弹出等可用高度很小的场景会溢出；本组件只在知识 Tab 内部做兜底，
/// 不改动共享设计系统。
class KnowledgeStateContainer extends StatelessWidget {
  const KnowledgeStateContainer({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return SingleChildScrollView(
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minHeight:
                  constraints.maxHeight.isFinite ? constraints.maxHeight : 0,
            ),
            child: child,
          ),
        );
      },
    );
  }
}
