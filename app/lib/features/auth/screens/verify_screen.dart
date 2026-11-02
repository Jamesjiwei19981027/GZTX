import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/auth/auth_state.dart';
import '../../../design/design.dart';
import '../auth_paths.dart';
import '../data/auth_api.dart';
import '../models/auth_models.dart';
import '../utils/auth_error_message.dart';
import '../utils/auth_validators.dart';
import '../utils/countdown_controller.dart';
import '../utils/phone_reminder.dart';
import '../widgets/auth_message_banner.dart';
import '../widgets/code_field_row.dart';
import '../widgets/phone_reminder.dart';
import '../widgets/send_code_button.dart';

/// 邮箱 / 手机验证门
///
/// 规则对照 `frontend/src/components/VerifyGate.tsx`：
/// - `required = email`：个人待办只需邮箱验证；
/// - `required = phone`：协作功能需要邮箱 + 手机都验证；
/// - 已满足要求时立即放行到“工作”Tab；
/// - 拉取状态失败给出可重试的错误页（断网 / 服务端异常）。
class VerifyScreen extends StatefulWidget {
  const VerifyScreen({
    super.key,
    this.required = VerifyRequirement.email,
    this.api,
    this.initialStatus,
    this.autoLoad = true,
    this.reminderStorage,
    this.userId,
    this.now,
  });

  final VerifyRequirement required;

  /// 测试注入用；生产从 `context.apiClient` 获取
  final AuthApi? api;

  /// 测试注入初始状态（跳过首屏加载）
  final VerificationStatus? initialStatus;

  /// 是否在首帧后自动拉取验证状态
  final bool autoLoad;

  /// 测试注入的手机提醒存储
  final PhoneReminderStorage? reminderStorage;

  /// 测试注入的用户 id；生产取 `AuthState.currentUser.id`
  final String? userId;

  /// 测试注入的当前时间
  final DateTime? now;

  @override
  State<VerifyScreen> createState() => _VerifyScreenState();
}

class _VerifyScreenState extends State<VerifyScreen> {
  final TextEditingController _emailTarget = TextEditingController();
  final TextEditingController _emailCode = TextEditingController();
  final TextEditingController _phoneTarget = TextEditingController();
  final TextEditingController _phoneCode = TextEditingController();
  late final CountdownController _emailCountdown = CountdownController();
  late final CountdownController _phoneCountdown = CountdownController();

  VerificationStatus? _status;
  bool _loading = true;
  bool _busy = false;
  String? _loadError;
  String? _actionError;
  String? _actionHint;
  bool _syncedTargets = false;
  bool _leaving = false;
  PhoneReminderStorage? _storageCache;

  @override
  void initState() {
    super.initState();
    // “发验证码”按钮的可用状态取决于绑定目标是否非空，而接口返回的邮箱/手机号
    // 可能为空（只用邮箱注册的用户首次绑手机）。必须监听输入，否则按钮会
    // 一直停留在首帧的禁用状态。
    _emailTarget.addListener(_onTargetChanged);
    _phoneTarget.addListener(_onTargetChanged);
    if (widget.initialStatus != null) {
      _status = widget.initialStatus;
      _loading = false;
      _syncTargets(_status!);
      if (_status!.satisfies(widget.required)) {
        WidgetsBinding.instance.addPostFrameCallback((_) => _onSatisfied());
      }
    } else if (widget.autoLoad) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _load());
    } else {
      _loading = false;
    }
  }

  @override
  void dispose() {
    _emailTarget.removeListener(_onTargetChanged);
    _phoneTarget.removeListener(_onTargetChanged);
    _emailTarget.dispose();
    _emailCode.dispose();
    _phoneTarget.dispose();
    _phoneCode.dispose();
    _emailCountdown.dispose();
    _phoneCountdown.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant VerifyScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.required == widget.required) return;
    // 同一路由只换了 `required`（例如邮箱验证通过后点“去绑定手机”，
    // 从 `/verify?required=email` 跳到 `/verify?required=phone`）时，
    // GoRouter 会复用同一个页面状态。这里必须重置“已离开”标记，
    // 否则手机验证成功后 `_onSatisfied()` 会直接返回，用户卡在验证页。
    _leaving = false;
    _actionError = null;
    _actionHint = null;
    final status = _status;
    if (status != null && status.satisfies(widget.required)) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _onSatisfied());
    }
  }

  /// 绑定目标输入变化时重建，让“发验证码”按钮的可用状态跟着更新。
  void _onTargetChanged() {
    if (mounted) setState(() {});
  }

  AuthApi get _api => widget.api ?? AuthApi(context.read<AuthState>().api);

  String get _userId {
    if (widget.userId != null) return widget.userId!;
    return context.read<AuthState>().currentUser?.id.toString() ?? '';
  }

  Future<PhoneReminderStorage> _reminderStorage() async {
    if (widget.reminderStorage != null) return widget.reminderStorage!;
    return _storageCache ??= await createDefaultPhoneReminderStorage();
  }

  void _syncTargets(VerificationStatus status) {
    if (_syncedTargets) return;
    _syncedTargets = true;
    if (status.hasEmail) _emailTarget.text = status.email;
    if (status.hasPhone) _phoneTarget.text = status.phone;
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final status = await _api.fetchVerificationStatus();
      if (!mounted) return;
      setState(() {
        _status = status;
        _loading = false;
      });
      _syncTargets(status);
      if (status.satisfies(widget.required)) {
        await _onSatisfied();
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadError = describeAuthError(e);
      });
    }
  }

  Future<void> _onSatisfied() async {
    if (_leaving) return;
    _leaving = true;

    final status = _status;
    if (status != null && !status.phoneVerified) {
      final storage = await _reminderStorage();
      if (!mounted) return;
      final goBind = await maybeShowPhoneReminder(
        context: context,
        userId: _userId,
        phoneVerified: false,
        storage: storage,
        now: widget.now,
      );
      if (goBind) return; // 已跳转到手机补验页
    }

    if (!mounted) return;
    _goWork();
  }

  /// 回到工作 Tab。
  ///
  /// 优先出栈回到进入验证门之前的页面（工作 Tab 的 StatefulShellRoute 不会被卸载重建）；
  /// 若验证门是登录后直接跳入的顶层页（无可出栈页面），再直接切到工作 Tab。
  /// 用 post-frame 回调避免同一帧内既卸载又重建带 GlobalKey 的导航壳。
  void _goWork() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final target = context.read<AuthState?>()?.takeAppLocation();
      if (target != null) {
        context.go(target);
        return;
      }
      if (context.canPop()) {
        context.pop();
      } else {
        context.go(AuthPaths.work);
      }
    });
  }

  Future<void> _sendBindCode(AuthChannel channel) async {
    final target =
        (channel == AuthChannel.email ? _emailTarget.text : _phoneTarget.text)
            .trim();
    setState(() {
      _actionError = null;
      _actionHint = null;
    });

    if (channel == AuthChannel.email) {
      final error = AuthValidators.validateEmail(target);
      if (error != null) {
        setState(() => _actionError = error);
        return;
      }
    } else {
      if (target.replaceAll(RegExp(r'[\s-]'), '').length < 7) {
        setState(() => _actionError = '请输入有效的手机号');
        return;
      }
    }

    setState(() => _busy = true);
    try {
      final result = await _api.sendBindCode(channel: channel, target: target);
      if (!mounted) return;
      if (channel == AuthChannel.email) {
        _emailCountdown.start(result.resendAfterSeconds);
      } else {
        _phoneCountdown.start(result.resendAfterSeconds);
      }
      setState(() {
        final prefix = channel == AuthChannel.email ? '验证码已发送至该邮箱' : '短信验证码已发送';
        _actionHint = result.debugCode != null
            ? '$prefix（调试码: ${result.debugCode}）'
            : prefix;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _actionError = describeAuthError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirmBind(AuthChannel channel) async {
    final target =
        (channel == AuthChannel.email ? _emailTarget.text : _phoneTarget.text)
            .trim();
    final code =
        (channel == AuthChannel.email ? _emailCode.text : _phoneCode.text)
            .trim();

    if (target.isEmpty) {
      setState(() {
        _actionError = channel == AuthChannel.email ? '请输入邮箱地址' : '请输入手机号码';
        _actionHint = null;
      });
      return;
    }
    if (code.isEmpty) {
      setState(() {
        _actionError = '请输入验证码';
        _actionHint = null;
      });
      return;
    }

    setState(() {
      _busy = true;
      _actionError = null;
      _actionHint = null;
    });
    try {
      final status = await _api.confirmBindCode(
        channel: channel,
        target: target,
        code: code,
        base: _status,
      );
      if (!mounted) return;
      setState(() {
        _status = status;
        _actionHint = channel == AuthChannel.email ? '邮箱验证成功！' : '手机号验证成功！';
      });
      if (status.satisfies(widget.required)) {
        await _onSatisfied();
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _actionError = describeAuthError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _logout() async {
    setState(() => _busy = true);
    try {
      await context.read<AuthState>().logout();
    } finally {
      if (mounted) {
        setState(() => _busy = false);
        context.go(AuthPaths.login);
      }
    }
  }

  String get _title =>
      widget.required == VerifyRequirement.phone ? '协作功能需要补验手机' : '完成邮箱验证';

  String get _subtitle => widget.required == VerifyRequirement.phone
      ? '个人待办只需邮箱；创建公司、项目或接受协作邀请需要手机号验证。'
      : '个人待办只需验证邮箱。手机号可稍后在协作时再补。';

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: '账号验证',
      body: _buildBody(context),
    );
  }

  Widget _buildBody(BuildContext context) {
    if (_loading) {
      return const Center(child: AppLoading());
    }
    if (_loadError != null) {
      return AppErrorState(
        title: '验证状态加载失败',
        message: _loadError!,
        onRetry: _load,
      );
    }
    final status = _status;
    if (status == null) {
      return AppErrorState(
        title: '验证状态加载失败',
        message: '未获取到验证状态，请重试',
        onRetry: _load,
      );
    }

    final isDark = isDarkMode(context);
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.xl,
        AppSpacing.lg,
        AppSpacing.xl,
        AppSpacing.xl + bottomInset,
      ),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                width: 48,
                height: 48,
                margin: const EdgeInsets.only(bottom: AppSpacing.md),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: AppIcon(
                    widget.required == VerifyRequirement.phone
                        ? 'phone'
                        : 'mail',
                    size: 24,
                    color: AppColors.primary,
                  ),
                ),
              ),
              Text(
                _title,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w700,
                  color: isDark
                      ? AppColors.darkTextPrimary
                      : AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                _subtitle,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 12,
                  height: 1.45,
                  color: isDark
                      ? AppColors.darkTextSecondary
                      : AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              if (_actionError != null)
                AuthMessageBanner(
                  key: const ValueKey('verify-error-banner'),
                  message: _actionError!,
                ),
              if (_actionHint != null)
                AuthMessageBanner(
                  key: const ValueKey('verify-hint-banner'),
                  message: _actionHint!,
                  type: AuthBannerType.hint,
                ),
              _buildStatusCard(context, status),
              if (!status.emailVerified) ...[
                const SizedBox(height: AppSpacing.lg),
                _buildBindCard(
                  context,
                  channel: AuthChannel.email,
                  targetController: _emailTarget,
                  codeController: _emailCode,
                  countdown: _emailCountdown,
                  title: '邮箱验证',
                  targetLabel: '邮箱地址',
                  targetPlaceholder: '请输入您的企业或工作邮箱',
                  codePlaceholder: '输入 6 位验证码',
                  sendLabel: '发送验证码',
                  confirmLabel: '确认绑定邮箱',
                ),
              ],
              if (widget.required == VerifyRequirement.phone &&
                  !status.phoneVerified) ...[
                const SizedBox(height: AppSpacing.lg),
                _buildBindCard(
                  context,
                  channel: AuthChannel.sms,
                  targetController: _phoneTarget,
                  codeController: _phoneCode,
                  countdown: _phoneCountdown,
                  title: '手机验证',
                  targetLabel: '手机号码',
                  targetPlaceholder: '请输入手机号码',
                  codePlaceholder: '输入短信验证码',
                  sendLabel: '获取短信验证码',
                  confirmLabel: '确认验证手机号',
                ),
              ],
              const SizedBox(height: AppSpacing.xl),
              AppButton(
                key: const ValueKey('verify-logout'),
                label: '退出登录',
                variant: AppButtonVariant.secondary,
                isFullWidth: true,
                onPressed: _busy ? null : _logout,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStatusCard(BuildContext context, VerificationStatus status) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: isDarkMode(context) ? AppColors.darkSurface : AppColors.surface,
        borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
        border: Border.all(
          color: isDarkMode(context) ? AppColors.darkBorder : AppColors.border,
        ),
      ),
      child: Column(
        children: [
          _ChannelStatusRow(
            icon: 'mail',
            label: '邮箱',
            value: status.hasEmail ? status.email : '未绑定',
            verified: status.emailVerified,
          ),
          const Divider(height: AppSpacing.lg),
          _ChannelStatusRow(
            icon: 'phone',
            label: '手机号',
            value: status.hasPhone ? status.phone : '未绑定',
            verified: status.phoneVerified,
          ),
        ],
      ),
    );
  }

  Widget _buildBindCard(
    BuildContext context, {
    required AuthChannel channel,
    required TextEditingController targetController,
    required TextEditingController codeController,
    required CountdownController countdown,
    required String title,
    required String targetLabel,
    required String targetPlaceholder,
    required String codePlaceholder,
    required String sendLabel,
    required String confirmLabel,
  }) {
    final isEmail = channel == AuthChannel.email;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: isDarkMode(context) ? AppColors.darkSurface : AppColors.surface,
        borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
        border: Border.all(
          color: isDarkMode(context) ? AppColors.darkBorder : AppColors.border,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            key: ValueKey('verify-target-${channel.apiValue}'),
            controller: targetController,
            label: targetLabel,
            placeholder: targetPlaceholder,
            keyboardType:
                isEmail ? TextInputType.emailAddress : TextInputType.phone,
            textInputAction: TextInputAction.next,
            prefix: AppIcon(isEmail ? 'mail' : 'phone', size: 18),
            enabled: !_busy,
          ),
          const SizedBox(height: AppSpacing.md),
          CodeFieldRow(
            field: AppTextField(
              key: ValueKey('verify-code-${channel.apiValue}'),
              controller: codeController,
              label: '验证码',
              placeholder: codePlaceholder,
              keyboardType: TextInputType.number,
              textInputAction: TextInputAction.done,
              prefix: const AppIcon('lock', size: 18),
              enabled: !_busy,
            ),
            button: SendCodeButton(
              key: ValueKey('verify-send-${channel.apiValue}'),
              controller: countdown,
              enabled: !_busy && targetController.text.trim().isNotEmpty,
              onPressed: () => _sendBindCode(channel),
              idleLabel: sendLabel,
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            key: ValueKey('verify-confirm-${channel.apiValue}'),
            label: _busy ? '正在验证…' : confirmLabel,
            isFullWidth: true,
            isLoading: _busy,
            onPressed: _busy ? null : () => _confirmBind(channel),
          ),
        ],
      ),
    );
  }
}

class _ChannelStatusRow extends StatelessWidget {
  const _ChannelStatusRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.verified,
  });

  final String icon;
  final String label;
  final String value;
  final bool verified;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return Row(
      children: [
        AppIcon(
          icon,
          size: 18,
          color: isDark ? AppColors.darkTextSecondary : AppColors.textSecondary,
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: isDark
                      ? AppColors.darkTextPrimary
                      : AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                value,
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
        _StatusChip(verified: verified),
      ],
    );
  }
}

/// 已验证：绿色“已验证”；未验证：置灰“未验证”
class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.verified});

  final bool verified;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final bg = verified
        ? AppColors.success.withValues(alpha: isDark ? 0.24 : 0.12)
        : (isDark ? AppColors.darkSurfaceVariant : AppColors.surfaceVariant);
    final fg = verified
        ? (isDark ? const Color(0xFF7FD8AE) : AppColors.success)
        : (isDark ? AppColors.darkTextTertiary : AppColors.textTertiary);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (verified) ...[
            Icon(
              Icons.check_circle,
              size: 12,
              color: fg,
            ),
            const SizedBox(width: 3),
          ],
          Text(
            verified ? '已验证' : '未验证',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }
}
