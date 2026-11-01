import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_state.dart';
import '../../../core/models/company.dart';
import '../../../core/models/user.dart';
import '../../../design/design.dart';
import '../appearance/me_appearance.dart';
import '../data/me_api.dart';
import '../data/me_models.dart';
import '../state/me_admin.dart';
import '../state/me_runtime.dart';
import '../widgets/me_common.dart';

/// 我的首页（对应网页 `MobileMeScreen`，设计 ID 53）
class MeRootScreen extends StatefulWidget {
  const MeRootScreen({
    super.key,
    this.api,
    this.authState,
    this.appearance,
    this.userOverride,
    this.companyOverride,
  });

  final MeApi? api;
  final AuthState? authState;
  final MeAppearanceController? appearance;
  final User? userOverride;
  final Company? companyOverride;

  @override
  State<MeRootScreen> createState() => _MeRootScreenState();
}

class _MeRootScreenState extends State<MeRootScreen> {
  bool _loading = true;
  Object? _error;
  User? _user;
  MeUiPrefs _prefs = const MeUiPrefs();
  MeAdminAccess _admin = MeAdminAccess.none;
  Object? _adminError;
  Object? _prefsError;
  bool _adminLoading = true;

  @override
  void initState() {
    super.initState();
    _user = widget.userOverride;
    _load();
  }

  MeApi get _api => resolveMeApi(context, widget.api);
  AuthState? get _auth => resolveMeAuthState(context, widget.authState);

  int? get _companyId {
    final company = widget.companyOverride ?? _auth?.currentCompany;
    return company?.id;
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _prefsError = null;
    });
    try {
      final api = _api;
      final user = await api.fetchMe();
      // 界面偏好失败不影响首页主体，但要把原因显示出来
      MeUiPrefs prefs = _prefs;
      Object? prefsError;
      try {
        prefs = await api.fetchUiPrefs();
      } catch (e) {
        prefsError = e;
      }
      if (!mounted) return;
      setState(() {
        _user = user;
        _prefs = prefs;
        _prefsError = prefsError;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
    await _loadAdmin();
  }

  Future<void> _loadAdmin() async {
    setState(() {
      _adminLoading = true;
      _adminError = null;
    });
    try {
      final access = await loadMeAdminAccess(
        _api,
        companyId: _companyId,
        companyName: (widget.companyOverride ?? _auth?.currentCompany)?.name,
      );
      if (!mounted) return;
      setState(() {
        _admin = access;
        _adminLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _adminError = e;
        _adminLoading = false;
        _admin = MeAdminAccess.none;
      });
    }
  }

  Future<void> _open(String location) async {
    await context.push(location);
    if (!mounted) return;
    // 子页可能改动资料 / 外观 / 默认值，返回后重新取一次服务端真值
    await _load();
  }

  Future<void> _logout() async {
    final confirmed = await showAppConfirmDialog(
      context: context,
      title: '确认退出登录？',
      message: '退出后本地草稿将被安全清理，下次登录需要重新输入身份凭据。',
      confirmLabel: '确认退出',
      isDestructive: true,
    );
    if (!confirmed || !mounted) return;
    final auth = _auth;
    if (auth != null) {
      await auth.logout();
      return;
    }
    if (mounted) {
      showAppToast(context, '当前会话不可用，请重新启动应用', type: ToastType.warning);
    }
  }

  @override
  Widget build(BuildContext context) {
    final appearance = widget.appearance;
    final isDark = isDarkMode(context);
    final user = _user ?? widget.userOverride;
    final company = widget.companyOverride ?? _auth?.currentCompany;
    final appearanceController = appearance ??
        MeAppearanceScope.maybeOf(context) ??
        MeAppearanceController.instance;

    return MeScreenAppearance(
      controller: appearance,
      child: AppScaffold(
        title: '我的',
        body: _loading && user == null
            ? const MeLoadingState(message: '正在加载账号信息…')
            : _error != null && user == null
                ? MeErrorState(
                    message: meErrorMessage(_error!),
                    onRetry: _load,
                  )
                : ListView(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.pageHorizontal,
                      AppSpacing.md,
                      AppSpacing.pageHorizontal,
                      AppSpacing.xxxl,
                    ),
                    children: [
                      if (_prefsError != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: AppSpacing.md),
                          child: MeBanner(
                            message: '界面偏好读取失败：${meErrorMessage(_prefsError!)}',
                            tone: MeTone.warning,
                            onRetry: _load,
                          ),
                        ),
                      if (_error != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: AppSpacing.md),
                          child: MeBanner(
                            message: meErrorMessage(_error!),
                            tone: MeTone.danger,
                            onRetry: _load,
                          ),
                        ),
                      _profileCard(user, company, isDark),
                      const SizedBox(height: AppSpacing.md),
                      _preferenceSection(appearanceController),
                      const SizedBox(height: AppSpacing.md),
                      _adminSection(),
                      const SizedBox(height: AppSpacing.md),
                      _supportSection(),
                      const SizedBox(height: AppSpacing.lg),
                      AppButton(
                        label: '退出当前账号',
                        variant: AppButtonVariant.secondary,
                        size: AppButtonSize.lg,
                        isFullWidth: true,
                        icon: Icon(
                          Icons.logout,
                          size: 18,
                          color: isDark
                              ? AppColors.darkTextPrimary
                              : AppColors.textPrimary,
                        ),
                        onPressed: _logout,
                      ),
                    ],
                  ),
      ),
    );
  }

  Widget _profileCard(User? user, Company? company, bool isDark) {
    final name = user?.displayName ?? '未登录用户';
    final isAdmin = _admin.isAdmin;
    return GestureDetector(
      onTap: () => _open('/me/profile'),
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.cardPadding),
        decoration: BoxDecoration(
          color: isDark ? AppColors.darkSurface : AppColors.surface,
          borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
          border: Border.all(
            color: isDark ? AppColors.darkBorder : AppColors.border,
          ),
        ),
        child: Row(
          children: [
            MeAvatar(url: user?.avatarUrl, name: name, size: 64),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: isDark
                                ? AppColors.darkTextPrimary
                                : AppColors.textPrimary,
                          ),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      MeBadge(
                        label: isAdmin ? '管理员' : '成员',
                        tone: isAdmin ? MeTone.warning : MeTone.primary,
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    (user?.email ?? '').isEmpty ? '未绑定邮箱' : user!.email!,
                    style: TextStyle(
                      fontSize: 12.5,
                      color: isDark
                          ? AppColors.darkTextSecondary
                          : AppColors.textSecondary,
                    ),
                  ),
                  if (company != null) ...[
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        AppIcon(
                          'work',
                          size: 12,
                          color: isDark
                              ? AppColors.darkTextTertiary
                              : AppColors.textTertiary,
                        ),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            company.name,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 11.5,
                              color: isDark
                                  ? AppColors.darkTextTertiary
                                  : AppColors.textTertiary,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            AppIcon(
              'chevron-right',
              size: 18,
              color: isDark ? AppColors.darkTextTertiary : AppColors.textTertiary,
            ),
          ],
        ),
      ),
    );
  }

  Widget _preferenceSection(MeAppearanceController appearanceController) {
    return ListenableBuilder(
      listenable: appearanceController,
      builder: (context, _) {
        return AppListSection(
          header: '个人设置',
          children: [
            AppListTile(
              title: '个人资料',
              subtitle: '头像、姓名与联系方式',
              leading: const AppIcon('user', size: 18, color: AppColors.primary),
              onTap: () => _open('/me/profile'),
            ),
            AppListTile(
              title: '账号信息',
              subtitle: '账号标识、注册时间与企业归属',
              leading: const AppIcon('me', size: 18, color: AppColors.primary),
              onTap: () => _open('/me/account'),
            ),
            AppListTile(
              title: '账号与安全',
              subtitle: '登录密码、手机与邮箱验证',
              leading:
                  const AppIcon('shield', size: 18, color: AppColors.success),
              onTap: () => _open('/me/security'),
            ),
            AppListTile(
              title: '外观与语言',
              subtitle: appearanceController.themeMode.label,
              leading:
                  const AppIcon('palette', size: 18, color: Color(0xFF7C4DFF)),
              onTap: () => _open('/me/appearance'),
            ),
            AppListTile(
              title: '通知与免打扰',
              subtitle: '推送渠道、提醒时段与免打扰',
              leading: const AppIcon('bell', size: 18, color: AppColors.warning),
              onTap: () => _open('/me/notifications'),
            ),
            AppListTile(
              title: '任务默认值',
              subtitle: '默认优先级：${_priorityLabel(_prefs.taskDefaultPriority)}',
              leading:
                  const AppIcon('sliders', size: 18, color: Color(0xFF0288D1)),
              onTap: () => _open('/me/defaults'),
            ),
            AppListTile(
              title: '第三方服务绑定',
              subtitle: '微信提醒与个人语音识别',
              leading:
                  const AppIcon('share', size: 18, color: AppColors.success),
              onTap: () => _open('/me/integrations'),
            ),
          ],
        );
      },
    );
  }

  Widget _adminSection() {
    // 非管理员不显示管理入口（管理员页面对直接访问仍有独立门禁）
    if (_adminLoading) {
      return const AppListSection(
        header: '企业集成与管理',
        children: [
          Padding(
            padding: EdgeInsets.symmetric(vertical: AppSpacing.md),
            child: MeLoadingState(message: '正在校验管理权限…'),
          ),
        ],
      );
    }
    if (_adminError != null) {
      return AppListSection(
        header: '企业集成与管理',
        children: [
          Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: MeBanner(
              message: '管理权限校验失败：${meErrorMessage(_adminError!)}',
              tone: MeTone.warning,
              onRetry: _loadAdmin,
            ),
          ),
        ],
      );
    }
    if (!_admin.isAdmin) {
      return const SizedBox.shrink();
    }

    return AppListSection(
      header: '企业集成与管理',
      footer: '您拥有企业超级管理员权限，可配置企业级基础设施。',
      children: [
        AppListTile(
          title: '通知渠道配置',
          subtitle: '企业 SMTP 邮件服务器',
          leading: const AppIcon('mail', size: 18, color: Color(0xFF1E88E5)),
          onTap: () => _open('/me/admin/notify-channels'),
        ),
        AppListTile(
          title: 'AI 模型配置',
          subtitle: '企业大模型接入与连通性测试',
          leading: const AppIcon('cpu', size: 18, color: Color(0xFF5C6BC0)),
          onTap: () => _open('/me/admin/llm'),
        ),
        AppListTile(
          title: '模型密钥配置',
          subtitle: '多厂商密钥安全更新',
          leading: const AppIcon('key', size: 18, color: AppColors.warning),
          onTap: () => _open('/me/admin/model-keys'),
        ),
        AppListTile(
          title: '组织与登录集成',
          subtitle: '组织同步、办公协同集成与登录方式',
          leading: const AppIcon('globe', size: 18, color: Color(0xFF00897B)),
          onTap: () => _open('/me/admin/org-sso'),
        ),
        AppListTile(
          title: '推送证书状态',
          subtitle: 'APNs / FCM / WebPush 诊断',
          leading: const AppIcon('smartphone', size: 18, color: Color(0xFFEF6C00)),
          onTap: () => _open('/me/admin/push-certs'),
        ),
        AppListTile(
          title: '语音识别配置',
          subtitle: '企业 ASR 引擎与转写参数',
          leading: const AppIcon('mic', size: 18, color: Color(0xFFE91E63)),
          onTap: () => _open('/me/admin/asr'),
        ),
        AppListTile(
          title: '单点登录配置',
          subtitle: 'OIDC / SAML 登录方式',
          leading: const AppIcon('server', size: 18, color: Color(0xFF546E7A)),
          onTap: () => _open('/me/admin/sso'),
        ),
      ],
    );
  }

  Widget _supportSection() {
    return AppListSection(
      header: '支持与记录',
      children: [
        AppListTile(
          title: '套餐、隐私与帮助',
          subtitle: '席位授权、数据导出与使用指引',
          leading: const AppIcon('card', size: 18, color: Color(0xFF0097A7)),
          onTap: () => _open('/me/billing-help'),
        ),
        AppListTile(
          title: '通知发送记录',
          subtitle: '最近 50 条送达状态与失败原因',
          leading: const AppIcon('clock', size: 18, color: Color(0xFF1E88E5)),
          onTap: () => _open('/me/notify-logs'),
        ),
        AppListTile(
          title: '关于与版本',
          subtitle: '版本号、服务状态与开源许可',
          leading: const AppIcon('info', size: 18, color: Color(0xFF757575)),
          onTap: () => _open('/me/about'),
        ),
      ],
    );
  }

  static String _priorityLabel(int? value) {
    return switch (value) {
      2 => '高',
      0 => '低',
      _ => '中',
    };
  }
}
