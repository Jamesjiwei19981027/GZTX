import 'package:flutter/material.dart';

import '../../../core/auth/auth_state.dart';
import '../../../design/design.dart';
import '../appearance/me_appearance.dart';
import '../data/me_api.dart';
import '../data/me_models.dart';
import '../state/me_runtime.dart';
import '../widgets/me_common.dart';

/// 任务默认值（对应网页 `MobileTaskDefaultsScreen`，设计 ID 58）
class MeDefaultsScreen extends StatefulWidget {
  const MeDefaultsScreen({
    super.key,
    this.api,
    this.authState,
    this.appearance,
  });

  final MeApi? api;
  final AuthState? authState;
  final MeAppearanceController? appearance;

  @override
  State<MeDefaultsScreen> createState() => _MeDefaultsScreenState();
}

class _MeDefaultsScreenState extends State<MeDefaultsScreen> {
  static const List<(int, String, String)> _priorities = [
    (2, '高优先级', '紧急且重要，需尽快处理'),
    (1, '中优先级', '默认选项，按计划推进'),
    (0, '低优先级', '可延后处理'),
  ];

  bool _loading = true;
  Object? _error;
  int _priority = 1;
  int? _categoryId;
  List<MeCategory> _categories = const [];
  bool _saving = false;
  String? _errorMessage;
  String? _successMessage;

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
      _errorMessage = null;
    });
    try {
      final prefs = await _api.fetchUiPrefs();
      List<MeCategory> categories = const [];
      Object? categoryError;
      try {
        categories = await _api.fetchCategories();
      } catch (e) {
        categoryError = e;
      }
      if (!mounted) return;
      setState(() {
        _priority = prefs.taskDefaultPriority ?? 1;
        _categoryId = prefs.taskDefaultCategoryId;
        _categories = categories;
        _loading = false;
        if (categoryError != null) {
          _errorMessage = '分类列表读取失败：${meErrorMessage(categoryError)}';
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _errorMessage = null;
      _successMessage = null;
    });
    try {
      await _api.saveUiPrefs(
        taskDefaultPriority: _priority,
        taskDefaultCategoryId: _categoryId,
      );
      if (!mounted) return;
      setState(() {
        _saving = false;
        _successMessage = '任务默认值已保存并应用';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _errorMessage = '保存失败：${meErrorMessage(e)}';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return MeScreenAppearance(
      controller: widget.appearance,
      child: AppScaffold(
        title: '任务默认值',
        body: _loading
            ? const MeLoadingState(message: '正在加载任务默认值…')
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
                        title: '默认优先级',
                        footer: '快速创建任务或从 AI 对话提取时，新任务默认使用该优先级',
                        children: [
                          for (final (value, title, subtitle) in _priorities)
                            _optionRow(
                              title: title,
                              subtitle: subtitle,
                              selected: _priority == value,
                              onTap: () => setState(() => _priority = value),
                            ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      MeCard(
                        title: '默认分类',
                        footer: _categories.isEmpty
                            ? '当前账号还没有任务分类，仅保存优先级；分类在「工作」中创建后可再次设置'
                            : '新任务默认归入所选分类',
                        children: [
                          if (_categories.isEmpty)
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 8),
                              child: Text(
                                '暂无可用分类',
                                style: TextStyle(
                                  fontSize: 13,
                                  color: isDarkMode(context)
                                      ? AppColors.darkTextSecondary
                                      : AppColors.textSecondary,
                                ),
                              ),
                            )
                          else
                            for (final category in _categories)
                              _optionRow(
                                title: category.name,
                                selected: _categoryId == category.id,
                                onTap: () =>
                                    setState(() => _categoryId = category.id),
                              ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.lg),
                      AppButton(
                        label: '保存任务默认配置',
                        isFullWidth: true,
                        size: AppButtonSize.lg,
                        isLoading: _saving,
                        onPressed: _saving ? null : _save,
                      ),
                    ],
                  ),
      ),
    );
  }

  Widget _optionRow({
    required String title,
    String? subtitle,
    required bool selected,
    required VoidCallback onTap,
  }) {
    final isDark = isDarkMode(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
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
                      fontWeight: FontWeight.w500,
                      color: isDark
                          ? AppColors.darkTextPrimary
                          : AppColors.textPrimary,
                    ),
                  ),
                  if (subtitle != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        subtitle,
                        style: TextStyle(
                          fontSize: 12,
                          color: isDark
                              ? AppColors.darkTextSecondary
                              : AppColors.textSecondary,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            if (selected)
              const AppIcon(
                'check',
                size: 18,
              )
            else
              const SizedBox(width: 20),
          ],
        ),
      ),
    );
  }
}
