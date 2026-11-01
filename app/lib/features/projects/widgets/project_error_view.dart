/// T03 项目与团队：统一的异常展示与文案映射
///
/// 断网、登录过期、服务端错误一律按 T00 底座 `core/errors` 的结构化异常类型
/// 分别处理，给出可见状态与重试入口，不做静默吞异常。
library;

import 'package:flutter/widgets.dart';
import 'package:worktodo_app/core/errors/app_error.dart';
import 'package:worktodo_app/design/design.dart';

/// 异常 → 中文提示文案（用于轻提示与行内横幅）
String projectErrorMessage(Object error) {
  if (error is NetworkException) {
    return error.message.isEmpty ? '网络连接异常，请检查网络后重试' : error.message;
  }
  if (error is AuthException) {
    return error.message.isEmpty ? '登录已过期，请重新登录' : error.message;
  }
  if (error is ValidationException) {
    return error.message.isEmpty ? '提交内容未通过校验' : error.message;
  }
  if (error is ApiException) {
    return error.message.isEmpty ? '服务端返回异常，请稍后重试' : error.message;
  }
  return '操作失败，请稍后重试';
}

/// 异常标题（用于整页错误态）
String projectErrorTitle(Object error) {
  if (error is NetworkException) return '网络连接异常';
  if (error is AuthException) return '登录已过期';
  if (isProjectForbidden(error)) return '暂无访问权限';
  if (isProjectNotFound(error)) return '项目不存在或无权限访问';
  return '加载失败';
}

/// 是否为「无权限」类异常
bool isProjectForbidden(Object error) =>
    error is ApiException && error.statusCode == 403;

/// 是否为「不存在」类异常
bool isProjectNotFound(Object error) =>
    error is ApiException && error.statusCode == 404;

/// 整页异常状态：断网/服务端错误给重试，403 走无权限展示，404 给返回入口
class ProjectErrorView extends StatelessWidget {
  const ProjectErrorView({
    super.key,
    required this.error,
    this.onRetry,
    this.onBack,
  });

  final Object error;
  final VoidCallback? onRetry;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    if (isProjectForbidden(error) || isProjectNotFound(error)) {
      final state = AppErrorState(
        isForbidden: isProjectForbidden(error),
        title: projectErrorTitle(error),
        message: projectErrorMessage(error),
      );
      if (onBack == null) return state;
      return SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            state,
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.xxxl),
              child: AppButton(
                label: '返回上一页',
                variant: AppButtonVariant.secondary,
                onPressed: onBack,
              ),
            ),
          ],
        ),
      );
    }
    return AppErrorState(
      title: projectErrorTitle(error),
      message: projectErrorMessage(error),
      onRetry: onRetry,
    );
  }
}
