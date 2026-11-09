import 'package:flutter/material.dart';

import '../../../core/auth/auth_state.dart';
import '../../../design/design.dart';
import '../appearance/me_appearance.dart';
import '../data/me_api.dart';
import '../state/me_runtime.dart';
import '../widgets/me_common.dart';

/// 外观与语言（对应网页 `MobileAppearanceScreen`，设计 ID 56）
///
/// 网页真源含「主题 / 系统动态字体 / 语言」三块；语言切换在手机网页版仅切换
/// 少量文案且原生版全中文，故本页不提供英文切换（差异已回传）。
class MeAppearanceScreen extends StatefulWidget {
  const MeAppearanceScreen({
    super.key,
    this.api,
    this.authState,
    this.appearance,
  });

  final MeApi? api;
  final AuthState? authState;
  final MeAppearanceController? appearance;

  @override
  State<MeAppearanceScreen> createState() => _MeAppearanceScreenState();
}

class _MeAppearanceScreenState extends State<MeAppearanceScreen> {
  MeAppearanceController? _controller;
  bool _loading = true;
  String? _syncError;
  bool _saving = false;

  MeApi get _api => resolveMeApi(context, widget.api);

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    // initState 阶段不能依赖 InheritedWidget，直接使用注入值或全局单例
    final controller = widget.appearance ?? MeAppearanceController.instance;
    await controller.ensureLoaded();
    String? syncError;
    try {
      await controller.syncFromCloud(_api, isCurrent: () => mounted);
    } catch (e) {
      syncError = '云端主题读取失败，暂用本机缓存：${meErrorMessage(e)}';
    }
    if (!mounted) return;
    setState(() {
      _controller = controller;
      _loading = false;
      _syncError = syncError;
    });
  }

  Future<void> _applyTheme(MeThemeMode mode) async {
    final controller = _controller;
    if (controller == null) return;
    setState(() {
      _saving = true;
      _syncError = null;
    });
    String? syncError;
    try {
      final saved = await _api.saveUiPrefs(themeMode: mode.storageValue);
      final localOk = await controller
          .setThemeMode(MeThemeMode.fromStorage(saved.themeMode));
      if (!localOk) {
        syncError = '云端主题已保存，本机缓存写入失败';
      }
    } catch (e) {
      syncError = '云端保存失败，主题保持上次设置：${meErrorMessage(e)}';
    }
    if (!mounted) return;
    setState(() {
      _saving = false;
      _syncError = syncError;
    });
  }

  Future<void> _applyTextScale(double? scale) async {
    final controller = _controller;
    if (controller == null) return;
    setState(() {
      _saving = true;
      _syncError = null;
    });
    final ok = await controller.setTextScale(scale);
    if (!mounted) return;
    setState(() {
      _saving = false;
      _syncError = ok ? null : '本机字号设置写入失败，重启后可能不保留';
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    return MeScreenAppearance(
      controller: widget.appearance,
      child: AppScaffold(
        title: '外观与语言',
        body: _loading || controller == null
            ? const MeLoadingState(message: '正在读取外观设置…')
            : ListenableBuilder(
                listenable: controller,
                builder: (context, _) {
                  return MePageBody(
                    children: [
                      if (_syncError != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: AppSpacing.md),
                          child: MeBanner(
                            message: _syncError!,
                            tone: MeTone.warning,
                          ),
                        ),
                      MeCard(
                        title: '主题模式',
                        footer: '主题以云端设置为准，登录和进入本页时同步；本机缓存用于网络不可用时显示。',
                        children: [
                          Row(
                            children: [
                              for (final mode in MeThemeMode.values) ...[
                                Expanded(
                                  child: _themeOption(
                                    controller,
                                    mode,
                                  ),
                                ),
                                if (mode != MeThemeMode.values.last)
                                  const SizedBox(width: AppSpacing.sm),
                              ],
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      MeCard(
                        title: '字号大小',
                        footer:
                            '「跟随系统」使用设备字号设置；选择档位后整个 APP 按档位统一缩放，长文案自动换行不截断。',
                        children: [
                          for (final option in _scaleOptions)
                            _scaleOption(controller, option),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      const MeCard(
                        title: '显示语言',
                        footer: '手机网页版支持中英切换；原生版按交付约定全部使用中文，暂不提供英文界面。',
                        children: [
                          MeInfoRow(label: '当前语言', value: '简体中文 (zh-CN)'),
                          MeInfoRow(
                            label: '其他语言',
                            value: '暂未开放',
                            showDivider: false,
                          ),
                        ],
                      ),
                      if (_saving)
                        const Padding(
                          padding: EdgeInsets.only(top: AppSpacing.md),
                          child: Center(child: AppLoading(size: 18)),
                        ),
                    ],
                  );
                },
              ),
      ),
    );
  }

  static const List<(double?, String, String)> _scaleOptions = [
    (null, '跟随系统', '随设备字体大小设置'),
    (1.0, '标准', '默认字号（100%）'),
    (1.15, '大', '字号放大 115%'),
    (1.3, '特大', '字号放大 130%'),
  ];

  Widget _themeOption(MeAppearanceController controller, MeThemeMode mode) {
    final isDark = isDarkMode(context);
    final selected = controller.themeMode == mode;
    return GestureDetector(
      key: Key('me-theme-${mode.storageValue}'),
      onTap: _saving ? null : () => _applyTheme(mode),
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(
          vertical: AppSpacing.md,
          horizontal: AppSpacing.sm,
        ),
        decoration: BoxDecoration(
          color: selected
              ? (isDark ? const Color(0xFF11294A) : const Color(0xFFEAF1FD))
              : Colors.transparent,
          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
          border: Border.all(
            color: selected
                ? AppColors.primary
                : (isDark ? AppColors.darkBorder : AppColors.border),
            width: selected ? 1.6 : 1,
          ),
        ),
        child: Column(
          children: [
            AppIcon(
              mode == MeThemeMode.dark
                  ? 'lock'
                  : mode == MeThemeMode.light
                      ? 'info'
                      : 'palette',
              size: 20,
              color: selected
                  ? AppColors.primary
                  : (isDark
                      ? AppColors.darkTextSecondary
                      : AppColors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              mode.label,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                color: selected
                    ? AppColors.primary
                    : (isDark
                        ? AppColors.darkTextPrimary
                        : AppColors.textPrimary),
              ),
            ),
            if (selected)
              const Padding(
                padding: EdgeInsets.only(top: 2),
                child: Text(
                  '当前生效',
                  style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w700,
                    color: AppColors.primary,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _scaleOption(
    MeAppearanceController controller,
    (double?, String, String) option,
  ) {
    final (scale, label, description) = option;
    final selected = controller.textScale == scale;
    final isDark = isDarkMode(context);
    return InkWell(
      key: Key('me-scale-${scale ?? 'system'}'),
      onTap: _saving ? null : () => _applyTextScale(scale),
      borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: isDark
                          ? AppColors.darkTextPrimary
                          : AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    description,
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
            if (selected)
              const AppIcon('check', size: 18, color: AppColors.primary)
            else
              const SizedBox(width: 18),
          ],
        ),
      ),
    );
  }
}
