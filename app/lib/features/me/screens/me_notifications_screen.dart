import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_state.dart';
import '../../../core/models/user.dart';
import '../../../design/design.dart';
import '../appearance/me_appearance.dart';
import '../data/me_api.dart';
import '../data/me_models.dart';
import '../state/me_runtime.dart';
import '../widgets/me_common.dart';

/// 通知与免打扰（对应网页 `MobileNotificationSettingsScreen`，设计 ID 57）
class MeNotificationsScreen extends StatefulWidget {
  const MeNotificationsScreen({
    super.key,
    this.api,
    this.authState,
    this.appearance,
    this.userOverride,
  });

  final MeApi? api;
  final AuthState? authState;
  final MeAppearanceController? appearance;
  final User? userOverride;

  @override
  State<MeNotificationsScreen> createState() => _MeNotificationsScreenState();
}

class _MeNotificationsScreenState extends State<MeNotificationsScreen> {
  final _startController = TextEditingController();
  final _endController = TextEditingController();

  bool _loading = true;
  Object? _loadError;
  MeNotifyPref _pref = const MeNotifyPref();
  bool _saving = false;
  bool _testing = false;
  String? _errorMessage;
  String? _successMessage;

  MeApi get _api => resolveMeApi(context, widget.api);

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _startController.dispose();
    _endController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final user = await _api.fetchMe();
      if (!mounted) return;
      final pref = MeNotifyPref.fromJson(user.notifyPref);
      setState(() {
        _pref = pref;
        _startController.text = pref.quietHoursStart;
        _endController.text = pref.quietHoursEnd;
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

  Future<bool> _savePref(MeNotifyPref next, {String? successMessage}) async {
    final previous = _pref;
    setState(() {
      _pref = next;
      _saving = true;
      _errorMessage = null;
      _successMessage = null;
    });
    try {
      await _api.updateMe(notifyPref: next.toUpdatePayload());
      if (!mounted) return true;
      setState(() {
        _saving = false;
        _successMessage = successMessage;
      });
      return true;
    } catch (e) {
      if (!mounted) return false;
      setState(() {
        // 保存失败回滚到上一次服务端确认的值，避免界面显示与服务端不一致
        _pref = previous;
        _saving = false;
        _errorMessage = '保存失败：${meErrorMessage(e)}';
      });
      return false;
    }
  }

  Future<void> _saveQuietHours() async {
    final start = _startController.text.trim();
    final end = _endController.text.trim();
    if (!_isValidTime(start) || !_isValidTime(end)) {
      setState(() {
        _errorMessage = '免打扰时间格式应为 HH:mm，例如 22:00';
        _successMessage = null;
      });
      return;
    }
    await _savePref(
      _pref.copyWith(quietHoursStart: start, quietHoursEnd: end),
      successMessage: '免打扰时段已保存',
    );
  }

  static bool _isValidTime(String value) {
    final match = RegExp(r'^([01]\d|2[0-3]):([0-5]\d)$').firstMatch(value);
    return match != null;
  }

  Future<void> _sendTest(String channel) async {
    setState(() {
      _testing = true;
      _errorMessage = null;
      _successMessage = null;
    });
    try {
      final result = await _api.sendNotifyTest(channel);
      if (!mounted) return;
      setState(() {
        _testing = false;
        if (result.ok) {
          _successMessage = channel == 'email'
              ? '测试邮件已发送，请检查收件箱'
              : '测试推送已发送';
        } else {
          _errorMessage = result.error ?? '测试发送失败，请检查服务配置';
        }
      });
      if (result.ok) await _load();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _testing = false;
        _errorMessage = '测试发送失败：${meErrorMessage(e)}';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return MeScreenAppearance(
      controller: widget.appearance,
      child: AppScaffold(
        title: '通知与免打扰',
        actions: [
          IconButton(
            tooltip: '刷新',
            icon: const AppIcon('refresh', size: 20),
            onPressed: _loading ? null : _load,
          ),
        ],
        body: _loading
            ? const MeLoadingState(message: '正在加载通知设置…')
            : _loadError != null
                ? MeErrorState(
                    message: meErrorMessage(_loadError!),
                    onRetry: _load,
                  )
                : MeKeyboardSafeBody(
                    child: MePageBody(
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
                        _channelsCard(),
                        const SizedBox(height: AppSpacing.md),
                        _quietHoursCard(),
                        const SizedBox(height: AppSpacing.md),
                        _testCard(),
                      ],
                    ),
                  ),
      ),
    );
  }

  Widget _channelsCard() {
    return MeCard(
      title: '接收渠道',
      footer: '渠道开关会同步到个人通知偏好；系统推送还需要在系统设置中授予通知权限。',
      children: [
        _switchRow(
          title: '邮件通知',
          subtitle: '任务逾期、项目里程碑与每周摘要',
          value: _pref.email,
          onChanged: (value) => _savePref(
            _pref.copyWith(email: value),
            successMessage: value ? '已开启邮件通知' : '已关闭邮件通知',
          ),
        ),
        _switchRow(
          title: '系统推送',
          subtitle: '任务分配、会话提及与紧急提醒',
          value: _pref.push,
          onChanged: (value) => _savePref(
            _pref.copyWith(push: value),
            successMessage: value ? '已开启系统推送' : '已关闭系统推送',
          ),
        ),
        _switchRow(
          title: '微信服务号提醒',
          subtitle: '需先在「第三方服务绑定」中完成微信绑定',
          value: _pref.wechat,
          onChanged: (value) => _savePref(
            _pref.copyWith(wechat: value),
            successMessage: value ? '已开启微信提醒' : '已关闭微信提醒',
          ),
          showDivider: false,
        ),
      ],
    );
  }

  Widget _switchRow({
    required String title,
    required String subtitle,
    required bool value,
    required Future<bool> Function(bool) onChanged,
    bool showDivider = true,
  }) {
    final isDark = isDarkMode(context);
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: showDivider
          ? BoxDecoration(
              border: Border(
                bottom: BorderSide(
                  color: isDark ? AppColors.darkBorder : AppColors.borderLight,
                  width: 0.5,
                ),
              ),
            )
          : null,
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w600,
                    color: isDark
                        ? AppColors.darkTextPrimary
                        : AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
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
          AppSwitch(
            value: value,
            onChanged: _saving ? null : onChanged,
          ),
        ],
      ),
    );
  }

  Widget _quietHoursCard() {
    return MeCard(
      title: '免打扰模式',
      footer: '免打扰时段内除加急任务外静默接收；周末静音可关闭周六与周日的主动推送。',
      children: [
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const MeFieldLabel(label: '开始静音', required: true),
                  AppTextField(
                    key: const Key('me-notify-quiet-start'),
                    controller: _startController,
                    placeholder: '22:00',
                    keyboardType: TextInputType.datetime,
                    clearButtonEnabled: false,
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const MeFieldLabel(label: '恢复提醒', required: true),
                  AppTextField(
                    key: const Key('me-notify-quiet-end'),
                    controller: _endController,
                    placeholder: '08:00',
                    keyboardType: TextInputType.datetime,
                    clearButtonEnabled: false,
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        _switchRow(
          title: '周末全天静音',
          subtitle: '周六与周日不主动发送工作类推送',
          value: _pref.weekendMute,
          onChanged: (value) => _savePref(
            _pref.copyWith(weekendMute: value),
            successMessage: value ? '已开启周末静音' : '已关闭周末静音',
          ),
          showDivider: false,
        ),
        const SizedBox(height: AppSpacing.md),
        AppButton(
          label: '保存免打扰时段',
          isFullWidth: true,
          onPressed: _saving ? null : _saveQuietHours,
        ),
      ],
    );
  }

  Widget _testCard() {
    return MeCard(
      title: '测试发送与记录',
      footer: '测试发送会真实调用后端渠道，并写入「通知发送记录」。',
      children: [
        AppButton(
          label: '发送测试邮件',
          variant: AppButtonVariant.secondary,
          isFullWidth: true,
          onPressed: _testing ? null : () => _sendTest('email'),
        ),
        const SizedBox(height: AppSpacing.sm),
        AppButton(
          label: '发送测试推送',
          variant: AppButtonVariant.secondary,
          isFullWidth: true,
          onPressed: _testing ? null : () => _sendTest('webpush'),
        ),
        const SizedBox(height: AppSpacing.sm),
        AppButton(
          label: '查看通知发送记录',
          variant: AppButtonVariant.secondary,
          isFullWidth: true,
          icon: const AppIcon('clock', size: 15),
          onPressed: () => context.push('/me/notify-logs'),
        ),
      ],
    );
  }
}
