import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/auth/auth_state.dart';
import '../design/design.dart';

/// 离线断网兜底页面（承接 AuthStatus.offline 状态）
class OfflineScreen extends StatelessWidget {
  const OfflineScreen({super.key, this.authState});

  final AuthState? authState;

  @override
  Widget build(BuildContext context) {
    AuthState? state = authState;
    if (state == null) {
      try {
        state = Provider.of<AuthState>(context, listen: true);
      } catch (_) {
        state = null;
      }
    }

    final errorMsg = state?.errorMessage ?? '网络连接失败，无法与服务器建立通信';

    return AppScaffold(
      title: '网络不可用',
      body: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.pageHorizontal),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const AppOfflineBanner(message: '当前网络连接不可用，请检查网络设置'),
              const SizedBox(height: AppSpacing.xxl),
              AppErrorState(
                message: errorMsg,
                retryLabel: '重试连接',
                onRetry: state != null ? () => state!.bootstrap() : null,
              ),
              const SizedBox(height: AppSpacing.xl),
              AppButton(
                label: '退出当前登录',
                variant: AppButtonVariant.secondary,
                onPressed: state != null ? () => state!.logout() : null,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
