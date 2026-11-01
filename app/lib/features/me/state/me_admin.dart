import 'package:flutter/material.dart';

import '../../../design/design.dart';
import '../data/me_api.dart';
import '../data/me_models.dart';
import '../widgets/me_common.dart';

/// 当前用户在企业内的管理权限
class MeAdminAccess {
  const MeAdminAccess({
    this.companyId,
    this.isSuperAdmin = false,
    this.isOrgLeader = false,
    this.companyName,
  });

  final int? companyId;
  final bool isSuperAdmin;
  final bool isOrgLeader;
  final String? companyName;

  /// 无企业上下文时的默认值：不具备任何管理权限
  static const MeAdminAccess none = MeAdminAccess();

  bool get isAdmin => isSuperAdmin;
}

/// 读取管理权限：无企业直接判定为非管理员；否则以 `/companies/{id}` 的
/// `my_membership.is_super_admin` 为准（与后端 `require_super_admin` 一致）。
///
/// 失败时向上抛出，由页面显示可重试的错误态，不静默当作无权限。
Future<MeAdminAccess> loadMeAdminAccess(
  MeApi api, {
  required int? companyId,
  String? companyName,
  MeCompanyContext? preloaded,
}) async {
  if (companyId == null) return MeAdminAccess.none;
  final context = preloaded ?? await api.fetchCompanyContext(companyId);
  return MeAdminAccess(
    companyId: companyId,
    isSuperAdmin: context.membership.isSuperAdmin,
    isOrgLeader: context.membership.isOrgLeader,
    companyName: companyName,
  );
}

/// 管理员页面统一门禁：加载中 / 加载失败可重试 / 无权限 / 正常内容
class MeAdminGuard extends StatelessWidget {
  const MeAdminGuard({
    super.key,
    required this.isLoading,
    required this.error,
    required this.isAdmin,
    required this.onRetry,
    required this.child,
    this.loadingMessage = '正在校验管理权限…',
    this.forbiddenMessage,
  });

  final bool isLoading;
  final Object? error;
  final bool isAdmin;
  final VoidCallback onRetry;
  final Widget child;
  final String loadingMessage;
  final String? forbiddenMessage;

  @override
  Widget build(BuildContext context) {
    if (isLoading) {
      return MeLoadingState(message: loadingMessage);
    }
    if (error != null) {
      return MeErrorState(
        message: meErrorMessage(error!),
        onRetry: onRetry,
      );
    }
    if (!isAdmin) {
      return MeErrorState(
        title: '无权限访问',
        message: forbiddenMessage ?? '该配置仅企业超级管理员可见。',
        isForbidden: true,
      );
    }
    return child;
  }
}

/// 无企业上下文时的说明（管理员页在未选择企业时展示）
class MeNoCompanyNotice extends StatelessWidget {
  const MeNoCompanyNotice({super.key, this.action});

  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return MeEmptyHint(
      title: '尚未加入企业',
      description: '当前账号没有企业工作区，企业级配置需先加入或创建企业。',
      action: action,
    );
  }
}

/// 轻量空状态（复用 MeErrorState 的排版规范，但为正向语气）
class MeEmptyHint extends StatelessWidget {
  const MeEmptyHint({
    super.key,
    required this.title,
    this.description,
    this.action,
  });

  final String title;
  final String? description;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xxxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppIcon(
              'info',
              size: 40,
              color: isDark ? AppColors.darkTextSecondary : AppColors.textSecondary,
            ),
            const SizedBox(height: AppSpacing.md),
            Text(
              title,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
              ),
            ),
            if (description != null) ...[
              const SizedBox(height: AppSpacing.sm),
              Text(
                description!,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 13,
                  height: 1.4,
                  color: isDark
                      ? AppColors.darkTextSecondary
                      : AppColors.textSecondary,
                ),
              ),
            ],
            if (action != null) ...[
              const SizedBox(height: AppSpacing.lg),
              action!,
            ],
          ],
        ),
      ),
    );
  }
}
