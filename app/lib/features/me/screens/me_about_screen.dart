import 'package:flutter/material.dart';

import '../../../core/auth/auth_state.dart';
import '../../../design/design.dart';
import '../appearance/me_appearance.dart';
import '../data/me_api.dart';
import '../data/me_models.dart';
import '../state/me_runtime.dart';
import '../widgets/me_common.dart';

/// 应用版本号（与 `app/pubspec.yaml` 的 version 保持一致）
const String meAppVersion = '2.0.0+2';

/// 关于与版本（版本号取自后端 `GET /health`）
class MeAboutScreen extends StatefulWidget {
  const MeAboutScreen({
    super.key,
    this.api,
    this.authState,
    this.appearance,
  });

  final MeApi? api;
  final AuthState? authState;
  final MeAppearanceController? appearance;

  @override
  State<MeAboutScreen> createState() => _MeAboutScreenState();
}

class _MeAboutScreenState extends State<MeAboutScreen> {
  bool _loading = true;
  Object? _error;
  MeHealth? _health;

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
    });
    try {
      final health = await _api.fetchHealth();
      if (!mounted) return;
      setState(() {
        _health = health;
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

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return MeScreenAppearance(
      controller: widget.appearance,
      child: AppScaffold(
        title: '关于与版本',
        body: MePageBody(
          children: [
            MeCard(
              children: [
                Center(
                  child: Column(
                    children: [
                      Container(
                        width: 64,
                        height: 64,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: AppColors.primary,
                          borderRadius:
                              BorderRadius.circular(AppSpacing.radiusLg),
                        ),
                        child: const AppIcon(
                          'work',
                          size: 18,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      Text(
                        '工作梯',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w500,
                          color: isDark
                              ? AppColors.darkTextPrimary
                              : AppColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '原生客户端 $meAppVersion',
                        style: TextStyle(
                          fontSize: 12,
                          color: isDark
                              ? AppColors.darkTextSecondary
                              : AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            MeCard(
              title: '服务端状态',
              footer: '版本号取自后端 `GET /health`，用于确认所连服务与数据库状态',
              trailing: MeInlineButton(
                label: _loading ? '检查中…' : '重新检查',
                isLoading: _loading,
                onPressed: _loading ? null : _load,
              ),
              children: [
                if (_error != null)
                  MeBanner(
                    message: '服务状态读取失败：${meErrorMessage(_error!)}',
                    tone: MeTone.danger,
                    onRetry: _load,
                  )
                else ...[
                  MeInfoRow(
                    label: '服务状态',
                    value: (_health?.status ?? '').trim().isEmpty
                        ? '未知'
                        : _health!.status,
                    valueWidget: MeBadge(
                      label: _health?.isHealthy == true ? '正常' : '异常',
                      tone: _health?.isHealthy == true
                          ? MeTone.success
                          : MeTone.danger,
                    ),
                  ),
                  MeInfoRow(
                    label: '服务版本',
                    value: (_health?.version ?? '').trim().isEmpty
                        ? '—'
                        : _health!.version,
                  ),
                  MeInfoRow(
                    label: '数据库',
                    value: (_health?.database ?? '').trim().isEmpty
                        ? '—'
                        : _health!.database,
                    showDivider: false,
                  ),
                ],
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            MeCard(
              title: '客户端信息',
              children: [
                const MeInfoRow(label: '客户端类型', value: '原生 APP（Flutter）'),
                const MeInfoRow(label: '客户端版本', value: meAppVersion),
                MeInfoRow(
                  label: '当前主题',
                  value: widget.appearance?.themeMode.label ??
                      MeAppearanceController.instance.themeMode.label,
                  showDivider: false,
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            MeCard(
              title: '开源许可',
              children: [
                MeListRow(
                  title: '查看第三方开源许可',
                  subtitle: 'Flutter 及依赖组件的许可声明',
                  icon: 'file',
                  onTap: () => showLicensePage(
                    context: context,
                    applicationName: '工作梯',
                    applicationVersion: meAppVersion,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
