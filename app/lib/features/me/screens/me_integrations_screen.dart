import 'package:flutter/material.dart';

import '../../../core/auth/auth_state.dart';
import '../../../design/design.dart';
import '../appearance/me_appearance.dart';
import '../data/me_api.dart';
import '../data/me_models.dart';
import '../state/me_runtime.dart';
import '../widgets/me_common.dart';

/// 第三方服务绑定 + 个人语音识别（对应网页 `MobileThirdPartyBindingsScreen`，设计 ID 90）
class MeIntegrationsScreen extends StatefulWidget {
  const MeIntegrationsScreen({
    super.key,
    this.api,
    this.authState,
    this.appearance,
  });

  final MeApi? api;
  final AuthState? authState;
  final MeAppearanceController? appearance;

  @override
  State<MeIntegrationsScreen> createState() => _MeIntegrationsScreenState();
}

class _MeIntegrationsScreenState extends State<MeIntegrationsScreen> {
  static const List<(String, String)> _asrOptions = [
    ('builtin', '暂不启用'),
    ('cloud:whisper', 'Whisper 兼容服务'),
    ('customer:whisper', '自有语音服务'),
  ];

  bool _loading = true;
  Object? _error;
  MeWechatStatus _wechat = const MeWechatStatus();
  String _asrProvider = 'builtin';
  bool _savingWechat = false;
  bool _savingAsr = false;
  String? _errorMessage;
  String? _successMessage;

  MeApi get _api => resolveMeApi(context, widget.api);
  AuthState? get _auth => resolveMeAuthState(context, widget.authState);

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final wechat = await _api.fetchWechatStatus();
      if (!mounted) return;
      setState(() {
        _wechat = wechat;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  Future<void> _toggleWechat(bool enabled) async {
    setState(() {
      _savingWechat = true;
      _errorMessage = null;
      _successMessage = null;
    });
    try {
      final status = await _api.updateWechatSubscription(enabled);
      if (!mounted) return;
      setState(() {
        _wechat = status;
        _savingWechat = false;
        _successMessage = enabled ? '已开启微信订阅提醒' : '已关闭微信订阅提醒';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _savingWechat = false;
        _errorMessage = '微信订阅设置保存失败：${meErrorMessage(e)}';
      });
    }
  }

  Future<void> _saveAsr(String providerId) async {
    final companyId = (_auth?.currentCompany)?.id;
    if (companyId == null) {
      setState(() {
        _errorMessage = '请先在「工作」中选择或加入一个企业后再配置个人语音识别';
        _successMessage = null;
      });
      return;
    }
    setState(() {
      _savingAsr = true;
      _errorMessage = null;
      _successMessage = null;
    });
    try {
      await _api.saveUserAsr(companyId: companyId, providerId: providerId);
      if (!mounted) return;
      setState(() {
        _asrProvider = providerId;
        _savingAsr = false;
        _successMessage = '个人语音识别偏好已保存';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _savingAsr = false;
        _errorMessage = '语音识别偏好保存失败：${meErrorMessage(e)}';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return MeScreenAppearance(
      controller: widget.appearance,
      child: AppScaffold(
        title: '第三方服务绑定',
        body: _loading
            ? const MeLoadingState(message: '正在读取绑定状态…')
            : _error != null
                ? MeErrorState(
                    message: meErrorMessage(_error!),
                    onRetry: _load,
                  )
                : MePageBody(
                    children: [
                      if (_errorMessage != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: AppSpacing.md),
                          child: MeBanner(
                            message: _errorMessage!,
                            tone: MeTone.danger,
                          ),
                        ),
                      if (_successMessage != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: AppSpacing.md),
                          child: MeBanner(
                            message: _successMessage!,
                            tone: MeTone.success,
                          ),
                        ),
                      MeCard(
                        title: '移动与协同渠道',
                        footer: '微信绑定需在微信客户端内完成授权回调，APP 内无法绕过微信安全协议；'
                            '企业微信与飞书由企业管理员在「组织与登录集成」中统一接入。',
                        children: [
                          Row(
                            children: [
                              const AppIcon(
                                'messages',
                                size: 18,
                                color: AppColors.success,
                              ),
                              const SizedBox(width: AppSpacing.sm),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text(
                                      '微信服务号',
                                      style: TextStyle(
                                        fontSize: 14.5,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      _wechat.bound
                                          ? '已绑定，可接收模板消息提醒'
                                          : '未绑定（需在微信内完成授权）',
                                      style: TextStyle(
                                        fontSize: 11.5,
                                        color: isDark
                                            ? AppColors.darkTextSecondary
                                            : AppColors.textSecondary,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              MeBadge(
                                label: _wechat.bound ? '已绑定' : '未绑定',
                                tone: _wechat.bound
                                    ? MeTone.success
                                    : MeTone.neutral,
                              ),
                            ],
                          ),
                          const SizedBox(height: AppSpacing.md),
                          Row(
                            children: [
                              const Expanded(
                                child: Text(
                                  '接收微信订阅提醒',
                                  style: TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                              AppSwitch(
                                value: _wechat.subscriptionEnabled,
                                onChanged: !_wechat.bound || _savingWechat
                                    ? null
                                    : _toggleWechat,
                              ),
                            ],
                          ),
                          if (!_wechat.bound)
                            const Padding(
                              padding: EdgeInsets.only(top: AppSpacing.sm),
                              child: MeBanner(
                                message: '未绑定微信服务号时无法开启订阅提醒',
                                tone: MeTone.warning,
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      MeCard(
                        title: '个人语音识别',
                        footer: '仅保存个人偏好；实际转写能力由企业语音服务提供，录音结束后才发送音频。',
                        children: [
                          for (final (id, label) in _asrOptions)
                            InkWell(
                              onTap: _savingAsr ? null : () => _saveAsr(id),
                              borderRadius:
                                  BorderRadius.circular(AppSpacing.radiusMd),
                              child: Padding(
                                padding:
                                    const EdgeInsets.symmetric(vertical: 10),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        label,
                                        style: TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.w600,
                                          color: isDark
                                              ? AppColors.darkTextPrimary
                                              : AppColors.textPrimary,
                                        ),
                                      ),
                                    ),
                                    if (_asrProvider == id)
                                      const AppIcon(
                                        'check',
                                        size: 18,
                                        color: AppColors.primary,
                                      )
                                    else
                                      const SizedBox(width: 18),
                                  ],
                                ),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      const MeCard(
                        title: '办公生态账号',
                        footer: '以下渠道由企业统一接入，个人侧仅展示接入状态。',
                        children: [
                          MeInfoRow(
                            label: '企业微信（WeCom）',
                            value: '由企业管理员配置',
                          ),
                          MeInfoRow(
                            label: '钉钉（DingTalk）',
                            value: '由企业管理员配置',
                          ),
                          MeInfoRow(
                            label: '飞书（Feishu）',
                            value: '由企业管理员配置',
                          ),
                          MeInfoRow(
                            label: 'GitHub / GitLab',
                            value: '暂未开放',
                            showDivider: false,
                          ),
                        ],
                      ),
                    ],
                  ),
      ),
    );
  }
}
