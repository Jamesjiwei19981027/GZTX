import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_state.dart';
import '../../../design/design.dart';
import '../appearance/me_appearance.dart';
import '../data/me_api.dart';
import '../data/me_models.dart';
import '../state/me_runtime.dart';
import '../widgets/me_common.dart';

/// 注销账号（对应网页 `AdaptAccountDeleteScreen`，设计 ID 96）
///
/// 多重确认：① 输入密码 + 键入 DELETE 关键词；② 危险操作二次确认弹窗；
/// ③ 注销成功后清空会话并回到登录页。
class MeDeleteAccountScreen extends StatefulWidget {
  const MeDeleteAccountScreen({
    super.key,
    this.api,
    this.authState,
    this.appearance,
  });

  final MeApi? api;
  final AuthState? authState;
  final MeAppearanceController? appearance;

  @override
  State<MeDeleteAccountScreen> createState() => _MeDeleteAccountScreenState();
}

class _MeDeleteAccountScreenState extends State<MeDeleteAccountScreen> {
  final _passwordController = TextEditingController();
  final _keywordController = TextEditingController();

  bool _loading = true;
  Object? _loadError;
  MePrivacySummary? _privacy;
  bool _submitting = false;
  String? _errorMessage;

  MeApi get _api => resolveMeApi(context, widget.api);
  AuthState? get _auth => resolveMeAuthState(context, widget.authState);

  bool get _canSubmit =>
      _passwordController.text.isNotEmpty &&
      _keywordController.text.trim() == meDeleteKeyword;

  @override
  void initState() {
    super.initState();
    _loadPrivacy();
  }

  @override
  void dispose() {
    _passwordController.dispose();
    _keywordController.dispose();
    super.dispose();
  }

  Future<void> _loadPrivacy() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final privacy = await _api.fetchPrivacy();
      if (!mounted) return;
      setState(() {
        _privacy = privacy;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadError = e;
        _loading = false;
      });
    }
  }

  Future<void> _exportData() async {
    final endpoint = (_privacy?.exportEndpoint ?? '').trim();
    if (endpoint.isEmpty) {
      showAppToast(context, '服务端未提供数据导出通道', type: ToastType.warning);
      return;
    }
    await Clipboard.setData(ClipboardData(text: endpoint));
    if (!mounted) return;
    showAppToast(context, '导出接口地址已复制：$endpoint', type: ToastType.info);
  }

  Future<void> _submit() async {
    if (!_canSubmit || _submitting) return;

    // 第二重确认：危险操作二次确认
    final confirmed = await showAppConfirmDialog(
      context: context,
      title: '永久注销此账号？',
      message: '所有个人数据、责任链身份与访问凭据将立即销毁，且不可恢复。',
      confirmLabel: '永久注销',
      isDestructive: true,
    );
    if (!confirmed || !mounted) return;

    setState(() {
      _submitting = true;
      _errorMessage = null;
    });
    try {
      await _api.deleteAccount(
        password: _passwordController.text,
        confirmation: meDeleteKeyword,
      );
      if (!mounted) return;
      showAppToast(context, '账号已注销', type: ToastType.success);
      await _auth?.logout();
      if (!mounted) return;
      // 会话已清空时路由守卫会自动跳登录页；无守卫（如测试环境）时手动回退
      if (context.canPop()) context.pop();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _errorMessage = '注销失败：${meErrorMessage(e)}';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return MeScreenAppearance(
      controller: widget.appearance,
      child: AppScaffold(
        title: '注销账号',
        body: _loading
            ? const MeLoadingState(message: '正在读取隐私数据概览…')
            : MeKeyboardSafeBody(
                child: MePageBody(
                  children: [
                    if (_loadError != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.md),
                        child: MeBanner(
                          message: '隐私概览读取失败：${meErrorMessage(_loadError!)}',
                          tone: MeTone.warning,
                          onRetry: _loadPrivacy,
                        ),
                      ),
                    MeCard(
                      title: '我的数据概览',
                      footer: '注销前请先确认已导出的数据；注销后上述数据无法恢复。',
                      children: [
                        for (final entry
                            in (_privacy?.storedData ?? const {}).entries)
                          MeInfoRow(
                            label: _storedDataLabel(entry.key),
                            value: _storedDataValue(entry.value),
                          ),
                        MeInfoRow(
                          label: '数据保留说明',
                          value: (_privacy?.retention ?? '').trim().isEmpty
                              ? '按企业合规归档'
                              : _privacy!.retention,
                          showDivider: false,
                        ),
                        const SizedBox(height: AppSpacing.md),
                        AppButton(
                          label: '导出我的数据',
                          variant: AppButtonVariant.secondary,
                          isFullWidth: true,
                          icon: const AppIcon('folder', size: 16),
                          onPressed: _exportData,
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.md),
                    Container(
                      padding: const EdgeInsets.all(AppSpacing.cardPadding),
                      decoration: BoxDecoration(
                        color: isDark ? AppColors.darkSurface : AppColors.surface,
                        borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
                        border: Border.all(color: AppColors.danger, width: 1),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(AppSpacing.sm),
                                decoration: BoxDecoration(
                                  color: isDark
                                      ? const Color(0xFF3D1414)
                                      : AppColors.dangerLight,
                                  shape: BoxShape.circle,
                                ),
                                child: const AppIcon(
                                  'alert',
                                  size: 20,
                                  color: AppColors.danger,
                                ),
                              ),
                              const SizedBox(width: AppSpacing.sm),
                              const Expanded(
                                child: Text(
                                  '永久注销此账号',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.danger,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: AppSpacing.sm),
                          Text(
                            '账号删除为最终不可逆操作，以下内容将被即刻销毁：',
                            style: TextStyle(
                              fontSize: 12,
                              height: 1.5,
                              color: isDark
                                  ? AppColors.darkTextSecondary
                                  : AppColors.textSecondary,
                            ),
                          ),
                          const SizedBox(height: AppSpacing.xs),
                          for (final item in const [
                            '个人创建的所有私有待办任务与未同步草稿',
                            '在所有项目人轴责任链中的责任人身份',
                            '已签发的全部 API Token 与会话凭证',
                          ])
                            Padding(
                              padding: const EdgeInsets.only(top: 2),
                              child: Text(
                                '• $item',
                                style: TextStyle(
                                  fontSize: 12,
                                  height: 1.5,
                                  color: isDark
                                      ? AppColors.darkTextSecondary
                                      : AppColors.textSecondary,
                                ),
                              ),
                            ),
                          if (_errorMessage != null) ...[
                            const SizedBox(height: AppSpacing.md),
                            MeBanner(
                              message: _errorMessage!,
                              tone: MeTone.danger,
                            ),
                          ],
                          const SizedBox(height: AppSpacing.md),
                          const MeFieldLabel(
                            label: '输入当前账号密码',
                            required: true,
                          ),
                          AppTextField(
                            key: const Key('me-delete-password'),
                            controller: _passwordController,
                            placeholder: '请输入密码进行身份核验',
                            obscureText: true,
                            onChanged: (_) => setState(() {}),
                          ),
                          const SizedBox(height: AppSpacing.md),
                          const MeFieldLabel(
                            label: '键入确认词',
                            required: true,
                            helper: '必须输入大写字母 $meDeleteKeyword 确认',
                          ),
                          AppTextField(
                            key: const Key('me-delete-keyword'),
                            controller: _keywordController,
                            placeholder: meDeleteKeyword,
                            onChanged: (_) => setState(() {}),
                          ),
                          const SizedBox(height: AppSpacing.lg),
                          AppButton(
                            label: '永久注销此账号',
                            variant: AppButtonVariant.danger,
                            isFullWidth: true,
                            size: AppButtonSize.lg,
                            isLoading: _submitting,
                            onPressed:
                                _canSubmit && !_submitting ? _submit : null,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
      ),
    );
  }

  static String _storedDataLabel(String key) {
    return switch (key) {
      'tasks' => '任务数据',
      'profile' => '个人资料',
      'notification_preferences' => '通知偏好',
      _ => key,
    };
  }

  static String _storedDataValue(dynamic value) {
    if (value is bool) return value ? '已保存' : '无';
    if (value is num) return '$value 条';
    if (value is String && value.trim().isNotEmpty) return value;
    return '—';
  }
}
