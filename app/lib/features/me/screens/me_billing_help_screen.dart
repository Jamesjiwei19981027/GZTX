import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_state.dart';
import '../../../design/design.dart';
import '../appearance/me_appearance.dart';
import '../data/me_api.dart';
import '../data/me_models.dart';
import '../state/me_runtime.dart';
import '../widgets/me_common.dart';

/// 套餐、隐私与帮助（对应网页 `MobileBillingHelpScreen`，设计 ID 62）
class MeBillingHelpScreen extends StatefulWidget {
  const MeBillingHelpScreen({
    super.key,
    this.api,
    this.authState,
    this.appearance,
  });

  final MeApi? api;
  final AuthState? authState;
  final MeAppearanceController? appearance;

  @override
  State<MeBillingHelpScreen> createState() => _MeBillingHelpScreenState();
}

class _MeBillingHelpScreenState extends State<MeBillingHelpScreen> {
  bool _loading = true;
  Object? _error;
  MeBillingSummary? _billing;
  MePrivacySummary? _privacy;
  final List<String> _partialErrors = [];

  MeApi get _api => resolveMeApi(context, widget.api);

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _partialErrors.clear();
    });
    final api = _api;
    MeBillingSummary? billing;
    MePrivacySummary? privacy;
    Object? firstError;
    try {
      billing = await api.fetchBilling();
    } catch (e) {
      firstError = e;
      _partialErrors.add('套餐信息读取失败：${meErrorMessage(e)}');
    }
    try {
      privacy = await api.fetchPrivacy();
    } catch (e) {
      firstError ??= e;
      _partialErrors.add('隐私概览读取失败：${meErrorMessage(e)}');
    }
    if (!mounted) return;
    setState(() {
      _billing = billing;
      _privacy = privacy;
      _loading = false;
      // 两条都失败才算整页失败，否则保留可读内容并提示局部失败
      _error = (billing == null && privacy == null) ? firstError : null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return MeScreenAppearance(
      controller: widget.appearance,
      child: AppScaffold(
        title: '套餐、隐私与帮助',
        body: _loading
            ? const MeLoadingState(message: '正在加载套餐与合规信息…')
            : _error != null
                ? MeErrorState(
                    message: meErrorMessage(_error!),
                    onRetry: _load,
                  )
                : MePageBody(
                    children: [
                      for (final message in _partialErrors)
                        Padding(
                          padding: const EdgeInsets.only(bottom: AppSpacing.md),
                          child: MeBanner(
                            message: message,
                            tone: MeTone.warning,
                            onRetry: _load,
                          ),
                        ),
                      _planCard(),
                      const SizedBox(height: AppSpacing.md),
                      MeCard(
                        title: '数据安全与隐私合规',
                        footer: '个人数据遵照隐私合规要求处理，敏感凭据在服务端加密存储',
                        children: [
                          MeInfoRow(
                            label: '审计数据保留',
                            value: (_privacy?.retention ?? '').trim().isEmpty
                                ? '按企业合规归档'
                                : _privacy!.retention,
                          ),
                          MeInfoRow(
                            label: '数据导出通道',
                            value:
                                (_privacy?.exportEndpoint ?? '').trim().isEmpty
                                    ? '未开放'
                                    : _privacy!.exportEndpoint,
                          ),
                          MeInfoRow(
                            label: '账号注销通道',
                            value:
                                (_privacy?.deleteEndpoint ?? '').trim().isEmpty
                                    ? '见「账号与安全 → 注销此账号」'
                                    : _privacy!.deleteEndpoint,
                            showDivider: false,
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      MeCard(
                        title: '帮助与支持',
                        children: [
                          MeListRow(
                            title: '帮助中心与快捷键',
                            subtitle: '桌面快捷键、统计口径与人轴协同规则',
                            icon: 'help',
                            onTap: () => context.push('/me/help'),
                          ),
                          MeListRow(
                            title: '关于与版本',
                            subtitle: '版本号、服务健康状态与开源许可',
                            icon: 'info',
                            onTap: () => context.push('/me/about'),
                          ),
                          MeListRow(
                            title: '通知发送记录',
                            subtitle: '查看最近 50 条通知送达情况',
                            icon: 'clock',
                            onTap: () => context.push('/me/notify-logs'),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(AppSpacing.md),
                        decoration: BoxDecoration(
                          color: isDark
                              ? AppColors.darkSurface
                              : AppColors.surface,
                          borderRadius:
                              BorderRadius.circular(AppSpacing.radiusLg),
                          border: Border.all(
                            color: isDark
                                ? AppColors.darkBorder
                                : AppColors.border,
                          ),
                        ),
                        child: Column(
                          children: [
                            Text(
                              '工作梯 APP',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                                color: isDark
                                    ? AppColors.darkTextPrimary
                                    : AppColors.textPrimary,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '版本信息见「关于与版本」',
                              style: TextStyle(
                                fontSize: 12,
                                color: isDark
                                    ? AppColors.darkTextTertiary
                                    : AppColors.textTertiary,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
      ),
    );
  }

  Widget _planCard() {
    final billing = _billing;
    final statusText = billing?.isActive == true ? '正常履约' : '基础免费';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.primary,
        borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  '当前授权状态',
                  style: TextStyle(
                    fontSize: 12,
                    letterSpacing: 0.8,
                    fontWeight: FontWeight.w500,
                    color: Color(0xFFB9D3F7),
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.22),
                  borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                ),
                child: Text(
                  statusText,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            (billing?.planCode ?? '').trim().isEmpty
                ? '企业专业版 · 多端协同'
                : billing!.planCode!,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w500,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '服务管理方：${(billing?.managedBy ?? '').trim().isEmpty ? '工作梯协作平台' : billing!.managedBy}',
            style: const TextStyle(fontSize: 12, color: Color(0xFFD6E4FA)),
          ),
          if ((billing?.companyName ?? '').trim().isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              '所属企业：${billing!.companyName}',
              style: const TextStyle(fontSize: 12, color: Color(0xFFD6E4FA)),
            ),
          ],
        ],
      ),
    );
  }
}
